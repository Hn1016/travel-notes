"""Look up a flight by number and date via AeroDataBox (RapidAPI), with a database cache.

Airport coordinates come from the offline airport list where possible.
"""

import json
import re
from datetime import datetime

import httpx
from sqlmodel import Session

from app import config
from app.models import FlightEndpoint, FlightInfo, FlightLookupCache
from app.services.airports import get_airport

API_HOST = "aerodatabox.p.rapidapi.com"


class FlightLookupNotConfigured(Exception):
    pass


def normalize_flight_number(number: str) -> str:
    return re.sub(r"\s+", "", number).upper()


def _local_time(movement: dict) -> str | None:
    """'2026-12-04 07:05+01:00' -> '2026-12-04T07:05' (local wall-clock time)."""
    scheduled = movement.get("scheduledTime")
    value = scheduled.get("local") if isinstance(scheduled, dict) else None
    value = value or movement.get("scheduledTimeLocal")
    if not value:
        return None
    return value[:16].replace(" ", "T")


def _endpoint(movement: dict) -> FlightEndpoint:
    raw = movement.get("airport") or {}
    known = get_airport(raw.get("iata")) or get_airport(raw.get("icao"))
    iata = raw.get("iata") or (known.iata if known else None)
    name = (known.name if known else None) or raw.get("name") or iata or "Unknown airport"
    location = raw.get("location") or {}
    return FlightEndpoint(
        iata=iata,
        name=f"{name} ({iata})" if iata else name,
        city=(known.city if known else None) or raw.get("municipalityName"),
        lat=known.lat if known else location.get("lat"),
        lng=known.lng if known else location.get("lon"),
        local_time=_local_time(movement),
    )


def parse_flights(payload: list[dict]) -> list[FlightInfo]:
    flights = []
    for row in payload:
        airline = row.get("airline") or {}
        flights.append(
            FlightInfo(
                flight_number=normalize_flight_number(row.get("number", "")),
                airline=airline.get("name"),
                departure=_endpoint(row.get("departure") or {}),
                arrival=_endpoint(row.get("arrival") or {}),
            )
        )
    return flights


def fetch_from_aerodatabox(number: str, day: str) -> list[dict]:
    if not config.AERODATABOX_API_KEY:
        raise FlightLookupNotConfigured()
    response = httpx.get(
        f"https://{API_HOST}/flights/number/{number}/{day}",
        params={"withAircraftImage": "false", "withLocation": "false", "dateLocalRole": "Departure"},
        headers={"X-RapidAPI-Key": config.AERODATABOX_API_KEY, "X-RapidAPI-Host": API_HOST},
        timeout=15,
    )
    # 204 / 404 mean "no such flight on that day".
    if response.status_code in (204, 404):
        return []
    response.raise_for_status()
    return response.json()


def lookup_flight(session: Session, number: str, day: str) -> list[FlightInfo]:
    number = normalize_flight_number(number)
    key = f"{number}|{day}"
    cached = session.get(FlightLookupCache, key)
    if cached is not None:
        return parse_flights(json.loads(cached.response_json))

    payload = fetch_from_aerodatabox(number, day)
    # Cache the raw response; schedules rarely change and lookups cost quota.
    session.add(FlightLookupCache(key=key, response_json=json.dumps(payload), created_at=datetime.now()))
    session.commit()
    return parse_flights(payload)
