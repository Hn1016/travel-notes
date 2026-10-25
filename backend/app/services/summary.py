from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from app.models import CityTotal, Item, ItemType, JourneySegment, MonthTotal, Stop, Summary

# Hotels sort at the end of their check-in day, so flights and trains that day come
# first; nights without a stay sort after everything that happens on their first day.
HOTEL_TIME = time(23, 58)
GAP_TIME = time(23, 59)


def totals_by_currency(items: Iterable[Item]) -> dict[str, float]:
    sums: dict[str, Decimal] = defaultdict(Decimal)
    for item in items:
        if item.amount is not None:
            sums[item.currency] += Decimal(str(item.amount))
    return {currency: float(round(value, 2)) for currency, value in sorted(sums.items())}


def city_key(city: str | None) -> str:
    return " ".join((city or "").lower().split())


def check_in_out(item: Item) -> tuple[date, date]:
    check_in = item.start_datetime.date()
    check_out = item.end_datetime.date() if item.end_datetime else check_in + timedelta(days=1)
    return check_in, max(check_out, check_in)


def sort_key(item: Item) -> tuple[datetime, int]:
    if item.type == ItemType.hotel:
        return datetime.combine(item.start_datetime.date(), HOTEL_TIME), item.id or 0
    return item.start_datetime, item.id or 0


def sort_items(items: Iterable[Item]) -> list[Item]:
    return sorted(items, key=sort_key)


def build_stops(items: Iterable[Item]) -> tuple[list[Stop], list[int]]:
    """Map stops in chronological order, plus ids of items without coordinates."""
    stops: list[Stop] = []
    missing: list[int] = []

    for item in sort_items(items):
        if item.type == ItemType.flight:
            has_origin = item.origin_lat is not None and item.origin_lng is not None
            has_dest = item.destination_lat is not None and item.destination_lng is not None
            if has_origin:
                stops.append(Stop(
                    item_id=item.id, item_type=item.type, role="origin",
                    name=item.origin or "Departure", lat=item.origin_lat, lng=item.origin_lng,
                    at=item.start_datetime, via="ground",
                ))
            if has_dest:
                arrival = item.end_datetime
                if arrival is None or arrival < item.start_datetime:
                    arrival = item.start_datetime
                stops.append(Stop(
                    item_id=item.id, item_type=item.type, role="destination",
                    name=item.destination or "Arrival", lat=item.destination_lat,
                    lng=item.destination_lng, at=arrival, via="ground",
                ))
            if not (has_origin and has_dest):
                missing.append(item.id)
        elif item.lat is not None and item.lng is not None:
            stops.append(Stop(
                item_id=item.id, item_type=item.type, role="location",
                name=item.city or item.title or "", lat=item.lat, lng=item.lng,
                at=sort_key(item)[0], via="ground",
            ))
        elif item.type == ItemType.hotel:
            # "Other" costs without a place are fine; hotels should be on the map.
            missing.append(item.id)

    # Stable sort keeps a flight's origin before its destination on equal times.
    stops.sort(key=lambda s: s.at)
    for index, stop in enumerate(stops):
        prev = stops[index - 1] if index else None
        if prev is None:
            stop.via = "start"
        elif stop.role == "destination" and prev.role == "origin" and prev.item_id == stop.item_id:
            stop.via = "flight"
        else:
            stop.via = "ground"
    return stops, missing


def build_journey(items: list[Item]) -> list[JourneySegment]:
    """Chronological list of stays (consecutive hotels in one city merged), flights,
    other costs, and gaps between stays."""
    keyed: list[tuple[datetime, JourneySegment]] = []
    stays: list[JourneySegment] = []

    for item in sort_items(items):
        if item.type == ItemType.hotel:
            check_in, check_out = check_in_out(item)
            last = stays[-1] if stays else None
            if last and city_key(last.city) == city_key(item.city) and last.end == check_in:
                last.end = check_out
                last.nights = (check_out - last.start).days
                last.item_ids.append(item.id)
                continue
            segment = JourneySegment(
                kind="stay", start=check_in, end=check_out,
                nights=(check_out - check_in).days, city=item.city, item_ids=[item.id],
            )
            stays.append(segment)
            keyed.append((sort_key(item)[0], segment))
        else:
            segment = JourneySegment(
                kind="flight" if item.type == ItemType.flight else "other",
                start=item.start_datetime.date(),
                end=item.end_datetime.date() if item.end_datetime else None,
                city=item.city, item_ids=[item.id],
            )
            keyed.append((item.start_datetime, segment))

    for prev, stay in zip(stays, stays[1:]):
        if stay.start > prev.end:
            gap = JourneySegment(
                kind="gap", start=prev.end, end=stay.start, nights=(stay.start - prev.end).days
            )
            keyed.append((datetime.combine(prev.end, GAP_TIME), gap))
        elif stay.start < prev.end:
            stay.overlap = True

    by_id = {item.id: item for item in items}
    for _, segment in keyed:
        segment.totals = totals_by_currency(by_id[i] for i in segment.item_ids)

    keyed.sort(key=lambda pair: pair[0])
    return [segment for _, segment in keyed]


def build_city_totals(journey: list[JourneySegment], items: list[Item]) -> list[CityTotal]:
    by_id = {item.id: item for item in items}
    groups: dict[str, list[JourneySegment]] = defaultdict(list)
    for segment in journey:
        if segment.kind == "stay":
            groups[city_key(segment.city)].append(segment)
    cities = [
        CityTotal(
            city=segments[0].city,
            nights=sum(s.nights for s in segments),
            visits=len(segments),
            totals=totals_by_currency(by_id[i] for s in segments for i in s.item_ids),
        )
        for segments in groups.values()
    ]
    cities.sort(key=lambda c: (-c.nights, c.city.lower()))
    return cities


def build_summary(all_items: list[Item], year: int | None = None) -> Summary:
    years = sorted({item.start_datetime.year for item in all_items}, reverse=True)
    items = [i for i in all_items if year is None or i.start_datetime.year == year]

    journey = build_journey(items)
    stops, missing = build_stops(items)
    per_month: dict[str, list[Item]] = defaultdict(list)
    for item in items:
        per_month[item.start_datetime.strftime("%Y-%m")].append(item)
    return Summary(
        year=year,
        years=years,
        nights=sum(s.nights for s in journey if s.kind == "stay"),
        flights=sum(1 for i in items if i.type == ItemType.flight),
        totals=totals_by_currency(items),
        by_type={t: totals_by_currency(i for i in items if i.type == t) for t in ItemType},
        by_city=build_city_totals(journey, items),
        by_month=[MonthTotal(month=m, totals=totals_by_currency(its)) for m, its in sorted(per_month.items())],
        journey=journey,
        stops=stops,
        items_without_location=missing,
    )
