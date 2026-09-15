# Manual test plan — v1.15.3

**Where:** `http://localhost:8722` (Mac) · phone on the LAN. Footer `TravelHub v1.15.3`.

One fix: **pasting a Google Maps share link actually fills the place**, including the messy
pastes the Maps app puts on the clipboard.

1. Google Maps → a real place → **Share** → copy link. Paste into a new booking's **name**
   field (the one the sheet opens on).
   - **Expect:** “Opening that short link…” then the place name and a pin, not the raw URL. ☐
2. Paste the same share again, but as Maps actually copies it — place name on one line,
   `maps.app.goo.gl` link on the next (or paste from WhatsApp / Messages if that is how
   you usually send it).
   - **Expect:** same result as (1). Not “No matches” / Photon searching the URL. ☐
3. Open the place in a browser, copy the long `google.com/maps/place/…` address-bar URL,
   paste into **name**.
   - **Expect:** name + pin fill in. ☐
4. Save → ⋯ → **Open in Google Maps**.
   - **Expect:** the place card, not a bare pin. ☐

Footer: `TravelHub v1.15.3`. ☐
