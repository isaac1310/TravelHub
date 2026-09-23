# Manual test plan — v2.3.0

**Where:** `http://localhost:8722` with your real data (phone: `http://<mac-ip>:8722`). Footer
should read `TravelHub v2.3.0`.

**Automated first:** `?selftest=1` on 8723 at 412px. Expect 0 failed. (In headless Chrome one
header check fails at 500px on `main` too, because of the scrollbar; the in-app browser at 412px
does not have this.)

This release is the "clarity" slice of the 23 Sept UX sweep (`design/UX-UI-SWEEP-2026-09-23.md`,
§ Decisions). There is **no data-model change**: nothing new is saved, and sync is untouched. The
risks are wording, one changed default (the Budget +), and the Maps-link parser.

⚠️ = the risky ones.

---

## 1. Budget

1.1 ⚠️ On Budget, tap the app-bar **+** while a trip is on or coming up.
- **Expect:** the **expense** dialog opens for that trip, not Add funds. Cancel it. ☐
1.2 With no current or upcoming trip (or pick a year that has none), tap **+**.
- **Expect:** Add funds, as before. ☐
1.3 The header **Add funds** button.
- **Expect:** an outline button now, not the dark one. It still opens Add funds. ☐
1.3a ⚠️ **Add funds actually saves** (bug found by QA, already broken on `main`). Tap the header
**Add funds**, add ₪1, then save. On the phone, also try it from the ⋯ menu.
- **Expect:** the pot goes up by ₪1 and a row appears in "Fund additions". Before this fix, the
  header button opened an "edit" of a non-existent row and saving did nothing. Delete the ₪1 row
  afterwards. ☐
1.4 While a trip is running, fold the **Overview** panel and read its summary line.
- **Expect:** "₪N to spare" when you're covered, "₪N short" when you're over — never "−₪N to
  spare". ☐

## 2. Readable selected states

2.1 📱 Itinerary day chips, Bookings filter chips, the trip picker, the round **+** FAB.
- **Expect:** the selected chip is still coral but its label/icon is **dark**, not white. Check it
  looks right to you — this is the one visible style change. ☐

## 3. Map and day sheet

3.1 Route (map) → look at the lines between stops, then open the printable day sheet.
- **Expect:** "1.2 km straight-line" — no "~12 min walk" or "drive". ☐
3.2 ⚠️ A trip where the hotel doesn't cover every night (or a day after checkout).
- **Expect:** those days show "No stay assigned for this day" instead of the hotel as "Start of the
  day". Nights the hotel does cover still start from it. A hotel **without dates** still shows on
  every day, as before. ☐
3.3 📱 Route on **All**: tap the heading of the stops sheet.
- **Expect:** it now reads "Show all stops ▾" / "Show fewer ▴" and toggles the list. ☐

## 4. Bookings

4.1 Tap a booking card's title, then tap elsewhere on the card.
- **Expect:** both open the reservation, as before. ☐
4.2 Tap **Add expense** and **⋯** on a card.
- **Expect:** each does its own thing, and neither opens the edit dialog. ☐

## 5. ⚠️ Importing Maps links

5.1 Itinerary → import places. Paste
`https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower%2C48.8584%2C2.2945`
- **Expect:** "✓ Pin found · Eiffel Tower", not "Name only". ☐
5.2 Paste `https://www.google.com/maps/@48.8606,2.3376,15z` (coordinates only).
- **Expect:** "✓ Pin found — type a name to import it". Type a name, tap out of the field, and the
  Import button count goes up. ☐
5.3 Share a real place from the Google Maps app on your phone, as you normally would.
- **Expect:** the same result as before this release: name and pin. ☐
5.4 Remove the test imports afterwards.

## 6. Nothing regressed

6.1 Go through every tab, and open and cancel the trip and reservation dialogs.
- **Expect:** nothing looks broken, and your real trips and totals are unchanged. ☐
