# Family TravelHub

A single-file web app for planning family trips: day-by-day itinerary with
reservations (flights, hotels, attractions, transport), an interactive map of
each day's stops, budget tracking, and optional shared storage via Supabase.

## Run locally

Open `index.html` in a browser — no build step. Data is saved in
`localStorage`. (For the map/geocoding features a local server is nicer:
`npx http-server` and open http://localhost:8080.)

## Features

- **Trips** — trip cards with destination, dates, and travelers (edit via the trip dialog).
- **Itinerary → Timeline** — day-by-day reservations. "Add reservation" opens a
  modal supporting flight / hotel / attraction / transport / other, with dates,
  times, location, and confirmation number. Edit/delete on each card.
- **Itinerary → Maps** — Leaflet + OpenStreetMap view with lettered pins per
  day (day chips 16 | 17 | … | All). Locations you type are geocoded via
  Nominatim on save. Every stop also has an "open in Google Maps" link, which
  doubles as the fallback when the map library or coordinates are unavailable.
- **Budget** — funds, per-trip budgets, expenses, rollovers, JSON export/import.
- **Sharing (optional)** — with Supabase configured, the Share button creates a
  link (`?room=…&key=…`). Anyone with the link sees and edits the same data,
  synced every ~20 s (last write wins).

## Enable sharing (one-time Supabase setup)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, paste and run `supabase-schema.sql`.
3. Copy `config.example.js` to `config.js` and fill in the **Project URL** and
   **anon public key** from Project Settings → API.
4. Reload the app — a Share button appears in the top bar.

`config.js` is gitignored. Without it the app is fully local — no errors, no
Share button.

## Hosting

The app is static — GitHub Pages, Netlify, or any static host works. Share
links only work for others once the app is hosted somewhere they can reach.
