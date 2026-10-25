from app.services import hotels as hotel_service

GOOGLE_PLACE = {
    "displayName": {"text": "Hotel New Opening", "languageCode": "en"},
    "formattedAddress": "Rua Nova 1, 1100-001 Lisboa, Portugal",
    "location": {"latitude": 38.71, "longitude": -9.13},
    "addressComponents": [
        {"longText": "Lisboa", "shortText": "Lisboa", "types": ["locality", "political"]},
        {"longText": "Portugal", "shortText": "PT", "types": ["country", "political"]},
    ],
    "primaryType": "hotel",
}


def test_parse_google_place():
    result = hotel_service.parse_google_place(GOOGLE_PLACE)
    assert (result.name, result.city, result.country, result.kind) == (
        "Hotel New Opening", "Lisboa", "Portugal", "hotel")
    assert (result.lat, result.lng) == (38.71, -9.13)
    assert hotel_service.parse_google_place({"displayName": {"text": "No location"}}) is None


def test_hotel_search_uses_google_and_caches(client, monkeypatch):
    monkeypatch.setattr(hotel_service.config, "GOOGLE_PLACES_API_KEY", "test-key")
    calls = []

    def fake_fetch(query):
        calls.append(query)
        return [hotel_service.parse_google_place(GOOGLE_PLACE)]

    monkeypatch.setattr(hotel_service, "fetch_from_google", fake_fetch)
    first = client.get("/api/hotels", params={"q": "Hotel New Opening, Lisbon"}).json()
    second = client.get("/api/hotels", params={"q": "hotel new opening,  lisbon"}).json()
    assert first == second
    assert first["source"] == "google"
    assert first["results"][0]["city"] == "Lisboa"
    assert calls == ["Hotel New Opening, Lisbon"]
    assert client.get("/api/features").json()["hotel_search"] == "google"


def test_hotel_search_falls_back_to_openstreetmap(client, monkeypatch):
    monkeypatch.setattr(hotel_service.config, "GOOGLE_PLACES_API_KEY", "")
    response = client.get("/api/hotels", params={"q": "Memmo Alfama"}).json()
    assert response == {"source": "osm", "results": []}  # tests run with geocoding offline
