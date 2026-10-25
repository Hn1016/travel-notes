"""Fill the database with sample travel notes: a multi-city route with stays and flights.

    python -m app.seed            # only if the database is empty
    python -m app.seed --reset    # delete all entries first
"""

import sys
from datetime import datetime
from decimal import Decimal

from sqlmodel import Session, delete, select

from app.db import engine, init_db
from app.models import Item, ItemType
from app.services.airports import get_airport


def stay(city, hotel, check_in, check_out, amount, currency, lat, lng, **extra):
    return Item(
        type=ItemType.hotel, city=city, title=hotel, lat=lat, lng=lng,
        start_datetime=datetime.fromisoformat(f"{check_in}T15:00"),
        end_datetime=datetime.fromisoformat(f"{check_out}T11:00"),
        amount=Decimal(amount), currency=currency, **extra,
    )


def flight(number, origin, destination, departure, arrival, amount, currency="CHF"):
    a, b = get_airport(origin), get_airport(destination)
    return Item(
        type=ItemType.flight, flight_number=number,
        origin=f"{a.name} ({a.iata})", origin_lat=a.lat, origin_lng=a.lng,
        destination=f"{b.name} ({b.iata})", destination_lat=b.lat, destination_lng=b.lng,
        start_datetime=datetime.fromisoformat(departure), end_datetime=datetime.fromisoformat(arrival),
        amount=Decimal(amount), currency=currency,
    )


def other(title, city, when, amount, currency):
    return Item(type=ItemType.other, title=title, city=city,
                start_datetime=datetime.fromisoformat(when), amount=Decimal(amount), currency=currency)


SAMPLES = [
    flight("LX2084", "ZRH", "LIS", "2026-09-01T07:05", "2026-09-01T08:50", "189"),
    stay("Lisbon", "Memmo Alfama", "2026-09-01", "2026-09-05", "480", "EUR", 38.7110, -9.1295),
    stay("Lisbon", "Lumiares Hotel", "2026-09-05", "2026-09-08", "345", "EUR", 38.7135, -9.1446,
         notes="Moved to Bairro Alto for the last nights."),
    other("Train Lisbon → Porto", "Porto", "2026-09-08T12:09", "31.40", "EUR"),
    stay("Porto", "Moov Hotel Porto Centro", "2026-09-08", "2026-09-11", "264", "EUR", 41.1466, -8.6110),
    flight("VY8473", "OPO", "BCN", "2026-09-11T10:40", "2026-09-11T13:45", "74", "EUR"),
    stay("Barcelona", "Casa Bonay", "2026-09-11", "2026-09-15", "640", "EUR", 41.3936, 2.1749),
    # 15 → 16 Sep: one night not recorded, shows up as a gap.
    flight("A3711", "BCN", "ATH", "2026-09-16T09:15", "2026-09-16T13:25", "118", "EUR"),
    stay("Athens", "Electra Metropolis", "2026-09-16", "2026-09-19", "396", "EUR", 37.9755, 23.7331),
    flight("TK1842", "ATH", "IST", "2026-09-19T11:00", "2026-09-19T12:30", "96", "EUR"),
    stay("Istanbul", "Pera Palace", "2026-09-19", "2026-09-23", "520", "EUR", 41.0317, 28.9744),
    flight("TK68", "IST", "BKK", "2026-09-23T21:05", "2026-09-24T10:40", "612"),
    stay("Bangkok", "Ariyasom Villa", "2026-09-24", "2026-09-28", "11800", "THB", 13.7444, 100.5545),
    flight("TG110", "BKK", "CNX", "2026-09-28T09:50", "2026-09-28T11:05", "1890", "THB"),
    stay("Chiang Mai", "Tamarind Village", "2026-09-28", "2026-10-03", "14500", "THB", 18.7880, 98.9910),
    flight("TG111", "CNX", "BKK", "2026-10-03T08:00", "2026-10-03T09:15", "1890", "THB"),
    flight("LX181", "BKK", "ZRH", "2026-10-03T12:40", "2026-10-03T19:15", "655"),
    # Planned: back to Lisbon in November.
    flight("TP935", "ZRH", "LIS", "2026-11-12T06:00", "2026-11-12T07:45", "142"),
    stay("Lisbon", "Memmo Alfama", "2026-11-12", "2026-11-16", "420", "EUR", 38.7110, -9.1295),
    flight("TP936", "LIS", "ZRH", "2026-11-16T09:00", "2026-11-16T12:40", "142"),
]


def main() -> None:
    init_db()
    with Session(engine) as session:
        if "--reset" in sys.argv:
            session.exec(delete(Item))
            session.commit()
        elif session.exec(select(Item)).first() is not None:
            print("Database already has entries. Use --reset to replace them with the samples.")
            return
        for item in SAMPLES:
            session.add(item)
        session.commit()
        print(f"Created {len(SAMPLES)} sample entries")


if __name__ == "__main__":
    main()
