# Manual test plan — v1.14.0

**Device:** your Samsung Ultra, Chrome. **Where:** the Vercel preview for this PR, not production.
**First:** ⋯ menu → the footer must read `TravelHub v1.14.0` — otherwise you are on a cached page.

Three features and a docs refresh, all from the September project review: **Past trips** (finished
trips fold away; a trip can be marked *cancelled*), **Import a place** from a pasted Google Maps
link, and a **Today card** in the Trips hero while you are travelling. Nothing in the budget maths
or the sync engine changed; one new field (`cancelled`) was added to a trip and it syncs like any
other edit.

**Use a trip you don't mind touching, or Export first** (Budget → Data & year-end → Export).
Step 1 needs a trip whose dates include today — edit an existing one temporarily or create a
throwaway.

---

## The risky ones — do these first

### ⚠️ 1. Today card on a real travelling trip

The harness rendered this with a fixed clock; only your phone runs it against the real one, the
real Maps app, and a real return from the background.

1. Edit a trip so its dates include today (yesterday → the day after tomorrow). Add three
   reservations for today: one that started an hour ago and ends in an hour, one starting in
   two hours, and a hotel whose stay covers tonight. Give the first one a location and a
   confirmation number.
2. Trips. **Expect:** the hero reads "Travelling now · day 2 of 4" and carries a white **Today**
   card: **Now** = the first item (with its time, location and `Conf: …`), **Next** = the second,
   **Tonight** = the hotel. ☐
3. Tap **Maps ↗** on the Now row. **Expect:** the Google Maps app opens on that place. ☐
4. Tap **Full day**. **Expect:** Itinerary → Timeline, scrolled to **today's** day with today's
   chip highlighted, not the top of the trip. ☐
5. Back to Trips. Leave the app (home screen) for two minutes, come back.
   **Expect:** the card is still correct for the new time (it refreshes on return and every minute). ☐
6. Delete today's reservations. **Expect:** "Nothing planned today" + **Add to today**; tapping it
   opens the reservation sheet with today's date filled. ☐
7. Put the trip's dates back.

### ⚠️ 2. Paste a place from the Google Maps app

1. In Google Maps, find any place → **Share** → copy link. That is a **short** link
   (`maps.app.goo.gl/…`).
2. Itinerary → + → paste it into the **name** field (the one the sheet opens on).
   **Expect:** the field clears and a note under Location says it is a short link and asks for the
   full one; no junk search results appear. ☐
3. Open the short link in Chrome, wait for Maps to load, copy the URL from the address bar
   (it contains `@lat,lng`). Paste that into the name field.
   **Expect:** name and Location both fill with the place name, the note says "Location set from
   your paste … Just Save". ☐
4. Save. Itinerary → Maps. **Expect:** the pin sits on the right place (no geocoding guess). ☐
5. Repeat step 3 but type a name first ("Dinner"), then paste the URL into **Location**.
   **Expect:** the title stays "Dinner"; only Location and the pin fill. ☐

### ⚠️ 3. Cancel a trip, then reinstate it

1. Trips → Edit a **future** trip → tick **Trip cancelled — file it under Past trips** → Save.
   **Expect:** it leaves "Your trips"; **Past trips (N)** appears below, closed; open it — the card
   shows a dark red **Cancelled** badge instead of "in N days". ☐
2. Bookings → + . **Expect:** the cancelled trip is **not** offered in the trip row. ☐
3. Budget → the year filter. **Expect:** the cancelled trip and its budget are still there. ☐
4. Itinerary. **Expect:** its tab is behind **Past trips (N)**; tapping the toggle reveals it. ☐
5. Edit → untick → Save. **Expect:** back in "Your trips" with its countdown. ☐

### ⚠️ 4. Two phones (the reviewer's P0)

With a second family phone in the same room:

1. Cancel a trip on phone A. On phone B: **Expect:** the update toast, and the What's-new list
   says **"cancelled trip <name>"**; the trip is under Past trips there too. ☐
2. Reinstate on B. On A: **Expect:** "reinstated trip <name>" and it returns to the live list. ☐
3. Edit a reservation on A while B adds a checklist item, then Sync both.
   **Expect:** both changes survive on both phones (three-way merge, unchanged this release). ☐

## The rest

### 5. Past trips fold — Trips, Bookings, Itinerary

1. Trips: if you have a finished trip, it is under **Past trips**, closed by default; open it,
   edit any trip, **Expect:** the fold stays open. ☐
2. Bookings: reservations of finished trips are under a **Past trips** fold at the bottom; the
   type chips still count them (filter by Hotels — the fold shows the old hotel). ☐
3. Nothing changed on Budget and Family — check they look as before. ☐

### 6. Regression glance

Tap through all five tabs at your usual size; open and Cancel each sheet. Nothing should look
different except the items above. ☐

Footer check: `TravelHub v1.14.0`. ☐
