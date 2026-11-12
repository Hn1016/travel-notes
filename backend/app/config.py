"""Settings from environment variables, optionally loaded from backend/.env."""

import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        # Real environment variables win over the file.
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file()

AERODATABOX_API_KEY = os.environ.get("AERODATABOX_API_KEY", "").strip()
DEFAULT_CURRENCY = os.environ.get("DEFAULT_CURRENCY", "CHF").strip().upper() or "CHF"
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip() or "gemini-3.8-flash"
GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite").strip()
