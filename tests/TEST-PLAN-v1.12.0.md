# Manual test plan — v1.12.0

**Device:** Samsung S24 Ultra, Chrome. **Where:** the Vercel preview for this PR, not production.

This release is almost entirely visual: colour, labels, tap targets, and where a few
controls live. Nothing in the trip/budget/sync data model changed. So most of what you
are checking is "does it still look right and still respond to my thumb", plus three
things the automated suite genuinely cannot see on a desktop.

**Do this on a trip you don't mind touching, or Export first from Budget → Data & year-end
→ Export.** Steps 9 and 10 ask you to actually delete something.

---

## The risky ones — do these first

These are the items where the harness is blind and your phone is the only coverage.

### 1. Escape and the back gesture still close dialogs

The review that prompted this release claimed Escape was broken. I could not reproduce
it and I believe the tooling was at fault, not the app — a blank `<dialog>` I injected
into the same page also refused to close. But that means **no automated check covers
this**, so it needs your eyes.

1. Trips → tap **+** → the *New trip* sheet opens.
2. Swipe the Android **back** gesture (or press Back).
   - **Expect:** the sheet closes and you are still on Trips — *not* navigated out of the app.
3. Reopen it, type something in *Trip name*, then swipe back.
   - **Expect:** it closes. (It is fine if it discards what you typed; that is existing behaviour.)
4. If you have a keyboard paired, repeat with Escape.

**If back-gesture closes the whole app instead of the sheet, stop and tell me — that is a
release blocker.**

### 2. The compact Edit/Delete buttons hit the right thing

These are the small round buttons on checklist rows, timeline cards, family member chips
and the funds history. They still *look* 28px, but each now has an invisible 42×44 tap
area. The risk is that the two in a pair overlap and Edit now triggers Delete.

1. Family → find a checklist item with **✏️ Edit** and **🗑 Delete** side by side.
2. Tap **Edit** ten times, deliberately aiming slightly off-centre — a bit left, a bit
   right, a bit high, a bit low.
   - **Expect:** the inline editor opens every single time. **Delete must never fire.**
3. Do the same on a **family member chip** (Rename vs Remove) — same pairing, and Remove
   is the destructive one.
4. Now tap **Delete** on a throwaway checklist item and confirm it *does* still work.

**Any single instance of Edit firing Delete is a blocker.** That is the exact failure the
42px width (rather than 44) is meant to prevent, and it is the change I am least able to
verify without a real thumb.

### 3. Tapping the bottom tabs leaves no stuck highlight

1. Tap through **Trips → Itinerary → Budget → Bookings → Family**, pausing on each.
2. After each tap, look at the tab you just *left*.
   - **Expect:** no lingering pale box or coloured halo on it. Only the current tab is
     highlighted, and the highlight moves the instant you tap.
3. Also watch the page body during the switch.
   - **Expect:** it swaps almost immediately. You should *not* see the old screen sitting
     at half opacity while the tab bar has already moved on. (Was 0.25s, now 0.12s.)

---

## The colour change — does it still look like your app?

This is the part I most want your opinion on rather than a pass/fail.

### 4. The hero and trip cards

**The salmon is unchanged — same three gradient stops as v1.11.4.** What changed is the
text on top of it: it is now **charcoal instead of white**.

1. Open **Trips**.
   - The header card and the trip card covers are the **same salmon you already had**.
   - "NEXT TRIP · IN 19 DAYS", "Paris", the dates and "Itzik, Moran" are all **dark**
     rather than white.
   - The **avatar initials** (I, M, G) are dark now too, on the same pastel circles.
2. **What to look at:** the salmon is a *light* surface — white on it measured 2.06:1
   against a 4.5 requirement, which is why none of it was readable in sunlight. Dark text
   on the same salmon measures 4.97–6.94. So the colour you liked stays and the text
   stops fighting it.
3. Things that are deliberately still white: the thin plane/monument line art, the ring
   around each avatar, and the "in 19 days" badge (which sits on its own dark pill).

### 5. Coral text everywhere else

Check these read comfortably in daylight, not washed out:

- The active bottom tab label ("Trips").
- The italic "Pick your next step of the trip".
- The **Itinerary** button on a trip card.
- Budget → the day-of-week letters on the day strip.
- Budget → a trip's **"₪6,751 committed"** amber figure. This one was the worst offender
  at 2.62:1 — a number about money you could barely read.
- Bookings → the **Booked** / **Flight** category tags.

**Expect:** all noticeably darker than you remember, still warm, none of them grey.

Note this is a *different* coral from the hero's: `--brand` (the salmon) is now strictly a
**fill** colour — backgrounds, map pins, progress bars, the focus ring — and `--brand-text`
is the darker one used whenever coral lands on actual letters. If you ever see the pale
salmon on text again, that is a regression and the suite has a check for it.

---

## The moved controls

### 6. Budget toolbar

1. Open **Budget**.
   - **Expect:** the top row is now just the **Year** dropdown, a **Data & year-end**
     button, and **Add funds**. Export, Import, Roll budget and Restore are gone from it.
2. Tap **Data & year-end**.
   - **Expect:** a small menu drops open with **Roll budget, Export, Import** (and
     *Restore my old data* only if this device once joined a shared trip).
3. Tap **Export**.
   - **Expect:** the menu closes and the file downloads as before.
4. Reopen it and tap somewhere else on the page.
   - **Expect:** it closes without doing anything.
5. Tap **Roll budget** and confirm the dialog is the same one as before, then Cancel.

### 7. The "+" button names what it does

Go to each screen and **long-press** the **+** in the top bar (long-press surfaces the
tooltip) — or just tap it and see what opens.

| Screen | + should open |
|---|---|
| Trips | New trip |
| Itinerary | **the + is hidden** — use the round FAB instead |
| Budget | Add funds |
| Bookings | Add reservation |
| Family | jumps to the checklist and focuses "Add an item" |

**Expect on Itinerary:** exactly **one** plus button on screen, the floating one. If you
see two, that is the bug this was meant to fix.

### 8. The "only on this device" banner

Only appears if this device is **not** in a shared trip.

1. Open **Trips**.
   - **Expect:** a soft amber banner under the hero: *"These trips are only on this
     device."* with a **Share my trips** button and an **✕**.
2. Tap **✕**.
   - **Expect:** it disappears.
3. **Reload the page.**
   - **Expect:** it stays gone. (If it comes back, the dismissal isn't sticking.)
4. If this device *is* already in a shared trip, the banner should never have appeared at
   all — confirm that instead.

---

## Regression — the boring but important part

### 9. Money still adds up

1. Budget → **Add funds** → add a small amount with today's date → Save.
   - **Expect:** it appears in the history reading **"28 Aug 2026 — …"**, *not*
     "2026-08-28". This is the date-format fix.
2. Tap the row to edit it, change the amount, Save. Confirm the totals move correctly.
3. Tap its **🗑**.
   - **Expect:** the confirmation still quotes a **formatted** date, not ISO.
4. Confirm the deletion and check the funds total went back.

### 10. Trips, reservations and the map

1. Itinerary → open a reservation → change something → Save → confirm it persisted.
2. Itinerary → **Maps** — pins still render, day chips still filter.
3. Bookings → the filter chips still work and the list still groups.
4. Create a throwaway trip, then **delete** it.
   - **Expect:** a confirmation prompt appears first. (I verified in code that every
     destructive path still has one, but this is worth one real tap.)

### 11. Sharing still syncs

Only if you have a second device handy, and only worth it if steps 1–10 are clean:

1. Make an edit on the phone, wait ~20s, confirm it reaches the other device.
2. Confirm the Menu still shows the same `Shared · xxxxxx` badge on both.

---

## What I did not do

The review suggested a dedicated **Sharing** surface — one screen showing status, who is
connected, the link, last sync, leave/restore — instead of five controls scattered in the
⋯ menu. I did not build it. It is a genuine feature with real sync implications, not a UX
fix, and it did not belong in a release that is otherwise CSS and labels. The banner in
step 8 is the small version. Say the word if you want the full thing scoped separately.

Three review findings turned out not to be real and are documented in the commit message:
the Escape claim (step 1 is why it is still on your list), the Family "+" label, and
missing delete confirmations.
