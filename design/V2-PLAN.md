# TravelHub v2 — parked work

Things decided against for now, with the reasoning, so they are not re-argued from scratch. Kept
in the repo deliberately: this list used to live in a planning file outside git and would not have
survived the session it was written in.

Nothing here is scheduled. The full design spec is `design/handoff/TRAVELHUB-REDESIGN.md`.

---

## Wanted

### Past bookings on the Bookings screen
*Raised 6 Aug 2026, when finished trips were removed from the "which trip" picker.*

Finished trips no longer appear when you add a reservation — you do not book a holiday you have
already taken. But the need underneath was real: **seeing what you booked on a trip that is over.**
Confirmation numbers, what a hotel cost, where you ate.

The Bookings screen already groups by trip and orders upcoming-first, so past trips simply stop
appearing once they have no future dates in view. Options, roughly in order of preference:

- A **"Past trips" section** at the bottom of Bookings, collapsed by default.
- A **`past` chip** in the existing type-filter row, which would mix two axes (type and time) into
  one control — cheap, but muddled.
- Fold it into the broader **trip lifecycle / archive** item below, which is where it belongs if
  that gets built.

Decide the surface before building; the data is all there already.

### Import from Google Maps
*Isaac's ask, v1.11.1. Replaces "Explore attractions", which only reopened the timeline.*

Paste a Google Maps link — or a whole saved list — and have the fields fill themselves: name,
address, coordinates, ideally the type.

The highest-value item on this list for how the app is actually used: the family finds places in
Google Maps and then retypes them here.

- **A single place is tractable.** A long `google.com/maps/place/...` URL carries lat/lng directly,
  so this needs no API key, no backend, and no geocoding. Short `maps.app.goo.gl` links redirect
  and a browser cannot follow them cross-origin — that would need a small serverless function.
- **A whole list is the hard part.** Google offers no public API for saved lists. Realistic options
  are a Takeout export the user uploads, or scraping a shared list URL server-side, which is
  brittle and against their terms. Scope it honestly rather than promising it.
- **Do not guess the type.** Mapping a Google category onto the app's eight types is guesswork;
  fill name/address/coords and let the user pick.

**Recommendation: build the single-place paste first**, long-URL form, no backend. Most of the
value, no new infrastructure.

### Today mode
Highest-value single change on the design spec. What is happening now, next, and where.

### Offline trip pack — data only
Itinerary and confirmations cached for a trip in progress. **No service worker**, no app-shell
caching (see Rejected).

### Undo instead of `confirm()`
Fixes the product and the testability at once: the harness cannot drive `confirm()`, so every
delete path is currently untestable end-to-end. The 5s undo has to survive a sync.

### Trip lifecycle / archive
v1.11.0 built most of it — `sortTripsByUpcoming()` and `tripTiming()`'s
`upcoming | travelling | past | undated`. Left: archiving finished trips out of the main list, and
the visual treatment. This is the natural home for past bookings above.

### Multi-currency
Store the original currency and rate, keep the ₪ family total.

### Sharing controls
Read-only vs editor, link rotation, an explicit "stop sharing".

### Module split + CI
Agreed in principle, and keep the no-build deployment. Highest-risk mechanical change available
with no user-visible value, so it follows the decisions above rather than preceding them.

---

## Rejected, with reasons

- **Offline service worker / app shell.** Recommended three times, cut three times. Caching a stale
  build onto three family phones is the failure that already cost this project a session, and there
  is no update-prompt infrastructure. The useful half is the data-only trip pack above.
- **Destination photography.** Blueprints stay. No `photoUrl`, no uploads, no Cache API.
- **Documents / attachments.** Removed entirely in v1.11.0. Not coming back.
- **Splash timing.** Stays at 1700ms. Settled.

---

## Still needs a decision

1. **Token renaming** (`--surface`/`--ink`/`--line` vs `--brand`/`--cream-2`/`--muted`) — the
   largest mechanical risk in v2, no user-visible gain by itself.
2. **Fraunces from Google Fonts** — two preconnects and a webfont on the critical path, against an
   app that currently makes zero external font requests.
3. **390px baseline** in the spec vs the real device (412px).
4. **Coral for small text** — `--brand` on white is 2.37:1 and unfixable by nudging. Either darken
   the brand or forbid coral on small text.
5. The **undo-vs-remote-change** hole in the sync contract.
6. Whether "keep every feature" can coexist with a subtractive redesign — and that **Moran and Goni
   have never seen the mockups.**

---

## Settled, no action

- Nine type chips on Bookings is fine on the phone (confirmed 6 Aug 2026).
- The primary button is already near-black (`#2c2a28`); the spec's recommendation is done.
