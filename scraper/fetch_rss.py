import re
import feedparser
import requests
from datetime import datetime, timedelta, timezone

from log_config import get_logger

logger = get_logger(__name__)


def get_article_image(entry):
    """
    記事entryからOGP画像URLを取得する。
    メモリ効率のため、レスポンスの先頭20KBのみ読み取り、正規表現で解析する。
    （BeautifulSoupによるDOM全体のメモリ展開を回避）
    """
    link = entry.get("link")
    if not link:
        return ""

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/118.0.0.0 Safari/537.36"
            )
        }

        with requests.get(link, headers=headers, timeout=5, stream=True) as response:
            response.raise_for_status()

            raw_content = b""
            for chunk in response.iter_content(chunk_size=4096):
                raw_content += chunk
                if len(raw_content) >= 20480:
                    break

            encoding = response.encoding or "utf-8"

        try:
            head_text = raw_content.decode(encoding, errors="replace")
        except (LookupError, UnicodeDecodeError):
            head_text = raw_content.decode("utf-8", errors="replace")
        del raw_content

        match = re.search(
            r'<meta\s+[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
            head_text,
            re.IGNORECASE,
        )
        if not match:
            match = re.search(
                r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']',
                head_text,
                re.IGNORECASE,
            )

        if match:
            return match.group(1)

    except requests.exceptions.RequestException as e:
        logger.warning("Failed to fetch OGP image from %s: %s", link, e)
    except Exception as e:
        logger.warning("Unexpected error fetching OGP image from %s: %s", link, e)

    return ""


def collect_new_rss_articles(rss_url, source_name, existing_links, blacklist_prefixes=None):
    """
    RSSフィードを取得し、既存リンクにない新しい記事をリストとして返す。
    ファイルI/Oは行わない。
    """
    if blacklist_prefixes is None:
        blacklist_prefixes = []

    new_articles = []

    try:
        feed = feedparser.parse(rss_url)
        if not feed.entries:
            return new_articles

        for entry in feed.entries:
            link = entry.get("link")

            if link and any(link.startswith(prefix) for prefix in blacklist_prefixes):
                continue

            if not link or link in existing_links:
                continue

            image_url = get_article_image(entry)

            dt_utc = None

            parsed_date = entry.get("published_parsed")
            if parsed_date:
                dt_utc = datetime(*parsed_date[:6], tzinfo=timezone.utc)

            updated_parsed = entry.get("updated_parsed")
            if updated_parsed:
                dt_utc = datetime(*updated_parsed[:6], tzinfo=timezone.utc)

            published_date = None
            if dt_utc:
                jst = timezone(timedelta(hours=+9))
                published_date = dt_utc.astimezone(jst).isoformat()

            new_articles.append(
                {
                    "source": source_name,
                    "title": entry.get("title", "タイトル不明"),
                    "link": link,
                    "published": published_date,
                    "image": image_url,
                }
            )
            existing_links.add(link)

    except Exception as e:
        logger.error("Failed to collect RSS articles from %s (%s): %s", rss_url, source_name, e)

    return new_articles


# 収集した記事の保存は store.py（Supabase）が行う。1巡ぶんの実行は run_once.py。
