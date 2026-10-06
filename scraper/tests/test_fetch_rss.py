from types import SimpleNamespace
from unittest.mock import patch

from fetch_rss import collect_new_rss_articles, entry_categories


def test_entry_categories_splits_tags_and_subject():
    entry = {
        "tags": [{"term": "AI, ソフトウェア"}],
        "dc_subject": "メモ,",
    }
    assert entry_categories(entry) == ["AI", "ソフトウェア", "メモ"]


def entry(slug, tags=None):
    item = {
        "title": slug,
        "link": f"https://gigazine.net/news/{slug}/",
        "published_parsed": (2026, 9, 17, 8, 0, 0, 0, 0, 0),
    }
    if tags is not None:
        item["tags"] = [{"term": tags}]
    return item


def test_collect_new_rss_articles_applies_blacklist_before_ogp():
    feed = SimpleNamespace(
        entries=[
            entry("blocked", "試食"),
            entry("ok", "AI"),
            # カテゴリが1つでもリスト外にあれば残す。
            entry("mixed", "試食, AI"),
            # "*" は全サイトに効く。
            entry("headline", "ヘッドライン"),
            # カテゴリの無い記事はブロックしない。
            entry("untagged"),
            {"title": "ad", "link": "https://gigazine.net/ad/1/", "tags": [{"term": "AI"}]},
        ]
    )
    blacklist = {
        "prefixes": ["https://gigazine.net/ad/"],
        # 他サイトの規則は効かない（効くと "ok" まで消える）。
        "categories": {"Gigazine": ["試食"], "*": ["ヘッドライン"], "GAZ:Log": ["AI"]},
    }

    with patch("fetch_rss.feedparser.parse", return_value=feed):
        with patch("fetch_rss.get_article_image", return_value="https://img/ok.jpg") as ogp:
            articles = collect_new_rss_articles(
                "https://gigazine.net/news/rss_2.0/", "Gigazine", set(), blacklist
            )

    assert [a["title"] for a in articles] == ["ok", "mixed", "untagged"]
    # ブロック対象の OGP は取りに行かない。
    assert ogp.call_count == 3
