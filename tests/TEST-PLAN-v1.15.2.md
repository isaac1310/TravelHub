# Manual test plan — v1.15.2

**Where:** `http://localhost:8722` (Mac) · `http://192.168.1.161:8722` (phone). Footer `TravelHub v1.15.2`.

One fix: **"Open in Google Maps" opens the place, not a bare pin.** A booking made from a pasted
Maps link keeps that link and opens it; any other geocoded stop opens the place by name anchored at
its coordinates.

1. Itinerary → + → paste a Google Maps link (full or short) for a real place → Save.
   Then ⋯ → **Open in Google Maps** (or Maps ↗ on the Maps tab / Bookings / Today card).
   - **Expect:** Google Maps opens **the place's card** (name, photos, hours), not "48.86, 2.33". ☐
2. Open the same booking → Edit → change only the notes → Save → Open in Google Maps.
   - **Expect:** still the place. ☐
3. Edit → retype the Location by hand and pick a Photon suggestion → Save → Open in Google Maps.
   - **Expect:** the place by name at the pin (a `/maps/place/…/@lat,lng` URL) — still a card, not a pin. ☐
4. An older booking (geocoded before this release): Open in Google Maps.
   - **Expect:** place card by name at its pin. If Google cannot match the name it falls back to
     the pin, which is what it did before. ☐
5. Regression: Maps tab pins and the Today card's Maps ↗ still open. ☐

Footer: `TravelHub v1.15.2`. ☐
