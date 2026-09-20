# Multi-room — a roadmap, not a commitment

Written during v2.1.0 (2026-09-20) so the thinking is not lost. **Nothing here is built.**

## What v2.1.0 actually solved

Isaac's brother needed his own family room that never sees Isaac's trips. That turned out not to
be a rooms problem at all: a fresh device was never empty (`SEED_DATA` was one family's real
trips), and a room is the whole device document, so "Create a room" would have uploaded Isaac's
trips as the brother's room. v2.1.0 makes a fresh device empty and adds "Start fresh on this
device", which is enough for the brother to create his own room. Isaac's devices are untouched.

## What is still not possible

**Being in two rooms from one device.** `roomId` / `roomSecret` / `sharedMode` are module
singletons in `share.js`, and `travelhub-room` holds exactly one `{room, key}`. Joining a second
room means leaving the first, and joining *merges* the local document into the room
(`mergeStates`) rather than switching to it. So today: one device, one room, and switching is
destructive.

This only matters if Isaac wants to *edit* his brother's trips from his own phone. To merely look,
opening the invite link in a private window costs nothing and needs no code.

## If it is ever wanted: phases 1–2

### Phase 1 — room-scoped local storage
Every document key becomes per-room, with a room index and an active-room pointer:

```
travelhub-room:<id>:state | :sync-base | :last-sync | :session
travelhub-local:state          (the not-shared workspace)
travelhub-active-room, travelhub-room-index
```

Touches every `localStorage` read/write in `index.html` and `share.js`, plus the self-test's
snapshot/restore of localStorage. Needs a migration for the devices that exist (one room →
one entry). **Medium-large, one release of its own.** The risk is the migration: a bug here
loses real data. v2.1.0 already routes its new keys (`travelhub-last-sync`,
`vacation-budget-backup`) so they can be scoped mechanically.

### Phase 2 — the switcher
A room list in the ⋯ / account menu with the active room always visible (v2.1.0's `#appbar-room`
badge is where it goes). Switching: flush pending changes, warn if they cannot be synced, cache
the current room, load the target's cached document, then fetch. **Joining adds a room instead of
merging into it** — the single biggest behavioural change, and the reason this cannot ride along
with unrelated work. Trips must never move between rooms. **Large.**

## Phases 3–4: deferred, deliberately

Room codes with passwords (Argon2id/bcrypt), per-device revocable session tokens, a connected-
devices list, password rotation, owner recovery keys.

**Not planned.** The invite link is already a 64-hex secret — adding a human-chosen password
introduces a *weaker* credential and somewhere to be phished, for a three-device family app. The
one scenario that would justify per-device revocation is a lost phone; if that happens, the
cheaper answer today is to create a new room and re-share the link.

If it is ever built, the session table and the `create/login/fetch/save/revoke` RPC set from the
original write-up are a sound design, and password verification belongs in a Vercel function
rather than in the browser.

## Testing it would need

Two rooms on one device; repeated switching with no data crossing; offline edits in both;
independent reconnect; join by link; a failed sync during a switch; a corrupted room index; a
failed localStorage write; migrating a single-room device; and that an export carries no tokens.
