# Supabase & storage check

The automated suite (`?selftest=1`) deliberately never touches the network — it
refuses to run at all in a shared room, because it stubs `localStorage.setItem` to
throw and a partial restore would corrupt real trip data and then sync it. So
everything backend-facing is checked here instead.

**Time:** ~8 minutes. **Run after any release that touches `share.js`, the schema, or sync.**

> **Rate limit:** `create_shared_budget` allows **20 new rooms per hour, project-wide**
> — not per user. A repeated debugging session will lock your family out of saving.
> Create **one** room per run and reuse it for re-tests.

---

## Part A — What "storage" means here

There is **no Supabase Storage bucket**. `grep` for `supabase.storage` returns zero
hits. Documents are base64 data-URLs embedded directly in the state object, which
lives in `localStorage` and is uploaded whole in the sync payload.

Three separate limits, and it's worth knowing which one you hit:

| Limit | Value | Enforced where |
|---|---|---|
| Single document | 2.5 MB | `DOC_MAX_MB`, client |
| All documents combined | 4 MB | `DOC_TOTAL_MAX_MB`, client |
| Whole sync payload | 8 MB | `pg_column_size` in `create_shared_budget`, server |
| Browser localStorage | ~5 MB typical | the browser |

Note the squeeze: browser localStorage is commonly ~5 MB, but the client allows 4 MB
of documents *plus* all trip data. You can hit the browser's wall before the app's own
limit. That's what the quota warning is for.

### A1. Quota warning (no backend needed)

In a **local-only** session (not joined to a room), paste into the console:

```js
(function () {
  const real = Storage.prototype.setItem;
  let alerts = 0; const realAlert = window.alert;
  window.alert = (m) => { alerts++; console.log("WARNED:", m); };
  Storage.prototype.setItem = function () { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; };
  try { saveState(); saveState(); }
  finally { Storage.prototype.setItem = real; window.alert = realAlert; }
  console.log(alerts === 1 ? "PASS — warned once, did not throw" : "FAIL — alerts: " + alerts);
})();
```

**Expect:** one visible warning naming the fix ("Remove some attached documents"), no
exception, and the app still usable afterwards. Reload to clear the once-per-session latch.

### A2. Document caps

Attach a file larger than 2.5 MB on the Family screen. **Expect** a clear rejection, not
a silent failure. Then attach several smaller ones until you pass 4 MB total.
**Expect** the combined cap to stop you and the usage label to reflect it.

---

## Part B — Supabase sync (needs two browsers)

Use your normal browser plus a private window, or two devices.

### B0. Before you start

Confirm you're testing the build you think you are — the footer must show the SHA you
just deployed:

```js
document.querySelector("[data-app-version]").textContent
```

This session lost hours to testing a stale deploy. Check it first, every time.

> **Share and Join are not the same action, and only one person does the first.**
>
> | Who | Action | What it does |
> |---|---|---|
> | Moran, once, ever | **Share my trips** | Creates a **new** room and gives her a link |
> | Itzik, and any other device | **Join a shared trip** | Connects to Moran's **existing** room |
>
> If Itzik also taps *Share my trips*, he creates a **second room**. Both devices then
> sync perfectly to different rooms and never see each other. That is the bug this whole
> flow exists to prevent, so keep the roles straight while testing.

### B1. Moran creates the room

On **Moran's device**: Menu (⋯) → **Share my trips** → confirm the prompt. Then check:

- she's asked who she is (once per device)
- the link is copied to her clipboard — if the clipboard is blocked, the pill says to use
  **Menu → Copy share link** instead, and the share still succeeded
- the room id and secret are **stripped from the address bar** — the URL must not show
  `?room=…&key=…` afterwards
- the Menu shows a room badge like `Shared · 3644ee`

She sends that link to Itzik however she likes — WhatsApp, email, anything.

### B2. Itzik joins with the link

Give **Itzik's device** a trip of its own first, so convergence is actually exercised —
otherwise this only proves he can receive, not that his own data survives.

On **Itzik's device**: Menu → **Join a shared trip** → paste the link → **Join**. Confirm:

- the prompt states how many of Itzik's trips will be **added for everyone**, and how many
  exist on both sides (the shared version is kept)
- after joining, Itzik sees **Moran's trips *and* his own** — nothing of his disappeared
- **both devices show the same `Shared · xxxxxx` badge.** This is the single most useful
  check in the file: matching badges mean one room, different badges mean the split.
- `localStorage.getItem("vacation-budget-backup-before-join")` on his device is non-null

Then check **Moran** picks up Itzik's trip on her own within ~20s. That round trip is the
whole point: it proves the room converged rather than one side overwriting the other.

**The two-room trap (negative test).** On a fresh third browser, tap **Share my trips**
instead of Join. The warning must tell you to use Join instead. If you proceed anyway, the
two devices must show **different** room badges — the split is now visible rather than
silent. This is the bug that made "sync doesn't work" so hard to diagnose.

### B2b. The creator-device regression (v1.6.1 — check this every release)

This is the exact shape of the bug that shipped in v1.6.0, and it is **asymmetric**:
it only affects the device that *created* the room, so testing one direction misses it.

1. On **A** (the creator), edit nothing.
2. On **B**, make a visible change and let it save.
3. Wait ~20s on **A**, with the tab visible.

**Expect:** A picks the change up on its own. **Fail:** A never notices, no matter how
long you wait or how many times you tap Sync.

The cause was A seeding its staleness baseline from its own device clock rather than the
server's, so any clock skew made every incoming change look older. To see the baseline
directly, run on **A**:

```js
window.VacationShare.getSyncInfo()
```

`lastSyncAt` in the future relative to the server, or a baseline that never advances after
B saves, is the signature. Test both directions — A→B **and** B→A.

### B3. Auto-apply, and when it should defer (v1.6.1)

Two different behaviours depending on whether the receiving device has unsaved edits.
Both must hold.

**Nothing unsaved on the receiver → it applies on its own.** With Itzik's tab open and
idle, have Moran rename a trip. Within ~20 seconds Itzik's screen updates **without him
tapping anything**, and a toast says what changed. Needing to tap Sync here is the
regression — the "tap Sync to see" nag was removed in v1.6.1.

**Unsaved edits on the receiver → it waits for him.** Have Itzik start editing something
and leave it unsaved, then have Moran save a change. Now Itzik gets the dot and a *"tap
Sync"* toast and **nothing on his screen changes**, because applying it would overwrite
what he is still typing. Tapping Sync then merges both (see B3b).

Note the poll only runs while the tab is **visible** — backgrounded tabs stop polling to
save mobile data and catch up when you return. If nothing arrives, check the tab is in the
foreground before calling it a failure.

### B3b. Concurrent edits on different data (v1.8.0 — the everyday case)

This is the one that matches how you actually use it: Moran edits the trip, Itzik edits
the budget. It does **not** require them to be simultaneous — just for one device to have
an unsent edit when the other's change arrives.

1. Both devices synced and showing the same room.
2. On **A**, open a trip and change its **name**. Don't wait.
3. On **B**, within the same minute, change **that same trip's budget**.
4. Let both settle, then check both devices.

**Expect:** the new name *and* the new budget, on both. **Fail:** one of them reverted —
that's the pre-v1.8.0 behaviour, where the Sync recovery overwrote the unsent edit.

Also worth one run: edit on A, then immediately kill the tab (swipe the app away) before
it can push, and reopen. The edit must still be there.

### B4. Conflict guard (the one that protects real work)

1. Edit in **A**, and separately edit in **B**.
2. Save in **B** first, let it complete.
3. Now save in **A**.

**Expect:** A refuses and warns *"… saved changes — tap Sync before saving"*.
**Fail:** A silently overwrites and B's edit is gone.

This narrows the window but can't close it — two devices saving in the same instant can
still both pass the check. Known and accepted.

### B5. Reconnect and bad links

- Reload **B** with a plain URL (no query string). It must reconnect to the remembered
  room rather than dropping to local-only.
- Open the share link with one character of the secret changed. **Expect** a clean
  "invalid or expired" message — no crash, no data loss, no partial join.

### B6. Clean up

Delete the throwaway row in the Supabase dashboard (Table Editor → `shared_budgets`).

---

## Part C — Schema guards (SQL editor, once per release)

RLS plus security-definer RPCs are the entire security model, so verify it's actually
in place rather than assuming.

### C1. The table must be unreachable directly

The anon key must not be able to read the table at all. In the browser console of the
deployed app:

```js
await window.supabase
  .createClient(VACATION_CONFIG.supabaseUrl, VACATION_CONFIG.supabaseAnonKey)
  .from("shared_budgets").select("*").limit(1);
```

**Expect:** an error or an empty result — never actual rows. Rows here means the
security model is off and every trip is public to anyone holding the (public) anon key.

### C2. The caps exist

In the Supabase SQL editor:

```sql
select prosrc from pg_proc where proname = 'create_shared_budget';
```

**Expect** the body to contain both:

- `pg_column_size(p_payload) > 8 * 1024 * 1024` — the payload cap
- a count against `created_at > now() - interval '1 hour'` with a limit of 20 — the
  rate limit

If either is missing, the deployed schema is the older copy and the project is open to
unbounded room creation and multi-megabyte payload spam on a free tier.

### C3. RPCs are the only granted surface

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where grantee = 'anon';
```

**Expect** exactly `create_shared_budget`, `fetch_shared_budget`, `save_shared_budget`.
Anything else granted to `anon` is worth understanding before you ship.

---

## Result

Record pass/fail per section. Any failure in **B4** or **C1** is release-blocking —
those are silent data loss and a data leak respectively, and neither announces itself.
