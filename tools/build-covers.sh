#!/bin/sh
# Rebuild assets/covers/*.jpg from the pastel source paintings.
#
# Deterministic: same inputs, same flags, same bytes out. Run it after replacing or
# re-generating any painting in design/blueprints/pastel/ (the prompts that made them
# are committed in that folder's prompts.json; the 49MB of PNGs are NOT committed).
#
# JPEG, not WebP, and that is a tooling constraint rather than a preference: neither
# `sips` nor ImageIO on this machine can ENCODE WebP (sips reports success and writes
# nothing; ImageIO returns no destination for public.webp). Chrome's canvas can, but
# that is not a command you can re-run from a clean checkout. At 840px/q0.60 a cover
# is ~95KB against ~63KB for WebP — the 30KB is worth less than a reproducible build.
#
# 840px wide: the cards render ~360-500px, so this is 2x for retina and no more.
set -eu
cd "$(dirname "$0")/.."
SRC=design/blueprints/pastel
OUT=assets/covers
[ -d "$SRC" ] || { echo "no $SRC — the source paintings are not in the repo by design; regenerate them from $SRC/prompts.json" >&2; exit 1; }
mkdir -p "$OUT"
command -v swiftc >/dev/null || { echo "swiftc required (Xcode command line tools)" >&2; exit 1; }
BIN=$(mktemp -d)/enc
swiftc -O -o "$BIN" tools/encode-cover.swift
for f in "$SRC"/*.png; do
  "$BIN" "$f" "$OUT/$(basename "$f" .png).jpg" 840 0.60
done
# The 51 European country fallbacks, same treatment. A raw painting is ~690KB against ~95KB
# built, and there are fifty of them — the difference is the whole repo several times over.
if [ -d "$SRC/country-fallbacks" ]; then
  mkdir -p "$OUT/country"
  for f in "$SRC"/country-fallbacks/*.png; do
    [ -e "$f" ] || continue
    "$BIN" "$f" "$OUT/country/$(basename "$f" .png).jpg" 840 0.60
  done
fi
# Regional paintings (v2.5.2): a region between the city and the country — Bavaria is not
# Berlin, Tuscany is not Rome. Same treatment as the country set.
if [ -d "$SRC/region-fallbacks" ]; then
  mkdir -p "$OUT/region"
  for f in "$SRC"/region-fallbacks/*.png; do
    [ -e "$f" ] || continue
    "$BIN" "$f" "$OUT/region/$(basename "$f" .png).jpg" 840 0.60
  done
fi
# Twelve countries already have a city painting good enough to stand for the whole country,
# so they reuse it rather than carrying a near-duplicate: France is the Paris canvas, Italy the
# Rome one, and so on. Copied, not re-encoded — the source is already built at 840/0.60.
for pair in austria:vienna czechia:prague france:paris germany:berlin greece:athens \
            hungary:budapest italy:rome netherlands:amsterdam portugal:lisbon \
            slovakia:bratislava spain:madrid united-kingdom:london; do
  country=${pair%%:*}; city=${pair##*:}
  [ -f "$OUT/$city.jpg" ] && cp "$OUT/$city.jpg" "$OUT/country/$country.jpg"
done
echo "covers: $(find "$OUT" -name '*.jpg' | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
