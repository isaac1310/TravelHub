# Feature parity inventory

Every user-reachable action in the app, as of **v1.10.0**.

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
| Step cards | Day by Day · Route · Explore attractions · Check |
| Year filter | all years / a specific year |

## Itinerary

| Action | Wiring |
|---|---|
| Switch trip | switcher tabs, `data-trip` |
| Timeline ↔ Maps | `data-subtab` |
| Jump to a day | date strip, `data-strip-day` → un-collapses if folded, then `scrollIntoView` |
| **Fold / unfold a day** | `data-day-toggle` on the date rail — *added v1.9.1*. Per-device, never synced |
| **Stop numbers** | Timeline cards show the map pin number (`.act__stopno`) for reservations that appear on the map — *added v1.9.1* |
| **Edit the trip** | `data-edit-trip` in the section head — *added v1.9.0* |
| Add a reservation | per-day add button (pre-fills that day) |
| Edit a reservation | `data-edit-item`, and ⋯ → Edit |
| Reorder within a day | `data-move-item` + `data-move-dir`, and ⋯ → Move up/down |
| Delete a reservation | `data-delete-item`, and ⋯ → Delete |
| ⋯ action sheet | `dialog-item-actions`: Edit · Move up · Move down · **Open in Google Maps** · Delete |
| Geocode a place | `data-locate-item` ("Locate") |
| Filter the map by day | day chips, `mapDayFilter` |
| **Same-day stops carousel** | `data-focus-stop` — *v1.10.0*. Shown for a single day; tap centres the map and opens that pin |
| Collapse/expand the stops sheet | tap `.map-list__title` (≤900px) |
| Open a stop in Google Maps | "Maps ↗" per stop, **the hotel row**, and **both marker popups** — *coords since v1.9.0* |
| Retry the map | `btn-map-retry` when Leaflet fails to load |

## Budget

| Action | Wiring |
|---|---|
| Year filter | `data-trip-id` scoped views |
| Add funds | `dialog-funds` |
| Roll budget over | `dialog-roll` |
| Add / edit / delete an expense | `dialog-expense` |
| Mark an expense paid | per-expense action |
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
| Build version | `TravelHub v1.9.0 · <sha>` — selectable |

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

## Diagnostics

`?selftest=1` runs 97 checks and prints a pass/fail panel. It refuses to run while joined to
a shared room, because it stubs `localStorage.setItem` to throw.
