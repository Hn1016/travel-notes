import re
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException, Query

from app import config
from app.db import SessionDep
from app.models import Airport, Features, FlightInfo
from app.services import flights as flight_service
from app.services.airports import search_airports
from app.services.hotels import provider as hotel_provider

router = APIRouter(prefix="/api", tags=["flights"])


@router.get("/features", response_model=Features)
def features():
    return Features(
        flight_lookup=bool(config.AERODATABOX_API_KEY),
        hotel_search=hotel_provider(),
        default_currency=config.DEFAULT_CURRENCY,
    )


@router.get("/airports", response_model=list[Airport])
def airports(q: str = Query(min_length=1, max_length=100)):
    return search_airports(q)


@router.get("/flights/lookup", response_model=list[FlightInfo])
def lookup_flight(session: SessionDep, number: str = Query(min_length=2, max_length=10), day: date = Query()):
    if not re.fullmatch(r"[A-Za-z0-9]{2,3}\s*\d{1,5}[A-Za-z]?", number.strip()):
        raise HTTPException(status_code=422, detail="Flight number should look like LX2084")
    try:
        return flight_service.lookup_flight(session, number, day.isoformat())
    except flight_service.FlightLookupNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail="Flight lookup is not set up. Add AERODATABOX_API_KEY to backend/.env",
        ) from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            detail = "The AeroDataBox API key was rejected"
        elif status == 429:
            detail = "AeroDataBox quota or rate limit reached, try again later"
        else:
            detail = f"Flight lookup failed ({status})"
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Flight lookup failed: {exc}") from exc
