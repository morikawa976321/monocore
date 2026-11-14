"""
記事サムネイルの生成と Supabase Storage への保存。

■ なぜ縮めて自前で持つのか(2026-11-15)
    /news は og:image を原寸のまま <img> で読んでいた。実測(550件中120枚)で幅の中央値 1200px・
    最大 3840px、1枚の中央値 229KB・最大 2.9MB。表示枠は全幅で 160×107 CSS px(3倍密度でも 480px)
    なので、初回表示の先頭20枚だけで約 11MB を読んでいた。480×320 の WebP にすると 1枚 約 12KB。
    外部のリサイズ中継(wsrv.nl 等)は、依存と閲覧先の漏えいが増えるので採らなかった。
    next/image は Vercel の画像最適化の無料枠(月の元画像数)を、毎日入れ替わる記事で超えやすいので採らなかった。

■ 切り抜きと大きさ
    表示側は 3:2 の枠に object-cover(中央)で入れる。同じ中央切り抜きを先にやっておけば
    余白分のバイトを送らずに済む。枠を 3:2 以外に変えるなら THUMB_WIDTH/HEIGHT を変えて
    backfill をやり直すこと。元画像が 480px 未満のときは拡大しない(切り抜きだけ)。

■ 失敗したら
    画像の取得・デコード・アップロードのどれかが失敗した記事は、元の og:image の URL のまま
    保存する(旧来の挙動。画面側は読み込み失敗で「画像なし」に落ちる)。1枚のために巡回全体を
    止めない。作り直しは `run_once.py --backfill`(Storage の外を指す行だけを対象にする)。

■ 取得先の制限
    og:image の URL は外部サイトが決めるので、http/https 以外・公開アドレスでないホスト
    (ループバック・LAN・リンクローカル)は取りに行かない。リダイレクトも1回ずつ同じ検査を通す。
    URL は requests と同じ解釈で検査する(`_require_public_http_url` の docstring)。
    DNS の名前解決と実際の接続の間に別アドレスへ差し替える攻撃(DNS rebinding)までは防がない
    (手元PCの1時間おきのジョブで、取った画像が画像として読めなければ捨てるため受け入れた)。
"""

import hashlib
import io
import ipaddress
import json
import socket
from urllib.parse import urljoin, urlparse

import requests
import urllib3
from PIL import Image, ImageOps

from log_config import get_logger
from store import StoreError

logger = get_logger(__name__)

BUCKET = "news-thumbs"
THUMB_WIDTH = 480
THUMB_HEIGHT = 320
WEBP_QUALITY = 75
# 取得する画像1枚の上限。実測の最大は 2.9MB。
MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
# 展開後の画素数の上限(デコード爆弾対策)。実測の最大は 3840 幅。
MAX_PIXELS = 50_000_000
MAX_REDIRECTS = 3
DOWNLOAD_TIMEOUT_SECONDS = 10
STORAGE_TIMEOUT_SECONDS = 15
# オブジェクト名は link のハッシュで、同じ名前の中身は変わらない。
CACHE_CONTROL = "max-age=31536000"
# Storage の削除 API に1回で渡す名前の数。
DELETE_CHUNK_SIZE = 200

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/118.0.0.0 Safari/537.36"
)
_REDIRECT_STATUSES = (301, 302, 303, 307, 308)
_NAT64_NETWORK = ipaddress.IPv6Network("64:ff9b::/96")


class ThumbnailError(Exception):
    """サムネイルを作れなかった理由。呼び出し側は元URLのまま保存して続行する。"""


def thumbnail_name(link):
    """記事 link から決まるオブジェクト名。同じ記事は何度作っても同じ名前になる。"""
    return hashlib.sha256(link.encode("utf-8")).hexdigest()[:32] + ".webp"


def _is_public_address(address):
    # NAT64(64:ff9b::/96)は末尾32bitが IPv4 アドレスで、is_global は中身を見ない。
    # ::/8 の予約域に含まれるので、予約の判定より先に見る。
    if isinstance(address, ipaddress.IPv6Address) and address in _NAT64_NETWORK:
        return _is_public_address(ipaddress.IPv4Address(int(address) & 0xFFFFFFFF))
    # is_global は予約域(::/8 の旧 IPv4 互換 ::127.0.0.1 など)を見ない。
    return address.is_global and not address.is_multicast and not address.is_reserved


def _require_public_http_url(url):
    """取得してよい URL かを検査し、requests が実際に送る形に正規化した URL を返す。

    検査と送信で URL の解釈が違うと迂回される(ホストの直後に「バックスラッシュ + @ + 公開IP」を
    続けた URL は、標準の urlparse ではホストが公開IP、requests/urllib3 では前半の内部アドレスに
    なる。argon のレビューで指摘され、テストに例を入れてある)。そこで requests と同じ
    組み立てを通した URL を urllib3 のパーサで読み、その URL をそのまま送る。
    """
    try:
        prepared_url = requests.Request("GET", url).prepare().url
        parsed = urllib3.util.parse_url(prepared_url)
    except (requests.RequestException, ValueError, urllib3.exceptions.LocationParseError):
        raise ThumbnailError("URL を解釈できません") from None

    if parsed.scheme not in ("http", "https") or not parsed.host or parsed.auth:
        raise ThumbnailError("http/https の URL ではありません")

    # 公開ホストにスコープ ID や % エンコードは要らない。urllib3 はホストの %25 を1段剥がし、
    # requests は %XX をデコードするので、%252530 のような二重エンコードは、検査した
    # アドレスと実際に接続するアドレスが食い違う。送る側(session.get)がもう一度整形しても
    # URL が変わらないことを確かめて、その種の食い違い全般を塞ぐ。
    if "%" in parsed.host or requests.Request("GET", prepared_url).prepare().url != prepared_url:
        raise ThumbnailError("URL の解釈が安定しません")

    host = parsed.host.strip("[]")
    try:
        infos = socket.getaddrinfo(host, parsed.port, proto=socket.IPPROTO_TCP)
    except (OSError, ValueError):
        # 空ラベル(a..com)や64文字超のラベルは getaddrinfo が UnicodeError(ValueError)を投げる。
        raise ThumbnailError("ホスト名を解決できません") from None

    for info in infos:
        address = info[4][0].split("%")[0]  # IPv6 のスコープ ID(fe80::1%eth0)を落とす
        if not _is_public_address(ipaddress.ip_address(address)):
            raise ThumbnailError("公開アドレスでないホストです")

    return prepared_url


def fetch_image_bytes(url, session=None, timeout=DOWNLOAD_TIMEOUT_SECONDS):
    """画像を取得してバイト列で返す。上限を超えるか、取得先が不適切なら ThumbnailError。"""
    session = session or requests
    headers = {"User-Agent": _USER_AGENT}

    for _ in range(MAX_REDIRECTS + 1):
        url = _require_public_http_url(url)
        with session.get(
            url, headers=headers, timeout=timeout, stream=True, allow_redirects=False
        ) as response:
            if response.status_code in _REDIRECT_STATUSES:
                location = response.headers.get("Location")
                if not location:
                    raise ThumbnailError("リダイレクト先がありません")
                try:
                    url = urljoin(url, location)
                except ValueError:
                    raise ThumbnailError("リダイレクト先を解釈できません") from None
                continue

            response.raise_for_status()

            declared = response.headers.get("Content-Length", "")
            if declared.isdigit() and int(declared) > MAX_DOWNLOAD_BYTES:
                raise ThumbnailError("画像が大きすぎます")

            chunks = []
            total = 0
            for chunk in response.iter_content(chunk_size=65536):
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise ThumbnailError("画像が大きすぎます")
                chunks.append(chunk)
            return b"".join(chunks)

    raise ThumbnailError("リダイレクトが多すぎます")


def _flatten_to_rgb(im):
    """透過を白で潰して RGB にする(WebP へ落とすとき、透過部が黒になるのを避ける)。"""
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        rgba = im.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return im.convert("RGB")


def _center_crop_to_ratio(im):
    ratio = THUMB_WIDTH / THUMB_HEIGHT
    width, height = im.size
    if width / height > ratio:
        new_width = min(width, max(1, round(height * ratio)))
        left = (width - new_width) // 2
        return im.crop((left, 0, left + new_width, height))
    new_height = min(height, max(1, round(width / ratio)))
    top = (height - new_height) // 2
    return im.crop((0, top, width, top + new_height))


def make_thumbnail(data):
    """画像のバイト列から 3:2・最大 480×320 の WebP を作って返す。読めなければ ThumbnailError。"""
    try:
        with Image.open(io.BytesIO(data)) as source:
            # open は遅延評価で、ここでは寸法しか読んでいない。展開する前に弾く。
            if source.width * source.height > MAX_PIXELS:
                raise ThumbnailError("画素数が多すぎます")
            im = _flatten_to_rgb(ImageOps.exif_transpose(source))

        im = _center_crop_to_ratio(im)
        if im.width > THUMB_WIDTH:
            im = im.resize((THUMB_WIDTH, THUMB_HEIGHT), Image.LANCZOS)

        out = io.BytesIO()
        im.save(out, "WEBP", quality=WEBP_QUALITY)
        return out.getvalue()
    except ThumbnailError:
        raise
    except Exception as e:
        raise ThumbnailError(f"画像を処理できません: {type(e).__name__}") from None


class ThumbnailStorage:
    """公開バケット news-thumbs への書き込み・削除。読む側はブラウザが公開 URL で直接取る。"""

    def __init__(self, url, service_key, session=None, timeout=STORAGE_TIMEOUT_SECONDS):
        base = url.rstrip("/")
        self._object_url = f"{base}/storage/v1/object/{BUCKET}"
        self._public_prefix = f"{base}/storage/v1/object/public/{BUCKET}/"
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        self._session = session or requests.Session()
        self._timeout = timeout

    def _check(self, response, what):
        if response.status_code >= 400:
            raise StoreError(f"{what} に失敗しました: HTTP {response.status_code} {response.text}")

    def public_url(self, name):
        return self._public_prefix + name

    def name_from_url(self, image_url):
        """このバケットを指す URL ならオブジェクト名を返す。外部サイトの URL なら None。"""
        if image_url and image_url.startswith(self._public_prefix):
            name = image_url[len(self._public_prefix):]
            return name or None
        return None

    def upload(self, name, data):
        headers = dict(self._headers)
        headers["Content-Type"] = "image/webp"
        headers["x-upsert"] = "true"
        headers["cache-control"] = CACHE_CONTROL
        response = self._session.post(
            f"{self._object_url}/{name}", headers=headers, data=data, timeout=self._timeout
        )
        self._check(response, "サムネイルのアップロード")

    def delete(self, names):
        """名前の一覧を削除する。存在しない名前が混ざっていても成功する。"""
        for start in range(0, len(names), DELETE_CHUNK_SIZE):
            chunk = names[start:start + DELETE_CHUNK_SIZE]
            response = self._session.delete(
                self._object_url,
                headers={**self._headers, "Content-Type": "application/json"},
                data=json.dumps({"prefixes": chunk}).encode("utf-8"),
                timeout=self._timeout,
            )
            self._check(response, "サムネイルの削除")


def build_thumbnail_url(storage, link, image_url, fetch=fetch_image_bytes):
    """元画像からサムネイルを作ってアップロードし、公開 URL を返す。失敗したら None。"""
    try:
        thumbnail = make_thumbnail(fetch(image_url))
        name = thumbnail_name(link)
        storage.upload(name, thumbnail)
        return storage.public_url(name)
    except Exception as e:
        # 1枚の失敗で巡回を止めない。例外の文面に鍵は載らない(鍵はヘッダにしか無い)。
        logger.warning("サムネイルを作れませんでした %s: %s: %s", link, type(e).__name__, e)
        return None


def attach_thumbnails(storage, articles, fetch=fetch_image_bytes):
    """新着記事の image を、作れたものだけサムネイルの URL に差し替える。作れた件数を返す。"""
    made = 0
    for article in articles:
        image_url = article.get("image")
        if not image_url:
            continue
        thumbnail_url = build_thumbnail_url(storage, article["link"], image_url, fetch)
        if thumbnail_url:
            article["image"] = thumbnail_url
            made += 1
    return made
