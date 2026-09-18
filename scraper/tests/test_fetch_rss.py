from types import SimpleNamespace
from unittest.mock import patch

from fetch_rss import (
    collect_new_rss_articles,
    entry_categories,
    entry_matches_category_blacklist,
)


def test_entry_categories_splits_tags_and_subject():
    entry = {
        "tags": [{"term": "AI, ソフトウェア"}],
        "dc_subject": "メモ,",
    }
    assert entry_categories(entry) == ["AI", "ソフトウェア", "メモ"]


def test_entry_matches_category_blacklist_only_when_all_categories_blocked():
    only_blocked = {"tags": [{"term": "試食"}]}
    mixed = {"tags": [{"term": "試食, AI"}]}
    rules = {"Gigazine": ["試食"]}
    assert entry_matches_category_blacklist(only_blocked, "Gigazine", rules)
    assert not entry_matches_category_blacklist(mixed, "Gigazine", rules)
    assert not entry_matches_category_blacklist(only_blocked, "GAZ:Log", {"GAZ:Log": ["Apple"]})
    assert not entry_matches_category_blacklist({"tags": []}, "Gigazine", rules)


def test_entry_matches_category_blacklist_global_star():
    entry = {"tags": [{"term": "ヘッドライン"}]}
    rules = {"*": ["ヘッドライン"]}
    assert entry_matches_category_blacklist(entry, "Gigazine", rules)


def test_collect_new_rss_articles_skips_blacklisted_category_before_ogp():
    feed = SimpleNamespace(
        entries=[
            {
                "title": "blocked",
                "link": "https://gigazine.net/news/blocked/",
                "published_parsed": (2026, 9, 17, 8, 0, 0, 0, 0, 0),
                "tags": [{"term": "\u8a66\u98df"}],
            },
            {
                "title": "ok",
                "link": "https://gigazine.net/news/ok/",
                "published_parsed": (2026, 9, 17, 9, 0, 0, 0, 0, 0),
                "tags": [{"term": "AI"}],
            },
            {
                "title": "mixed",
                "link": "https://gigazine.net/news/mixed/",
                "published_parsed": (2026, 9, 17, 10, 0, 0, 0, 0, 0),
                "tags": [{"term": "\u8a66\u98df, AI"}],
            },
        ]
    )
    existing = set()

    with patch("fetch_rss.feedparser.parse", return_value=feed):
        with patch("fetch_rss.get_article_image", return_value="https://img/ok.jpg") as ogp:
            articles = collect_new_rss_articles(
                "https://gigazine.net/news/rss_2.0/",
                "Gigazine",
                existing,
                blacklist={"categories": {"Gigazine": ["\u8a66\u98df"]}},
            )

    assert [a["link"] for a in articles] == [
        "https://gigazine.net/news/ok/",
        "https://gigazine.net/news/mixed/",
    ]
    assert ogp.call_count == 2
