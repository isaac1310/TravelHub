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
echo "covers: $(ls "$OUT" | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
