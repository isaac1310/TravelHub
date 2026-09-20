# Manual test plan — v2.1.0

**Where:** `http://localhost:8722` with your real data. Phone on the LAN for anything marked 📱.
Footer should read `TravelHub v2.1.0`.

**localhost is a sandbox — never share or join a room from it.**

**Automated first:** `?selftest=1` on **8723** at desktop *and* at **phone width** (412px). Expect
**0 failed** at both. Run it on 8723, not 8722: the suite writes probe data and on 8722 that lands
in the same localStorage key as your real trips.

**This release changes what a fresh device shows and adds a destructive action.** §1 and §3 are the
ones that matter; the rest is smaller.

---

## 0. Before anything else

0.1 **Export a backup from the phone and from the Mac**, before installing anything. §3 wipes a
device on purpose and §1 changes first-run behaviour; both are reversible, but only if a file
exists. ☐

0.2 Note which room each device is in *today*: ⋯ → the badge at the top of the menu. Write both
six-character codes down. If they already differ, that is the drift this release exists to make
visible — say so before going further. ☐

---

## 1. A fresh device is empty — the brother scenario

The whole point: your brother installs this and sees **nothing of yours**.

1.1 Open a **private window** on localhost:8723 (a clean profile — do NOT clear 8722).
- **Expect:** Trips shows *"No trips yet"*. No Paris, no Christmas, no ₪20,671, no ₪2,716 funds
  line, no *Itzik / Moran / Goni* anywhere on any screen. ☐
- **Expect:** the sidebar reads **You · Family organiser** with a plain initial, not a name. ☐
- **Expect:** the banner button says **Create a room**, not "Share my trips". ☐
1.2 Walk every tab in that private window — Trips, Itinerary, Budget, Bookings, Family.
- **Expect:** each shows its own empty state. Nothing throws (open the console and check it is
  clean). ☐
1.3 In the private window: create a trip, then ⋯ → **Create a room** → accept.
- **Expect:** a room is created and the link copies. This is the flow your brother follows. ☐
- **Expect:** the room code in his window is **different** from both of yours. ☐
1.4 Back on your real 8722 profile, reload.
- **Expect:** every trip, expense, booking and the fund pot are exactly as before. The seed data
  is gone from the code, but your data lives in localStorage and must be untouched. ☐
- ⚠️ **Expect:** the funds total has NOT changed. The ₪2,716 one-time addition no longer
  re-injects itself; it is already in your `fundHistory`, so the number must be identical to
  before the upgrade. If it moved, stop and report it. ☐

---

## 2. Leaving a room, and seeing which one you are in

2.1 On the Mac (wide window), look at the app bar while shared.
- **Expect:** a pill reading **Shared · <6 chars>** next to the sync controls, and a new
  **exit-arrow** button beside Sync / Copy link. ☐
- **Expect:** hovering the pill shows `… · last synced <age>`. ☐
2.2 📱 **Phone — this is the device that drifted, so it matters most.** Look at the app bar
without opening anything.
- **Expect:** the sync chip shows the **room code** beside the tick (`a3f9c1 ✓`). Compare it with
  the Mac's pill at a glance — that is the whole point. ☐
- **Expect:** it fits on one line at your phone's width with the ⋯ and + buttons, no squashing
  and no horizontal scroll. ☐
2.2b 📱 ⋯ menu on the phone.
- **Expect:** the badge shows the same code, and underneath it a line in words: *Last synced 3m
  ago* — not hidden in a tooltip, since a phone cannot hover. ☐
- **Expect:** **Leave shared trip**, **Start fresh on this device**, **Import places from Maps**
  and **Restore** are all present here. Every new action in this release must be reachable from
  the phone. ☐
2.3 Narrow the Mac window below 900px.
- **Expect:** the pill and the exit button disappear (the ⋯ sheet owns leaving on phones); the ⋯
  button is present at **both** widths now. ☐
2.4 Click the exit button (wide window).
- **Expect:** a confirm naming the room and saying *"Your trips stay on this device."* Cancel it.
  Nothing changes. ☐
2.5 Now really leave (or do this in the private window from §1 so your real room is untouched).
- **Expect:** status reads *"Not shared — this device only"*, the pill and the exit button go,
  and **every trip is still there**. ☐
- **Expect:** rejoining with the link works and the pill comes back. ☐
2.6 Staleness (do this **on the phone** too — Chrome on Android → ⋮ → the address bar works, or
just let it sit): in the console run
  `localStorage.setItem('travelhub-last-sync', String(Date.now() - 9*24*3600*1000))` then
  `VacationShare.refreshChrome()`.
- **Expect:** the Mac pill turns **amber**, tooltip says `9d ago`. ☐
- 📱 **Expect:** the phone's chip turns **amber** too, and the ⋯ menu spells out *⚠️ Last synced
  9d ago — open the app on your other device, or tap Sync now.* ☐
- **Expect:** tapping the chip (Sync now) clears the amber immediately on both. ☐

---

## 3. Start fresh on this device ⚠️

Do this in the **private window**, not on your real profile.

3.1 ⋯ → **Start fresh on this device** (red row).
- **Expect:** an in-app dialog (not the browser's) titled *Start fresh*. Cancel → nothing
  happens, all data still there. ☐
3.2 Do it for real.
- **Expect:** the device empties, a toast says a backup was kept, and if it was in a room it has
  left it. ☐
3.3 ⋯ → **Restore data from before the reset**.
- **Expect:** that exact label (not "Restore my old data"), and restoring brings everything
  back. ☐
- **Expect:** after restoring you are **not** back in the old room — the restored copy predates
  it, so it must not silently reconnect and merge. ☐
3.4 Quota case: in the console run
  `Storage.prototype.setItem = () => { throw new Error('quota') }`, then ⋯ → Start fresh → confirm.
- **Expect:** an error toast, and **nothing is deleted** — trips still on screen, still in the
  room. Reload the page afterwards to undo the stub. ☐

---

## 4. One date per expense

4.1 Budget → add an expense to a trip whose dates are **not** today.
- **Expect:** one date field labelled **Date**, prefilled with **today**. There is no "Paid
  date" field any more. ☐
4.2 Set it to Paid and save; reopen it.
- **Expect:** the amount paid is right, and the date is the one you chose. ☐
4.3 Open an **existing** paid expense from the December trip, change only its label, save.
- ⚠️ **Expect:** its Date is unchanged. The old bookkeeping date behind the scenes must not be
  written into it. ☐
4.4 Budget day chips.
- **Expect:** they still group by that date, and the counts are unchanged from before the
  upgrade. ☐
- **Expect:** the Unpaid / Paid / Unsettled chips work as before. ☐

---

## 5. Bulk import places from Google Maps

5.1 Itinerary → the **Import places from Google Maps** row at the bottom of the timeline (or ⋯ →
Import places from Maps).
- **Expect:** the dialog opens on the trip you were looking at. ☐
5.2 Paste **five** share links, one per line — include one `maps.app.goo.gl` short link.
- **Expect:** a row per line; the short one briefly says *Opening short link…* then resolves to a
  name, most rows show **✓ Pin found**. ☐
5.3 Paste a **saved-list** link (the one for a whole list).
- **Expect:** that row explains it is a list link and what to do instead — not a silent failure
  and not a bogus place. ☐
5.4 Give two rows a day, leave two blank, remove one with ✕, then Import.
- **Expect:** the dated ones land on their days; a toast says how many have no day yet. ☐
5.5 The **Unscheduled** section at the top of the timeline.
- **Expect:** it lists the undated places with a count. ☐
- **Expect:** opening one and setting a Day moves it onto that day, at the end of it. ☐
5.6 Maps tab with **All** selected.
- **Expect:** undated places appear as **grey** pins under an *Unscheduled* heading; picking a
  single day hides them. ☐
5.7 AI route: tap **Copy prompt for AI**, paste it plus your list into ChatGPT/Claude, paste the
JSON array back into the links box.
- **Expect:** a row per place, names intact (Hebrew too), notes carried, any day it returned
  already filled in. ☐
5.8 Airplane mode (or devtools offline) with a short link.
- **Expect:** that row shows an error and the dialog stays usable — it must not hang. ☐

---

## 6. Regression sweep

6.1 Add a booking the normal way with a day, and one **without** a day.
- **Expect:** both save. The undated one goes to Unscheduled. (Before this release a day was
  required.) ☐
6.2 Reorder two items in a day with ↑/↓, reload.
- **Expect:** the order holds. ☐
6.3 📱 Phone, whole app: Today card, day sheet, checklist, Bookings groups.
- **Expect:** unchanged. ☐
6.4 Sync between your two devices once (edit on one, Sync on the other).
- **Expect:** the change arrives, and the room pill still matches on both. ☐
