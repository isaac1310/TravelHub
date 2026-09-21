# Manual test plan — v2.2.0

**Where:** `http://localhost:8722` with your real data. Footer should read `TravelHub v2.2.0`.

**Automated first:** `?selftest=1` on 8723 at desktop *and* 412px. Expect 0 failed.

This release is artwork and the rule that picks it. Nothing touches trips, money or sync, so the
risk is cosmetic — a wrong or missing painting, not lost data.

---

## 1. The fallback order: city → country → generic

1.1 A trip to a city that has its own painting — **Paris, France**.
- **Expect:** the Paris canvas, exactly as before. A city must never lose its own art to a
  country one. ☐
1.2 A trip to a city with no painting, in a country that has one — **Ghent, Belgium**,
**Reykjavik, Iceland**, **Ljubljana, Slovenia**.
- **Expect:** the country painting, not the generic skyline. ☐
1.3 **Alba, Italy** — a city that now has its own.
- **Expect:** the Alba cathedral painting, not Italy's. ☐
1.4 Somewhere outside Europe with no city art — **Nairobi, Kenya**.
- **Expect:** the generic skyline. ☐
1.5 A destination written in Hebrew — **תל אביב**.
- **Expect:** the Tel Aviv painting. ☐

## 2. Both places a cover appears

2.1 The big hero on Trips, and the small card in the list below.
- **Expect:** same painting in both, no stretching, the trip name still readable over it. ☐
2.2 📱 At phone width.
- **Expect:** the card crops sensibly — no letterboxing, nothing important cut out. ☐

## 3. Nothing regressed

3.1 Your real trips.
- **Expect:** every existing trip shows the painting it showed before this release. ☐
3.2 Turn the network off and reload.
- **Expect:** where an image cannot load, the blueprint line art shows on the gradient — no
  empty box, no layout shift. ☐

## 4. Weight

4.1 `du -sh assets/covers` → **about 6.8 MB for 72 covers** (~94 KB each).
- **Expect:** no cover above ~120 KB. If one is, it skipped `tools/build-covers.sh`. ☐
