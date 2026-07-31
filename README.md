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

**Sharing: one person Shares, everyone else Joins.** These are different actions
and only the first person does the first one:

- **Share my trips** creates a **new** shared space from everything on that device
  and copies a link. Exactly one person, exactly once.
- **Join a shared trip** connects a device to an existing one — Menu → paste the
  link. Anyone who taps *Share* instead creates a **second, separate room** that
  will never sync with the first, so the app warns about this.

The link carries a room id and a secret; the app strips them from its own address
bar once joined, so the secret isn't left on screen or leaked in outbound
`Referer` headers. Use **Copy share link** when you need it again. You'll be asked
who you are once per device, so changes are stamped with a name. The Menu shows
which room you're in (`Shared · 3644ee`) — two devices showing different badges are
in different rooms, which is the first thing to check if syncing seems broken.

**How syncing behaves:** your edits upload automatically, and incoming changes
**apply on their own** within about 20 seconds while the tab is open (backgrounded
tabs pause polling and catch up when you return). The exception is when you have
unsaved edits of your own: then the app waits, shows a dot and a "tap Sync" toast,
and merges both sides when you tap it — so two people editing different things at
once both keep their work. If you both change the *same* field, the value that
reached the server first wins. Large documents make every sync heavier, so keep
attachments small.

## Hosting — Vercel

The app is static, so there's no build step to speak of. Share links only work
for others once the app is hosted somewhere they can reach.

**One-time setup:**

1. Import this repository at [vercel.com/new](https://vercel.com/new). Framework
   preset: **Other**. `vercel.json` already sets the build command and output
   directory — leave the defaults alone.
2. In **Settings → Environment Variables**, add these for *all* environments
   (Production, Preview, Development):
   - `VACATION_SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `VACATION_SUPABASE_ANON_KEY` — the **publishable** key
3. Deploy. `scripts/write-config.js` writes `config.js` from those variables at
   build time; if they're missing it silently no-ops and the committed
   `config.js` is used instead.

`.vercelignore` keeps the design archive, handoff bundles, and the source CSV
out of the public deployment. `vercel.json` also sets a Content-Security-Policy
and `Referrer-Policy: no-referrer` — if you add a new external script, image
host, or API, add it to the CSP or the browser will block it.

To deploy from the terminal instead:

```bash
npx vercel --prod
```
