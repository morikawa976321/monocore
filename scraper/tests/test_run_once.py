"""run_once の配線（既存リンク → 収集 → 投入 → 期限切れ削除）のテスト。

JSONL 時代の tests/test_scheduler_runner.py の後継。旧テストは load_existing_links と
record_rss_articles（ファイル書き込み）を見ていたが、両方とも保存先の変更で消えた。
"""

from unittest.mock import patch

import pytest

import run_once as run_once_module
from run_once import collect_all, run_once

CONFIG = {
    "rss_sites": {"A": "https://a.test/feed", "B": "https://b.test/feed"},
    "blacklist_prefixes": ["https://a.test/ad/"],
    "blacklist_categories": {"Gigazine": ["試食"]},
    "max_age_days": 8,
}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    # run_once はサイト間で待つので、止めないと1テスト数秒かかる。
    monkeypatch.setattr(run_once_module.time, "sleep", lambda seconds: None)


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


def article(link):
    return {"source": "S", "title": link, "link": link, "published": None, "image": ""}


def test_run_once_wires_links_blacklist_and_store():
    store = FakeStore({"https://a.test/old"})
    calls = []

    # 引数は名前で受ける（位置の添字で読むと、呼び出し形を変えただけで壊れる）。
    def fake_collect(rss_url, source_name, existing_links, blacklist=None):
        calls.append({"existing_links": set(existing_links), "blacklist": blacklist})
        return [article(rss_url.replace("/feed", "/1"))]

    with patch.object(run_once_module, "collect_new_rss_articles", side_effect=fake_collect):
        result = run_once(store, CONFIG)

    assert "https://a.test/old" in calls[0]["existing_links"]
    assert calls[0]["blacklist"] == {
        "prefixes": ["https://a.test/ad/"],
        "categories": {"Gigazine": ["試食"]},
    }
    assert {a["link"] for a in store.upserted} == {"https://a.test/1", "https://b.test/1"}
    assert result["upserted"] == 2
    assert result["deleted"] == 2


def test_run_once_still_deletes_when_nothing_new():
    """新着ゼロの回でも期限切れ削除は走ること（静かな日ほど古い記事が残るのを防ぐ）。"""
    store = FakeStore()

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]):
        run_once(store, CONFIG)

    assert store.upserted == []
    assert store.deleted_with == 8


def test_collect_all_shares_one_link_set_across_sites():
    """同じ記事が複数サイトに出ても1度しか積まれないこと（集合を巡回中に更新するため）。"""
    seen = set()

    def fake_collect(rss_url, source_name, existing_links, blacklist=None):
        if "a.test" in rss_url:
            existing_links.add("https://dup.test/1")
            return [article("https://dup.test/1")]
        seen.update(existing_links)
        return []

    with patch.object(run_once_module, "collect_new_rss_articles", side_effect=fake_collect):
        collect_all(CONFIG, set(), sleep_seconds=0)

    assert "https://dup.test/1" in seen
