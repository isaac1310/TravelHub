# Pastel destination artwork — alternative 01

Open `index.html` to browse the collection and expand the original blueprint comparison beneath each destination.

This alternative contains 19 destination paintings plus a generic fallback. Milano is an additional pastel-only destination; the other entries are keyed to the existing `../blueprints.json` catalog. The original SVGs and live application are preserved so the new direction can be reviewed as a complete collection.

## Art direction

Vintage travel illustration with soft pastel gouache, blush and apricot skies, warm ivory architecture, muted slate blue and sage accents, and subtle paper texture. Each destination has its own recognizable architecture and composition. The supplied Paris souvenir photographs were visual references only; their lettering and branding were not reused.

The images are wide, full-bleed artwork with a target aspect ratio of 2.1:1, matching the blueprint canvas. City labels stay in HTML for crisp rendering, accessibility and localization. Use `object-fit: cover` when placing the images in a fixed-ratio card. These opaque paintings are best used as card/header images rather than overlaid like transparent SVG line art.

## Files

- `<city-key>.png`: full-resolution generated painting.
- `artworks.json`: destination-to-image mapping.
- `prompts.json`: exact prompts used with the built-in image generation tool.
- `index.html`: standalone responsive review gallery with search and blueprint comparisons.
- `build-gallery.py`: rebuilds the gallery and manifest from the existing blueprint catalog.

Generation used the built-in `image_gen` tool. All final artwork is stored here in the project; there are no external image dependencies.
