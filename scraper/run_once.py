"""
RSS を1巡して Supabase へ反映する。タスクスケジューラが毎時これを実行する。

常駐（schedule ライブラリ）をやめてワンショットにしたのは、常駐プロセスは
落ちても誰も気づかず再起動でしか復旧しないため。ワンショットなら失敗は次の枠で
自然に回復する。

    pythonw.exe run_once.py                # 本番（remote）
    python run_once.py --env local         # ローカルSupabaseで検証
    python run_once.py --env local --dry-run
"""

import argparse
import gc
import sys
import time

from config import load_config
from fetch_rss import collect_new_rss_articles
from log_config import get_logger
from store import ArticleStore, StoreError, load_env_config

logger = get_logger(__name__)

# サイト間の待ち時間（相手先への配慮。JSONL 時代からの値）。
SLEEP_BETWEEN_SITES_SECONDS = 2


def collect_all(config, existing_links, sleep_seconds=SLEEP_BETWEEN_SITES_SECONDS):
    """全サイトを巡回して新着記事を集める。

    existing_links は collect_new_rss_articles が巡回中に更新するので、
    同じ記事が複数サイトに出ても1度しか積まれない。
    """
    target_sites = config.get("rss_sites", {})
    blacklist_prefixes = config.get("blacklist_prefixes", [])

    all_new_articles = []
    for site_name, feed_url in target_sites.items():
        if not feed_url:
            continue

        all_new_articles.extend(
            collect_new_rss_articles(feed_url, site_name, existing_links, blacklist_prefixes)
        )

        gc.collect()
        if sleep_seconds:
            time.sleep(sleep_seconds)

    all_new_articles.sort(key=lambda article: article.get("published") or "", reverse=True)
    return all_new_articles


def run_once(store, config):
    max_age_days = config.get("max_age_days", 14)

    existing_links = store.fetch_existing_links()
    logger.info("Existing links: %d", len(existing_links))

    new_articles = collect_all(config, existing_links)
    logger.info("New articles: %d", len(new_articles))

    upserted = store.upsert_articles(new_articles)

    deleted = store.delete_expired(max_age_days)
    logger.info("Upserted: %d, deleted: %s (max_age_days=%d)", upserted, deleted, max_age_days)

    return {"existing": len(existing_links), "upserted": upserted, "deleted": deleted}


def main(argv=None):
    parser = argparse.ArgumentParser(description="RSSを1巡してSupabaseへ反映する")
    parser.add_argument("--env", choices=["local", "remote"], default="remote")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="収集だけ行い、書き込みと削除をしない（件数のみ表示）",
    )
    args = parser.parse_args(argv)

    config = load_config()

    try:
        url, service_key = load_env_config(args.env)
        store = ArticleStore(url, service_key)

        if args.dry_run:
            existing_links = store.fetch_existing_links()
            new_articles = collect_all(config, existing_links)
            logger.info(
                "[dry-run] existing=%d new=%d (書き込みなし)",
                len(existing_links),
                len(new_articles),
            )
            return 0

        run_once(store, config)
    except StoreError as e:
        logger.error("%s", e)
        return 1
    except Exception as e:
        logger.error("巡回に失敗しました: %s: %s", type(e).__name__, e)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
