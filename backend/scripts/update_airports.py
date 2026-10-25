"""Refresh app/data/airports.csv from OurAirports (public domain data).

    .venv/bin/python scripts/update_airports.py               # download latest
    .venv/bin/python scripts/update_airports.py --source FILE # use a downloaded airports.csv

Keeps only airports that have an IATA code, which is what flights refer to.
"""

import argparse
import csv
import io
import urllib.request
from pathlib import Path

SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUTPUT = Path(__file__).resolve().parent.parent / "app" / "data" / "airports.csv"
SIZES = {"large_airport": "large", "medium_airport": "medium", "small_airport": "small"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="local airports.csv instead of downloading")
    args = parser.parse_args()

    if args.source:
        text = args.source.read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
            text = response.read().decode("utf-8")

    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        iata = row["iata_code"].strip().upper()
        if len(iata) != 3 or row["type"] not in SIZES:
            continue
        rows.append({
            "iata": iata,
            "icao": (row["icao_code"] or row["ident"]).strip().upper(),
            "name": row["name"].strip(),
            "city": row["municipality"].strip(),
            "country": row["iso_country"].strip(),
            "lat": round(float(row["latitude_deg"]), 5),
            "lng": round(float(row["longitude_deg"]), 5),
            "size": SIZES[row["type"]],
        })
    rows.sort(key=lambda r: r["iata"])

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} airports to {OUTPUT}")


if __name__ == "__main__":
    main()
