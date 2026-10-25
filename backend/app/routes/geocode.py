import httpx
from fastapi import APIRouter, HTTPException, Query

from app.db import SessionDep
from app.models import GeocodeResult, HotelSearchResult
from app.services import geocode as geocode_service
from app.services import hotels as hotel_service

router = APIRouter(prefix="/api", tags=["geocode"])


@router.get("/geocode", response_model=list[GeocodeResult])
def geocode(session: SessionDep, q: str = Query(min_length=2, max_length=200)):
    try:
        return geocode_service.geocode(session, q)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Geocoding failed: {exc}") from exc


@router.get("/hotels", response_model=HotelSearchResult)
def hotels(session: SessionDep, q: str = Query(min_length=2, max_length=200)):
    try:
        source, results = hotel_service.search_hotels(session, q)
    except hotel_service.HotelSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Hotel search failed: {exc}") from exc
    return HotelSearchResult(source=source, results=results)
