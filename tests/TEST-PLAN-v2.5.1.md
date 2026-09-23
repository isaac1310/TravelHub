# Manual test plan — v2.5.1

**Where:** `http://localhost:8722` (phone: `http://<mac-ip>:8722`). Footer should read
`TravelHub v2.5.1`.

**Automated first:** `?selftest=1` on 8723 at 412px. Expect 0 failed (headless Chrome's
500px header-edge failure also happens on `main`).

Replaces v2.5.0's reservation flow (Isaac: "do all as ideas"). Four states, never guessed:

| State | When |
|---|---|
| Booked | a flight or a hotel, always |
| Reserved | you ticked **Reserved** |
| Planned | it has a date |
| Idea | everything else |

It uses a **new** field (`reservation`). v2.5.0's `reserved` is ignored, because it saved a guess
into every dated item, so everything restarts as planned or idea.

⚠️ Reload the app on both phones the same evening. A phone left on v2.5.0 drops the new tick
when it saves.

---

## 1. ⚠️ Your real data
1.1 Bookings → a real trip.
- **Expect:** "N booked · M planned · K ideas". **Booked & reserved** holds only flights and
  hotels, because nothing is ticked yet. Dated places are under **Planned**, undated ones under
  **Ideas**. All three start closed. ☐

## 2. The Reserved box
2.1 Add a place with a day and a confirmation number.
- **Expect:** the box stays **unticked**, and the place is under Planned. ☐
2.2 Tick Reserved and save.
- **Expect:** it moves to Booked & reserved. Untick it and it goes back. ☐
2.3 Choose Flight or Hotel in the form.
- **Expect:** the box disappears, because these are always booked. ☐

## 3. Assign to day
3.1 An idea's ⋯ → Assign to day.
- **Expect:** it moves to **Planned**, not Reserved. ☐

## 4. ⚠️ Sync
4.1 Tick Reserved on the phone, then Sync on the Mac.
- **Expect:** it moves there too, and What's new lists "edited …". ☐
