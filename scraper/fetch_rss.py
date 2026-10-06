"""
RSS の取得と記事の正規化（OGP 画像・日付・エンコーディングのフォールバック）。

このファイルは 2026-08-14 に旧リポジトリ mf/news_scraping から移設した。移設元は
ローカル・GitHub とも削除済みで、移設前の git 履歴は存在しない。OGP の属性順2パターン、
published_parsed / updated_parsed の優先順、エンコーディングのフォールバックなど
「なぜこう書いたか」はここのコメントにしか残っていないので、消すと復元できない。
"""

import re
import feedparser
import requests
from datetime import datetime, timedelta, timezone

from log_config import get_logger

logger = get_logger(__name__)

_CATEGORY_SPLIT_RE = re.compile(r"[,、]")


def _split_category_field(raw):
    """カテゴリ文字列1件をカンマ・読点で分割し、空要素を除いて返す。"""
    names = []
    for part in _CATEGORY_SPLIT_RE.split(str(raw)):
        name = part.strip()
        if name:
            names.append(name)
    return names


def entry_categories(entry):
    """feedparser の entry からカテゴリ名のリストを取り出す（GIGAZINE の dc:subject 等）。"""
    names = []

    for tag in entry.get("tags") or []:
        raw = (tag.get("term") or tag.get("label") or "").strip()
        if raw:
            names.extend(_split_category_field(raw))

    for key in ("subject", "dc_subject"):
        subj = entry.get(key)
        if subj:
            names.extend(_split_category_field(subj))

    return list(dict.fromkeys(names))


def _resolve_blocked_categories(source_name, blacklist_categories):
    """blacklist_categories からそのサイトに適用するブロック対象カテゴリの集合を求める。

    blacklist_categories は { "サイト名": ["カテゴリ", ...], "*": [...] }。"*" は全サイトに効く。
    """
    if not isinstance(blacklist_categories, dict):
        return set()

    blocked = set()
    for key in ("*", source_name):
        values = blacklist_categories.get(key) or []
        if isinstance(values, str):
            values = [values]
        for name in values:
            stripped = str(name).strip()
            if stripped:
                blocked.add(stripped)
    return blocked


def _entry_matches_blocked_categories(entry, blocked):
    """記事のカテゴリがすべて blocked に含まれるときだけ True（保存しない）。

    カテゴリが1つでもリスト外にあれば False（保存する）。カテゴリなしは False。
    """
    if not blocked:
        return False

    categories = entry_categories(entry)
    if not categories:
        return False

    return all(category in blocked for category in categories)


def get_article_image(entry):
    """
    記事entryからOGP画像URLを取得する。
    メモリ効率のため、レスポンスの先頭20KBのみ読み取り、正規表現で解析する。
    （BeautifulSoupによるDOM全体のメモリ展開を回避）
    """
    link = entry.get("link")
    if not link:
        return ""

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/118.0.0.0 Safari/537.36"
            )
        }

        with requests.get(link, headers=headers, timeout=5, stream=True) as response:
            response.raise_for_status()

            raw_content = b""
            for chunk in response.iter_content(chunk_size=4096):
                raw_content += chunk
                if len(raw_content) >= 20480:
                    break

            encoding = response.encoding or "utf-8"

        try:
            head_text = raw_content.decode(encoding, errors="replace")
        except (LookupError, UnicodeDecodeError):
            head_text = raw_content.decode("utf-8", errors="replace")
        del raw_content

        match = re.search(
            r'<meta\s+[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
            head_text,
            re.IGNORECASE,
        )
        if not match:
            match = re.search(
                r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']',
                head_text,
                re.IGNORECASE,
            )

        if match:
            return match.group(1)

    except requests.exceptions.RequestException as e:
        logger.warning("Failed to fetch OGP image from %s: %s", link, e)
    except Exception as e:
        logger.warning("Unexpected error fetching OGP image from %s: %s", link, e)

    return ""


def collect_new_rss_articles(rss_url, source_name, existing_links, blacklist=None):
    """
    RSSフィードを取得し、既存リンクにない新しい記事をリストとして返す。
    ファイルI/Oは行わない。

    blacklist は {"prefixes": [...], "categories": {...}}（両方省略可）。
    """
    blacklist = blacklist or {}
    blacklist_prefixes = blacklist.get("prefixes") or []
    blocked_categories = _resolve_blocked_categories(
        source_name, blacklist.get("categories") or {}
    )

    new_articles = []

    try:
        feed = feedparser.parse(rss_url)
        if not feed.entries:
            return new_articles

        for entry in feed.entries:
            link = entry.get("link")

            if not link or link in existing_links:
                continue

            if any(link.startswith(prefix) for prefix in blacklist_prefixes):
                continue

            if _entry_matches_blocked_categories(entry, blocked_categories):
                continue

            image_url = get_article_image(entry)

            dt_utc = None

            parsed_date = entry.get("published_parsed")
            if parsed_date:
                dt_utc = datetime(*parsed_date[:6], tzinfo=timezone.utc)

            updated_parsed = entry.get("updated_parsed")
            if updated_parsed:
                dt_utc = datetime(*updated_parsed[:6], tzinfo=timezone.utc)

            published_date = None
            if dt_utc:
                jst = timezone(timedelta(hours=+9))
                published_date = dt_utc.astimezone(jst).isoformat()

            new_articles.append(
                {
                    "source": source_name,
                    "title": entry.get("title", "タイトル不明"),
                    "link": link,
                    "published": published_date,
                    "image": image_url,
                }
            )
            existing_links.add(link)

    except Exception as e:
        logger.error("Failed to collect RSS articles from %s (%s): %s", rss_url, source_name, e)

    return new_articles


# 収集した記事の保存は store.py（Supabase）が行う。1巡ぶんの実行は run_once.py。
