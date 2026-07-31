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

### B1. Create a room

In browser **A**, click **Save**. Confirm:

- you're asked who you are (once per device)
- a link is copied to your clipboard
- the room id and secret are **stripped from the address bar** — the URL must not show
  `?room=…&key=…` after saving
- the status pill settles on "Saved"

### B2. Join from browser B

Paste the copied link into browser **B**. Confirm:

- you are **prompted** before local data is replaced
- after accepting, B shows A's trips
- `localStorage.getItem("vacation-budget-backup-before-join")` in B is non-null — the
  pre-join backup exists, which is what makes the join reversible

### B3. Notify-first (the design — silent auto-apply is a bug)

Edit something in **A** (rename a trip). Within ~60 seconds, **B** should show a sync dot
and one toast naming the editor. **Nothing on B's screen may change yet.**

Then tap **Sync** in B. Now the change applies and the "what's new" list names the right
person. If B updated *before* you tapped Sync, that's a regression.

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
