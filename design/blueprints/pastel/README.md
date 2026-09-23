# Pastel destination artwork — alternative 01

Open `index.html` to browse the collection and expand the original blueprint comparison beneath each destination.

This alternative contains 21 destination paintings covering 20 cities, plus 51 European country fallbacks and the legacy generic fallback. Milano has two pastel-only alternatives. Alba has a dedicated Cathedral of San Lorenzo design. The live app chooses dedicated city art first, country art second, and the legacy generic image only when neither can be identified.

## Art direction

Vintage travel illustration with soft pastel gouache, blush and apricot skies, warm ivory architecture, muted slate blue and sage accents, and subtle paper texture. Each destination has its own recognizable architecture and composition. The supplied Paris souvenir photographs were visual references only; their lettering and branding were not reused.

The images are wide, full-bleed artwork with a target aspect ratio of 2.1:1, matching the blueprint canvas. City labels stay in HTML for crisp rendering, accessibility and localization. Use `object-fit: cover` when placing the images in a fixed-ratio card. These opaque paintings are best used as card/header images rather than overlaid like transparent SVG line art.

## Files

- `<city-key>.png`: full-resolution generated painting.
- `artworks.json`: destination-to-image mapping.
- `prompts.json`: exact prompts used with the built-in image generation tool.
- `index.html`: standalone responsive review gallery with search and blueprint comparisons.
- `country-fallbacks.html`: searchable review gallery for every European country fallback.
- `country-fallbacks.json`: country names, aliases, landmarks, and image mapping.
- `country-fallback-prompts.json`: exact prompts for newly generated country art.
- `region-fallbacks.html`: review gallery for the regional fallback concept.
- `region-fallbacks.json`: regional prototype metadata and artwork mapping.
- `region-fallback-prompts.json`: exact prompt used for the regional prototype.
- `region-fallbacks/tuscany.png`: Tuscany example with the Florence Duomo, Tuscan landscape and Italian flag.
- `region-fallbacks/bavaria.png`: Bavaria example with Neuschwanstein Castle, the Alps and German flag.
- `build-gallery.py`: rebuilds the gallery and manifest from the existing blueprint catalog.

Generation used the built-in `image_gen` tool. All final artwork is stored here in the project; there are no external image dependencies.
