# Manual test plan — v1.13.0

**Device:** your Samsung Ultra, Chrome. **Where:** the Vercel preview for this PR, not production.
**First:** open the ⋯ menu and check the footer reads `TravelHub v1.13.0` — otherwise you are on a
cached page and nothing below means anything.

This release adopts seven items from the September UX review. Nothing in the sync or budget
maths changed; the data model gained no fields. What changed is how five dialogs and two rows
behave under your thumb — which is exactly the class of thing the desktop harness cannot see.

**Use a trip you don't mind touching, or Export first** (Budget → Data & year-end → Export).
Steps 4 and 5 delete and rename real things (and put them back).

---

## The risky ones — do these first

### ⚠️ 1. Android Back on a half-filled sheet (new behaviour)

Escape and the Back gesture used to throw typed input away silently. Now a dirty sheet stays
open on the first Back; a second Back closes it (browser rule — one blocked dismissal, then
it wins). The harness can dispatch the event but cannot perform the real gesture.

1. Trips → **+** → type a Trip name.
2. Swipe **Back** once.
   - **Expect:** the sheet stays open, your text still there. ☐
3. Swipe **Back** again.
   - **Expect:** the sheet closes; you are still on Trips, not out of the app. ☐
4. Reopen **+**, type nothing, swipe Back once.
   - **Expect:** closes on the first swipe (nothing to protect). ☐

### ⚠️ 2. "Who are you?" can be dismissed and Share still works

This dialog had no Cancel, and Escape left the Share flow hanging forever. Only reachable on a
device with no name stored, so:

1. ⋯ menu → Account → note your current name. Then clear it: Chrome → ⋮ → Settings → Site
   settings → the preview site → Clear & reset. (Or use a private tab.)
2. Reload, tap **Share my trips** (on a throwaway copy — it creates a room) or Join a link.
3. When *Who are you?* appears, tap **Not now**.
   - **Expect:** it closes, the Share/Join flow continues (status pill shows Saving… / loaded), no hang. ☐
4. Make any edit → ⋯ → Account.
   - **Expect:** "no name set yet" — Not now did not save a name, so it will ask again next time. ☐
5. Trigger it again and pick your name with **That's me**. **Expect:** stored as before. ☐

### ⚠️ 3. Year follows the start date

1. Trips → **+** → set Start date to a date in **2027**.
   - **Expect:** Year fills with 2027, goes grey/read-only, "Taken from the start date" under it. ☐
2. Clear the start date. **Expect:** Year is editable again. ☐
3. Save a trip dated 2027 → Budget → year filter.
   - **Expect:** it is under 2027, not this year. ☐  (Delete it afterwards.)

## The rest

### 4. Checklist delete → Undo

1. Family → add an item "probe" → tap its 🗑.
   - **Expect:** it disappears; a toast "Removed “probe”" with an **Undo** button. ☐
2. Tap **Undo**. **Expect:** it is back in the same position. ☐
3. Delete it again and let the toast time out (8 s). **Expect:** gone for good. ☐

### 5. Member rename is inline (no system prompt)

1. Family → ✎ on a member.
   - **Expect:** the name turns into a text box inside the pill, keyboard up, text selected — no grey Android prompt. ☐
2. Type a change, tap Done/Enter. **Expect:** renamed on every trip card. ☐
3. ✎ again, change it back, tap **elsewhere** (blur). **Expect:** commits too. ☐
4. ✎ once more, type junk, press Back to close the keyboard — the input loses focus. **Expect:** junk is saved (blur commits, like the checklist). If that feels wrong on a phone, tell me. ☐

### 6. Reservation type picker

1. Itinerary → Edit an existing **Hotel**.
   - **Expect:** Hotel is highlighted **and** has the focus ring, not Flight. ☐
2. With TalkBack on (optional): swipe through the type row.
   - **Expect:** "Hotel, radio button, checked", others "not checked". ☐

### 7. Trips step chips

1. Trips → the pill row (Day by Day / Route / Checklist / Reservations).
   - **Expect:** looks as before; each pill navigates on one tap; nothing double-fires. ☐
2. Desktop, if handy: the four cards look as before, "Start now" still visible, whole card is one click target. ☐

---

**Not in this release (pushed back, see PR):** the review's "Escape doesn't close New Trip" — not
reproducible, native behaviour intact; the carousel fade — already shipped in v1.12.0
(`markScrollableRows`); the ~40 P2 visual-polish items.

Footer check: `TravelHub v1.13.0`. ☐
