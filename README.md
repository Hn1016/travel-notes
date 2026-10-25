# Travel Notes

A personal notebook for where you stay and what it costs. Click a check-in and a
check-out day in the calendar, write down the city, hotel and price. See all your
stops in order, nights per city, flights in between, costs per month, and a map
of the whole route.

Runs locally, single user, no login.

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you)
- Node.js 20+

## First-time setup

```bash
# Backend
cd backend
uv python install 3.12
uv venv --python 3.12 .venv
uv pip install -p .venv -r requirements.txt
.venv/bin/python -m app.seed        # optional: sample stays and flights

# Frontend
cd ../frontend
npm install
```

## Run

Use two terminals.

```bash
# Terminal 1: API on http://localhost:8000
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2: web app on http://localhost:5173
cd frontend
npm run dev
```

Open http://localhost:5173. The Vite dev server forwards `/api` to the backend.
Interactive API docs are at http://localhost:8000/docs.

## Optional: flight lookup by number

The flight form can fill in airports and times from a flight number and date,
using [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) on RapidAPI
(free tier available).

1. Create a RapidAPI account and subscribe to AeroDataBox.
2. `cp backend/.env.example backend/.env` and paste your key after `AERODATABOX_API_KEY=`.
3. Restart the backend. A "Look up flight" button appears in the flight form.

Lookups are cached in the database, so looking up the same flight and date again
does not use your quota. Without a key everything else still works.

## Optional: better hotel search (Google Places)

The 🔎 button next to the hotel name uses OpenStreetMap by default, which misses some
newer hotels. With a Google key it searches Google Maps instead:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and
   set up billing (needed even within the free monthly allowance).
2. Enable **Places API (New)**, then create an API key under *APIs & Services → Credentials*.
   Restrict the key to "Places API (New)".
3. Paste it after `GOOGLE_PLACES_API_KEY=` in `backend/.env` and restart the backend.

Each search is one Text Search (Pro) request; results are cached for 30 days.

Airport search (type `ZRH` or `Lisbon`) works offline from `backend/app/data/airports.csv`,
built from [OurAirports](https://ourairports.com/data/) (public domain). To refresh it:

```bash
cd backend
.venv/bin/python scripts/update_airports.py
```

## Other commands

```bash
cd backend
.venv/bin/pytest                      # backend tests
.venv/bin/python -m app.seed --reset  # delete everything and reload the samples
```

```bash
cd frontend
npm run build                         # type-check and production build
npm run lint
```

## Notes

- Data is stored in `backend/travel_notes.db` (SQLite). Delete it to start fresh.
  Set `TRAVEL_NOTES_DB_URL` to use another database, and `DEFAULT_CURRENCY` (default `CHF`)
  for new entries. The form remembers the last currency you used.
- A stay without an exact location is shown at its city on the map (looked up once and cached).
- All times are local times at the place of the event; no timezone conversion.
- Geocoding uses OpenStreetMap's Nominatim: at most 1 request per second, and every
  search is cached in the database. Searches run on Enter or the Search button only,
  because Nominatim does not allow search-as-you-type. Set `NOMINATIM_USER_AGENT`
  to identify yourself if you use it a lot.
- If a location is wrong, open "More details" in the form and search, drag the marker, or edit the coordinates.
- Costs are summed per currency. Conversion to CHF is a later feature.
