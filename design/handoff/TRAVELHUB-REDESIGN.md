# TravelHub — UI/UX enhancement spec

Implementation brief for `index.html` (single-file app, vanilla JS, no build step).
Target: mobile-first, 390px baseline. Direction: **warm editorial** — destination
photography carries the atmosphere, the UI stays quiet.

Reference design: `Enhanced App.dc.html` in this project (screens labelled `2a …`).
Mobile-layout fixes that precede this: `Mobile UX.dc.html` (screens labelled `1a …`).

---

## 1. Design system

Add these as CSS custom properties on `:root` and use them everywhere. Values marked
**new** are additions; the rest already exist in the app and must not drift.

### Colour

```css
:root {
  /* surfaces */
  --bg:            #fbf7f3;   /* app background (cream) */
  --surface:       #ffffff;   /* cards, sheets */
  --surface-sunk:  #fbf1e8;   /* inset tiles, quiet chips */
  --surface-warm:  #f6e8dc;   /* secondary buttons, segmented track */

  /* ink */
  --ink:           #33302e;   /* body text */
  --ink-strong:    #2c2a28;   /* headings, primary buttons (new role) */
  --ink-muted:     #6f6660;   /* secondary text, inactive icons — CORRECTED, see note */
  --ink-faint:     #b9aca4;   /* placeholders */
  --ink-on-dark:   #ffffff;

  /* accent — coral, unchanged */
  --accent:        #ef8e7f;
  --accent-strong: #e87a6a;   /* links, text accents */
  --accent-press:  #dd6d5d;
  --accent-tint:   #fbe4de;

  /* lines */
  --line:          #efe6dd;   /* card borders, dividers */
  --line-strong:   #e4d8cc;   /* inputs, dashed placeholders */

  /* semantic */
  --danger:        #d9534f;
  --danger-tint:   #fdeeec;
  --warn:          #d9903f;
  --ok:            #3f9b7c;
  --ok-tint:       #eaf5f0;

  /* reservation-type tints (already in app, keep) */
  --t-flight-bg: #dcf1f4; --t-flight-fg: #2f8a9b;
  --t-stay-bg:   #f0e6fb; --t-stay-fg:   #7c4fc4;
  --t-food-bg:   #fce8d8; --t-food-fg:   #c26a33;
  --t-status-bg: #e3edfa; --t-status-fg: #4a6fa5;
}
```

**Rule changes from today's UI**

- The coral gradient hero is **removed**. Destination photography replaces it.
  Coral survives as accent only: progress fills, links, text accents, avatars, map pins.
- The **primary button is `--ink-strong`** (near-black), not coral. One primary per screen.
  Secondary = `--surface` + `--line-strong` border. Tertiary = `--surface-warm`, no border.
- Max **two** background colours per screen (`--bg` + `--surface`).

### Type

```css
--font-display: "Fraunces", Georgia, serif;   /* new — place names & section titles */
--font-ui:      "Inter", system-ui, sans-serif;
--font-mono:    ui-monospace, monospace;      /* conf numbers, flight codes */
```

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Hero place name | display | 44px / 0.98 | 600 | over photo, `letter-spacing:-.02em` |
| Screen title | display | 22px | 600 | in the app bar |
| Section title | display | 20px | 600 | "By trip", "Before Paris" |
| Card title | ui | 15px | 600 | |
| Body | ui | 15px / 1.5 | 400 | |
| Secondary | ui | 13px | 400 | `--ink-muted` |
| Eyebrow / label | ui | 10.5px | 600 | uppercase, `letter-spacing:.18em`, `--ink-muted` |
| Metric | display | 38px | 600 | the one big number |

Never below 12.5px. Inputs are **16px** (prevents iOS zoom-on-focus).

### Space, radius, elevation

- Space scale: `4 · 8 · 12 · 16 · 20 · 24 · 32`. Screen gutter **16px**.
- Radius: `999px` pills · `24px` sheets & phone-level containers · `18px` cards ·
  `14px` inputs & tiles · `12px` icon badges.
- Elevation: cards `0 4px 16px rgba(70,45,30,.06)`; raised/FAB `0 10px 24px rgba(44,42,40,.35)`;
  sheets `0 -14px 40px rgba(70,45,30,.2)`. Nothing else casts a shadow.
- **Touch targets ≥44px**; primary CTAs 48–54px; inputs 50px.
- Layout siblings with `display:flex/grid` + `gap`. No margin-based spacing between siblings.
- Safe areas: `padding-bottom: max(14px, env(safe-area-inset-bottom))` on the tab bar and
  every bottom sheet.

### Components

| Component | Spec |
|---|---|
| App bar | 56px, `--bg`, 1px bottom `--line`. Left: eyebrow + screen title. Right: max **one** icon action (44px) — contextual, not global. |
| Tab bar | 5 items, icon 22px + 10.5px label, active `--ink-strong` w/ 1.8 stroke, inactive `#b3a79f`. |
| Photo hero | 400px home / 158px day header. Scrim `linear-gradient(180deg, rgba(30,18,12,.5), transparent 34%, rgba(30,18,12,.12) 60%, rgba(30,18,12,.78))`. Apply `saturate(.9)` to normalise user photos. Content overlay is `pointer-events:none` except buttons. |
| Card | `--surface`, 1px `--line`, radius 18, card shadow. Optional footer row divided by `--line` for actions/documents. |
| Segmented control | Track `--surface-warm`, radius 999, 3px pad; active chip `--surface` + card shadow. |
| Date strip | Sticky under the app bar. 52px-wide chips: weekday 10px uppercase over day number 18px. Active = `--ink-strong` fill. Horizontal scroll, `scroll-snap-type:x proximity`. |
| Bottom sheet | Radius 24 top, 38×4 grab handle, sticky footer CTA, `max-height:88dvh`, body scrolls. Backdrop `rgba(44,42,40,.44)` + `blur(3px)`. |
| Overflow menu | `⋯` 38px circle, `--surface-sunk`. Opens an action sheet. Replaces **all** hover-only actions. |
| Empty state | One dashed `--line-strong` row, 14px pad, that states the object and the action: "Nothing planned for Thursday — add a stop". No illustrations. |

### Motion

`--ease: cubic-bezier(.2,.8,.2,1)`. Sheets in 260ms, tab/route change 180ms fade+4px rise,
progress bars 400ms width. Shared-element transition trip card → trip hero
(`view-transition-name` on the photo). Everything else is static.
Wrap all of it in `@media (prefers-reduced-motion: no-preference)`.

### RTL

Use logical properties throughout (`margin-inline`, `padding-inline-start`, `inset-inline-end`,
`border-start-*`). Set `dir` on `<html>` from the locale. Keep LTR islands for flight
codes, times and currency: `<span dir="ltr">`. Mirror chevrons/arrows with
`[dir=rtl] .icon-chevron { transform: scaleX(-1) }`. Never position with `left/right`.

---

## 2. Recommendations, in build order

### P0 — structural

1. **Destination imagery as the app's spine.**
   Add `photoUrl` (+ optional `photoCredit`, `photoFocalPoint`) to the trip model. One
   photo per trip, reused at three crops: home hero 390×400, trip card 190px tall,
   day header 390×158. Source order: user upload → a curated `DESTINATION_PHOTOS`
   map keyed by normalised destination name → a warm neutral fill with the place name
   set large. Store user uploads as blobs with the trip; cache remote ones in a Cache API
   bucket so the app still looks right offline. Always render the scrim so white text
   stays legible on any photo, and `saturate(.9)` so nothing clashes with the coral.

2. **Retire the five "step" cards on Trips.**
   They are navigation dressed as content and cost ~3 screens of scroll. Replace with:
   photo hero for the next trip → one dark "Open itinerary" CTA + two 48px icon buttons
   (map, budget) → an "Up next" card showing the next chronological event → the trips list.
   Discovery lives in the tab bar.

3. **"Today" as the default screen while travelling.**
   If now is within a trip's date range, open the itinerary on today's day with the next
   event pinned. Before the trip: countdown on the hero ("in 46 days"). After: the trip
   moves to a "Past trips" group. This is the single highest-value change — the app is
   used most while standing in an airport.

4. **Every action reachable by touch.**
   Every `:hover`-revealed edit/move/delete becomes a persistent `⋯` opening an action
   sheet. Audit for `@media (hover: hover)` and make touch the baseline. Delete confirms
   with an inline undo toast (5s), not a modal.

5. **Forms become bottom sheets.**
   Type as an 8-item icon grid (not a `<select>`), day pre-filled from context, sticky CTA
   labelled with its outcome ("Add to Thursday"), rare fields (cost, confirmation, notes,
   end time) collapsed behind "+ more". Put a **Paste a Maps link** row at the top that
   fills name + address + coordinates in one action — the fastest real path.

### P1 — content and clarity

6. **Money in plain language.** Lead with one dark card: "₪12,371 still to pay", then
   "of ₪20,000 planned · ₪20,671 in the pot" and a two-segment committed/paid bar.
   Per-trip rows show the trip photo, remaining budget as words, one "Add expense" action,
   the rest in `⋯`. Move Export / Import / Restore into the app-bar overflow — admin, not daily.

7. **Documents where you need them.** Attach passes/vouchers to the reservation, and
   surface them as a card footer row ("2 passes", conf number, or "+ Attach voucher").
   Cache them for offline; the airport has no signal. Bookings groups round trips as one
   card with both legs and one price.

8. **Itinerary day view.** Sticky date strip with weekdays; route timeline with travel
   legs between stops ("↓ 1.2 km · ~14 min walk"); contextual actions on the card
   (boarding pass, add to calendar, open in Maps); a photo thumbnail only where it aids
   recognition (restaurants, attractions). Remove the desktop route bar and the duplicated
   sub-tab rows.

9. **Map is full-height** with the stops in a draggable bottom sheet (peek ≈ 240px), so map
   and list are visible together. Number the pins in day order (1, 2, 3 — not letters), show
   a route summary chip ("Walking route · 2.4 km"), and give each stop one 40px button that
   opens the phone's maps app.

10. **Family = coordination.** Checklist is per-trip ("Before Paris") with an owner per
    item, promoted above everything else. Members become a horizontal swipe row. Shared
    documents get their own section with download.

11. **Empty states that ask for one thing** — per day, per trip list, per expense list,
    per document list. Name the object, name the action.

### P2 — polish

12. **RTL + Hebrew** per the section above. The trip data is already bilingual.
13. **Motion with a purpose** per the section above.
14. **Offline-first**: service worker precaches the shell; trips, photos and documents come
    from cache; a quiet "offline — showing saved plan" bar when the network is gone.
15. **Accessibility pass**: visible focus ring (`0 0 0 3px var(--accent-tint)`), labels on
    every icon button, `aria-current` on the active tab, 4.5:1 on all text over photos
    (the scrim handles it), announce toasts via `aria-live`.

---

## 3. Screen map

| Screen | Reference | Key changes |
|---|---|---|
| Trips (home) | `2a Home` | Photo hero, one CTA + 2 icon buttons, "Up next" card, photo trip cards, step cards removed |
| Itinerary | `2a Itinerary` | Photo day header, sticky date strip, route timeline w/ travel legs, on-card actions |
| Map | `2b Map` | Full-height map, numbered pins, route summary, draggable stops sheet |
| Budget | `2a Budget` | Dark "still to pay" answer card, per-trip rows w/ photo, admin in overflow |
| Bookings | `2a Bookings` | Round trips as one card, documents as card footer, filter chips w/ counts |
| Family | `2a Family` | Per-trip checklist w/ owners, members swipe row, documents section |
| Add reservation | `2a Add sheet` | Bottom sheet, Maps-link paste, icon-grid type, collapsed rare fields |

## 4. Out of scope

Don't change the data model beyond the trip `photo*` fields and per-item checklist owners.
Don't touch the Supabase sync or share-link logic. Keep the desktop (>900px) layout working
— the sidebar stays; these changes are additive at ≤900px except where a component is shared
(buttons, cards, sheets), which should improve both.


---

## Corrections applied after review (v1.11.0)

- **`--ink-muted` was `#9a9089`**, which measures 2.79–3.12:1 against the surfaces in this same
  spec — below the 4.5:1 the spec's own accessibility section (item 15) requires for normal text.
  Corrected to `#6f6660`, the lightest value that clears it on all four. Shipping the spec as
  written would have carried the failure into v2.
- **Coral for small text is not viable.** `--accent` on white is 2.37:1 and `--accent-strong` is
  3.27:1, so no nudge reaches 4.5. Either the brand darkens, or coral is reserved for large text,
  fills, icons and non-text accents. Open v2 decision.
- **Item 7, "Documents where you need them", is struck.** Document attachments were removed
  entirely in v1.11.0 — there is no longer a feature to extend onto reservations. This also
  removed the payload size-cap machinery and a merge special case that existed only for them.
- **Item 14's offline service worker is cut**, three times recommended. Caching a stale build
  onto three family phones is the failure that already cost this project a session, and there is
  no update-prompt infrastructure. The useful half — caching trip *data* for a trip in progress —
  needs no service worker and is parked separately.
- **Item 1's destination photography is cut.** Blueprints stay; the treatments in
  `City Blueprints.dc.html` take the surfaces this spec gave to photos.
