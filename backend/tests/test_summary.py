from tests.conftest import add, flight, hotel


def journey_rows(summary):
    return [(s["kind"], s["city"], s["start"], s["end"], s["nights"]) for s in summary["journey"]]


def test_journey_merges_stays_and_shows_gaps(client):
    # Created out of order on purpose.
    hotel(client, "Porto", "2026-09-08", "2026-09-11", amount="290", currency="EUR")
    hotel(client, "Lisbon", "2026-09-05", "2026-09-08", title="Hotel B", amount="330", currency="EUR")
    hotel(client, "lisbon ", "2026-09-01", "2026-09-05", title="Hotel A", amount="480", currency="EUR")
    flight(client, "ZRH", "LIS", "2026-09-01T07:00", "2026-09-01T08:50", amount="150")
    # Overnight flight: Porto stay ends 11 Sep, Bangkok starts 12 Sep.
    flight(client, "OPO", "BKK", "2026-09-11T20:00", "2026-09-12T14:00", amount="700")
    hotel(client, "Bangkok", "2026-09-12", "2026-09-14", amount="5000", currency="THB")
    add(client, type="other", title="Train", city="Porto", start_datetime="2026-09-08T10:00",
        amount="31", currency="EUR")

    summary = client.get("/api/summary").json()
    assert journey_rows(summary) == [
        ("flight", None, "2026-09-01", "2026-09-01", 0),
        ("stay", "lisbon", "2026-09-01", "2026-09-08", 7),  # two hotels, one stay
        ("other", "Porto", "2026-09-08", None, 0),
        ("stay", "Porto", "2026-09-08", "2026-09-11", 3),
        ("flight", None, "2026-09-11", "2026-09-12", 0),
        ("gap", None, "2026-09-11", "2026-09-12", 1),
        ("stay", "Bangkok", "2026-09-12", "2026-09-14", 2),
    ]
    assert summary["journey"][1]["totals"] == {"EUR": 810.0}

    assert summary["nights"] == 12
    assert summary["flights"] == 2
    assert summary["totals"] == {"CHF": 850.0, "EUR": 1131.0, "THB": 5000.0}
    assert summary["by_type"]["hotel"] == {"EUR": 1100.0, "THB": 5000.0}
    assert summary["by_month"] == [{"month": "2026-09", "totals": summary["totals"]}]
    assert [(c["city"], c["nights"], c["visits"]) for c in summary["by_city"]] == [
        ("lisbon", 7, 1), ("Porto", 3, 1), ("Bangkok", 2, 1),
    ]


def test_repeat_visits_and_overlaps(client):
    hotel(client, "Lisbon", "2026-09-01", "2026-09-04")
    hotel(client, "Porto", "2026-09-04", "2026-09-06")
    hotel(client, "Lisbon", "2026-09-06", "2026-09-08")
    hotel(client, "Madrid", "2026-09-07", "2026-09-09")  # overlaps the last Lisbon night

    summary = client.get("/api/summary").json()
    lisbon = next(c for c in summary["by_city"] if c["city"] == "Lisbon")
    assert (lisbon["nights"], lisbon["visits"]) == (5, 2)
    assert [s["overlap"] for s in summary["journey"]] == [False, False, False, True]


def test_year_filter(client):
    hotel(client, "Lisbon", "2025-12-01", "2025-12-03")
    hotel(client, "Porto", "2026-01-05", "2026-01-07")
    summary = client.get("/api/summary", params={"year": 2026}).json()
    assert summary["years"] == [2026, 2025]
    assert [c["city"] for c in summary["by_city"]] == ["Porto"]


def test_route_ordering(client):
    # Hotels count from the end of their check-in day, so a flight that arrives later
    # the same day still comes before the hotel.
    porto = hotel(client, "Porto", "2026-09-08", "2026-09-11", lat=41.15, lng=-8.61)
    lisbon = hotel(client, "Lisbon", "2026-09-05", "2026-09-08", lat=38.72, lng=-9.14)
    fly = flight(client, "ZRH", "LIS", "2026-09-05T18:00", "2026-09-05T19:50",
                 origin_lat=47.46, origin_lng=8.55, destination_lat=38.78, destination_lng=-9.13)
    no_location = flight(client, "OPO", "ZRH", "2026-09-11T12:00", "2026-09-11T15:50")

    summary = client.get("/api/summary").json()
    route = [(s["item_id"], s["role"], s["via"]) for s in summary["stops"]]
    assert route == [
        (fly["id"], "origin", "start"),
        (fly["id"], "destination", "flight"),
        (lisbon["id"], "location", "ground"),
        (porto["id"], "location", "ground"),
    ]
    assert summary["items_without_location"] == [no_location["id"]]
