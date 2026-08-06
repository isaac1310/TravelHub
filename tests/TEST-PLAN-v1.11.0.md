# v1.11.0 — manual test plan

Roughly 15 minutes. **Steps 1–4 are the ones worth your attention** — they are the changes no
automated check in this project can actually judge, and two of them are bugs I got wrong twice.
Everything from 5 onward is confirmation.

Mark each ✅ / ❌ and send me the ❌s with what you saw.

## Where to test

**On the S24 — needed for steps 1–3.** The branch preview is
`https://travel-ei9r9r8dm-aviente.vercel.app`, but it is behind Vercel's SSO, so you must be
logged in to Vercel in your phone's browser first. If that is a nuisance, either:

- turn off **Deployment Protection** in the Vercel project settings (then every future preview
  opens on any device with no login — worth doing once), or
- tell me and I will merge to `main` first so you test the real
  `travel-hub-beta.vercel.app`, accepting that the fixes are live before you have signed off.

**On the desktop** — the Browser pane I opened is on the same build; fine for steps 4–12.

**Check the footer first.** Menu (⋯) → bottom should read `TravelHub v1.11.0`. If it says
v1.10.5 you are on a cached copy — reload with a junk parameter, e.g. `?x=1`, and close the
home-screen app fully if you use it.

---

## 1. Payment status — the bug I got wrong twice ⚠️

Budget → any trip → tap **"N expenses"** → **Edit** on a row.

1. Payment status should be **three buttons** — Planned / Booked / Paid — not a dropdown.
2. Tap **Paid**. Take your time; linger on it.
3. **Expect:** the sheet stays open, and *Amount paid* fills with the full amount.
4. Tap **Save**. The row shows as paid.
5. Reopen it — **Paid** should be the highlighted button.
6. Tap **Booked**. *Amount paid* should go back to 0.

There is no dropdown left on this field, so the mechanism I kept mis-guessing is gone rather
than guarded.

## 2. Category — the same mechanism, still a dropdown ⚠️

Same sheet, one field up.

1. Tap **Category** and pick a different one.
2. **Expect:** the sheet stays open and the category changes.
3. Now tap **Category** to open the list, then tap **outside the sheet** to dismiss the list.
   **Expect:** the list closes and the sheet survives. A *second* tap outside dismisses the sheet.

**This is the real test of whether my theory about this bug was ever right.** QA proved my
previous fix here could never fire. If Category still closes the sheet, tell me — it gets the
same three-button treatment.

Correction to an earlier version of this plan: I also asked you to try **Type** in Add/Edit
reservation. Skip it — that field is an icon grid, and its `<select>` is hidden. The only real
dropdowns left in the app are **Category** here and the **two year pickers in Roll budget**.

## 3. Itinerary scrolling and the sticky header ⚠️

Itinerary → switch to **Christmas** (7 days; Paris is too short to scroll far).

1. Scroll down. **Expect:** the Timeline/Maps toggle *and* the date strip both stay pinned at the
   top, fully visible — not tucked behind the app bar.
2. As you scroll, the highlighted day chip should follow the day under the header, and scroll
   itself into view along the strip. **Judge this by feel** — it is more likely to feel wrong
   than to be wrong, and that is your call, not mine.
3. Scrolled down, tap **Maps**. **Expect:** the map appears *below* the toggle, not over it, and
   the header's cream band reaches **both screen edges** — no map showing through at the sides.
   You reported this twice; it had three independent causes, and the third was that the header's
   background stopped at the 1rem gutter while the map runs full-bleed.
4. Tap **Timeline** again, then tap a day chip. **Expect:** it jumps to that day with the heading
   visible below the header, and the highlight does not flicker through the days on the way.
5. Press and hold a reservation card, drag it toward the **top** edge. **Expect:** the page
   scrolls and the card stays visible — it must not slide under the header.

## 4. Shared checklist

Family → Shared checklist.

1. The heading should say you can **tick things off**, and the field should say **"Add an item"**.
2. Add one, tick it — **expect** a strikethrough. Tapping anywhere on the row should tick it, not
   just the small box.
3. Delete it.
4. There should be **no attach/upload control and no documents anywhere** — this is the removal
   you confirmed. Bookings should have no Documents section either.

---

## 4b. Adding a second destination

Itinerary → **Edit trip**.

1. **Destinations** should now be the *second* field, directly under Trip name, labelled
   "Destinations — these build your route", with a visible **+ Add another destination** button.
2. Tap it, type `Vienna, Austria` in the new row, **Save**.
3. **Expect:** the route strip immediately reads **Home → Paris → Vienna → Home**.

This is the "Vienna is missing" report. The route strip was right — Vienna had gone into **Trip
name** (your data read `"Paris, viena"`), because that is the field the dialog opens on and
Destinations was three fields below behind a ghost button. Nothing was broken; the form pointed
you at the wrong box. Remove Vienna again afterwards if you like.

## 5. Trip cards and ordering

1. **Trips** — the soonest trip first (Paris, then Christmas), each card showing **in N days**.
2. Each card has **Edit** — tap Christmas's; it must open *Christmas*.
3. Now Itinerary → switch to **Christmas** via the tabs → back to Trips → tap **Paris's**
   Itinerary button. **Expect:** Paris opens, not Christmas. That is the bug it fixes.
4. **Budget, Bookings and Family** should all list trips in that same order.

## 6. Step cards

**Route** → the **Maps** tab. **Day by Day** → **Timeline**. Both on the trip named in the hero.
"Explore attractions" is deliberately unchanged.

## 7. Bookings

Tap a card body → that reservation's editor opens. The filter chips (All / Flights / Hotels /
Other) still filter.

## 8. The trip switcher

It should read as **underline tabs**, not a pill toggle. On desktop, arrow keys move between them.

## 9. Map with a located hotel

Itinerary → Maps. If a trip has a geocoded hotel and nothing else located, it should now show a
pin and a list row. Previously it showed nothing at all.

## 10. Contrast

Glance at Trips, Itinerary and Budget. Secondary text is slightly darker throughout. **Tell me if
anything now reads too heavy** — especially input borders when you hover, and the grey button
text. This is subjective and it is the change most likely to have gone too far.

## 11. Everything else still working

Add funds · Roll budget dialog opens · add/edit an expense · Mark paid/unpaid · day fold/unfold ·
Edit trip from the itinerary header · add/edit a reservation · the ⋯ sheet and its actions ·
"Maps ↗" opens the right place · tap a card to edit · press-and-hold to drag reorders and sticks
after a reload · a quick swipe scrolls instead of lifting · dialogs close on Cancel and on a tap
outside · a half-typed form resists a tap outside.

## 12. Known and deliberately not fixed

Do not report these; they are on the follow-up list:

- Fund additions cannot be undone or removed from the UI.
- **Escape** does not close dialogs. Worth telling me whether it does on your phone's keyboard —
  there is no handler, and these are native `<dialog>`s, so the browser should do it itself.
- Family member rows and Budget's trip-card Edit/Delete have no spoken context.
- The day chips have no `aria-current`.

---

## What the automation already covers

176 checks, 175 pass, 1 skip, 0 fail at phone width; every new check proven to fail against its
own bug. A code review caught a data-loss blocker; a QA pass caught three more.

**What it cannot cover, which is why this plan exists:** the harness cannot open a native Android
dropdown, `IntersectionObserver` never fires in it, `confirm()` is auto-dismissed so no delete
path is testable end-to-end, and smooth scrolling is a no-op. Steps 1–3 are exactly the gap.
