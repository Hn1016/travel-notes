"""Hotel search by name: Google Places (Text Search) when a key is set, else OpenStreetMap.

Google results are cached for at most 30 days, as the Google Maps Platform terms allow.
"""

import json
from datetime import datetime, timedelta

import httpx
from sqlmodel import Session

from app import config
from app.models import GeocodeCache, GeocodeResult
from app.services.geocode import geocode, normalize_query

GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText"
# Pro-tier fields only; asking for ratings or photos would bill a pricier tier.
GOOGLE_FIELDS = ",".join(
    f"places.{field}"
    for field in ("displayName", "formattedAddress", "location", "addressComponents", "primaryType")
)
CACHE_DAYS = 30
CITY_TYPES = ("locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2")


class HotelSearchError(Exception):
    pass


def provider() -> str:
    return "google" if config.GOOGLE_PLACES_API_KEY else "osm"


def _component(place: dict, types: tuple[str, ...]) -> str | None:
    components = place.get("addressComponents") or []
    for wanted in types:
        for component in components:
            if wanted in component.get("types", []):
                return component.get("longText")
    return None


def parse_google_place(place: dict) -> GeocodeResult | None:
    location = place.get("location") or {}
    if "latitude" not in location:
        return None
    address = place.get("formattedAddress", "")
    return GeocodeResult(
        name=(place.get("displayName") or {}).get("text") or address.split(",")[0],
        display_name=address,
        lat=location["latitude"],
        lng=location["longitude"],
        city=_component(place, CITY_TYPES),
        country=_component(place, ("country",)),
        kind=place.get("primaryType"),
    )


def fetch_from_google(query: str) -> list[GeocodeResult]:
    response = httpx.post(
        GOOGLE_URL,
        json={"textQuery": query, "includedType": "lodging", "pageSize": 6, "languageCode": "en"},
        headers={"X-Goog-Api-Key": config.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": GOOGLE_FIELDS},
        timeout=10,
    )
    if response.status_code != 200:
        try:
            message = response.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            message = response.text[:200]
        raise HotelSearchError(f"Google Places: {message}")
    places = response.json().get("places", [])
    return [r for r in (parse_google_place(p) for p in places) if r is not None]


def search_hotels(session: Session, query: str) -> tuple[str, list[GeocodeResult]]:
    if provider() == "osm":
        return "osm", geocode(session, query)

    key = f"google:{normalize_query(query)}"
    cached = session.get(GeocodeCache, key)
    if cached is not None and cached.created_at > datetime.now() - timedelta(days=CACHE_DAYS):
        return "google", [GeocodeResult(**row) for row in json.loads(cached.results_json)]

    try:
        results = fetch_from_google(query)
    except httpx.HTTPError as exc:
        raise HotelSearchError(f"Google Places could not be reached: {exc}") from exc
    entry = cached or GeocodeCache(query=key, results_json="", created_at=datetime.now())
    entry.results_json = json.dumps([r.model_dump() for r in results])
    entry.created_at = datetime.now()
    session.add(entry)
    session.commit()
    return "google", results
