# Manual test plan — v1.15.0

**Device:** your Samsung Ultra, Chrome. **Where:** first the local server (`http://<mac-ip>:8722`
on the phone, `http://localhost:8722` on the Mac), then the Vercel preview for the PR.
**First:** ⋯ menu → footer reads `TravelHub v1.15.0`.

What changed: short Google Maps links now expand through the app's own `/api/expand`; **Delete
trip** lives in the Edit dialog; the Budget expense fold and the Bookings filter chips stop
losing their place; Bookings shows one collapsible group per trip; booking cards show notes and
offer **Add expense** (prefilled and linked); the word is *Bookings* everywhere; the Budget
overview leads with *Funds vs committed*; Shopping is a Budget category.

**Use a trip you don't mind touching, or Export first.** Steps 2 and 5 delete things (both
undoable or confirmable).

---

## The risky ones — do these first

### ⚠️ 1. Paste a short Google Maps link (needs the network; only real links prove it)

1. Google Maps → any place → **Share** → copy link (a `maps.app.goo.gl/…` link).
2. Itinerary → + → paste it into the **name** field.
   - **Expect:** "Opening that short link…", then within a few seconds the name and Location fill
     in and the note says "Location set from your paste … Just Save" (or "…the pin will be found
     on Save" if the link carried no coordinates). ☐
3. Save → Itinerary → Maps. **Expect:** the pin is on the right place. ☐
4. Airplane mode on, paste another short link. **Expect:** after ~6 s the note asks you to open
   the link and paste the full URL — no hang. ☐

### ⚠️ 2. Delete a trip from the homepage

1. Trips → **Edit** on a throwaway trip → scroll to the bottom.
   - **Expect:** a red **Delete trip…** on its own row above Cancel/Save, with a clear gap. ☐
2. Tap it → **Cancel** the confirm. **Expect:** trip still there, dialog still open. ☐
3. Tap it → **OK**. **Expect:** trip, its bookings and its expenses are gone; dialog closed. ☐
4. Trips → + (New trip). **Expect:** no Delete row. ☐

### ⚠️ 3. Add an expense from a booking

1. Itinerary → ⋯ on a hotel booking → **Add expense**.
   - **Expect:** the expense sheet opens with Description = the hotel name, Category = Hotel,
     Booking date = the check-in date, and the cursor in **Amount**. ☐
2. Type an amount, Save. Bookings → that card. **Expect:** it now shows the payment status and
   amount instead of an "Add expense" button. ☐
3. ⋯ on the same booking. **Expect:** the row now reads **Open expense** and opens that expense. ☐
4. Bookings → a card with no expense → tap **Add expense** on the card. **Expect:** same prefilled
   sheet. Cancel. ☐
5. Itinerary → ⋯ → **Delete** on the booking from step 1.
   - **Expect:** the confirm says its expense will be deleted too. OK → both gone, a toast
     "Removed … and its expense" with **Undo**. Tap Undo → both are back. ☐
6. Budget → delete that expense from the row. **Expect:** the booking stays; its card offers
   "Add expense" again. ☐

## The rest

### 4. Bookings groups and chips
1. Bookings. **Expect:** one collapsible group per trip; only the trip you are on (or the next
   upcoming) is open. Open another, tap a type chip → your open/closed choices are kept. ☐
2. Scroll the chip row to the right, tap the last chip. **Expect:** the row does not jump back;
   the chosen chip stays in view. ☐
3. Trips → the **Bookings** step chip under the hero. **Expect:** Bookings opens with only the
   featured trip's group open. Tap the Bookings tab in the bar. **Expect:** the default again. ☐
4. Add a booking to any trip → Bookings. **Expect:** that trip's group is open. ☐
5. A card with notes shows them under the details, two lines max. ☐

### 5. Budget
1. Phone: Budget → open a trip's expense fold → tap **Mark paid** on a row.
   - **Expect:** the fold stays open. Add an expense to a trip whose fold is closed → it opens. ☐
2. Overview card. **Expect:** "Funds vs committed" with "₪X to spare" or "₪X short"; the tiles
   below include "Still to pay" and no longer "Funds vs committed". ☐
3. Add expense → Category list has **Shopping**. ☐

### 6. Words
Nav tab, step chip, dialog titles, empty states, the ⋯ sheet: everything says **booking(s)**;
nothing says "reservation" except a restaurant's "Reservation time" field. ☐

### 7. Two phones (sync)
Add an expense from a booking on phone A. On B: What's-new lists the new expense, and B's Bookings
card shows the payment status. Delete the booking on B (with Undo untouched) → A shows both removed. ☐

Footer check: `TravelHub v1.15.0`. ☐
