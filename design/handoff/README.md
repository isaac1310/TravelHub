# Design handoff

Source material from Claude Design, kept in the repo so the spec is versioned alongside the
code it describes.

| File | What it is |
|---|---|
| `TRAVELHUB-REDESIGN.md` | The full "warm editorial" UI/UX spec — design system, 15 numbered recommendations, screen map. This is the **v2.0.0** brief, not shipped. |
| `City Blueprints.dc.html` | The blueprint artwork, v2: 19 cities, each a landmark plus its city context, with six ideas for where the artwork could live. |

## What has actually shipped from these

Only the blueprint artwork, in **v1.10.3** — the 19 two-layer paths now back `MONUMENTS` in
`index.html`, drawn on the Trips hero and the trip cards. Everything else here is parked.

`design/export-blueprints.js` parses those paths back out of `index.html` into
`design/blueprints/`, so the exported SVGs cannot drift from what the app draws. Regenerate with:

    node design/export-blueprints.js

## Decisions already taken against this spec

- **Blueprints stay; destination photography is cut.** That removes recommendation 1 outright —
  no `photoUrl` on the trip model, no uploads, no Cache API bucket, nothing added to the synced
  payload. Blueprint treatments take the surfaces the spec gave to photos.
- **Recommendation 7 (documents on reservations)** — recommended cut; it reverses the earlier
  consolidation onto Family and changes the data model.
- **Recommendation 14 (offline service worker)** — recommended cut; it would cache stale builds
  onto family phones.
- The five remaining blueprint placements (dark surfaces, draw-on animation, passport stamp,
  map-pin glyph, day-header parallax) are scoped in the v2 plan. The map-pin glyph is the one to
  avoid: pins are per-stop and carry the shared stop number, while blueprints are per-city, so
  every stop in one city would get an identical glyph and lose the number that links a pin to its
  timeline card.

## Rendering `City Blueprints.dc.html`

It needs the `support.js` runtime that shipped in the original
`Mobile UXUI improvements3.zip`; that file is not vendored here. Either drop `support.js` next to
it, or read the path data from `design/blueprints/blueprints.json`, which carries the same 19
cities in plain JSON.
