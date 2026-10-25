from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import NaiveDatetime, field_validator, model_validator
from sqlmodel import Field, SQLModel


class ItemType(str, Enum):
    hotel = "hotel"
    flight = "flight"
    other = "other"


def _normalize_currency(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise ValueError("currency must be a 3-letter code, e.g. CHF")
    return value


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


# All times are local wall-clock times at the place of the event, so they are
# stored without a timezone.
LocalDatetime = NaiveDatetime

# ---------------------------------------------------------------- items


class ItemBase(SQLModel):
    type: ItemType
    # Hotel name, flight label, or what an "other" cost was for.
    title: str | None = Field(default=None, max_length=200)
    # Where a hotel (or other cost) is; stays are grouped by city.
    city: str | None = Field(default=None, max_length=100)

    # For a hotel these are check-in and check-out; for a flight departure and arrival.
    start_datetime: LocalDatetime
    end_datetime: LocalDatetime | None = None

    address: str | None = None
    lat: float | None = None
    lng: float | None = None

    # Flights only.
    origin: str | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination: str | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    flight_number: str | None = None

    amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2, ge=0)
    currency: str | None = Field(default=None, max_length=3)

    booking_ref: str | None = None
    url: str | None = None
    notes: str | None = None


class Item(ItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class ItemCreate(ItemBase):
    _currency = field_validator("currency")(_normalize_currency)
    _blank = field_validator("title", "city", "origin", "destination", "flight_number")(_blank_to_none)

    @model_validator(mode="after")
    def check(self) -> "ItemCreate":
        start, end = self.start_datetime, self.end_datetime
        if self.type == ItemType.hotel:
            if not self.city:
                raise ValueError("a hotel needs a city")
            if end is None or end.date() <= start.date():
                raise ValueError("a hotel needs a check-out date after the check-in date")
        elif self.type == ItemType.flight:
            if not (self.origin and self.destination):
                raise ValueError("a flight needs a departure and an arrival airport")
            # Times are local, so a westbound flight may "land before it departs".
        else:
            if not self.title:
                raise ValueError("please describe what the cost was for")
            if end is not None and end < start:
                raise ValueError("the end must not be before the start")
        return self


class ItemUpdate(SQLModel):
    """All fields optional; the merged result is validated as an ItemCreate."""

    type: ItemType | None = None
    title: str | None = None
    city: str | None = None
    start_datetime: LocalDatetime | None = None
    end_datetime: LocalDatetime | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    origin: str | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    destination: str | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    flight_number: str | None = None
    amount: Decimal | None = None
    currency: str | None = None
    booking_ref: str | None = None
    url: str | None = None
    notes: str | None = None


class ItemRead(ItemBase):
    id: int
    amount: float | None = None
    currency: str


# ---------------------------------------------------------------- geocoding cache


class GeocodeCache(SQLModel, table=True):
    query: str = Field(primary_key=True)
    results_json: str
    created_at: LocalDatetime


class GeocodeResult(SQLModel):
    name: str
    display_name: str
    lat: float
    lng: float
    # From Nominatim's address details; missing in results cached before they were added.
    city: str | None = None
    country: str | None = None
    kind: str | None = None  # e.g. "hotel", "guest_house", "city"


# ---------------------------------------------------------------- airports & flights


class Airport(SQLModel):
    iata: str
    icao: str
    name: str
    city: str
    country: str
    lat: float
    lng: float
    size: str


class FlightLookupCache(SQLModel, table=True):
    key: str = Field(primary_key=True)  # "LX2084|2026-12-04"
    response_json: str
    created_at: LocalDatetime


class FlightEndpoint(SQLModel):
    iata: str | None
    name: str
    city: str | None
    lat: float | None
    lng: float | None
    local_time: str | None  # YYYY-MM-DDTHH:MM, local at the airport


class FlightInfo(SQLModel):
    flight_number: str
    airline: str | None
    departure: FlightEndpoint
    arrival: FlightEndpoint


class HotelSearchResult(SQLModel):
    source: Literal["google", "osm"]
    results: list[GeocodeResult]


class Features(SQLModel):
    flight_lookup: bool
    hotel_search: Literal["google", "osm"]
    default_currency: str


# ---------------------------------------------------------------- summary


class Stop(SQLModel):
    item_id: int
    item_type: ItemType
    # "location" for hotels/other, "origin"/"destination" for flight airports.
    role: Literal["location", "origin", "destination"]
    name: str
    lat: float
    lng: float
    at: LocalDatetime
    # How this stop is reached from the previous one: the first stop is "start".
    via: Literal["start", "ground", "flight"]


class JourneySegment(SQLModel):
    """One row of the journey: a stay in a city (one or more hotels in a row),
    a flight, another cost, or nights without a recorded stay."""

    kind: Literal["stay", "flight", "other", "gap"]
    start: date
    end: date | None = None
    nights: int = 0
    city: str | None = None
    item_ids: list[int] = []
    totals: dict[str, float] = {}
    # This stay starts before the previous one ended.
    overlap: bool = False


class CityTotal(SQLModel):
    city: str
    nights: int
    visits: int
    totals: dict[str, float]


class MonthTotal(SQLModel):
    month: str  # YYYY-MM
    totals: dict[str, float]


class Summary(SQLModel):
    year: int | None
    years: list[int]
    nights: int
    flights: int
    totals: dict[str, float]
    by_type: dict[ItemType, dict[str, float]]
    by_city: list[CityTotal]
    by_month: list[MonthTotal]
    journey: list[JourneySegment]
    stops: list[Stop]
    items_without_location: list[int]
