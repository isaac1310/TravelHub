# Feature parity inventory

Every user-reachable action in the app, as of **v1.15.0**.

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
| Edit any trip | `.btn-edit-trip` on the Budget cards, **and `data-edit-trip` on the Trips cards** — *added v1.11.0* |
| **Multiple destinations** | Repeatable rows in the trip dialog — *v1.10.0*. `destination` stays mirrored from the first |
| Add a trip | `btn-add-trip`, and the app-bar `+` |
| Delete a trip | **Delete trip…** on its own row above Cancel/Save in the Edit-trip dialog (*v1.15.0*, `#trip-delete`; hidden on New) — reachable wherever Edit is: hero, Trips cards, Itinerary, Budget — and the Delete button on the Budget cards. `deleteTrip()` confirms, naming the cascade ("and its 3 bookings & 2 expenses"), and returns false on decline so the dialog stays open |
| Step cards | Day by Day · Route · Checklist · Bookings (renamed from "Reservations" in *v1.15.0* — one word everywhere). **The Bookings step carries the featured trip's id** (*v1.15.0*): it sets `bookingsFocusTrip`, so Bookings opens with only that trip's group open; the tab bar clears it and opens the default. **"Explore attractions" was removed in v1.11.1** — it only reopened the timeline, a third door to a room you were already in; real discovery moves to v2 as a Google Maps import. **Route opens the Maps sub-tab** — *fixed v1.11.0*; the itinerary cards previously all landed on the timeline, so "see the trip in route mode" described a view it did not open. The itinerary ones carry `data-trip-id` for the **featured** trip — *fixed v1.10.3*; they previously only set the hash, so once the switcher tabs had been used they opened whichever trip was last viewed. Enter and Space activate them (they are `role="button"`) |
| **Trip timing badge** | Every card shows `in 43 days` / `Travelling now · day 2 of 4` / `Ended Dec 2026` — *added v1.11.0*, from one shared `tripTiming()` the hero also uses. Compared against a **local** date; `todayISO()` is UTC and names yesterday between midnight and 03:00 in Israel |
| **Trip order** | One order on every screen — travelling, then soonest, then finished (most recent first), then undated — *v1.11.0*, replacing five sorts that disagreed. `featuredTrip()` follows it, so it is no longer the first dated trip in array order. Since *v1.14.0* a **cancelled** trip sorts with the finished ones whatever its dates, and `featuredTrip()` never picks one |
| **Past trips fold** | *v1.14.0*. Trips that are finished (`tripTiming` past) **or cancelled** — one predicate, `tripArchived()` — render inside `#past-trips`, a static `<details class="past-fold">` under the live cards, closed by default at every width. Only its inner div is re-rendered, so the open state survives. Hidden when nothing is archived; when everything is, the live area says "No upcoming trips — your finished trips are below". Budget and Family are deliberately **not** folded: the year filter is how you look back, and the year-end roll must keep seeing every trip |
| **Cancelled trip** | *v1.14.0*. A checkbox in `dialog-trip`, **edit only** (`#trip-cancelled-field`), stored as `trip.cancelled` (strict boolean in `normalizeTripMeta`). The card badge reads `Cancelled` instead of a countdown (`tag--cancelled`); the Bookings picker leaves it out; its budget and expenses stay in Budget. Sync reports `cancelled trip X` / `reinstated trip X` |
| **Today card** | *v1.14.0*. While the featured trip is travelling the hero carries `#hero-today` (`renderTodayCard(trip, todayIso, nowMin)`, pure): **Now** = the timed entry in progress (an entry without an end time lasts until the next one starts), **Next** = the first one still to come, **Tonight** = the hotel whose stay covers tonight (`tonightHotel`, not `tripHotelForDay` — that would name the hotel you left this morning), "Also today" lists untimed entries (two, then `+n more`). Empty day → "Nothing planned today" + `data-today-add` (opens the reservation sheet on today); after the last item → "Done for today" and tomorrow's first entry, or "Last day of the trip". **Full day** is a `data-go` button with `data-day-target`, landing on today's day of the timeline. Refreshed every 60 s and on `visibilitychange`. Local clock only (`todayLocalISO`, `nowMinutes`) |
| Year filter | all years / a specific year |

## Itinerary

| Action | Wiring |
|---|---|
| Switch trip | Underline **tabs**, `data-trip` — restyled *v1.11.0*. Since *v1.14.0* finished and cancelled trips sit behind a **`Past trips (N)`** toggle (`data-switcher-past`, a plain button — not `role=tab`, so it stays out of the arrow-key roving; `itinerarySwitcherShowPast`), forced open when the selected trip is itself archived. Both switchers now honour the tab contract they had only declared: `aria-selected`, one focusable tab per list, ←/→/Home/End, `aria-controls` → a real `role="tabpanel"`. Focus follows an activation and is not stolen by the ~11 unrelated callers of `renderItinerary()` |
| Timeline ↔ Maps | `data-subtab`, in the **sticky header** alongside the day strip — *v1.11.0*. Both the app bar's and the header's heights are measured and published (`--appbar-h`, `--itin-sticky-h`), so `.day`'s scroll-margin and the drag auto-scroll edge derive from them instead of hardcoded numbers that drift. The header sticks at `top: var(--appbar-h)`: the app bar is **also** `position: sticky; top: 0`, so at `top: 0` this slid underneath it and hid the toggle — which on the map tab read as the map covering the header. Switching view also resets the scroll to the top of the header |
| Jump to a day | date strip, `data-strip-day` → selects + scrolls. Deliberately does NOT unfold (v1.10.1) |
| **The strip follows the scroll** | *v1.11.0*. The active chip tracks the day under the sticky header and scrolls itself into view; `timelineDayIso` follows, so the FAB pre-fills the day you are looking at. Suppressed during a tap-to-jump and during a v1.10.2 drag, and it **never** calls `renderItinerary`. A rAF-throttled scroll listener, not an `IntersectionObserver` — the observer never fires in this project's browser harness, and shipping the one thing that could not be verified is how two earlier bugs happened |
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
| **Import a place from Google Maps** | *v1.14.0*. Paste a Maps link into **either** the name field or Location; `parseMapsPaste()` → `applyMapsPaste()` fills the location name and the pin, and the title too when it is empty or is the pasted URL (a typed title is kept). Shapes: `/place/<name>/@lat,lng`, `/search/<name>/`, `?q=<name>,lat,lng`, `!3d!4d`, bare `lat, lng`, DMS. **Short links expand** (*v1.15.0*): `maps.app.goo.gl` / `goo.gl/maps` / `g.co` go to the app's own `/api/expand` (`api/expand.js`, the only server code; allow-listed hosts, 4 hops, 5 s; also served by `tools/serve.js` locally), which follows Google's redirect and returns the full URL — then the normal paste path runs. A name-only result fills the name and lets Save geocode the pin. If the call fails or times out (6 s), the sheet asks for the full URL. Photon is **never** asked to search the URL text |
| **Add expense from a booking** | *v1.15.0*. ⋯ sheet row **Add expense** (becomes **Open expense** once linked) and an **Add expense** button in the Bookings card foot when no expense is linked. `openExpenseForItem()` prefills Description = title, Category from type (`TYPE_TO_CATEGORY`: flight→Flight, hotel→Hotel, restaurant/cafe→Food, transport→Transport, attraction→Activities, store→**Shopping** (new category), other→Other), Booking date = the booking's date, and focuses Amount. The saved expense carries `itemId`; `linkedExpense()` reads it (and still honours the seed `item-<expId>` pattern). **Deleting a booking deletes its linked expense** — the confirm says so — with an **Undo** toast that restores both at their indexes; deleting an expense never touches a booking |
| Filter the map by day | day chips in the same format as the timeline's — day-of-week over the date, same tile, one scrolling line — plus `All`. `mapDayFilter`. The day travels with you between Timeline and Maps: scroll or tap a day, switch tabs, and the other view opens on it. Only a day you *chose* carries — the scroll spy sets one on arrival, and carrying that would stop Maps ever opening on the whole route |
| **Tap a stop to focus it** | `data-focus-stop` on the row body — *v1.10.1*. Centres the map and opens that pin; the Locate and Maps buttons sit outside it. The v1.10.0 carousel was removed (it never rendered) |
| Collapse/expand the stops sheet | tap `.map-list__title` (≤900px, and only while the filter is "All" — a selected day lists in full) |
| Open a stop in Google Maps | "Maps ↗" per stop, **the hotel row**, and **both marker popups** — *coords since v1.9.0* |
| Retry the map | `btn-map-retry` when Leaflet fails to load |
| **Map layering** | `.map-canvas` carries `z-index: 0` — *v1.11.0*. `position: relative` alone is not a stacking context, so Leaflet's own panes (200–700) competed directly with the sticky header and painted over it |

## Budget

| Action | Wiring |
|---|---|
| Year filter | `data-trip-id` scoped views |
| Add funds | `dialog-funds` |
| **Edit a fund addition** | Tap its row in "Fund additions & budget rolls" — *added v1.11.1*. Reuses `dialog-funds` with a hidden `fundId`, and applies the **difference** to `currentFunds`, never the new amount, because the pot is a running total that rollovers also draw from |
| **Remove a fund addition** | Trash button on the row, `data-fund-del` — *added v1.11.1*. Refuses rather than clamping if the pot would go below zero, which means the money has already been rolled into trip budgets |
| **Rollover rows** | Neither editable nor removable. `reduceSourceBudgets` already changed the source trip budgets and clamps on `tripSpent()`, so reversing it would leave the budgets and the ledger disagreeing |
| Roll budget over | `dialog-roll` |
| Add / edit / delete an expense | `dialog-expense`. **Every expense keeps a real id** — *fixed v1.10.3*. Until then `buildExpenseFromForm` returned a payload carrying `id: ""`, which overwrote the id both when adding and when editing, leaving that row's actions permanently dead. Expenses already saved broken are repaired on load with a deterministic `exp-r<hash>` |
| Mark an expense paid | per-expense action, `.btn-mark-paid` / `.btn-mark-unpaid`. Works after an edit — see the row above. **The expense fold stays where you left it** — *v1.15.0*: `expensesFoldOpen` (a Set outside `state`, like `collapsedDays`) remembers open folds across the full re-render that marking paid triggers; adding an expense opens its trip's fold |
| **Overview card** | Leads with **Funds vs committed** in words — *v1.15.0*: "₪2,300 to spare" / "₪553 short" (`answer-card--clear` / `answer-card--short`), sub-line "₪X in the pot · ₪Y committed", bar = committed as a share of funds. "Still to pay" moved to a tile; "Funds vs committed" is no longer duplicated as one |
| **Expense filter** | *v1.15.0*. **All · Unpaid · Paid** chips above the trip cards (`#expense-filter`, `expenseFilter`), same chip as Bookings, counted over the year's trips; partly paid counts as unpaid. Filters the rows inside every card, opens the folds, and the fold summary reads "2 unpaid of 3 expenses". A chip with nothing behind it is hidden |
| **Categories** | Hotel · Flight · Food · Transport · Activities · **Shopping** (*v1.15.0*) · Other — `CATEGORIES`, the dialog `<select>`, `normalizeCategory`, breakdown colours. Every booking type maps to one (`TYPE_TO_CATEGORY`) |
| **Payment status in the expense sheet** | Three tap targets (`#expense-status`, `.segmented`), **not a `<select>`** — *v1.11.0*. A hidden `input[name=status]` keeps the form contract identical. Android draws a select's option list over the sheet's backdrop and dismissing it closed the whole sheet; v1.10.4 guarded it with a timer and v1.10.5 with a focus check, and **both failed on the real phone**. Removing the popup removed the mechanism. Category is still a `<select>` |
| Expand a trip's expenses | expenses fold |
| Category breakdown | rendered per trip |
| **Still-to-pay answer card** | Leads the Overview — *v1.10.0*. Removed from the tile grid, not duplicated |

## Bookings

| Action | Wiring |
|---|---|
| Appbar **+** | Adds what the screen is made of: a trip on Trips, a reservation on Bookings and Itinerary, funds on Budget, a checklist item on Family. On Bookings it asks which trip — a one-line scrolling row of buttons, not a select, upcoming and in-progress trips only (`tripArchived()` — since *v1.14.0* that excludes **cancelled** trips too) — you do not book a holiday you have already taken — and prefills the type from the active filter |
| **Past trips fold** | *v1.14.0*. Bookings of finished and cancelled trips render inside `#bookings-past` (`.past-fold`) after the live groups; `bookingsPastOpen` remembers the open state across the wholesale re-render. The type chips still count folded bookings, so a filter that only matches old bookings shows the fold, not a dead end |
| **One collapsible group per trip** | *v1.15.0*. Each trip is a `<details class="booking-group" data-trip-group>`; **from the tab every group starts closed** (Isaac's call after the local test); the Trips **Bookings** step card lands with the featured trip's group open. `bookingsGroupOpen` (a Map, session-only) remembers what you open or close across chip taps and edits; adding or editing a booking opens its trip's group. Groups inside the Past-trips fold are collapsible too |
| **⋯ on a booking card** | *v1.15.0*. `data-booking-more` opens the same action sheet as the timeline (Edit · Open in Google Maps · Add/Open expense · Delete) with the Move up/down rows hidden — deleting a booking from Bookings was not possible before |
| **Filter chips keep their place** | *v1.15.0*. The chip row's `scrollLeft` survives the re-render and the active chip is scrolled into view — picking Transport at the far right no longer snaps the row back to All |
| **Notes on the card** | *v1.15.0*. `.booking__notes`, muted, clamped to two lines; the full text is in the sheet |
| Filter by type | One chip per type actually present, each with a count, single-select. "Other" means the literal `other` type — it used to sweep up six of the eight |
| Open a reservation | **Tap the card** — *fixed v1.11.0*. `data-item` + `openItemDialog`, the same gesture the timeline learned in v1.10.2. This row previously claimed the cards routed into the itinerary; in fact nothing was bound at all |

## Family

| Action | Wiring |
|---|---|
| Who's travelling | member list |
| Trips by travellers | per-trip roster |
| Shared checklist | add (`checklist-add`), tick (`data-chk`), **edit (`data-chk-edit`)** and delete (`data-chk-del`). Editing is inline — the pencil swaps the label for an input; Enter saves, Escape abandons, blur saves. Not a `prompt()`: a system dialog on a phone hides the list you are correcting, and the label itself is the 44px tick target so it cannot double as the edit target. **The keyboard no longer opens just from visiting Family** — *v1.11.2*; `renderFamily` focused the add field unconditionally, so you got a text cursor when all you wanted was to read the list. It still focuses after you add an item, so several can be typed in a row. Items have always had a checkbox and a strikethrough; *v1.11.0* fixed the wording, which called them "notes" and read as free text, and made the whole row the 44px tick target. **Document attachments were removed in v1.11.0**, along with the payload size-cap machinery and the merge special case that existed only for them |

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
| Build version | `TravelHub v1.15.0 · <sha>` — selectable |

Background behaviour: auto-apply of remote changes when nothing local is pending · notify +
"tap Sync" when there are unsaved edits · three-way merge on sync · pre-join backup ·
missing-room recovery · storage-quota warning. The What's-new list names `cancelled trip X` /
`reinstated trip X` alongside the other trip edits — *v1.14.0*.

## Dialogs, and what opens each

| Dialog | Opened by |
|---|---|
| `dialog-trip` | Add trip · Edit trip (hero, cards, **itinerary**). Edit also offers the **Trip cancelled** checkbox — *v1.14.0* — and **Delete trip…** — *v1.15.0* |
| `dialog-item` | Add/edit booking · **Add to today** on the Today card. Accepts a pasted Google Maps link in the name or Location field — *v1.14.0*; short links expand via `/api/expand` — *v1.15.0* |
| `dialog-expense` | Add/edit expense · **Add expense** from a booking (⋯ sheet, Bookings card) prefilled and linked — *v1.15.0*. Categories now include **Shopping** |
| `dialog-confirm` | **In-app confirm for deletes** — *v1.15.0*: trip, expense, booking, member removal go through `appConfirm(message, cb, {title, okLabel})` instead of the native `confirm()`. Isaac's local test had three deletes "do nothing" in Chrome: a suppressed native prompt returns false silently, and the browser harness auto-dismisses it too. Cancel / Escape / Back / backdrop → `cb(false)`; the red button → `cb(true)`. Fund removal, year-end roll, import and restore still use the native prompt (rare, desktop-side) |
| `dialog-item-actions` | ⋯ on a reservation |
| `dialog-expense` | Add/edit expense |
| `dialog-funds` | Add funds |
| `dialog-roll` | Roll budget |
| `dialog-join` | Menu → Join |
| `dialog-whoami` | First share/join on a device |
| `dialog-changes` | After a sync that brought changes |
| `dialog-overflow` | ⋯ in the app bar |

All of them close on Escape, the close button, **and a tap outside** — a half-filled form stays
open on the first Escape/Back (v1.13.0) and on a backdrop tap.

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

## Accessibility

Since *v1.11.0*:

- `--muted` is `#6f6660` — the **lightest** value clearing 4.5:1 on all four surfaces
  (5.61 / 5.26 / 5.03 / 4.67). The old `#9a9089` measured 2.79–3.12. Input hover borders use
  their own `--border-hover`, because reusing the darkened text colour read as a heavy outline.
  Coral is still below 4.5 on white (2.37) and is a v2 brand decision, so it must not be used
  for small text.
- All ten dialogs carry `aria-labelledby`. None did before.
- **One** always-present visually-hidden `aria-live` region (`#a11y-live`), written by both
  `showToast` and share.js's `setSyncStatus`. Neither of those elements can host a live region:
  `#sync-status` is `display:none` below 900px, and `#toast` is toggled with `hidden`.
- Touch targets: `.pill`, `.act__more`, `.switcher button` and `.day__date` reach 44px. v1.9.1's
  pass covered `.btn` and the icon buttons but missed these.
- Row controls name their object — "Edit Paris Hotel", "Actions for Transavia", "Add a
  reservation on Wed 16" — instead of a list of identical "Edit, Delete, Edit, Delete".

## Diagnostics

`?selftest=1` runs 272 checks (groups up to `v1.15.0`) and prints a pass/skip/fail panel. **A skip is reported
separately and never counted as a pass** — *v1.11.0*. Two checks used to `return true` early at
desktop width, so a desktop run showed them green without exercising anything. Run the suite at
**412px** for full coverage. It refuses to run while joined to
a shared room, because it stubs `localStorage.setItem` to throw.
