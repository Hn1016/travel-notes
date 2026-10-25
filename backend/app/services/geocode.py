"""Nominatim geocoding with a database cache and a global 1 request/second limit.

Usage policy: https://operations.osmfoundation.org/policies/nominatim/
"""

import json
import os
import threading
import time
from datetime import datetime

import httpx
from sqlmodel import Session

from app.models import GeocodeCache, GeocodeResult

NOMINATIM_URL = os.environ.get(
    "NOMINATIM_URL", "https://nominatim.openstreetmap.org/search"
)
USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT", "TripPlanner/0.1 (personal single-user trip planner)"
)
MIN_INTERVAL_SECONDS = 1.0

_lock = threading.Lock()
_last_request = 0.0


def normalize_query(query: str) -> str:
    return " ".join(query.lower().split())


def fetch_from_nominatim(query: str) -> list[GeocodeResult]:
    global _last_request
    with _lock:
        wait = MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        try:
            response = httpx.get(
                NOMINATIM_URL,
                params={"q": query, "format": "jsonv2", "limit": 6, "addressdetails": 1},
                headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
                timeout=10,
            )
        finally:
            _last_request = time.monotonic()
    response.raise_for_status()
    return [parse_result(row) for row in response.json()]


CITY_FIELDS = ("city", "town", "village", "municipality")


def parse_result(row: dict) -> GeocodeResult:
    address = row.get("address") or {}
    return GeocodeResult(
        name=row.get("name") or row["display_name"].split(",")[0],
        display_name=row["display_name"],
        lat=float(row["lat"]),
        lng=float(row["lon"]),
        city=next((address[f] for f in CITY_FIELDS if address.get(f)), None),
        country=address.get("country"),
        kind=row.get("type"),
    )


def geocode(session: Session, query: str) -> list[GeocodeResult]:
    key = normalize_query(query)
    cached = session.get(GeocodeCache, key)
    if cached is not None:
        return [GeocodeResult(**row) for row in json.loads(cached.results_json)]

    results = fetch_from_nominatim(key)
    session.add(
        GeocodeCache(
            query=key,
            results_json=json.dumps([r.model_dump() for r in results]),
            created_at=datetime.now(),
        )
    )
    session.commit()
    return results
