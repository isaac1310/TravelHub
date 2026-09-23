# Manual test plan — v2.5.0

**Where:** `http://localhost:8722` (phone: `http://<mac-ip>:8722`). Footer should read
`TravelHub v2.5.0`. Stacked on v2.4.0 → v2.3.0. Merge those first.

**Automated first:** `?selftest=1` on 8723 at 412px. Expect 0 failed (headless Chrome's
500px header-edge failure also happens on `main`).

**This release changes synced data.** Every item gains a `reserved` true/false. Older documents
don't have it, so every device works it out the same way: flights, hotels, and anything with a
day or a confirmation are reserved, and everything else is an idea. Because every device gets the
same answer, loading the new version produces no sync change of its own.

⚠️ **Update both phones the same evening.** A phone still on v2.4 drops the new field when it
saves. That is harmless for anything that would be inferred anyway, but a *dated* item you
switched to "idea" would flip back to reserved. Reloading the app on each phone updates it.

---

## 1. ⚠️ Your real data after upgrading

1.1 Open Bookings.
- **Expect:** each trip reads "N bookings · M ideas". Flights, hotels and anything on a day are
  under **Reserved**. Unscheduled places are under **Ideas**. Both sections start closed. ☐
1.2 Open both sections of a real trip.
- **Expect:** nothing is missing. Reserved + Ideas = everything that was listed before. ☐

## 2. The Reserved switch

2.1 Add a new place **with a day**.
- **Expect:** "Reserved" is already ticked. ☐
2.2 Add a place with no day, then type a confirmation number.
- **Expect:** it ticks itself as you type. ☐
2.3 Untick Reserved, then change the day.
- **Expect:** it stays unticked. Your choice wins. ☐
2.4 Save a dated place as unticked, then reopen it.
- **Expect:** still unticked, and it's under Ideas in Bookings. ☐

## 3. Assign to day

3.1 An idea's ⋯ → **Assign to day**.
- **Expect:** it moves to Reserved (Isaac: "a day or a confirmation"). ☐

## 4. ⚠️ Sync

4.1 In your shared room, untick Reserved on the phone, then Sync on the Mac.
- **Expect:** it moves to Ideas there too, and What's new lists "edited …". ☐

## 5. Nothing regressed

5.1 Tap a card title in either section.
- **Expect:** it opens the booking. ⋯ and Add expense still work. ☐
5.2 The filter chips (Flights / Hotels / …).
- **Expect:** they filter both sections. ☐
