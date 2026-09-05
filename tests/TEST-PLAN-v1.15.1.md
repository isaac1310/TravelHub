# Manual test plan — v1.15.1

**Where:** local first — `http://localhost:8722` on the Mac, `http://192.168.1.161:8722` on the
phone — then the Vercel preview. **First:** ⋯ menu → footer reads `TravelHub v1.15.1`.

A reliability patch from the Codex review: failed saves are visible, dates are local, an import
keeps a snapshot, the short-link expander only follows Google, and the parked-work list is current.
No data-model change.

---

### 1. A failed save is visible until a save lands (Mac, Chrome)
1. DevTools → Application → Storage → tick **"Simulate custom storage quota"** and set it to a tiny
   value (e.g. 1 KB) — or in the console run
   `Storage.prototype.setItem = () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }`.
2. Mark any expense paid.
   - **Expect:** one alert about storage, and a red bar under the app bar: "Storage is full — your
     latest change wasn't saved on this device…" with **Export a copy**. ☐
3. Mark it unpaid. **Expect:** no second alert, the bar is still there. ☐
4. Tap **Export a copy**. **Expect:** the JSON download starts. ☐
5. Untick the quota simulation (or reload), mark the expense again.
   - **Expect:** the bar disappears. ☐

### 2. Dates are local, not UTC
Only testable between midnight and 03:00 Israel time; otherwise trust the check.
1. After midnight, mark an expense paid → its paid date is **today**, not yesterday. ☐
2. Add funds → the date field defaults to today. ☐

### 3. Import keeps a snapshot
1. Budget → Data & year-end → **Export** (keep the file).
2. Note one trip's name, then **Import** the file you just exported (identical data is fine).
   - **Expect:** it imports, and ⋯ menu now shows **Restore data from before the import**. ☐
3. Change something (rename a trip), then ⋯ → Restore data from before the import → OK.
   - **Expect:** the page reloads with the pre-import data (rename gone), and the Restore item is gone. ☐
4. If you are in a shared room, the item still reads "Restore my old data" and behaves as before. ☐

### 4. Short links still expand
1. Paste a real `maps.app.goo.gl` share link into a booking → name and pin fill in. ☐
   (The change only adds a rule that every redirect hop must stay on Google; a real link proves
   nothing broke.)

### 5. Regression glance
All five tabs; delete a booking with the in-app confirm and Undo it; Budget chips. ☐

Footer: `TravelHub v1.15.1`. ☐
