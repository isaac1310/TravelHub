# v1.11.2 — manual test plan

About five minutes. Three fixes, all on screens you use daily. Footer should read
`TravelHub v1.11.2` (Menu ⋯ → bottom); if it says v1.11.1 you are on a cached copy — reload with
a junk parameter, e.g. `?x=1`.

Mark each ✅ / ❌ and send me the ❌s with what you saw.

## 1. Family opens without the keyboard ⚠️

Tap **Family** from any other tab.

1. **Expect:** the page just opens. No keyboard, no cursor in the "Add an item" field.
2. Now tap into the field and add an item. **Expect:** after it is added the cursor *stays* in the
   field, ready for the next one — the focus is wanted here, only not on arrival.

## 2. Editing a checklist item

Family → Shared checklist.

1. Each row has a **pencil**. Tap it — the row becomes a text field with the current text in it.
2. Change the text, press **Enter** (or tap away). **Expect:** it saves.
3. Edit another one and press **Escape** instead. **Expect:** the original text is back, and if the
   item was ticked it is still ticked.
4. After an edit, **tick** the row and then **delete** it. Both must still work — an edit must not
   quietly give the item a new identity.

## 3. The Bookings filter ⚠️ new in this build

Bookings.

1. The chips should now be **one per type you actually have** — All, Flights, Hotels, and so on —
   each with a **count** beside it. Types you have none of get no chip.
2. Swipe the chip row sideways if it runs past the edge.
3. Tap **Hotels**. **Expect:** only hotels, and only that chip highlighted.
4. **"Other" now means the literal Other type only.** It used to mean everything that was not a
   flight or a hotel — attractions, restaurants, cafés, shops and transport all landed in it,
   which is the problem you reported. Those each have their own chip now.
5. **Tell me if nine chips feels like too many** on the phone. The alternative is grouping the
   food/shopping types back together, and that is a judgement call, not a bug.

## 4. The + button ⚠️ new in this build

It used to open the **new-trip** form on every screen except Budget and Family — including
Bookings and the Itinerary, which are lists of reservations. Your question, and you were right.

1. **Bookings → +.** Expect **Add reservation**, with a **Trip** row at the top (Paris /
   Christmas) since Bookings spans both. Pick the other trip, save something, and check it lands
   in that trip's group.
2. **Filter to Hotels first, then +.** Expect **Hotel** already selected in the Type grid.
3. **Itinerary → +.** Expect Add reservation for the trip you are viewing, dated to the day you
   are scrolled to, and **no** Trip row — the screen already tells you which trip.
4. **Trips → +.** Expect the new-trip form, unchanged.
5. The Trip row is **buttons, not a dropdown** — deliberately, given the sheet-closing history.
   Confirm tapping one does not dismiss the sheet.

## 5. Nothing else moved

Tap a booking card → its reservation opens. Add/edit a reservation. Add funds, and edit or remove
a fund addition. Itinerary scroll and the sticky header. These are unchanged from v1.11.1, so a
glance is enough.

---

## What the automation covers

198 checks — 197 pass, 1 skip, 0 fail at 412px. All seventeen new checks this release were
mutation-tested: the fix reverted, the check confirmed failing, the fix restored.

**Still not covered, from the v1.11.0 plan and still outstanding on your phone:** step 1
(Payment status) and step 2 (Category) of `TEST-PLAN-v1.11.0.md`. Those need a real Android
dropdown, which the harness cannot open.
