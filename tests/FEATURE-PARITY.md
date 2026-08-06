# Feature parity inventory

Every user-reachable action in the app, as of **v1.11.2**.

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
| Delete a trip | inside the trip dialog (cascades to its reservations) |
| Step cards | Day by Day · Route · Checklist · Reservations. **"Explore attractions" was removed in v1.11.1** — it only reopened the timeline, a third door to a room you were already in; real discovery moves to v2 as a Google Maps import. **Route opens the Maps sub-tab** — *fixed v1.11.0*; the itinerary cards previously all landed on the timeline, so "see the trip in route mode" described a view it did not open. The itinerary ones carry `data-trip-id` for the **featured** trip — *fixed v1.10.3*; they previously only set the hash, so once the switcher tabs had been used they opened whichever trip was last viewed. Enter and Space activate them (they are `role="button"`) |
| **Trip timing badge** | Every card shows `in 43 days` / `Travelling now · day 2 of 4` / `Ended Dec 2026` — *added v1.11.0*, from one shared `tripTiming()` the hero also uses. Compared against a **local** date; `todayISO()` is UTC and names yesterday between midnight and 03:00 in Israel |
| **Trip order** | One order on every screen — travelling, then soonest, then finished (most recent first), then undated — *v1.11.0*, replacing five sorts that disagreed. `featuredTrip()` follows it, so it is no longer the first dated trip in array order |
| Year filter | all years / a specific year |

## Itinerary

| Action | Wiring |
|---|---|
| Switch trip | Underline **tabs**, `data-trip` — restyled *v1.11.0*. Both switchers now honour the tab contract they had only declared: `aria-selected`, one focusable tab per list, ←/→/Home/End, `aria-controls` → a real `role="tabpanel"`. Focus follows an activation and is not stolen by the ~11 unrelated callers of `renderItinerary()` |
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
| Filter the map by day | day chips, `mapDayFilter` |
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
| Mark an expense paid | per-expense action, `.btn-mark-paid` / `.btn-mark-unpaid`. Works after an edit — see the row above |
| **Payment status in the expense sheet** | Three tap targets (`#expense-status`, `.segmented`), **not a `<select>`** — *v1.11.0*. A hidden `input[name=status]` keeps the form contract identical. Android draws a select's option list over the sheet's backdrop and dismissing it closed the whole sheet; v1.10.4 guarded it with a timer and v1.10.5 with a focus check, and **both failed on the real phone**. Removing the popup removed the mechanism. Category is still a `<select>` |
| Expand a trip's expenses | expenses fold |
| Category breakdown | rendered per trip |
| **Still-to-pay answer card** | Leads the Overview — *v1.10.0*. Removed from the tile grid, not duplicated |

## Bookings

| Action | Wiring |
|---|---|
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
| Build version | `TravelHub v1.11.2 · <sha>` — selectable |

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

`?selftest=1` runs 192 checks and prints a pass/skip/fail panel. **A skip is reported
separately and never counted as a pass** — *v1.11.0*. Two checks used to `return true` early at
desktop width, so a desktop run showed them green without exercising anything. Run the suite at
**412px** for full coverage. It refuses to run while joined to
a shared room, because it stubs `localStorage.setItem` to throw.
