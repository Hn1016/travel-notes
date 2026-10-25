from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from sqlmodel import Session, select

from app import config
from app.db import SessionDep
from app.models import Item, ItemCreate, ItemRead, ItemType, ItemUpdate, Summary
from app.services.geocode import geocode
from app.services.summary import build_summary, sort_items

router = APIRouter(prefix="/api", tags=["items"])


def locate_city(session: Session, item: Item) -> None:
    """Put a hotel or other cost on the map at its city if no exact spot was chosen."""
    if item.type == ItemType.flight or item.lat is not None or not item.city:
        return
    try:
        results = geocode(session, item.city)
    except Exception:  # noqa: BLE001 - offline or rate limited: just stay off the map
        return
    if results:
        item.lat, item.lng = results[0].lat, results[0].lng


def get_item_or_404(session: Session, item_id: int) -> Item:
    item = session.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def save(session: Session, item: Item) -> Item:
    if not item.currency:
        item.currency = config.DEFAULT_CURRENCY
    locate_city(session, item)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.get("/items", response_model=list[ItemRead])
def list_items(session: SessionDep):
    return sort_items(session.exec(select(Item)).all())


@router.post("/items", response_model=ItemRead, status_code=201)
def create_item(payload: ItemCreate, session: SessionDep):
    return save(session, Item.model_validate(payload))


@router.put("/items/{item_id}", response_model=ItemRead)
def update_item(item_id: int, payload: ItemUpdate, session: SessionDep):
    item = get_item_or_404(session, item_id)
    merged = {**item.model_dump(exclude={"id"}), **payload.model_dump(exclude_unset=True)}
    try:
        validated = ItemCreate.model_validate(merged)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False, include_input=False)) from exc
    item.sqlmodel_update(validated.model_dump())
    return save(session, item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, session: SessionDep):
    session.delete(get_item_or_404(session, item_id))
    session.commit()


@router.get("/summary", response_model=Summary)
def summary(session: SessionDep, year: int | None = None):
    return build_summary(list(session.exec(select(Item)).all()), year)
