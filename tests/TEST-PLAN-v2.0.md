# Manual test plan — v2.0.0

**Where:** `http://localhost:8723` (**not** 8722 — an earlier session's in-memory probes got
saved onto the real-data origin, and this release rewrites how every amount is read). Phone on
the LAN for anything marked 📱. Footer should read `TravelHub v2.0.0`.

**Automated first:** `?selftest=1` at **phone width**, not just desktop — 19 checks skip
themselves on a wide viewport, including the sticky-bar and FAB clearance ones. Expect
0 failed.

---

## 0. Before anything else

0.1 **Upgrade every device to v2.0 before the December trip.** A phone still on v1.15.3 that
applies a shared document strips `currency` and `settledHome` from every expense and pushes
the stripped version back — a €420 row becomes ₪420 with nothing left to say it was ever
euros, recoverable only from a backup. There is deliberately no code guard (an old client
does not run the new check); this step is the guard. ☐

0.2 Export a JSON backup from the Budget ⋯ menu before you start. ☐

---

## 1. Migration — the release stands or falls here

1.1 Import your real pre-v2.0 backup on 8723.
- **Expect:** every trip's Budget / Committed / Paid / Still to pay / Left in budget is
  **identical to the numbers you saw before**, to the shekel. No expense shows a foreign
  symbol. No "awaiting rate" note anywhere. ☐
1.2 Open a trip's category breakdown.
- **Expect:** same categories, same amounts, percentages still summing to 100. ☐
1.3 Reload twice.
- **Expect:** nothing changes on the second or third load (the migration is meant to be a
  no-op once it has run). ☐

---

## 2. Foreign currency

2.1 Edit a trip → **Spending currency** → EUR → rate `1 EUR = 4 ₪` → card fee 1%.
- **Expect:** the Budget label still says **Budget (₪)** — budgets are always shekels. ☐
- **Expect:** every existing expense on that trip is unchanged. ☐
2.2 Add an expense on that trip: `Dinner`, `38`.
- **Expect:** the currency button already says **EUR**, and under the amount: `≈ ₪153.52 est.
  (incl. 1% fee)`. ☐
- **Expect:** **Amount paid is empty**, not `0`. ☐
2.3 Save, look at the row.
- **Expect:** `€38` on the right, muted `≈ ₪153.52` under the category. ☐
2.4 Clear the trip's rate and reload.
- **Expect:** the row says **Rate needed**, it still saves and still shows `€38`, the trip
  totals show **`N awaiting rate`** beneath them, and the amount is **left out** of the
  totals rather than counted as zero. This is the important one: a EUR trip with no rate
  must never read as "nothing spent, whole budget left". ☐
2.5 Put the rate back. Add an expense in a *third* currency (say USD) with no rate.
- **Expect:** it saves, says rate needed, and only that row is excluded. ☐

## 3. Settling from the statement

3.1 Mark the EUR dinner paid, then tap **Settle**.
- **Expect:** the sheet is prefilled with the estimate and today's date. ☐
3.2 Enter the real charge (`157.40`) → Save.
- **Expect:** the row now reads `₪157.4 ✓` in green instead of the estimate, the button
  becomes **Re-settle**, and the trip total moves by exactly the difference. ☐
3.3 Tap the **Unsettled** chip.
- **Expect:** only paid, non-shekel, not-yet-settled expenses. A *planned* EUR hotel must
  **not** be listed — nothing has hit a statement yet. A shekel expense is never listed. ☐
- **Expect:** "Unpaid" and "Unsettled" are genuinely different lists. ☐
3.4 Edit the settled expense and change its amount.
- **Expect:** a toast says the settled amount was cleared, and **Undo** brings it back. ☐
3.5 Re-settle it, then Edit → **Clear** on the Settled line.
- **Expect:** cleared, with Undo. ☐

## 4. 📱 Budget on the phone, mid-trip

4.1 Open Budget while a trip is running.
- **Expect:** that trip is first (it already was), its expenses are **unfolded**, and a
  sticky **+ Add expense** bar sits above the tab bar — reachable without scrolling. ☐
4.2 Scroll the whole screen.
- **Expect:** the bar stays put and never sits under the tab bar. ☐
4.3 Between trips (year filter → a year with no live trip).
- **Expect:** the bar targets the next upcoming trip, and that trip is **not** unfolded. ☐

## 5. 📱 Timeline

5.1 Open Itinerary mid-trip.
- **Expect:** it lands on **today**, not day one. ☐
5.2 Scroll to another day, then switch to **Maps**.
- **Expect:** the map opens on **All**, not filtered to today. (Landing on today is not the
  same as you choosing a day — this regressed once during development.) ☐
5.3 Add a stop to day 4 with **Position in the day → After ⟨something⟩**.
- **Expect:** it lands in that position, and the view returns to **day 4** with the new card
  visible — not back at day one. ☐
5.4 ⋯ on a stop → **Mark visited**.
- **Expect:** the card dims and gets a tick, **the stop number stays** (it is what matches
  the row to the map pin), and the map row dims to match. ☐
5.5 Edit that stop — change only its title — and save.
- **Expect:** it is **still marked visited** and still in the same position. ☐
5.6 The add card and the + button say **Add to day**, not "Add booking". ☐

## 6. 📱 Maps

6.1 Stop rows show the address **and** the notes/confirmation, clamped. ☐
6.2 Tap the locate button (bottom-right of the map).
- **Expect:** it asks for permission only now — never on opening the screen. ☐
6.3 Allow it, outdoors.
- **Expect:** a blue dot with an accuracy circle, and "You are 0.8 km · ~9 min walk from
  ⟨next unvisited stop⟩" above the list. ☐
6.4 Tap it again to switch off.
- **Expect:** the dot **disappears**. A dot that stops updating but stays on screen is worse
  than none. ☐
6.5 Tap day chips a few times with locating on, then go to Timeline and back.
- **Expect:** still one dot, no battery warning, no duplicate. ☐
6.6 Deny permission on a fresh profile.
- **Expect:** one quiet toast, the button goes back to off, nothing else breaks. ☐

## 7. Day sheet

7.1 Day header → the sheet icon.
- **Expect:** stops in order with the **same numbers as the map pins**, times, addresses,
  notes, confirmations, walking legs between them. ☐
7.2 If the day has a confirmation number, the sheet says so at the bottom. ☐
7.3 **Save or print** → save as PDF.
- **Expect:** only the sheet prints — no app chrome, no buttons. ☐
7.4 Put the phone in flight mode and open the **saved PDF**.
- **Expect:** it opens. The *app* will not — there is no service worker, and the sheet's
  wording says exactly that. ☐

## 8. Covers

8.1 Trips screen, hero and the small trip cards.
- **Expect:** the pastel painting for the right city, text fully legible over it. ☐
8.2 Throttle to Slow 3G and reload.
- **Expect:** covers arrive without blocking the page (~95KB each, lazy). ☐
8.3 Rename a trip's destination to somewhere with no painting (e.g. "Reykjavik").
- **Expect:** the line-art blueprint and the plain gradient — the v1.15.3 look — with no
  empty box and no doubled-up gradient. ☐

## 9. Sync

9.1 Two devices, **both on v2.0**, one shared trip.
9.2 Add a EUR expense on A.
- **Expect:** B shows it with the same currency and estimate. ☐
9.3 Settle it on B.
- **Expect:** A shows the settled figure, and **What's new** mentions the change (the new
  fields were added to the diff allow-list; without that they sync silently and it reads
  like the sync dropped them). ☐
9.4 Mark a stop visited on A.
- **Expect:** B agrees. ☐

---

Footer: `TravelHub v2.0.0`. ☐
