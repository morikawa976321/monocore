r"""旧 news_scraping の articles.jsonl を1度だけ Supabase へ流し込む（使い捨て）。

移行直後の /news が空にならないようにするためだけのスクリプト。RSS は最新20〜30件しか
配らないので、これを流さないと保持期間(8日)ぶんの記事が揃うまで面が薄くなる。

    python import_jsonl_once.py --env remote --file ..\..\news_scraping\static\articles.jsonl

**移行が終わったらこのファイルを削除する。**
"""

import argparse
import json
import os
import sys

from log_config import get_logger
from store import ArticleStore, StoreError, load_env_config

logger = get_logger(__name__)

DEFAULT_JSONL = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "news_scraping",
    "static",
    "articles.jsonl",
)


def load_articles(path):
    """JSONL を読む。壊れた行は捨てる（JSONL 時代の load_existing_links と同じ耐性）。"""
    articles = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                article = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON line skipped in %s", path)
                continue
            if article.get("link"):
                articles.append(article)
    return articles


def main(argv=None):
    parser = argparse.ArgumentParser(description="articles.jsonl を1度だけ投入する")
    parser.add_argument("--env", choices=["local", "remote"], default="remote")
    parser.add_argument("--file", default=DEFAULT_JSONL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not os.path.exists(args.file):
        logger.error("ファイルが見つかりません: %s", args.file)
        return 1

    articles = load_articles(args.file)
    if not articles:
        logger.error("投入できる記事がありません: %s", args.file)
        return 1

    # link 単位の upsert なので、既存行は上書きされない（重複実行しても安全）。
    logger.info("読み込み: %d件 (%s)", len(articles), args.file)
    if args.dry_run:
        logger.info("[dry-run] 書き込みなし")
        return 0

    try:
        url, service_key = load_env_config(args.env)
        store = ArticleStore(url, service_key)
        before = len(store.fetch_existing_links())
        store.upsert_articles(articles)
        after = len(store.fetch_existing_links())
    except StoreError as e:
        logger.error("%s", e)
        return 1

    logger.info("投入完了: DB件数 %d → %d (env=%s)", before, after, args.env)
    return 0


if __name__ == "__main__":
    sys.exit(main())
