# TravelHub — review, blind spots, and open questions

Written against v1.6.0; the status table below was added at v1.14.0. Everything in "Fixed"
is verified in a browser; everything in "Open" was deliberately *not* done at the time, with
a recommendation. The sections after the table are left as written — they are the record of
what the app looked like then.

---

## 0. Status as of v1.14.0

| Item (from §3 / §4 below) | Where it stands |
|---|---|
| Documents base64 in `localStorage` and every sync payload | **Removed in v1.11.0.** Attachments are gone; the 8 MB payload cap remains as a guard, not a wall |
| No offline support | **Open.** Sync degrades cleanly and the itinerary is readable from `localStorage` while the tab is alive, but there is no service worker. Still the biggest product gap for use *while travelling* |
| Conflict handling best-effort | **Open by decision** (Sept 2026 review): three-way merge (v1.11.0) plus the fetch-first check covers a family that does not edit simultaneously. The compare-and-swap save was considered and pushed back — it touches the only data path for a case that does not occur |
| No way to revoke a share link | **Open.** `leaveRoom` exists; no `rotate_secret`. Family-only audience, so not scheduled |
| Project-wide room-creation rate limit | **Open**, accepted for a family-only tool |
| No tests | **Done.** In-browser self-test suite (`?selftest=1`, 257 checks at v1.14.0, groups per release), every new check mutation-tested; a per-release manual test plan under `tests/` for the phone |
| RTL/Hebrew untested | **Partly.** Inputs are `dir="auto"` and the suite covers RTL text handling; the full interface is still LTR-first |
| Q1 — phone dies mid-trip | Shared rooms are the backup; local-only devices have Export. No automatic backup |
| Q2 — what happens when a trip ends | **Answered in v1.14.0:** finished trips fold under *Past trips*, a trip can be marked *cancelled*, Budget deliberately keeps every trip for the year filter and the year-end roll |
| Q3 — who is this for | **Answered:** the family. Auth, roles and a record-level data model are out of scope by decision |
| Q4 — is 8 MB real | Moot since attachments left the payload |

---

## 1. Why the map didn't work — two separate bugs

**On mobile, the map never rendered at all.** The desktop rule sets
`align-items: start` on `.map-layout`. The mobile rule switches the same element
to `flex-direction: column` but doesn't reset alignment, and in a column flex
container `align-items: start` sizes children to their *content* width on the
cross axis. The map div is empty, so it was 0px wide. This has been broken since
the v1.5.0 mobile redesign.

**On any device, a first render of the maps tab could show "Map unavailable"
forever.** The app's inline `<script>` runs during parse, before the `defer`red
Leaflet bundle, so `typeof L === "undefined"` and the fallback card rendered
permanently — nothing re-checked. Default tab is Timeline, which is why it looked
intermittent rather than always broken.

A third, subtler one: `fitBounds` ran while the canvas was still 0×0, so even when
the map appeared it was zoomed to a single street.

---

## 2. Fixed in v1.6.0

| Severity | Issue | Fix |
|---|---|---|
| **Critical** | Cloud sync entirely dead — `share.js` had been overwritten by a stale copy from `archive/`, so `notifyLocalChange`/`syncNow` hit `undefined` behind optional chaining, silently | Restored from HEAD after verifying the adapter contract |
| **Critical** | Map invisible on mobile (0px wide) | `align-items: stretch` in the mobile rule |
| **High** | "Map unavailable" dead end on load race | Boot on `DOMContentLoaded` + Retry button |
| **High** | `escapeHtml` didn't escape quotes, so every `attr="${escapeHtml(x)}"` was breakable by a shared payload containing `"` | Escape `"` and `'` too |
| **High** | `saveState()` had no `try/catch` — a full quota threw mid-edit and lost the change with no message | Warn once per session, keep going |
| **Medium** | Last-write-wins could silently discard a family member's newer save | Compare `updated_at` before pushing; prompt to Sync first |
| **Medium** | Unescaped `travelers.join()` rendered raw into HTML | Escaped |
| **Medium** | Ids, traveler names, `trip.year` unvalidated from shared payloads | Sanitized at the normalization boundary |
| **Medium** | Room secret sat in the address bar, leaking via `Referer` | Stripped after join (already persisted locally) + `no-referrer` |
| **Medium** | Deploy shipped `archive/`, a 1.5 MB GIF, a 1.6 MB zip, and a CSV of real vacation data | `.vercelignore` |
| **Low** | No SRI on the Supabase CDN script; floating `@2` version | Pinned to 2.111.0 with an integrity hash |
| **Low** | `trip.year` never coerced, so `getYears()`' `=== Number` comparison silently never matched a string year | `Number()` at normalization |

Also added: app icon + web manifest (installable to a phone home screen), and a
boot splash with the paper plane flying across.

---

## 3. Open — deliberately not done

**Documents are base64 in `localStorage` and in every sync payload.** A single
boarding-pass PDF can be a couple of MB, the whole state re-uploads on every
debounced save, and the server caps the payload at 8 MB. This is the app's main
scaling wall. *Recommendation:* move documents to Supabase Storage and sync only
their URLs. It's the highest-value remaining change.

**No offline support.** No service worker, no cached tiles. On a plane or on
foreign data, the map, geocoding, and sync all fail. For a travel app used
*while travelling*, this is the biggest product gap. *Recommendation:* a service
worker caching the app shell would make the itinerary readable offline; cached
map tiles are a bigger job.

**Conflict handling is still best-effort.** The `updated_at` check narrows the
window a lot but two devices can still pass it simultaneously. Genuinely fixing
it means either a compare-and-swap in `save_shared_budget` (small schema change)
or per-item rows (large rewrite). For a family of three, the current guard is
probably enough.

**No way to revoke a share link.** If a link leaks, the only remedy is creating a
new room and re-sharing. A `rotate_secret` RPC would be ~10 lines.

**The 20-rooms-per-hour rate limit is project-wide, not per-user.** It protects
against abuse but doubles as a self-DoS: one abuser locks out the whole family
for an hour.

**No tests, at all.** For a 4,000-line single file holding real trip data, even a
handful of tests around `normalizeState`, the budget math, and the sync
conflict logic would pay for themselves.

**RTL/Hebrew is untested.** Your source data is Hebrew but the UI is LTR-only.

---

## 4. Questions worth answering before the next round

1. **If a phone dies mid-trip, what's the recovery story?** `localStorage` is the
   only local copy, and it's the same store that silently filled up.
2. **What happens when a trip ends?** Nothing archives; the trip list grows
   forever and every sync carries all of it.
3. **Who is this for beyond your family?** The answer changes whether room
   secrets, rate limits, and last-write-wins are acceptable or blocking.
4. **Is the 8 MB cap a real budget or a guess?** It's the constraint that decides
   whether documents can stay inline.
