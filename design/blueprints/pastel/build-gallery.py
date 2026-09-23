"""Build the standalone review gallery from the existing destination catalog."""
import json
from pathlib import Path
from html import escape

root = Path(__file__).resolve().parent
cities = json.loads((root.parent / 'blueprints.json').read_text())['cities']
for city in cities:
    if city['key'] == 'telaviv':
        city['landmark'] = 'Dizengoff Square · Fire and Water Fountain · Cinema Hotel'
cities.insert(-1, {
    'key': 'alba',
    'label': 'Alba, Italy',
    'landmark': 'Cathedral of San Lorenzo · Medieval towers',
    'pastel_only': True,
})
cities.insert(-1, {
    'key': 'milano',
    'label': 'Milano',
    'landmark': 'Duomo di Milano · Piazza del Duomo',
    'pastel_only': True,
})
cities.insert(-1, {
    'key': 'milano-v2',
    'label': 'Milano — Alternative 02',
    'landmark': 'Duomo di Milano · Framed by the Galleria',
    'pastel_only': True,
})
cards = []
for city in cities:
    key, label = city['key'], city['label']
    if key == 'generic':
        label = 'Somewhere new'
    comparison = '' if city.get('pastel_only') else f'''<details><summary>Compare with original blueprint</summary><img class="original" src="../{key}.svg" alt="Original {escape(label)} blueprint"></details>'''
    cards.append(f'''<article class="card" data-name="{escape(label.lower())}">
      <a class="art" href="{key}.png" target="_blank" aria-label="Open {escape(label)} artwork"><img src="{key}.png" alt="Pastel travel illustration of {escape(label)}" loading="lazy"></a>
      <div class="caption"><div><h2>{escape(label)}</h2><p>{escape(city['landmark'])}</p></div><span class="number">{len(cards)+1:02}</span></div>
{comparison}
    </article>''')
html = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TravelHub · A softer way to see the world</title><style>
:root{color-scheme:light;--paper:#f7f2e9;--ink:#494e47;--muted:#807c73;--line:#ded7cb}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 system-ui,sans-serif}
header,main,footer{max-width:1440px;margin:auto;padding:0 5vw}header{padding-top:60px;padding-bottom:38px}.eyebrow{font-size:11px;letter-spacing:.23em;text-transform:uppercase;color:#967b67}h1{font:normal clamp(36px,5vw,72px)/1.06 Georgia,serif;letter-spacing:-.04em;max-width:800px;margin:22px 0}header p{max-width:620px;color:var(--muted)}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:35px;border-top:1px solid var(--line);padding-top:22px}.swatches{display:flex;gap:7px}.swatches i{height:20px;width:20px;border-radius:50%;background:var(--c);border:1px solid #0000000b}input{background:#fff8;border:1px solid var(--line);border-radius:30px;padding:11px 18px;font:inherit;width:min(270px,60vw);color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 28px}.card{background:#fffcf6;padding:12px 12px 0;border:1px solid #e8e0d3;border-radius:3px;box-shadow:0 5px 22px #574b3410;overflow:hidden}.art{display:block;overflow:hidden;background:#eadbc9}.art img{display:block;width:100%;aspect-ratio:2.1;object-fit:cover;transition:transform .4s}.art:hover img{transform:scale(1.025)}.caption{display:flex;justify-content:space-between;gap:15px;padding:19px 12px}h2{font:normal 29px/1.1 Georgia,serif;margin:0 0 8px}.caption p{font-size:11px;letter-spacing:.025em;margin:0;color:var(--muted)}.number{font-size:11px;color:#b39b83}details{border-top:1px solid #eee6da;padding:10px 12px;font-size:11px;color:var(--muted)}summary{cursor:pointer}.original{display:block;width:100%;max-height:180px;margin:10px auto;background:#fff}footer{padding-top:48px;padding-bottom:40px;font-size:12px;color:var(--muted)}[hidden]{display:none!important}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid #9eaaa0;outline-offset:4px}@media(max-width:700px){.grid{grid-template-columns:1fr}header{padding-top:35px}.caption{padding:18px 6px}h1{font-size:43px}}@media(prefers-reduced-motion:reduce){.art img{transition:none}}
</style></head><body><header><div class="eyebrow">TravelHub / Destination art / Alternative 01</div><h1>A softer way<br>to see the world.</h1><p>A collection of pastel travel paintings. Familiar landmarks, sun-warmed architecture and the quiet romance of a vintage postcard.</p><p><a href="country-fallbacks.html">Review all European country fallbacks →</a></p><div class="toolbar"><div class="swatches" aria-label="Blush, apricot, cream, sage and slate palette"><i style="--c:#d9a6a2"></i><i style="--c:#e9bc94"></i><i style="--c:#ece1ca"></i><i style="--c:#9ea68c"></i><i style="--c:#8498ac"></i></div><input type="search" aria-label="Filter destinations" placeholder="Find a destination…"></div></header><main><div class="grid">CARDS</div><p id="empty" hidden>No matching destinations.</p></main><footer>21 destination artworks + one legacy fallback · Click any painting to open the full artwork.<br>Original blueprint comparison is available where a blueprint exists.</footer><script>document.querySelector('input').addEventListener('input',e=>{let count=0;document.querySelectorAll('.card').forEach(c=>{c.hidden=!c.dataset.name.includes(e.target.value.trim().toLowerCase());if(!c.hidden)count++});document.getElementById('empty').hidden=count>0});</script></body></html>'''.replace('CARDS', '\n'.join(cards))
(root / 'index.html').write_text(html)
manifest = {'style':'pastel-vintage-travel', 'aspectRatio':'2.1:1', 'generator':'built-in image_gen', 'cities':[{ 'key':c['key'], 'label':c['label'], 'src':c['key']+'.png', 'landmark':c['landmark']} for c in cities]}
(root / 'artworks.json').write_text(json.dumps(manifest, indent=2) + '\n')

fallbacks = json.loads((root / 'country-fallbacks.json').read_text())
fallback_cards = []
for country in fallbacks['countries']:
    fallback_cards.append(f'''<article class="card" data-name="{escape((country['label'] + ' ' + country['landmark']).lower())}">
      <a class="art" href="{escape(country['src'])}" target="_blank" aria-label="Open {escape(country['label'])} fallback artwork"><img src="{escape(country['src'])}" alt="Pastel fallback illustration for {escape(country['label'])}" loading="lazy"></a>
      <div class="caption"><div><h2>{escape(country['label'])}</h2><p>{escape(country['landmark'])}</p></div><span class="number">{len(fallback_cards)+1:02}</span></div>
    </article>''')
fallback_html = html.replace('TravelHub · A softer way to see the world', 'TravelHub · European country fallback art')
fallback_html = fallback_html.replace('A softer way<br>to see the world.', 'Europe, one landmark<br>at a time.')
fallback_html = fallback_html.replace('A collection of pastel travel paintings. Familiar landmarks, sun-warmed architecture and the quiet romance of a vintage postcard.', 'Country-level fallback paintings for European destinations without dedicated city art. Each design centers one recognizable landmark.')
fallback_html = fallback_html.replace('<p><a href="country-fallbacks.html">Review all European country fallbacks →</a></p>', '<p><a href="index.html">← Return to the destination gallery</a> · <a href="region-fallbacks.html">View regional fallback prototype →</a></p>')
fallback_html = fallback_html.replace('\n'.join(cards), '\n'.join(fallback_cards))
fallback_html = fallback_html.replace('21 destination artworks + one legacy fallback · Click any painting to open the full artwork.<br>Original blueprint comparison is available where a blueprint exists.', f"{fallbacks['count']} European country fallbacks · City art is chosen first, then country art, then the legacy generic fallback.")
(root / 'country-fallbacks.html').write_text(fallback_html)

regions = json.loads((root / 'region-fallbacks.json').read_text())
region_cards = []
for region in regions['regions']:
    region_cards.append(f'''<article class="card" data-name="{escape((region['label'] + ' ' + region['landmark']).lower())}">
      <a class="art" href="{escape(region['src'])}" target="_blank" aria-label="Open {escape(region['label'])} regional fallback artwork"><img src="{escape(region['src'])}" alt="Pastel regional fallback illustration for {escape(region['label'])}"></a>
      <div class="caption"><div><h2>{escape(region['label'])}</h2><p>{escape(region['landmark'])}</p></div><span class="number">{len(region_cards)+1:02}</span></div>
    </article>''')
region_html = html.replace('TravelHub · A softer way to see the world', 'TravelHub · Regional fallback prototype')
region_html = region_html.replace('A softer way<br>to see the world.', 'A region, its character<br>and its country.')
region_html = region_html.replace('A collection of pastel travel paintings. Familiar landmarks, sun-warmed architecture and the quiet romance of a vintage postcard.', 'A regional fallback combines a recognizable landmark, scenery the region is famous for, and a subtle national flag in the same pastel design language.')
region_html = region_html.replace('<p><a href="country-fallbacks.html">Review all European country fallbacks →</a></p>', '<p><a href="country-fallbacks.html">← Return to country fallbacks</a></p>')
region_html = region_html.replace('\n'.join(cards), '\n'.join(region_cards))
region_html = region_html.replace('21 destination artworks + one legacy fallback · Click any painting to open the full artwork.<br>Original blueprint comparison is available where a blueprint exists.', 'Regional fallback prototype · City art remains the first choice, followed by region, country and then the legacy generic fallback.')
(root / 'region-fallbacks.html').write_text(region_html)
print(f"Built {len(cities)} destination artworks, {fallbacks['count']} country fallbacks and {len(regions['regions'])} regional prototype.")
