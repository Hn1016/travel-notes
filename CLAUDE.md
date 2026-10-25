# Travel Notes: Project Brief for Claude Code

## Goal
A personal notebook for writing down **where I stay and what it costs**, so I get a clear
overview of all my stops. It is not a trip planner: there are no "trips" from A to B, just one
continuous record of stays (usually a few nights per hotel), the flights between them, and
other costs.

The user should be able to:
- Click a check-in day and a check-out day in a calendar, then write down the city, the hotel
  (optional) and the cost. That must stay quick: dates come from the clicks, details are optional.
- See in which cities they stayed and for how long, in order (consecutive hotels in the same
  city count as one stop), plus total nights per city across visits.
- Note the flights they take, and see all stops connected on a map.
- See costs per stay, per city, per month, per type, and in total.

**This phase: web version only.** Mobile/native comes later, but the web UI must work on a phone.

## Features
1. **Calendar (main screen)**: month view, Monday first. Two clicks create a stay. Stays show as
   colored bars labeled with the city, flights as ✈️, other costs as 📌. Clicking a bar or icon
   selects that entry.
2. **Entries** (one table with a `type`):
   - `hotel` (a stay): city (required), hotel name (optional), check-in/check-out dates, cost.
   - `flight`: flight number, from/to airports, departure/arrival local times, cost.
   - `other`: what it was for, date, optional city, cost (e.g. trains, insurance).
3. **Stops list**: chronological stays (merged per city when consecutive), flights and other costs,
   gaps ("3 nights without a stay", or "Night on the plane" for overnight flights), and a "Today" divider.
4. **Cities**: nights, visits and cost per city.
5. **Costs**: totals per type, per month and overall, shown per currency (no conversion yet).
6. **Map**: numbered stops in order, flights dashed, ground legs solid. Two-way highlighting with
   the list and calendar.
7. **Year filter** for the summary views.

## Out of scope for now
User accounts/auth, sharing, email import, file attachments, native mobile app, payments,
currency conversion.

## Tech stack
- **Backend**: Python 3.12 (via `uv`), FastAPI, SQLite via SQLModel. No Alembic.
- **Frontend**: React + TypeScript + Vite, Tailwind CSS v4. No router (single page).
- **Map**: Leaflet + react-leaflet with OpenStreetMap tiles.
- **Geocoding**: Nominatim. Max 1 request per second, descriptive User-Agent, results cached in
  the database. No search-as-you-type (forbidden by its policy). A stay without an exact location
  is placed at its city, geocoded by the backend on save.
- **Airports**: offline list in `backend/app/data/airports.csv` (OurAirports, public domain),
  searched as you type.
- **Hotel search (optional)**: Google Places Text Search (New), key `GOOGLE_PLACES_API_KEY` in
  `backend/.env`; Pro-tier fields only, results cached max 30 days (Google terms), "Google Maps"
  attribution shown. Falls back to Nominatim without a key.
- **Flight lookup (optional)**: AeroDataBox via RapidAPI, key in `backend/.env`
  (`AERODATABOX_API_KEY`), responses cached in the database. The app works without it.

## Data model
**Item** (table `item`): `id`, `type` (`hotel` | `flight` | `other`), `title`, `city`,
`start_datetime`, `end_datetime` (check-in/check-out or departure/arrival; local times, no timezone),
`address`, `lat`, `lng`, flight-only `origin`/`destination` (+ `_lat`/`_lng`) and `flight_number`,
`amount` (decimal), `currency`, `booking_ref`, `url`, `notes`.

Keep it a single table with nullable type-specific columns. Hotels store 15:00/11:00 as times; only
dates are shown. For ordering, a hotel counts at the end of its check-in day, so flights that day
come first.

## API (REST, JSON)
- `GET/POST /api/items`, `PUT/DELETE /api/items/{id}`
- `GET /api/summary?year=`: journey (stops list), per city, per month, per type, totals, map stops
- `GET /api/geocode?q=`, `GET /api/hotels?q=`, `GET /api/airports?q=`, `GET /api/flights/lookup?number=&day=`
- `GET /api/features`: whether flight lookup is configured, default currency

## Conventions
- Dates in European style (`24 Oct 2026`), 24-hour time.
- Store original amount and currency; totals per currency.
- Keep dependencies minimal. Ask before adding anything not listed here.
- Backend tests for CRUD, validation, journey merging/gaps, city totals and route ordering.
- README has exact install and run commands.
