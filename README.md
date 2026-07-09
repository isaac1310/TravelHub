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
  day (day chips 16 | 17 | … | All). Locations autocomplete via **Photon**
  (OpenStreetMap) and are geocoded on save; you can also paste a Google Maps
  link or `lat, lng` (decimal or DMS) to set an exact pin. Every stop has an
  "open in Google Maps" link, which doubles as the fallback when the map
  library or coordinates are unavailable. Flights are not pinned on the map.
- **Budget** — funds, per-trip budgets, expenses, rollovers, JSON export/import.
- **Sharing (optional)** — with Supabase configured, the Share button creates a
  link (`?room=…&key=…`). Anyone with the link sees and edits the same data,
  synced every ~20 s (last write wins).

## Enable sharing (one-time Supabase setup)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, paste and run `supabase-schema.sql`.
3. Put the **Project URL** and **publishable (anon public) key** from Project
   Settings → API into `config.js` (see `config.example.js` for the shape).
4. Reload the app — a **Save** button appears in the top bar.

`config.js` **is committed** in this repo on purpose: the hosted app on GitHub
Pages needs it to enable Save/sharing, and the publishable key is safe to
expose in client code. Trip data is protected by the per-trip secret embedded
in each share link. Without `config.js` the app is fully local — no errors, no
Save button.

**How Save & Sync work:** click **Save** once to store the trip in Supabase (a
`?room&key` link is copied to your clipboard). You'll be asked who you are
(once per device) so changes are stamped with a name. Your edits push
automatically; **incoming** family changes are notify-first: every 5 minutes
the app checks for updates and shows a dot on the Sync button + a toast
("Moran made changes — tap Sync"). Nothing changes on screen until you tap
**Sync**, which then shows a "What's new" list and marks the changed sections
with a dot in the navigation. Concurrent edits are **last-write-wins** — sync
before making big edits; large documents also make each sync heavier, so keep
attachments small.

## Hosting

The app is static — GitHub Pages, Netlify, or any static host works. Share
links only work for others once the app is hosted somewhere they can reach.
