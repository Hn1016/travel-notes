"""Offline airport search over app/data/airports.csv (OurAirports, IATA airports only)."""

import csv
from functools import lru_cache
from pathlib import Path

from app.models import Airport

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "airports.csv"
SIZE_RANK = {"large": 0, "medium": 1, "small": 2}


@lru_cache
def _airports() -> list[Airport]:
    with DATA_FILE.open(encoding="utf-8") as f:
        return [Airport(**row) for row in csv.DictReader(f)]


@lru_cache
def _by_code() -> dict[str, Airport]:
    codes: dict[str, Airport] = {}
    for airport in _airports():
        codes.setdefault(airport.icao, airport)
        codes[airport.iata] = airport
    return codes


def get_airport(code: str | None) -> Airport | None:
    if not code:
        return None
    return _by_code().get(code.strip().upper())


def search_airports(query: str, limit: int = 8) -> list[Airport]:
    q = query.strip().lower()
    if not q:
        return []
    exact = get_airport(q)

    def score(airport: Airport) -> tuple[int, int] | None:
        name, city = airport.name.lower(), airport.city.lower()
        if city == q:
            match = 0
        elif city.startswith(q) or name.startswith(q):
            match = 1
        elif q in city or q in name:
            match = 2
        else:
            return None
        return match, SIZE_RANK.get(airport.size, 3)

    scored = [(s, a) for a in _airports() if a is not exact and (s := score(a)) is not None]
    scored.sort(key=lambda pair: pair[0])
    results = [a for _, a in scored]
    if exact:
        results.insert(0, exact)
    return results[:limit]
