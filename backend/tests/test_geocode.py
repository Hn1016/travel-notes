from app.models import GeocodeResult
from app.services import geocode as geocode_service


def test_geocode_is_cached(client, monkeypatch):
    calls = []

    def fake_fetch(query):
        calls.append(query)
        return [GeocodeResult(name="Zurich", display_name="Zurich, Switzerland",
                              lat=47.37, lng=8.54)]

    monkeypatch.setattr(geocode_service, "fetch_from_nominatim", fake_fetch)

    first = client.get("/api/geocode", params={"q": "Zurich"}).json()
    second = client.get("/api/geocode", params={"q": "  zurich "}).json()
    assert first == second
    assert (first[0]["name"], first[0]["lat"]) == ("Zurich", 47.37)
    assert calls == ["zurich"]


def test_nominatim_result_parsing():
    row = {
        "name": "Pera Palace Hotel",
        "display_name": "Pera Palace Hotel, Meşrutiyet Caddesi, Beyoğlu, İstanbul, Türkiye",
        "lat": "41.0317", "lon": "28.9744", "category": "tourism", "type": "hotel",
        "address": {"tourism": "Pera Palace Hotel", "town": "Beyoğlu", "city": "İstanbul",
                    "country": "Türkiye"},
    }
    result = geocode_service.parse_result(row)
    assert (result.name, result.city, result.country, result.kind) == (
        "Pera Palace Hotel", "İstanbul", "Türkiye", "hotel")
    assert geocode_service.parse_result({**row, "address": {"village": "Sintra"}}).city == "Sintra"
