from app.services import flights as flight_service

AERODATABOX_RESPONSE = [
    {
        "number": "LX 2084",
        "airline": {"name": "Swiss"},
        "departure": {
            "airport": {"icao": "LSZH", "iata": "ZRH", "name": "Zurich"},
            "scheduledTime": {"utc": "2026-12-04 06:05Z", "local": "2026-12-04 07:05+01:00"},
        },
        "arrival": {
            # Not in the offline list: falls back to the API's own data.
            "airport": {"iata": "XXQ", "name": "Somewhere", "location": {"lat": 1.5, "lon": 2.5}},
            "scheduledTime": {"utc": "2026-12-04 08:50Z", "local": "2026-12-04 08:50+00:00"},
        },
    }
]


def test_airport_search(client):
    results = client.get("/api/airports", params={"q": "zrh"}).json()
    assert results[0]["iata"] == "ZRH"
    assert results[0]["city"] == "Zurich"

    lisbon = client.get("/api/airports", params={"q": "lisbon"}).json()
    assert lisbon[0]["iata"] == "LIS"

    porto = client.get("/api/airports", params={"q": "porto"}).json()
    assert porto[0]["iata"] == "OPO"


def test_flight_lookup_parses_and_caches(client, monkeypatch):
    calls = []

    def fake_fetch(number, day):
        calls.append((number, day))
        return AERODATABOX_RESPONSE

    monkeypatch.setattr(flight_service, "fetch_from_aerodatabox", fake_fetch)
    params = {"number": "lx 2084", "day": "2026-12-04"}
    first = client.get("/api/flights/lookup", params=params).json()
    second = client.get("/api/flights/lookup", params=params).json()
    assert first == second
    assert calls == [("LX2084", "2026-12-04")]

    flight = first[0]
    assert flight["flight_number"] == "LX2084"
    assert flight["departure"]["name"] == "Zürich Airport (ZRH)"
    assert flight["departure"]["lat"] == 47.45806
    assert flight["departure"]["local_time"] == "2026-12-04T07:05"
    assert flight["arrival"]["name"] == "Somewhere (XXQ)"
    assert (flight["arrival"]["lat"], flight["arrival"]["lng"]) == (1.5, 2.5)


def test_flight_lookup_without_key(client, monkeypatch):
    monkeypatch.setattr(flight_service.config, "AERODATABOX_API_KEY", "")
    response = client.get("/api/flights/lookup", params={"number": "LX2084", "day": "2026-12-04"})
    assert response.status_code == 503
    assert client.get("/api/features").json()["flight_lookup"] is False
