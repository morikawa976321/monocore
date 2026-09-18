"""run_once の配線（既存リンク → 収集 → 投入 → 期限切れ削除）のテスト。

JSONL 時代の tests/test_scheduler_runner.py の後継。旧テストは load_existing_links と
record_rss_articles（ファイル書き込み）を見ていたが、両方とも保存先の変更で消えた。
"""

from unittest.mock import patch

import run_once as run_once_module
from run_once import collect_all, run_once

CONFIG = {
    "rss_sites": {"A": "https://a.test/feed", "B": "https://b.test/feed"},
    "blacklist_prefixes": ["https://a.test/ad/"],
    "blacklist_categories": {"Gigazine": ["試食"]},
    "max_age_days": 8,
}


class FakeStore:
    def __init__(self, existing_links=None):
        self._existing_links = set(existing_links or [])
        self.upserted = None
        self.deleted_with = None

    def fetch_existing_links(self):
        return set(self._existing_links)

    def upsert_articles(self, articles):
        self.upserted = articles
        return len(articles)

    def delete_expired(self, max_age_days):
        self.deleted_with = max_age_days
        return 2


def article(link, published):
    return {"source": "S", "title": link, "link": link, "published": published, "image": ""}


def test_run_once_passes_existing_links_to_collection():
    store = FakeStore({"https://a.test/old"})

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]) as collect:
        run_once(store, CONFIG)

    passed_links = collect.call_args_list[0][0][2]
    assert "https://a.test/old" in passed_links


def test_run_once_upserts_all_sites_sorted_by_published_desc():
    store = FakeStore()
    per_site = {
        "https://a.test/feed": [article("https://a.test/1", "2026-08-14T10:00:00+09:00")],
        "https://b.test/feed": [article("https://b.test/1", "2026-08-14T20:00:00+09:00")],
    }

    with patch.object(
        run_once_module,
        "collect_new_rss_articles",
        side_effect=lambda url, name, links, blacklist: per_site[url],
    ):
        result = run_once(store, CONFIG)

    assert [a["link"] for a in store.upserted] == ["https://b.test/1", "https://a.test/1"]
    assert result["upserted"] == 2
    assert result["deleted"] == 2


def test_run_once_deletes_with_configured_max_age():
    store = FakeStore()

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]):
        run_once(store, CONFIG)

    assert store.deleted_with == 8


def test_run_once_still_deletes_when_nothing_new():
    """新着ゼロの回でも期限切れ削除は走ること（静かな日ほど古い記事が残るのを防ぐ）。"""
    store = FakeStore()

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]):
        run_once(store, CONFIG)

    assert store.upserted == []
    assert store.deleted_with == 8


def test_collect_all_skips_empty_feed_urls():
    config = {"rss_sites": {"A": "https://a.test/feed", "B": ""}, "blacklist_prefixes": []}

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]) as collect:
        collect_all(config, set(), sleep_seconds=0)

    assert len(collect.call_args_list) == 1


def test_collect_all_passes_blacklist_prefixes():
    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]) as collect:
        collect_all(CONFIG, set(), sleep_seconds=0)

    assert collect.call_args_list[0][0][3]["prefixes"] == ["https://a.test/ad/"]


def test_collect_all_passes_blacklist_categories():
    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]) as collect:
        collect_all(CONFIG, set(), sleep_seconds=0)

    assert collect.call_args_list[0][0][3]["categories"] == {"Gigazine": ["試食"]}


def test_collect_all_shares_one_link_set_across_sites():
    """同じ記事が複数サイトに出ても1度しか積まれないこと（集合を巡回中に更新するため）。"""
    seen = set()

    def fake_collect(url, name, links, blacklist):
        if "a.test" in url:
            links.add("https://dup.test/1")
            return [article("https://dup.test/1", "2026-08-14T10:00:00+09:00")]
        seen.update(links)
        return []

    with patch.object(run_once_module, "collect_new_rss_articles", side_effect=fake_collect):
        collect_all(CONFIG, set(), sleep_seconds=0)

    assert "https://dup.test/1" in seen
