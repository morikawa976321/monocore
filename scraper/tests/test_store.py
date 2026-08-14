import json
from datetime import datetime, timedelta, timezone

import pytest

from store import (
    CHUNK_SIZE,
    PAGE_SIZE,
    ArticleStore,
    StoreError,
    article_to_row,
    expired_filter,
    expiry_threshold,
    load_env_config,
)

COLLECTED_AT = "2026-08-14T13:00:00Z"


class FakeResponse:
    def __init__(self, status_code=200, payload=None, headers=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}
        self.text = text

    def json(self):
        return self._payload


class FakeSession:
    """requests.Session の差し替え。呼び出しを記録するだけ。"""

    def __init__(self, get_responses=None, post_response=None, delete_response=None):
        self.get_responses = list(get_responses or [])
        self.post_response = post_response or FakeResponse(201)
        self.delete_response = delete_response or FakeResponse(204)
        self.get_calls = []
        self.post_calls = []
        self.delete_calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.get_calls.append({"url": url, "params": params, "headers": headers})
        return self.get_responses.pop(0)

    def post(self, url, params=None, headers=None, data=None, timeout=None):
        self.post_calls.append({"url": url, "params": params, "headers": headers, "data": data})
        return self.post_response

    def delete(self, url, headers=None, timeout=None):
        self.delete_calls.append({"url": url, "headers": headers})
        return self.delete_response


def make_store(session):
    return ArticleStore("http://localhost:54321", "test-key", session=session)


# ---------------------------------------------------------------
# article_to_row — PGRST102（キー集合の不一致で400）対策が主眼
# ---------------------------------------------------------------

def test_article_to_row_maps_fields():
    row = article_to_row(
        {
            "source": "PC Watch",
            "title": "タイトル",
            "link": "https://example.test/1",
            "published": "2026-08-14T19:00:00+09:00",
            "image": "https://example.test/1.png",
        },
        COLLECTED_AT,
    )
    assert row == {
        "link": "https://example.test/1",
        "source": "PC Watch",
        "title": "タイトル",
        "published": "2026-08-14T19:00:00+09:00",
        "image_url": "https://example.test/1.png",
        "collected_at": COLLECTED_AT,
    }


@pytest.mark.parametrize(
    "article",
    [
        {"link": "https://example.test/a", "source": "S", "title": "T", "published": None, "image": ""},
        {"link": "https://example.test/b", "source": "S", "title": "T"},
        {"link": "https://example.test/c"},
    ],
)
def test_article_to_row_always_has_the_same_keys(article):
    """値が無い列もキーごと落とさないこと。

    PostgREST は一括INSERTの配列内でキー集合が揃っていないと PGRST102 で400を返す。
    画像が取れた記事と取れなかった記事が同じ巡回に混ざるのは日常なので、ここが崩れると
    「たまたま全記事に画像があった回だけ成功する」という気づきにくい壊れ方をする。
    """
    row = article_to_row(article, COLLECTED_AT)
    assert set(row) == {"link", "source", "title", "published", "image_url", "collected_at"}


def test_article_to_row_normalizes_empty_values():
    row = article_to_row(
        {"link": "https://example.test/x", "image": "", "published": None},
        COLLECTED_AT,
    )
    assert row["image_url"] is None
    assert row["published"] is None
    # NOT NULL 制約のある列は空でも値を入れる。
    assert row["source"] == ""
    assert row["title"] == "タイトル不明"


def test_upsert_sends_uniform_key_sets_for_mixed_articles():
    """画像のある記事と無い記事が混ざった配列を送っても、全行のキー集合が一致すること。"""
    session = FakeSession()
    store = make_store(session)

    store.upsert_articles(
        [
            {"link": "https://example.test/1", "source": "S", "title": "T", "image": "https://example.test/1.png"},
            {"link": "https://example.test/2", "source": "S", "title": "T"},
        ],
        collected_at=COLLECTED_AT,
    )

    sent = json.loads(session.post_calls[0]["data"].decode("utf-8"))
    assert len({tuple(sorted(row)) for row in sent}) == 1


# ---------------------------------------------------------------
# 期限切れ削除
# ---------------------------------------------------------------

def test_expiry_threshold_is_utc_z_without_plus():
    threshold = expiry_threshold(datetime(2026, 8, 14, 13, 0, 0, tzinfo=timezone.utc), 8)
    assert threshold == "2026-08-06T13:00:00Z"
    # クエリ文字列で '+' は空白扱いになり 22007 で落ちるため、絶対に含めない。
    assert "+" not in threshold


def test_expiry_threshold_converts_local_time_to_utc():
    """JST の now を渡しても UTC に直してから引くこと。"""
    jst = timezone(timedelta(hours=9))
    threshold = expiry_threshold(datetime(2026, 8, 14, 22, 0, 0, tzinfo=jst), 8)
    assert threshold == "2026-08-06T13:00:00Z"


def test_expired_filter_covers_null_published_rows():
    """published が NULL の記事は collected_at で判定すること（さもないと永久に残る）。"""
    f = expired_filter("2026-08-06T13:00:00Z")
    assert f == (
        "or=(published.lt.2026-08-06T13:00:00Z,"
        "and(published.is.null,collected_at.lt.2026-08-06T13:00:00Z))"
    )


def test_delete_expired_returns_count_from_content_range():
    session = FakeSession(delete_response=FakeResponse(204, headers={"Content-Range": "*/3"}))
    store = make_store(session)

    deleted = store.delete_expired(8, now=datetime(2026, 8, 14, 13, 0, 0, tzinfo=timezone.utc))

    assert deleted == 3
    assert "published.is.null" in session.delete_calls[0]["url"]


def test_delete_expired_returns_none_when_count_absent():
    session = FakeSession(delete_response=FakeResponse(204))
    store = make_store(session)
    assert store.delete_expired(8) is None


# ---------------------------------------------------------------
# ページング（max_rows=1000 で黙って切れると重複記事が復活する）
# ---------------------------------------------------------------

def test_fetch_existing_links_pages_until_short_page():
    first = [{"link": f"https://example.test/{i}"} for i in range(PAGE_SIZE)]
    second = [{"link": "https://example.test/last"}]
    session = FakeSession(get_responses=[FakeResponse(200, first), FakeResponse(200, second)])
    store = make_store(session)

    links = store.fetch_existing_links()

    assert len(links) == PAGE_SIZE + 1
    assert "https://example.test/last" in links
    assert len(session.get_calls) == 2
    assert session.get_calls[0]["headers"]["Range"] == f"0-{PAGE_SIZE - 1}"
    assert session.get_calls[1]["headers"]["Range"] == f"{PAGE_SIZE}-{2 * PAGE_SIZE - 1}"


def test_fetch_existing_links_stops_on_single_short_page():
    session = FakeSession(get_responses=[FakeResponse(200, [{"link": "https://example.test/1"}])])
    store = make_store(session)

    assert store.fetch_existing_links() == {"https://example.test/1"}
    assert len(session.get_calls) == 1


def test_fetch_existing_links_raises_on_http_error():
    session = FakeSession(get_responses=[FakeResponse(401, text="unauthorized")])
    store = make_store(session)

    with pytest.raises(StoreError):
        store.fetch_existing_links()


# ---------------------------------------------------------------
# 分割投入
# ---------------------------------------------------------------

def test_upsert_splits_into_chunks():
    session = FakeSession()
    store = make_store(session)
    articles = [{"link": f"https://example.test/{i}", "source": "S", "title": "T"} for i in range(CHUNK_SIZE * 2 + 1)]

    count = store.upsert_articles(articles, collected_at=COLLECTED_AT)

    assert count == CHUNK_SIZE * 2 + 1
    assert len(session.post_calls) == 3
    assert all(
        len(json.loads(call["data"].decode("utf-8"))) <= CHUNK_SIZE for call in session.post_calls
    )
    assert session.post_calls[0]["params"] == {"on_conflict": "link"}
    assert "ignore-duplicates" in session.post_calls[0]["headers"]["Prefer"]


def test_upsert_does_nothing_for_empty_input():
    session = FakeSession()
    store = make_store(session)
    assert store.upsert_articles([]) == 0
    assert session.post_calls == []


# ---------------------------------------------------------------
# 設定の読み込み（キーを外に出さないこと）
# ---------------------------------------------------------------

def test_load_env_config_reads_bom_prefixed_file(tmp_path):
    """~/.monocore/config.json は PowerShell 由来の UTF-8 BOM 付き。"""
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps({"envs": {"remote": {"url": "https://x.supabase.co", "service_key": "k"}}}),
        encoding="utf-8-sig",
    )

    url, key = load_env_config("remote", config_path=str(path))

    assert url == "https://x.supabase.co"
    assert key == "k"


def test_load_env_config_error_does_not_leak_file_contents(tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"envs": {"remote": {"service_key": "SUPER-SECRET"}}}', encoding="utf-8")

    with pytest.raises(StoreError) as excinfo:
        load_env_config("remote", config_path=str(path))

    assert "SUPER-SECRET" not in str(excinfo.value)


def test_load_env_config_missing_file(tmp_path):
    with pytest.raises(StoreError):
        load_env_config("remote", config_path=str(tmp_path / "nope.json"))
