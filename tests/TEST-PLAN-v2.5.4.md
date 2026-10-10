# Manual test plan — v2.5.4

**Where:** `http://localhost:8722` (phone: `http://<mac-ip>:8722`). Footer should read
`TravelHub v2.5.4`.

**Automated first:** `?selftest=1` on 8723. Phone width (375): 400 passed, 0 failed, 6 skipped. Desktop
(1280): 382 passed, 0 failed, 24 skipped. The extra desktop skips are the phone-only checks. The 6 skipped
in both runs need a second trip or a hotel, which the sandbox seed doesn't have. Every new check failed
when its fix was removed (16 mutations). A code review found 4 must-fix issues. All are fixed and have
checks: a fallback could pin a city centre, Update could turn a booked hotel into an attraction, a
moved hotel could keep an impossible checkout, and Undo could race the geocoder.

This release has no new stored fields. A phone still on v2.5.3 syncs fine.

What changed:
- **Import places** lives in **Edit trip** now. The button at the bottom of Day by Day and the ⋯ menu
  entry are gone. One place at a time still goes through **+**: paste a Maps link into Location.
- The import reads a **type** (hotel, restaurant, café, store, transport, attraction). For JSON with no
  type, like your Bratislava list, it guesses from the name and the opening words of the note. Every row
  has a type picker to correct it.
- **Importing the same list again:** places already in the trip are skipped, or updated if you choose.
- **Hotels** get a checkout date (the next hotel's check-in, or the end of the trip). They are the
  unnumbered start of each day, so the first sight is **1**.
- **Hidden pins:** places at the same spot (Hofburg and Michaelerplatz) now sit side by side instead
  of one on top of the other. UFO is found now.
- **Editing a booking** keeps your scroll position.
- **Route list drag:** press and hold a stop to reorder it there too. The map pins follow.

---

## 1. ⚠️ Fix your Bratislava–Vienna trip with a re-import (your real data)
1.1 Day by Day → **Edit trip** → **Import places…**
- **Expect:** "Add places · <trip name>", no trip picker, two numbered boxes ("One place, or a few" /
  "A whole list at once"), nothing folded away. ☐

1.2 Paste the same JSON you used before.
- **Expect:** a box "36 already in this trip" with **Skip them** pressed. Every row says
  "Already in this trip — will be skipped". The button is disabled, because there is nothing new. ☐

1.3 Check the type pickers.
- **Expect:** BEIGLI and Hotel City Central = Hotel. Koliba, Slovak Pub, Meissl & Schadn, Figlmüller =
  Restaurant. Demel = Café. Primark, Aupark = Store. Hauptbahnhof, Airport = Transport. Everything else =
  Attraction. Change Eurovea City to Store if you want. ☐
- A guess only replaces **Attraction** (what the old import gave everything). If you had already set a
  place to something else by hand, its picker shows that type and keeps it. ☐

1.4 Tap **Update them**.
- **Expect:** the hint says type, note and day are replaced and visited ticks, times and pins are kept.
  The button reads "Update 36 places". ☐

1.5 Tap it.
- **Expect:** Edit trip closes too, and a toast says "36 updated." with **Undo**. ☐

## 1a. ⚠️ While the places are being found
1a.1 Right after tapping Update/Add in step 1, look at the top of Day by Day, then at Route.
- **Expect:** a strip with the splash's paper plane flying over a dashed line, reading "Finding places
  on the map… N of M". The count goes up and the plane keeps flying smoothly, without jumping back to
  the start each time. ☐
- **Expect:** at the end it reads "✓ All places are on the map" (gone after about 5 s), or "N places not
  found — tap Locate on them in Route" (gone after about 15 s). ☐
- If every place already has a pin (e.g. a second Update), no strip appears. That's correct. ☐

## 1b. ⚠️ Dates that don't fit the trip
1b.1 Edit trip → change the end date one day earlier → **Import places…** → paste a list whose last
row is on the old last day.
- **Expect:** the trip is saved and Edit trip closes. That row's day picker refuses the old last day. ☐
1b.2 Cancel, Edit trip → put the end date back → **Import places…** at once, without tapping Save.
- **Expect:** the same row is accepted now. There's no need to save and come back. ☐

## 2. ⚠️ Hotel is the start, sights start at 1
2.1 Route → Fri 11.
- **Expect:** BEIGLI is the hotel pin with no number, first in the list as "Start of the day". Michael's
  Gate is **1**. ☐

2.2 Sat 12.
- **Expect:** still starts at BEIGLI. ☐

2.3 Sun 13 (the move day).
- **Expect:** starts at **Hotel City Central**, not BEIGLI. Stephansplatz is 1. ☐

2.4 Day by Day on the 13th.
- **Expect:** "Check-out · BEIGLI…" and "Check-in · Hotel City Central". ☐

⚠️ Your note says you return to BEIGLI after Vienna. Add that second stay yourself (+ → Hotel, 15→16),
or edit City Central's checkout. The importer can't know about the return from this JSON. A list made
with the new prompt lists each stay separately.

## 3. ⚠️ No hidden pins
3.1 Route → Sun 13, zoom in on Michaelerplatz.
- **Expect:** **6** and **7** (Michaelerplatz and Hofburg) side by side, both tappable. ☐

3.2 Sat 12, zoom in on SNP Bridge.
- **Expect:** SNP Bridge and UFO Observation Deck both have pins. If UFO still has a Locate button, tap
  it once. ☐

## 3b. ⚠️ Drag to reorder in the Route list (new)
3b.1 Route → pick a day → press and **hold** a stop row about half a second until it lifts, drag it to
a new spot, let go.
- **Expect:** it lifts as a card and the distance lines hide while you drag. On release the list
  renumbers. ☐
- **Expect:** the **map pins renumber to match** the list, and the map stays where you had it zoomed. ☐
3b.2 Switch to Day by Day.
- **Expect:** same order there. ☐
3b.3 On a day with a flight or a check-in (they're not in the Route list), drag a stop past where they
would sit.
- **Expect:** in Day by Day it lands next to the stop you dropped it beside, not before the flight. ☐
3b.3a **On the Mac with the mouse:** click a stop (Route) or a card (Day by Day) and pull straight
away, no hold.
- **Expect:** it lifts right away and drops where you let go. On the phone the hold is still needed,
  so a quick swipe still scrolls. ☐
3b.4 A quick tap on a row (no hold).
- **Expect:** it still shows that place on the map, as before. ☐
- The hotel ("Start of the day") can't be dragged. That's on purpose. ☐

## 4. Undo
4.1 Run 1.1–1.5 again, but this time change one row's type first, then tap **Undo** on the toast.
- **Expect:** that place's type goes back. ☐

## 5. ⚠️ Scroll position
5.1 Bookings → scroll halfway down → tap a booking → change the note → Save.
- **Expect:** you stay where you were, not back at the top. ☐

5.2 Day by Day → scroll to day 3 → edit a place there without changing its day.
- **Expect:** you stay on day 3. ☐

5.3 Edit a place and move it to another day.
- **Expect:** the timeline jumps to the new day (as before). ☐

## 6. New prompt (optional, 2 min)
6.1 Copy the AI prompt and give it to ChatGPT or Claude with a short list that includes a hotel and a
restaurant.
- **Expect:** each object has `"type"`, and the hotel has `"checkout"`. Pasted back, the rows show those
  types. ☐

---
Version footer checked: ☐ `TravelHub v2.5.4`
