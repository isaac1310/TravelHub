# Feature parity inventory

Every user-reachable action in the app, as of **v1.10.5**.

**Why this exists.** While planning a redesign I specified building a sticky date strip —
which had already shipped, working, for several releases. That kind of drift is invisible
until it costs you: you either rebuild something that works, or you delete something you
didn't know was there. This is the reference that stops both.

**How to use it.** Before any release that touches rendering, walk the list and confirm each
row still does what it says. It's the concrete form of "keep functionality" — otherwise that
promise gets argued screen by screen, under pressure, at the end.

Derived from the handlers actually wired in `index.html`, not from memory.

---

## Navigation

| Surface | Action |
|---|---|
| Sidebar (>900px) | Trips · Itinerary · Budget · Bookings · Family |
| Tab bar (≤900px) | The same five |
| Hash routes | `#trips` `#itinerary` `#budget` `#bookings` `#family` — deep-linkable |
| App bar | Cloud/save state · `+` (contextual add) · account |

## Trips

| Action | Wiring |
|---|---|
| Open the featured trip's itinerary | hero CTA |
| Edit the featured trip | `data-edit-trip` on the hero |
| Edit any trip | `.btn-edit-trip` on trip cards |
| **Multiple destinations** | Repeatable rows in the trip dialog — *v1.10.0*. `destination` stays mirrored from the first |
| Add a trip | `btn-add-trip`, and the app-bar `+` |
| Delete a trip | inside the trip dialog (cascades to its reservations) |
| Step cards | Day by Day · Route · Explore attractions · Checklist · Reservations. The three itinerary ones carry `data-trip-id` for the **featured** trip — *fixed v1.10.3*; they previously only set the hash, so once the switcher tabs had been used they opened whichever trip was last viewed. Enter and Space activate them (they are `role="button"`) |
| Year filter | all years / a specific year |

## Itinerary

| Action | Wiring |
|---|---|
| Switch trip | switcher tabs, `data-trip` |
| Timeline ↔ Maps | `data-subtab` |
| Jump to a day | date strip, `data-strip-day` → selects + scrolls. Deliberately does NOT unfold (v1.10.1) |
| **Fold / unfold a day** | `data-day-toggle` on the date rail — *added v1.9.1*. Per-device, never synced |
| **Stop numbers** | Timeline cards show the map pin number (`.act__stopno`) for reservations that appear on the map — *added v1.9.1* |
| **Edit the trip** | `data-edit-trip` in the section head — *added v1.9.0* |
| Add a reservation | per-day add button (pre-fills that day) |
| Edit a reservation | **Tap the card body** (*v1.10.2*), `data-edit-item`, and ⋯ → Edit. The ⋯ button, the hover cluster and "Add reservation" are all excluded from the card tap |
| **Tap a check-out row** | Opens the underlying hotel — *v1.10.2*. Same thing its Edit button already did |
| Reorder within a day | **Press and hold ~450 ms, then drag** (*v1.10.2*), `data-move-item` + `data-move-dir`, and ⋯ → Move up/down. Drag is pointer-only and confined to one day; the ↑/↓ buttons stay as the keyboard and assistive path. Moving before the hold fires scrolls the page instead, and a completed drag never also opens the editor |
| Delete a reservation | `data-delete-item`, and ⋯ → Delete |
| ⋯ action sheet | `dialog-item-actions`: Edit · Move up · Move down · **Open in Google Maps** · Delete |
| Geocode a place | `data-locate-item` ("Locate") |
| Filter the map by day | day chips, `mapDayFilter` |
| **Tap a stop to focus it** | `data-focus-stop` on the row body — *v1.10.1*. Centres the map and opens that pin; the Locate and Maps buttons sit outside it. The v1.10.0 carousel was removed (it never rendered) |
| Collapse/expand the stops sheet | tap `.map-list__title` (≤900px, and only while the filter is "All" — a selected day lists in full) |
| Open a stop in Google Maps | "Maps ↗" per stop, **the hotel row**, and **both marker popups** — *coords since v1.9.0* |
| Retry the map | `btn-map-retry` when Leaflet fails to load |

## Budget

| Action | Wiring |
|---|---|
| Year filter | `data-trip-id` scoped views |
| Add funds | `dialog-funds` |
| Roll budget over | `dialog-roll` |
| Add / edit / delete an expense | `dialog-expense`. **Every expense keeps a real id** — *fixed v1.10.3*. Until then `buildExpenseFromForm` returned a payload carrying `id: ""`, which overwrote the id both when adding and when editing, leaving that row's actions permanently dead. Expenses already saved broken are repaired on load with a deterministic `exp-r<hash>` |
| Mark an expense paid | per-expense action, `.btn-mark-paid` / `.btn-mark-unpaid`. Works after an edit — see the row above |
| Expand a trip's expenses | expenses fold |
| Category breakdown | rendered per trip |
| **Still-to-pay answer card** | Leads the Overview — *v1.10.0*. Removed from the tile grid, not duplicated |

## Bookings

| Action | Wiring |
|---|---|
| Filter by type | All / Flights / Hotels / Other |
| Open a reservation | routes into the itinerary item |

## Family

| Action | Wiring |
|---|---|
| Who's travelling | member list |
| Trips by travellers | per-trip roster |
| Shared checklist | add (`checklist-add`), toggle (`data-chk`), delete (`data-chk-del`) |
| Attach a document | `family-doc-upload` (2.5 MB each, 4 MB total) |
| Download / delete a document | per-row, `data-doc-del` |

## Sharing and sync — `dialog-overflow` (the Menu)

| Item | Shown when |
|---|---|
| Share my trips (`save`) | not in a room |
| Join a shared trip (`join`) | always — reads "Switch to a different trip" when already in one |
| Copy share link (`copy`) | in a room |
| Sync now (`sync`) | in a room |
| Leave shared trip (`leave`) | in a room |
| Export data (`export`) | always |
| Import data (`import`) | always |
| Restore my old data (`restore`) | a pre-join backup exists |
| Room badge | `Shared · xxxxxx` / `Local only` — tap to copy the full room id |
| Build version | `TravelHub v1.10.5 · <sha>` — selectable |

Background behaviour: auto-apply of remote changes when nothing local is pending · notify +
"tap Sync" when there are unsaved edits · three-way merge on sync · pre-join backup ·
missing-room recovery · storage-quota warning.

## Dialogs, and what opens each

| Dialog | Opened by |
|---|---|
| `dialog-trip` | Add trip · Edit trip (hero, cards, **itinerary**) |
| `dialog-item` | Add/edit reservation |
| `dialog-item-actions` | ⋯ on a reservation |
| `dialog-expense` | Add/edit expense |
| `dialog-funds` | Add funds |
| `dialog-roll` | Roll budget |
| `dialog-join` | Menu → Join |
| `dialog-whoami` | First share/join on a device |
| `dialog-changes` | After a sync that brought changes |
| `dialog-overflow` | ⋯ in the app bar |

All ten close on Escape, the close button, **and a tap outside** — with a confirm if a form
has unsaved edits.

A backdrop tap while a `<select>` inside the dialog holds focus blurs the select instead of
closing the sheet — *v1.10.5*. Android draws a select's option list over the upper part of the
screen, which for a bottom sheet is the backdrop; dismissing it delivered the tap through and
closed the sheet, losing the edit. v1.10.4 tried a 700ms window from touching the select and
failed on the real phone, because the list stays open while you read it; focus has no clock.
A short window after `change` remains as a bridge, reset on every dialog open.

Layout, since *v1.10.3*: two-up rows (`.roll-years`) can shrink below their inputs' natural
width, so no dialog scrolls sideways at 412px — `#dialog-item` with the flight fields showing
used to be 446px in a 397px box. The sticky Cancel/Save bar no longer occludes a field: the
form reserves the bar's height and focusing a field scrolls it clear.

## Trip covers

| Surface | Detail |
|---|---|
| Trips hero | `coverArt()`, confined to the upper right (34% × 44%) so it never sits under the trip name |
| Trip cards | `coverArt()` filling the 96px `.tripcard__cover` strip |

**Blueprints v2** — *v1.10.3*. Two layers per city: the landmark (`fg`, stroke 2.2) over its
city context (`bg`, stroke 1.2, lighter) — the bridge, river, rooftops, tram or tree that places
it. Drawn on a 210 × 100 grid, baseline y = 88, right-aligned and baseline-anchored via
`preserveAspectRatio="xMaxYMax meet"`. Derived from the destination string, so nothing is stored
and nothing is fetched.

19 cities: Paris · Bratislava · London · Rome · Barcelona · Amsterdam · Prague · Vienna · Athens
· New York · **Tel Aviv** · **Jerusalem** · **Budapest** · **Berlin** · **Lisbon** · **Madrid** ·
**Tokyo** · **Bangkok** (the eight bold are new in v1.10.3), plus a neutral `generic` skyline for
anything unmatched. Aliases cover local spellings (Praha, Wien, Lisboa, TLV, ירושלים). Known
limit: matching on the string means "Paris, Texas" gets the Eiffel Tower.

Exported for design work by `design/export-blueprints.js`, which parses the paths out of
`index.html` so `design/blueprints/` can never drift from what the app draws.

## Diagnostics

`?selftest=1` runs 136 checks and prints a pass/fail panel. It refuses to run while joined to
a shared room, because it stubs `localStorage.setItem` to throw.
