import logging
import os
import sys
from logging.handlers import RotatingFileHandler

_configured = False

# ログは scraper/ 直下に置く（monocore のルートを汚さない）。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(SCRIPT_DIR, "logs")


def setup_logging() -> None:
    global _configured
    if _configured:
        return

    handlers = []

    # pythonw.exe (ウィンドウレス起動) では sys.stderr が None になるため、
    # コンソール出力はstderrがあるときだけ付ける。
    if sys.stderr is not None:
        handlers.append(logging.StreamHandler(sys.stderr))

    # コンソールが無い場合でもログが残るようファイルにも常に出す。
    os.makedirs(LOG_DIR, exist_ok=True)
    handlers.append(
        RotatingFileHandler(
            os.path.join(LOG_DIR, "scraper.log"),
            maxBytes=1_000_000,
            backupCount=3,
            encoding="utf-8",
        )
    )

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        handlers=handlers,
    )
    _configured = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)
