from datetime import date

from app.models import PlanRequest
from app.services import planner
from tests.conftest import hotel

GEMINI_ANSWER = {
    "summary": "Fly to Tokyo, then Kyoto by train.",
    "suggestions": [
        {"type": "flight", "start_date": "2026-12-20", "origin_iata": "PVG", "destination_iata": "HND",
         "estimated_cost": 180, "currency": "CHF", "reason": "Short direct flight"},
        {"type": "hotel", "start_date": "2026-12-20", "end_date": "2026-12-24", "city": "Tokyo",
         "title": "Hotel Gracery Shinjuku", "estimated_cost": 520, "reason": "Central"},
        {"type": "other", "start_date": "2026-12-24", "end_date": "", "city": "", "title": "Shinkansen to Kyoto",
         "origin_iata": "", "destination_iata": "", "estimated_cost": 90, "currency": "", "reason": ""},
        {"type": "hotel", "start_date": "2026-12-24", "end_date": "2026-12-27", "city": "Kyoto"},
        # Unusable: no city, unknown airport, stay without nights.
        {"type": "hotel", "start_date": "2026-12-27", "end_date": "2026-12-29"},
        {"type": "flight", "start_date": "2026-12-29", "origin_iata": "XXX", "destination_iata": "ZRH"},
        {"type": "hotel", "start_date": "2026-12-29", "end_date": "2026-12-29", "city": "Osaka"},
    ],
}


def test_plan_turns_suggestions_into_drafts(client, monkeypatch):
    hotel(client, "Shanghai", "2026-12-18", "2026-12-20", title="City Hotel", amount="103")
    sent = []

    def fake_gemini(text):
        sent.append(text)
        return GEMINI_ANSWER, "gemini-test"

    monkeypatch.setattr(planner, "call_gemini", fake_gemini)
    response = client.post("/api/plan", json={"prompt": "A week in Japan after Shanghai", "currency": "CHF"})
    assert response.status_code == 200, response.text
    body = response.json()

    assert "- stay 2026-12-18 to 2026-12-20: Shanghai (City Hotel), 103" in sent[0]
    assert "Request: A week in Japan after Shanghai" in sent[0]
    assert body["summary"] == "Fly to Tokyo, then Kyoto by train."
    assert body["model"] == "gemini-test"
    assert body["skipped"] == 3

    entries = [d["entry"] for d in body["drafts"]]
    assert [e["type"] for e in entries] == ["flight", "hotel", "other", "hotel"]
    flight, tokyo, train, kyoto = entries
    assert flight["origin"].endswith("(PVG)") and flight["destination_lat"] is not None
    assert (tokyo["city"], tokyo["start_datetime"], tokyo["end_datetime"]) == (
        "Tokyo", "2026-12-20T15:00:00", "2026-12-24T11:00:00")
    assert (tokyo["amount"], tokyo["currency"]) == (520, "CHF")
    assert kyoto["amount"] is None
    assert body["drafts"][0]["reason"] == "Short direct flight"

    # Nothing is saved until the user adds a draft.
    assert len(client.get("/api/items").json()) == 1


def test_refining_sends_the_previous_plan(monkeypatch):
    request = PlanRequest(prompt="Make it cheaper", previous=[
        {"type": "hotel", "start_date": "2026-12-20", "end_date": "2026-12-24", "city": "Tokyo"}])
    text = planner.build_input(request, [], date(2026, 11, 12))
    assert "Today is 2026-11-12" in text
    assert '"city": "Tokyo"' in text
    assert text.endswith("Request: Make it cheaper")


def test_extract_text_from_interaction():
    payload = {"id": "abc", "steps": [
        {"type": "thought", "content": [{"type": "thought", "text": "thinking"}]},
        {"type": "model_output", "content": [{"type": "text", "text": '{"summary": "x"}'}]},
    ]}
    assert planner._extract_text(payload) == '{"summary": "x"}'


def test_plan_without_key(client, monkeypatch):
    monkeypatch.setattr(planner.config, "GEMINI_API_KEY", "")
    response = client.post("/api/plan", json={"prompt": "Somewhere warm"})
    assert response.status_code == 503
    assert client.get("/api/features").json()["plan"] is False


def test_busy_model_falls_back(monkeypatch):
    monkeypatch.setattr(planner.config, "GEMINI_API_KEY", "key")
    monkeypatch.setattr(planner.config, "GEMINI_MODEL", "main")
    monkeypatch.setattr(planner.config, "GEMINI_FALLBACK_MODEL", "backup")
    tried = []

    def fake_call(model, text):
        tried.append(model)
        if model == "main":
            raise planner._Retryable("Gemini (503): high demand")
        return {"summary": "ok", "suggestions": []}

    monkeypatch.setattr(planner, "_call_model", fake_call)
    assert planner.call_gemini("hi") == ({"summary": "ok", "suggestions": []}, "backup")
    assert tried == ["main", "backup"]

    # Other errors (e.g. a bad key) are not retried.
    tried.clear()
    def bad_key(model, text):
        tried.append(model)
        raise planner.PlannerError("Gemini (400): API key not valid")
    monkeypatch.setattr(planner, "_call_model", bad_key)
    try:
        planner.call_gemini("hi")
    except planner.PlannerError as exc:
        assert "key not valid" in str(exc)
    assert tried == ["main"]
