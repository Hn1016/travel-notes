from app.models import GeocodeResult
from app.services import geocode as geocode_service
from tests.conftest import add, hotel


def test_item_crud(client):
    stay = hotel(client, "Lisbon", "2026-12-04", "2026-12-07", title="Memmo Alfama", amount="540.50")
    assert stay["currency"] == "CHF"  # default currency
    assert stay["amount"] == 540.5

    updated = client.put(f"/api/items/{stay['id']}", json={"amount": 600, "currency": "eur"}).json()
    assert (updated["amount"], updated["currency"], updated["city"]) == (600, "EUR", "Lisbon")

    assert client.delete(f"/api/items/{stay['id']}").status_code == 204
    assert client.get("/api/items").json() == []


def test_validation(client):
    def status(**fields):
        return client.post("/api/items", json=fields).status_code

    # Hotel without a city, or without at least one night.
    assert status(type="hotel", start_datetime="2026-12-04T15:00", end_datetime="2026-12-05T11:00") == 422
    assert status(type="hotel", city="Lisbon", start_datetime="2026-12-04T15:00",
                  end_datetime="2026-12-04T18:00") == 422
    # Flight without airports.
    assert status(type="flight", start_datetime="2026-12-04T07:00") == 422
    # Westbound flight landing "before" departure in local time is fine.
    assert status(type="flight", origin="LIS", destination="PDL", start_datetime="2026-12-04T10:00",
                  end_datetime="2026-12-04T09:30") == 201
    assert status(type="activity", title="x", start_datetime="2026-12-04T10:00") == 422
    assert status(type="hotel", city="Lisbon", start_datetime="2026-12-04T15:00",
                  end_datetime="2026-12-05T11:00", amount=-5) == 422

    stay = hotel(client, "Porto", "2026-12-07", "2026-12-09")
    response = client.put(f"/api/items/{stay['id']}", json={"city": ""})
    assert response.status_code == 422


def test_city_is_geocoded_when_no_location_given(client, monkeypatch):
    monkeypatch.setattr(geocode_service, "fetch_from_nominatim", lambda q: [
        GeocodeResult(name="Porto", display_name="Porto, Portugal", lat=41.15, lng=-8.61)
    ])
    stay = hotel(client, "Porto", "2026-12-07", "2026-12-09")
    assert (stay["lat"], stay["lng"]) == (41.15, -8.61)

    exact = hotel(client, "Porto", "2026-12-09", "2026-12-10", lat=41.14, lng=-8.62)
    assert exact["lat"] == 41.14

    other = add(client, type="other", title="Insurance", start_datetime="2026-12-01T12:00")
    assert other["lat"] is None
