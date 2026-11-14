import io
import json

import pytest
from PIL import Image

import thumbnails
from thumbnails import (
    THUMB_HEIGHT,
    THUMB_WIDTH,
    ThumbnailError,
    ThumbnailStorage,
    _require_public_http_url,
    attach_thumbnails,
    build_thumbnail_url,
    make_thumbnail,
    thumbnail_name,
)


def encode(size, mode="RGB", color=(200, 30, 30), fmt="JPEG"):
    out = io.BytesIO()
    Image.new(mode, size, color).save(out, fmt)
    return out.getvalue()


def decode(data):
    im = Image.open(io.BytesIO(data))
    im.load()
    return im


# ---------------------------------------------------------------
# make_thumbnail — 表示枠(3:2・object-cover)に合わせて切り、拡大しないこと
# ---------------------------------------------------------------

def test_large_landscape_becomes_exact_thumbnail_size():
    result = decode(make_thumbnail(encode((1200, 630))))
    assert result.format == "WEBP"
    assert result.size == (THUMB_WIDTH, THUMB_HEIGHT)


def test_tall_image_is_center_cropped_to_3_by_2():
    # 上下の端だけ色を変え、中央で切られたら端の色が消えることで切り抜き位置を確かめる。
    im = Image.new("RGB", (900, 1600), (0, 255, 0))
    im.paste((255, 0, 0), (0, 0, 900, 300))
    im.paste((255, 0, 0), (0, 1300, 900, 1600))
    out = io.BytesIO()
    im.save(out, "PNG")

    result = decode(make_thumbnail(out.getvalue()))

    assert result.size == (THUMB_WIDTH, THUMB_HEIGHT)
    r, g, b = result.convert("RGB").getpixel((THUMB_WIDTH // 2, THUMB_HEIGHT // 2))
    assert g > 200 and r < 60  # 中央は緑のまま(切り抜きは 900x600 の中央なので赤の端は入らない)


def test_small_image_is_cropped_but_never_upscaled():
    result = decode(make_thumbnail(encode((200, 100))))
    assert result.size == (150, 100)


def test_transparent_png_is_flattened_onto_white():
    data = encode((600, 400), mode="RGBA", color=(0, 0, 0, 0), fmt="PNG")
    r, g, b = decode(make_thumbnail(data)).convert("RGB").getpixel((10, 10))
    # 透過をそのまま RGB に落とすと黒になる。
    assert min(r, g, b) > 240


def test_garbage_bytes_raise_thumbnail_error():
    with pytest.raises(ThumbnailError):
        make_thumbnail(b"<html>not an image</html>")


def test_pixel_limit_rejects_before_decoding(monkeypatch):
    monkeypatch.setattr(thumbnails, "MAX_PIXELS", 1000)
    with pytest.raises(ThumbnailError):
        make_thumbnail(encode((100, 100)))


# ---------------------------------------------------------------
# 取得先の検査(og:image は外部サイトが決める URL)
# ---------------------------------------------------------------

@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.test/a.png",
        "file:///etc/passwd",
        "http://127.0.0.1/a.png",
        "http://localhost/a.png",
        "http://192.168.0.1/a.png",
        "http://10.0.0.5/a.png",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/a.png",
        "http://[fe80::1]/a.png",
    ],
)
def test_non_public_or_non_http_urls_are_rejected(url):
    with pytest.raises(ThumbnailError):
        _require_public_http_url(url)


def test_public_literal_address_is_accepted():
    _require_public_http_url("https://8.8.8.8/a.png")


# ---------------------------------------------------------------
# 名前と URL
# ---------------------------------------------------------------

def test_thumbnail_name_is_stable_and_ascii():
    name = thumbnail_name("https://example.test/記事/1")
    assert name == thumbnail_name("https://example.test/記事/1")
    assert name != thumbnail_name("https://example.test/記事/2")
    assert name.isascii() and name.endswith(".webp")


class FakeResponse:
    def __init__(self, status_code=200, text=""):
        self.status_code = status_code
        self.text = text


class FakeSession:
    def __init__(self, status_code=200):
        self.status_code = status_code
        self.post_calls = []
        self.delete_calls = []

    def post(self, url, headers=None, data=None, timeout=None):
        self.post_calls.append({"url": url, "headers": headers, "data": data})
        return FakeResponse(self.status_code)

    def delete(self, url, headers=None, data=None, timeout=None):
        self.delete_calls.append({"url": url, "headers": headers, "data": json.loads(data)})
        return FakeResponse(self.status_code)


def make_storage(session=None):
    return ThumbnailStorage("http://localhost:54321/", "test-key", session=session or FakeSession())


def test_public_url_round_trips_through_name_from_url():
    storage = make_storage()
    url = storage.public_url("abc.webp")
    assert url == "http://localhost:54321/storage/v1/object/public/news-thumbs/abc.webp"
    assert storage.name_from_url(url) == "abc.webp"


def test_name_from_url_ignores_foreign_and_empty_urls():
    storage = make_storage()
    assert storage.name_from_url("https://example.test/a.png") is None
    assert storage.name_from_url(None) is None
    assert storage.name_from_url(storage.public_url("")) is None


def test_upload_sets_webp_upsert_and_long_cache():
    session = FakeSession()
    make_storage(session).upload("abc.webp", b"data")

    call = session.post_calls[0]
    assert call["url"] == "http://localhost:54321/storage/v1/object/news-thumbs/abc.webp"
    assert call["headers"]["Content-Type"] == "image/webp"
    assert call["headers"]["x-upsert"] == "true"
    assert "max-age" in call["headers"]["cache-control"]


def test_delete_splits_names_into_chunks_and_skips_empty():
    session = FakeSession()
    storage = make_storage(session)

    storage.delete([])
    assert session.delete_calls == []

    storage.delete([f"{i}.webp" for i in range(thumbnails.DELETE_CHUNK_SIZE + 1)])
    assert [len(c["data"]["prefixes"]) for c in session.delete_calls] == [thumbnails.DELETE_CHUNK_SIZE, 1]


def test_upload_error_does_not_leak_key():
    with pytest.raises(Exception) as excinfo:
        make_storage(FakeSession(status_code=500)).upload("a.webp", b"x")
    assert "test-key" not in str(excinfo.value)


# ---------------------------------------------------------------
# 失敗しても巡回を止めず、元の URL のまま残すこと
# ---------------------------------------------------------------

def test_build_thumbnail_url_returns_none_when_fetch_fails():
    def failing_fetch(url):
        raise ThumbnailError("boom")

    assert build_thumbnail_url(make_storage(), "https://example.test/1", "https://img.test/1.jpg", failing_fetch) is None


def test_build_thumbnail_url_returns_none_when_upload_fails():
    storage = make_storage(FakeSession(status_code=404))
    result = build_thumbnail_url(
        storage, "https://example.test/1", "https://img.test/1.jpg", lambda url: encode((600, 400))
    )
    assert result is None


def test_attach_thumbnails_replaces_only_what_succeeded():
    storage = make_storage()
    articles = [
        {"link": "https://example.test/ok", "image": "https://img.test/ok.jpg"},
        {"link": "https://example.test/bad", "image": "https://img.test/bad.jpg"},
        {"link": "https://example.test/none", "image": ""},
    ]

    def fetch(url):
        if "bad" in url:
            raise ThumbnailError("boom")
        return encode((600, 400))

    made = attach_thumbnails(storage, articles, fetch)

    assert made == 1
    assert articles[0]["image"] == storage.public_url(thumbnail_name("https://example.test/ok"))
    assert articles[1]["image"] == "https://img.test/bad.jpg"
    assert articles[2]["image"] == ""
