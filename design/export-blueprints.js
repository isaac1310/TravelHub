/* Export the trip-cover monuments as standalone black line-art SVGs.
   The paths are read out of index.html rather than copied, so this file can
   never drift from what the app actually draws. Run: node design/export-blueprints.js */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "blueprints");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");

/* Pull the MONUMENTS object literal, then each `key: { fg, bg }` entry inside it.
   Two layers per city since v1.10.3 — the landmark and its city context. */
const block = src.match(/const MONUMENTS = \{([\s\S]*?)\n\};/);
if (!block) throw new Error("MONUMENTS block not found in index.html");

const monuments = {};
for (const m of block[1].matchAll(/(\w+):\s*\{\s*fg:\s*`([^`]+)`,\s*bg:\s*`([^`]+)`,?\s*\}/g)) {
  const clean = (d) => d.replace(/\s+/g, " ").trim();
  monuments[m[1]] = { fg: clean(m[2]), bg: clean(m[3]) };
}
if (!Object.keys(monuments).length) throw new Error("no {fg,bg} entries parsed");

/* The landmark each city is drawn around, for the contact sheet's captions. */
const LABELS = {
  paris: ["Paris", "Eiffel Tower · Haussmann rooftops"],
  bratislava: ["Bratislava", "Castle · UFO bridge over the Danube"],
  london: ["London", "Elizabeth Tower · Parliament · Tower Bridge"],
  rome: ["Rome", "Colosseum · triumphal arch · cypress"],
  barcelona: ["Barcelona", "Sagrada Família · Gaudí roofline"],
  amsterdam: ["Amsterdam", "Canal houses · bridge · water"],
  prague: ["Prague", "Charles Bridge tower · castle spires"],
  vienna: ["Vienna", "St. Stephen's · Riesenrad"],
  athens: ["Athens", "Parthenon · Acropolis rock · olive tree"],
  newyork: ["New York", "Empire State · midtown block"],
  telaviv: ["Tel Aviv", "Azrieli towers · palm · shoreline"],
  jerusalem: ["Jerusalem", "Dome of the Rock · Old City wall"],
  budapest: ["Budapest", "Parliament dome · Chain Bridge"],
  berlin: ["Berlin", "Fernsehturm · Brandenburg Gate"],
  lisbon: ["Lisbon", "Tram 28 · hillside houses · 25 de Abril"],
  madrid: ["Madrid", "Puerta de Alcalá · Metrópolis dome"],
  tokyo: ["Tokyo", "Tokyo Tower · pagoda · Fuji"],
  bangkok: ["Bangkok", "Wat Arun prang · temple roofs · river boat"],
  generic: ["Generic skyline", "fallback for unmapped destinations"],
};

/* Black on transparent — the app tints these over the peach card, but a design tool
   wants the unmodified artwork. Context stays thinner and grey so the depth treatment
   survives the export; the 210x100 grid and y=88 baseline match the app exactly. */
function svg(m) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 100" width="420" height="200"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="${m.bg}" stroke="#9a9a9a" stroke-width="1.2"/>
  <path d="${m.fg}" stroke="#000000" stroke-width="2.2"/>
</svg>
`;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const keys = Object.keys(monuments);
for (const k of keys) {
  fs.writeFileSync(path.join(out, `${k}.svg`), svg(monuments[k]));
}

/* Contact sheet — every blueprint on one page, labelled, for a single upload. */
const cells = keys.map((k) => `    <figure>
      <svg viewBox="0 0 210 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="${monuments[k].bg}" stroke="#9a9a9a" stroke-width="1.2"/>
        <path d="${monuments[k].fg}" stroke="#000" stroke-width="2.2"/>
      </svg>
      <figcaption>${(LABELS[k] || [k])[0]}<span>${(LABELS[k] || ["", ""])[1]}</span></figcaption>
    </figure>`).join("\n");

fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<meta charset="utf-8">
<title>TravelHub — city blueprints</title>
<style>
  body { margin: 0; padding: 40px; background: #fff; color: #000;
         font: 400 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  p.sub { margin: 0 0 32px; color: #666; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 32px; }
  figure { margin: 0; }
  svg { width: 100%; height: auto; display: block; }
  figcaption { margin-top: 8px; letter-spacing: .04em; text-transform: uppercase;
               font-size: 11px; color: #444; }
  figcaption span { display: block; margin-top: 3px; text-transform: none;
                    letter-spacing: 0; color: #8a8a8a; }
</style>
<h1>TravelHub city blueprints</h1>
<p class="sub">Black line art, drawn on a 210 × 100 grid with the baseline at y = 88.
Right-aligned and baseline-anchored in the app (<code>preserveAspectRatio="xMaxYMax meet"</code>).
Two layers per city: the landmark at stroke 2.2, its city context at 1.2 in grey.</p>
<div class="grid">
${cells}
</div>
`);

/* Machine-readable, for regenerating at any size or colour. */
fs.writeFileSync(
  path.join(out, "blueprints.json"),
  JSON.stringify(
    { viewBox: "0 0 210 100", baseline: 88,
      strokeWidth: { landmark: 2.2, context: 1.2 },
      cities: keys.map((k) => ({
        key: k,
        label: (LABELS[k] || [k])[0],
        landmark: (LABELS[k] || ["", ""])[1],
        fg: monuments[k].fg,
        bg: monuments[k].bg,
      })) },
    null, 2
  ) + "\n"
);

console.log(`Wrote ${keys.length} blueprints to design/blueprints/ (${keys.join(", ")}).`);
