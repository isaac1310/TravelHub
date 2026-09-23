# Manual test plan — v2.4.0

**Where:** `http://localhost:8722` (phone: `http://<mac-ip>:8722`). Footer should read
`TravelHub v2.4.0`. Stacked on v2.3.0 — merge that PR first.

**Automated first:** `?selftest=1` on 8723 at 412px. Expect 0 failed (headless Chrome's
500px header-edge failure also happens on `main`).

Travel execution and the planning loop, from the 23 Sept UX sweep. The only data this release
writes is an item's **date and position** (Assign to day), the same fields editing an item
already writes. No new fields, and sync is untouched.

⚠️ = can only be proven on your phone.

---

## 1. ⚠️ Directions

1.1 📱 On a travelling trip's **Today** card, tap **Directions** on the Now/Next row.
- **Expect:** a sheet with Walking / Transit / Driving. Pick one: Google Maps opens **in
  directions mode**, from where you are, to the right place (not another branch). ☐
1.2 Come back to TravelHub and tap Directions again.
- **Expect:** the mode you used last is at the top. ☐
1.3 Route → a stop in the list → the new **Directions** icon (the ↱ diamond, beside the ↗).
- **Expect:** the same sheet. The ↗ still opens the place card. ☐
1.4 An item's ⋯ sheet.
- **Expect:** "Place details in Google Maps" and "Directions". Flights have no Directions. ☐

## 2. Assign to day

2.1 An unscheduled place → its ⋯ sheet → **Assign to day** → pick a day.
- **Expect:** it lands at the **end** of that day and leaves Unscheduled, with a toast saying
  where it went. ☐
2.2 A place that already has a day.
- **Expect:** no Assign to day in its sheet (Edit still changes the day). ☐
2.3 ⚠️ In a shared room, assign a place on the phone, then look on the Mac.
- **Expect:** it syncs like any edit. ☐

## 3. Adding places

3.1 Unscheduled → **Add places from Google Maps**.
- **Expect:** "Paste place links" first. The AI prompt and the saved-list note sit under **More
  import options**, closed. The button reads "Add N places". ☐
3.2 Share a place from the Maps app and paste it in.
- **Expect:** name and pin, as before. ☐

## 4. Names and pins

4.1 The Itinerary views.
- **Expect:** **Day by Day** / **Route**, the same words as the home cards. ☐
4.2 Route → **All**.
- **Expect:** pins read "Thu · 2". Pick one day and they are bare numbers again. The list keeps
  numbers under each day heading. ☐

## 5. Nothing regressed

5.1 📱 Today card, the ⋯ sheet, map stop rows (one icon more), the import sheet.
- **Expect:** nothing squashed or cut off at phone width. ☐
5.2 Every tab. Your trips unchanged.
