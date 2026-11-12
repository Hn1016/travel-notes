"""Trip suggestions from Gemini (Interactions API), turned into draft entries.

Gemini answers with JSON matching PLAN_SCHEMA. Nothing is saved here: the drafts go
to the browser, and only the ones the user adds become real entries.
"""

import json
from datetime import date, datetime, timedelta

import httpx
from pydantic import ValidationError

from app import config
from app.models import DraftEntry, Item, ItemCreate, ItemType, PlanDraft, PlanRequest, PlanResponse, PlanSuggestion
from app.services.airports import get_airport
from app.services.summary import sort_items

API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
API_REVISION = "2026-05-20"
CONTEXT_DAYS_BACK = 30
MAX_CONTEXT_ITEMS = 150

# Kept deliberately small (no nullable unions, length limits or descriptions), because
# Gemini rejects schemas that are too complex to serve; SYSTEM_INSTRUCTION explains the
# fields. Every field is required, with "" or 0 when it does not apply: lighter models
# otherwise skip optional fields and put everything into the title.
PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["hotel", "flight", "other"]},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                    "city": {"type": "string"},
                    "title": {"type": "string"},
                    "origin_iata": {"type": "string"},
                    "destination_iata": {"type": "string"},
                    "estimated_cost": {"type": "number"},
                    "currency": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": [
                    "type", "start_date", "end_date", "city", "title", "origin_iata",
                    "destination_iata", "estimated_cost", "currency", "reason",
                ],
            },
        },
    },
    "required": ["summary", "suggestions"],
}

SYSTEM_INSTRUCTION = """\
You help plan travel for one person who keeps a travel notebook of hotel stays, flights
and other costs. Suggest concrete entries for the request:
- "hotel" entries are stays: city (required), check-in start_date and check-out end_date
  (at least one night), and optionally a real, well-reviewed hotel name as title.
- "flight" entries: origin_iata and destination_iata airport codes and the date.
- "other" entries: ground transport or other notable costs, with a title.
Chain stays without gaps or overlaps unless the person asks otherwise, and fit them around
the existing entries (never overlap an existing stay). Use the person's currency for
estimated_cost (total for the whole stay, not per night). Costs are rough estimates, so be
realistic for mid-range options unless told otherwise. Keep reasons to one short sentence.
Order the suggestions chronologically, at most 25.

Fields (fill every field; use "" or 0 when a field does not apply):
- type: "hotel", "flight" or "other"
- start_date: YYYY-MM-DD check-in day (hotel) or travel day; end_date: check-out day (hotels only)
- city: the city of a hotel or other cost, e.g. "Tokyo"; "" for flights
- title: hotel name, or what an "other" cost is; "" for flights
- origin_iata, destination_iata: 3-letter airport codes (flights only), e.g. "PVG", "HND"
- estimated_cost: number in the person's currency; currency: e.g. "CHF"
- reason: one short sentence
summary is 2-4 sentences about the whole plan."""


class PlannerError(Exception):
    pass


class PlannerNotConfigured(PlannerError):
    pass


def _describe(item: Item) -> str:
    day = item.start_datetime.date().isoformat()
    cost = f", {item.amount} {item.currency}" if item.amount is not None else ""
    if item.type == ItemType.hotel:
        end = item.end_datetime.date().isoformat() if item.end_datetime else "?"
        hotel = f" ({item.title})" if item.title else ""
        return f"- stay {day} to {end}: {item.city}{hotel}{cost}"
    if item.type == ItemType.flight:
        return f"- flight {day}: {item.origin} to {item.destination}{cost}"
    return f"- other {day}: {item.title}{f' in {item.city}' if item.city else ''}{cost}"


def build_input(request: PlanRequest, items: list[Item], today: date) -> str:
    since = today - timedelta(days=CONTEXT_DAYS_BACK)
    recent = [i for i in sort_items(items) if (i.end_datetime or i.start_datetime).date() >= since]
    lines = [f"Today is {today.isoformat()}. My currency is {request.currency}.", ""]
    if recent:
        lines.append("My notebook (recent and upcoming entries):")
        lines += [_describe(i) for i in recent[:MAX_CONTEXT_ITEMS]]
    else:
        lines.append("My notebook has no recent or upcoming entries.")
    if request.previous:
        lines += ["", "Your previous suggestion, which I want changed:"]
        lines += [json.dumps(s.model_dump(mode="json", exclude_none=True)) for s in request.previous]
    lines += ["", f"Request: {request.prompt.strip()}"]
    return "\n".join(lines)


def _extract_text(payload: dict) -> str:
    """The JSON answer is the text of the last text content in the last step."""
    for step in reversed(payload.get("steps") or []):
        for content in reversed(step.get("content") or []):
            if content.get("type") == "text" and content.get("text"):
                return content["text"]
    if payload.get("output_text"):
        return payload["output_text"]
    raise PlannerError("Gemini returned no answer")


# "Overloaded" and "rate limited": worth trying the fallback model.
RETRY_STATUSES = {429, 503}


def call_gemini(text: str) -> tuple[dict, str]:
    """Return Gemini's JSON answer and the model that gave it."""
    if not config.GEMINI_API_KEY:
        raise PlannerNotConfigured()
    models = [config.GEMINI_MODEL]
    if config.GEMINI_FALLBACK_MODEL and config.GEMINI_FALLBACK_MODEL != config.GEMINI_MODEL:
        models.append(config.GEMINI_FALLBACK_MODEL)
    for index, model in enumerate(models):
        try:
            return _call_model(model, text), model
        except _Retryable as exc:
            if index == len(models) - 1:
                raise PlannerError(str(exc)) from exc
    raise AssertionError("unreachable")


class _Retryable(PlannerError):
    pass


def _call_model(model: str, text: str) -> dict:
    try:
        response = httpx.post(
            API_URL,
            json={
                "model": model,
                "system_instruction": SYSTEM_INSTRUCTION,
                "input": text,
                "response_format": {"type": "text", "mime_type": "application/json", "schema": PLAN_SCHEMA},
            },
            headers={"x-goog-api-key": config.GEMINI_API_KEY, "Api-Revision": API_REVISION},
            timeout=90,
        )
    except httpx.HTTPError as exc:
        raise PlannerError(f"Gemini could not be reached: {exc}") from exc
    if response.status_code != 200:
        try:
            message = response.json()["error"]["message"]
        except (ValueError, KeyError, TypeError):
            message = response.text[:300]
        error = _Retryable if response.status_code in RETRY_STATUSES else PlannerError
        raise error(f"Gemini ({response.status_code}): {message}")
    try:
        return json.loads(_extract_text(response.json()))
    except json.JSONDecodeError as exc:
        raise PlannerError("Gemini's answer was not valid JSON, please try again") from exc


def _at(day: date, hh_mm: str) -> datetime:
    return datetime.fromisoformat(f"{day.isoformat()}T{hh_mm}")


def to_entry(s: PlanSuggestion, currency: str) -> ItemCreate:
    """Turn a suggestion into a valid entry, or raise ValueError/ValidationError."""
    amount = round(s.estimated_cost, 2) if s.estimated_cost and s.estimated_cost > 0 else None
    common = {"type": s.type, "amount": amount, "currency": (s.currency or currency) if amount else currency}
    if s.type == ItemType.hotel:
        return ItemCreate(
            **common, city=s.city, title=s.title,
            start_datetime=_at(s.start_date, "15:00"),
            end_datetime=_at(s.end_date, "11:00") if s.end_date else None,
        )
    if s.type == ItemType.flight:
        origin, destination = get_airport(s.origin_iata), get_airport(s.destination_iata)
        if not (origin and destination):
            raise ValueError("unknown airport")
        return ItemCreate(
            **common,
            origin=f"{origin.name} ({origin.iata})", origin_lat=origin.lat, origin_lng=origin.lng,
            destination=f"{destination.name} ({destination.iata})",
            destination_lat=destination.lat, destination_lng=destination.lng,
            # Gemini only plans the day; the user fills in the real times.
            start_datetime=_at(s.start_date, "09:00"),
        )
    return ItemCreate(**common, title=s.title, city=s.city, start_datetime=_at(s.start_date, "12:00"))


def plan(request: PlanRequest, items: list[Item], today: date | None = None) -> PlanResponse:
    answer, model = call_gemini(build_input(request, items, today or date.today()))
    drafts: list[PlanDraft] = []
    skipped = 0
    for raw in answer.get("suggestions") or []:
        try:
            suggestion = PlanSuggestion.model_validate(raw)
            entry = DraftEntry.model_validate(to_entry(suggestion, request.currency).model_dump())
            drafts.append(PlanDraft(reason=suggestion.reason, entry=entry))
        except (ValidationError, ValueError):
            skipped += 1
    return PlanResponse(
        summary=answer.get("summary") or "", drafts=drafts, skipped=skipped, model=model,
    )
