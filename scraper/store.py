"""
記事の保存先（Supabase の public.articles）への読み書き。

■ 経路
    PostgREST を requests で直接叩く。supabase-py は入れない（使うのが3経路しかない）。

■ 認証情報
    `~/.monocore/config.json` の `envs.<env>` から読む（スキル monocore.py と同じ流儀）。
    リポジトリの外にあるので鍵をコミットする事故が起きない。既定は remote（本番）で、
    local はローカルSupabaseを指す検証専用。**キーの値はログにも例外にも出さない。**

■ ローカル状態を持たない
    既存リンク集合は毎回 DB から引く。書き込みに失敗した記事は次の巡回で自然に
    再取得されるので、「ローカルとDBが食い違う」状態が原理的に発生しない。

■ PostgREST の制約（実測・2026-08-14）
    - 一括INSERTは配列内の全オブジェクトのキー集合が完全一致していないと
      PGRST102 "All object keys must match" で400になる。したがって article_to_row は
      値が無い列も null で必ず埋める（キーごと落とさない）。
    - 1レスポンスは max_rows=1000 で頭打ちになる。既存リンクの取得は Range で
      ページングしないと、行が増えたとき黙って切れて重複記事が復活する。
    - クエリ文字列に timestamptz を素で埋めると '+' が空白扱いになり 22007 で落ちる。
      期限のしきい値は UTC の 'Z' 表記で作る（本文JSONにはこの制約は無い）。
"""

import json
import os
from datetime import datetime, timedelta, timezone

import requests

from log_config import get_logger

logger = get_logger(__name__)

TABLE = "articles"
# 1レスポンスの上限（supabase/config.toml の max_rows と合わせる）。
PAGE_SIZE = 1000
# 1回のPOSTで送る行数。初回移行のような数百行の投入を分割するため。
CHUNK_SIZE = 200
TIMEOUT_SECONDS = 15


class StoreError(Exception):
    """Supabase とのやりとりの失敗。メッセージにキーを含めてはならない。"""


def load_env_config(env_name="remote", config_path=None):
    """~/.monocore/config.json から (url, service_key) を読む。

    utf-8-sig で読むのは、このファイルが PowerShell 由来の UTF-8 BOM 付きだから。
    失敗時のメッセージにファイルの中身を含めない（キーが載るため）。
    """
    if config_path is None:
        config_path = os.path.join(os.path.expanduser("~"), ".monocore", "config.json")

    if not os.path.exists(config_path):
        raise StoreError(f"設定ファイルが見つかりません: {config_path}")

    try:
        with open(config_path, "r", encoding="utf-8-sig") as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        raise StoreError(f"設定ファイルの読み込みに失敗しました: {type(e).__name__}") from None

    env = (config.get("envs") or {}).get(env_name)
    if not env or not env.get("url") or not env.get("service_key"):
        raise StoreError(f"設定ファイルに環境 '{env_name}' の url / service_key がありません")

    return env["url"], env["service_key"]


def article_to_row(article, collected_at):
    """収集した記事 dict を articles の1行へ写す。

    **全行で同じキー集合になるよう、値が無い列も必ず null で埋める**
    （PostgREST の PGRST102 対策。モジュール docstring 参照）。
    """
    return {
        "link": article["link"],
        "source": article.get("source") or "",
        "title": article.get("title") or "タイトル不明",
        "published": article.get("published") or None,
        "image_url": article.get("image") or None,
        "collected_at": collected_at,
    }


def expiry_threshold(now, max_age_days):
    """保持期間の下限を UTC の 'Z' 表記で返す（クエリ文字列に '+' を出さないため）。"""
    threshold = now.astimezone(timezone.utc) - timedelta(days=max_age_days)
    return threshold.strftime("%Y-%m-%dT%H:%M:%SZ")


def expired_filter(threshold):
    """期限切れ行の PostgREST フィルタ。

    published が NULL の記事（RSSが日付を持たない場合）は collected_at で判定する。
    これをしないと NULL 行が永久に残る。
    """
    return f"or=(published.lt.{threshold},and(published.is.null,collected_at.lt.{threshold}))"


def chunked(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


class ArticleStore:
    def __init__(self, url, service_key, session=None, timeout=TIMEOUT_SECONDS):
        self._endpoint = f"{url.rstrip('/')}/rest/v1/{TABLE}"
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        self._session = session or requests.Session()
        self._timeout = timeout

    def _check(self, response, what):
        if response.status_code >= 400:
            # response.text にキーは含まれない（キーはヘッダにしか無い）。
            raise StoreError(f"{what} に失敗しました: HTTP {response.status_code} {response.text}")

    def fetch_existing_links(self):
        """既存の link を全件返す。max_rows で切れないよう Range でページングする。"""
        links = set()
        offset = 0
        while True:
            headers = dict(self._headers)
            headers["Range-Unit"] = "items"
            headers["Range"] = f"{offset}-{offset + PAGE_SIZE - 1}"
            response = self._session.get(
                self._endpoint,
                params={"select": "link"},
                headers=headers,
                timeout=self._timeout,
            )
            self._check(response, "既存リンクの取得")

            rows = response.json()
            for row in rows:
                link = row.get("link")
                if link:
                    links.add(link)

            if len(rows) < PAGE_SIZE:
                return links
            offset += PAGE_SIZE

    def upsert_articles(self, articles, collected_at=None):
        """記事を link 単位で upsert する。既存行は上書きしない。

        既存行を触らないのは、記事が後から書き換わることを想定していないため
        （JSONL 時代の「既存リンクは読み飛ばす」と同じ挙動）。
        """
        if not articles:
            return 0

        if collected_at is None:
            collected_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        rows = [article_to_row(article, collected_at) for article in articles]

        headers = dict(self._headers)
        headers["Prefer"] = "resolution=ignore-duplicates,return=minimal"

        for chunk in chunked(rows, CHUNK_SIZE):
            response = self._session.post(
                self._endpoint,
                params={"on_conflict": "link"},
                headers=headers,
                data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
                timeout=self._timeout,
            )
            self._check(response, "記事の投入")

        return len(rows)

    def delete_expired(self, max_age_days, now=None):
        """保持期間を過ぎた行を削除する。削除件数を返す（取れなければ None）。"""
        if now is None:
            now = datetime.now(timezone.utc)
        threshold = expiry_threshold(now, max_age_days)

        headers = dict(self._headers)
        headers["Prefer"] = "count=exact"

        # フィルタは URL に直接書く（params だと '(' や ',' がエンコードされて
        # PostgREST が式として読めなくなる）。しきい値は 'Z' 表記なので '+' は出ない。
        response = self._session.delete(
            f"{self._endpoint}?{expired_filter(threshold)}",
            headers=headers,
            timeout=self._timeout,
        )
        self._check(response, "期限切れ記事の削除")

        content_range = response.headers.get("Content-Range", "")
        _, _, total = content_range.partition("/")
        return int(total) if total.isdigit() else None
