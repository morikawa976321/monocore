"""
RSS を1巡して Supabase へ反映する。タスクスケジューラが毎時これを実行する。

常駐（schedule ライブラリ）をやめてワンショットにしたのは、常駐プロセスは
落ちても誰も気づかず再起動でしか復旧しないため。ワンショットなら失敗は次の枠で
自然に回復する。

    pythonw.exe run_once.py                # 本番（remote）
    python run_once.py --env local         # ローカルSupabaseで検証
    python run_once.py --env local --dry-run
    python run_once.py --backfill          # 元サイトの画像を指したままの記事を縮小版に差し替える
"""

import argparse
import gc
import sys
import time
from datetime import datetime, timezone

from config import load_config
from fetch_rss import collect_new_rss_articles
from log_config import get_logger
from store import ArticleStore, StoreError, load_env_config
from thumbnails import ThumbnailStorage, attach_thumbnails, build_thumbnail_url

logger = get_logger(__name__)

# サイト間の待ち時間（相手先への配慮。JSONL 時代からの値）。
SLEEP_BETWEEN_SITES_SECONDS = 2
# backfill で画像を取りに行く間隔(同じサイトへ続けて当たるので間を置く)。
BACKFILL_SLEEP_SECONDS = 0.3


def collect_all(config, existing_links, sleep_seconds=SLEEP_BETWEEN_SITES_SECONDS):
    """全サイトを巡回して新着記事を集める。

    existing_links は collect_new_rss_articles が巡回中に更新するので、
    同じ記事が複数サイトに出ても1度しか積まれない。
    """
    target_sites = config.get("rss_sites", {})
    blacklist = {
        "prefixes": config.get("blacklist_prefixes", []),
        "categories": config.get("blacklist_categories", {}),
    }

    all_new_articles = []
    for site_name, feed_url in target_sites.items():
        if not feed_url:
            continue

        all_new_articles.extend(
            collect_new_rss_articles(feed_url, site_name, existing_links, blacklist)
        )

        gc.collect()
        if sleep_seconds:
            time.sleep(sleep_seconds)

    all_new_articles.sort(key=lambda article: article.get("published") or "", reverse=True)
    return all_new_articles


def run_once(store, config, storage=None):
    """storage(ThumbnailStorage)を渡すと、新着の画像を縮小して Storage に置き、
    期限切れの記事の縮小画像も消す。渡さなければ画像は元サイトの URL のまま扱う。"""
    max_age_days = config.get("max_age_days", 14)

    existing_links = store.fetch_existing_links()
    logger.info("Existing links: %d", len(existing_links))

    new_articles = collect_all(config, existing_links)
    logger.info("New articles: %d", len(new_articles))

    if storage is not None:
        made = attach_thumbnails(storage, new_articles)
        logger.info("Thumbnails: %d/%d", made, len(new_articles))

    upserted = store.upsert_articles(new_articles)

    # 画像を先に消し、あとで行を消す。逆にすると、画像の削除に失敗したとき
    # 行が無いので二度と掃除されず、画像だけが残り続ける。
    # 同じ now を使うのは、消える行と掃除する画像の集合を一致させるため。
    now = datetime.now(timezone.utc)
    if storage is not None:
        expired_names = [
            name
            for name in map(storage.name_from_url, store.fetch_expired_image_urls(max_age_days, now))
            if name
        ]
        storage.delete(expired_names)

    deleted = store.delete_expired(max_age_days, now)
    logger.info("Upserted: %d, deleted: %s (max_age_days=%d)", upserted, deleted, max_age_days)

    return {"existing": len(existing_links), "upserted": upserted, "deleted": deleted}


def backfill_thumbnails(store, storage, sleep_seconds=BACKFILL_SLEEP_SECONDS):
    """元サイトの画像 URL を指している記事を、縮小版の URL に差し替える。

    作れなかった記事は元の URL のまま残る(再実行すれば再び試す)。
    """
    targets = [
        row
        for row in store.fetch_image_rows()
        if row.get("image_url") and storage.name_from_url(row["image_url"]) is None
    ]
    logger.info("Backfill targets: %d", len(targets))

    converted = 0
    for row in targets:
        thumbnail_url = build_thumbnail_url(storage, row["link"], row["image_url"])
        if thumbnail_url:
            store.update_image_url(row["link"], thumbnail_url)
            converted += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)

    logger.info("Backfill converted: %d/%d", converted, len(targets))
    return {"targets": len(targets), "converted": converted}


def main(argv=None):
    parser = argparse.ArgumentParser(description="RSSを1巡してSupabaseへ反映する")
    parser.add_argument("--env", choices=["local", "remote"], default="remote")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="収集だけ行い、書き込みと削除をしない（件数のみ表示）",
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="巡回せず、元サイトの画像を指している既存記事の画像を縮小版に差し替える",
    )
    args = parser.parse_args(argv)

    config = load_config()

    try:
        url, service_key = load_env_config(args.env)
        store = ArticleStore(url, service_key)
        storage = ThumbnailStorage(url, service_key)

        if args.backfill:
            backfill_thumbnails(store, storage)
            return 0

        if args.dry_run:
            existing_links = store.fetch_existing_links()
            new_articles = collect_all(config, existing_links)
            logger.info(
                "[dry-run] existing=%d new=%d (書き込みなし)",
                len(existing_links),
                len(new_articles),
            )
            return 0

        run_once(store, config, storage)
    except StoreError as e:
        logger.error("%s", e)
        return 1
    except Exception as e:
        logger.error("巡回に失敗しました: %s: %s", type(e).__name__, e)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
