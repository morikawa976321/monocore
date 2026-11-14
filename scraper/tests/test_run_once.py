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
    def __init__(self, existing_links=None, expired_image_urls=None, image_rows=None, events=None):
        self._existing_links = set(existing_links or [])
        self._expired_image_urls = list(expired_image_urls or [])
        self._image_rows = list(image_rows or [])
        self.events = events if events is not None else []
        self.upserted = None
        self.deleted_with = None
        self.updated = {}
        self.vanished_links = set()

    def fetch_existing_links(self):
        return set(self._existing_links)

    def upsert_articles(self, articles):
        # 呼び出し時点の中身を保存する。参照のまま持つと、upsert のあとに in-place で
        # 書き換えても assert が通ってしまい、順序の取り違えを検出できない。
        self.upserted = [dict(a) for a in articles]
        return len(articles)

    def fetch_expired_image_urls(self, max_age_days, now=None):
        return list(self._expired_image_urls)

    def fetch_image_rows(self):
        return list(self._image_rows)

    def update_image_url(self, link, image_url):
        if link in self.vanished_links:
            return False
        self.updated[link] = image_url
        return True

    def delete_expired(self, max_age_days, now=None):
        self.events.append("delete_rows")
        self.deleted_with = max_age_days
        return 2


class FakeStorage:
    """ThumbnailStorage の差し替え。bucket 配下の URL だけを自分のものと見なす。"""

    PREFIX = "https://s.test/thumbs/"

    def __init__(self, events=None):
        self.events = events if events is not None else []
        self.deleted = None

    def name_from_url(self, image_url):
        if image_url and image_url.startswith(self.PREFIX):
            return image_url[len(self.PREFIX):]
        return None

    def public_url(self, name):
        return self.PREFIX + name

    def upload(self, name, data):
        self.events.append(f"upload:{name}")

    def delete(self, names):
        self.events.append("delete_objects")
        self.deleted = list(names)


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


def test_run_once_deletes_expired_thumbnails_before_rows():
    """画像を先に消すこと。行を先に消すと、画像の削除に失敗したとき二度と掃除されない。"""
    events = []
    store = FakeStore(
        expired_image_urls=[
            FakeStorage.PREFIX + "old1.webp",
            "https://external.test/original.jpg",  # 縮小前の行。バケットの外なので触らない
            FakeStorage.PREFIX + "old2.webp",
        ],
        events=events,
    )
    storage = FakeStorage(events)

    with patch.object(run_once_module, "collect_new_rss_articles", return_value=[]):
        run_once(store, CONFIG, storage)

    assert storage.deleted == ["old1.webp", "old2.webp"]
    assert events == ["delete_objects", "delete_rows"]


def test_run_once_makes_thumbnails_for_new_articles_before_upsert():
    store = FakeStore()
    storage = FakeStorage()
    new = {"source": "S", "title": "T", "link": "https://a.test/1", "published": None, "image": "https://img.test/1.jpg"}

    def fake_attach(st, arts):
        for x in arts:
            x["image"] = st.public_url("t.webp")
        return len(arts)

    with (
        patch.object(run_once_module, "collect_new_rss_articles", side_effect=lambda *a, **k: [dict(new)] if "a.test" in a[0] else []),
        patch.object(run_once_module, "attach_thumbnails", side_effect=fake_attach),
    ):
        run_once(store, CONFIG, storage)

    assert [a["image"] for a in store.upserted] == [FakeStorage.PREFIX + "t.webp"]


def test_backfill_only_touches_rows_pointing_outside_the_bucket():
    store = FakeStore(
        image_rows=[
            {"link": "https://a.test/done", "image_url": FakeStorage.PREFIX + "x.webp"},
            {"link": "https://a.test/orig", "image_url": "https://img.test/orig.jpg"},
            {"link": "https://a.test/fail", "image_url": "https://img.test/fail.jpg"},
        ]
    )

    def fake_build(storage, link, image_url, fetch=None):
        return None if "fail" in image_url else storage.public_url("new.webp")

    with patch.object(run_once_module, "build_thumbnail_url", side_effect=fake_build):
        result = run_once_module.backfill_thumbnails(store, FakeStorage(), sleep_seconds=0)

    assert result == {"targets": 2, "converted": 1}
    assert store.updated == {"https://a.test/orig": FakeStorage.PREFIX + "new.webp"}


def test_backfill_deletes_the_new_thumbnail_when_the_row_vanished_meanwhile():
    """作っている間に期限切れ削除で行が消えたら、置いた画像は孤児になるので消すこと。"""
    store = FakeStore(image_rows=[{"link": "https://a.test/gone", "image_url": "https://img.test/gone.jpg"}])
    store.vanished_links.add("https://a.test/gone")
    storage = FakeStorage()

    with patch.object(
        run_once_module, "build_thumbnail_url", side_effect=lambda st, link, url, fetch=None: st.public_url("gone.webp")
    ):
        result = run_once_module.backfill_thumbnails(store, storage, sleep_seconds=0)

    assert result == {"targets": 1, "converted": 0}
    assert storage.deleted == ["gone.webp"]
