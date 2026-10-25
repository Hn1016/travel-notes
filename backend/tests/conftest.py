import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401  (registers tables)
from app.db import get_session
from app.main import app


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    # Not used as a context manager, so the lifespan does not touch the real database.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def offline_geocoding(monkeypatch):
    """Never call Nominatim from tests; cities simply stay off the map."""
    from app.services import geocode as geocode_service

    monkeypatch.setattr(geocode_service, "fetch_from_nominatim", lambda query: [])


def add(client, **fields):
    response = client.post("/api/items", json=fields)
    assert response.status_code == 201, response.text
    return response.json()


def hotel(client, city, check_in, check_out, **fields):
    return add(client, type="hotel", city=city, start_datetime=f"{check_in}T15:00",
               end_datetime=f"{check_out}T11:00", **fields)


def flight(client, origin, destination, departure, arrival, **fields):
    return add(client, type="flight", origin=origin, destination=destination,
               start_datetime=departure, end_datetime=arrival, **fields)
