"""Build the standalone review gallery from the existing destination catalog."""
import json
from pathlib import Path
from html import escape

root = Path(__file__).resolve().parent
cities = json.loads((root.parent / 'blueprints.json').read_text())['cities']
for city in cities:
    if city['key'] == 'telaviv':
        city['landmark'] = 'Dizengoff Square · Fire and Water Fountain · Cinema Hotel'
cards = []
for city in cities:
    key, label = city['key'], city['label']
    if key == 'generic':
        label = 'Somewhere new'
    cards.append(f'''<article class="card" data-name="{escape(label.lower())}">
      <a class="art" href="{key}.png" target="_blank" aria-label="Open {escape(label)} artwork"><img src="{key}.png" alt="Pastel travel illustration of {escape(label)}" loading="lazy"></a>
      <div class="caption"><div><h2>{escape(label)}</h2><p>{escape(city['landmark'])}</p></div><span class="number">{len(cards)+1:02}</span></div>
      <details><summary>Compare with original blueprint</summary><img class="original" src="../{key}.svg" alt="Original {escape(label)} blueprint"></details>
    </article>''')
html = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TravelHub · A softer way to see the world</title><style>
:root{color-scheme:light;--paper:#f7f2e9;--ink:#494e47;--muted:#807c73;--line:#ded7cb}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 system-ui,sans-serif}
header,main,footer{max-width:1440px;margin:auto;padding:0 5vw}header{padding-top:60px;padding-bottom:38px}.eyebrow{font-size:11px;letter-spacing:.23em;text-transform:uppercase;color:#967b67}h1{font:normal clamp(36px,5vw,72px)/1.06 Georgia,serif;letter-spacing:-.04em;max-width:800px;margin:22px 0}header p{max-width:620px;color:var(--muted)}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:35px;border-top:1px solid var(--line);padding-top:22px}.swatches{display:flex;gap:7px}.swatches i{height:20px;width:20px;border-radius:50%;background:var(--c);border:1px solid #0000000b}input{background:#fff8;border:1px solid var(--line);border-radius:30px;padding:11px 18px;font:inherit;width:min(270px,60vw);color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 28px}.card{background:#fffcf6;padding:12px 12px 0;border:1px solid #e8e0d3;border-radius:3px;box-shadow:0 5px 22px #574b3410;overflow:hidden}.art{display:block;overflow:hidden;background:#eadbc9}.art img{display:block;width:100%;aspect-ratio:2.1;object-fit:cover;transition:transform .4s}.art:hover img{transform:scale(1.025)}.caption{display:flex;justify-content:space-between;gap:15px;padding:19px 12px}h2{font:normal 29px/1.1 Georgia,serif;margin:0 0 8px}.caption p{font-size:11px;letter-spacing:.025em;margin:0;color:var(--muted)}.number{font-size:11px;color:#b39b83}details{border-top:1px solid #eee6da;padding:10px 12px;font-size:11px;color:var(--muted)}summary{cursor:pointer}.original{display:block;width:100%;max-height:180px;margin:10px auto;background:#fff}footer{padding-top:48px;padding-bottom:40px;font-size:12px;color:var(--muted)}[hidden]{display:none!important}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid #9eaaa0;outline-offset:4px}@media(max-width:700px){.grid{grid-template-columns:1fr}header{padding-top:35px}.caption{padding:18px 6px}h1{font-size:43px}}@media(prefers-reduced-motion:reduce){.art img{transition:none}}
</style></head><body><header><div class="eyebrow">TravelHub / Destination art / Alternative 01</div><h1>A softer way<br>to see the world.</h1><p>A collection of pastel travel paintings. Familiar landmarks, sun-warmed architecture and the quiet romance of a vintage postcard.</p><div class="toolbar"><div class="swatches" aria-label="Blush, apricot, cream, sage and slate palette"><i style="--c:#d9a6a2"></i><i style="--c:#e9bc94"></i><i style="--c:#ece1ca"></i><i style="--c:#9ea68c"></i><i style="--c:#8498ac"></i></div><input type="search" aria-label="Filter destinations" placeholder="Find a destination…"></div></header><main><div class="grid">CARDS</div><p id="empty" hidden>No matching destinations.</p></main><footer>18 destinations + one fallback · Click any painting to open the full artwork.<br>Original blueprint comparison is available below each destination.</footer><script>document.querySelector('input').addEventListener('input',e=>{let count=0;document.querySelectorAll('.card').forEach(c=>{c.hidden=!c.dataset.name.includes(e.target.value.trim().toLowerCase());if(!c.hidden)count++});document.getElementById('empty').hidden=count>0});</script></body></html>'''.replace('CARDS', '\n'.join(cards))
(root / 'index.html').write_text(html)
manifest = {'style':'pastel-vintage-travel', 'aspectRatio':'2.1:1', 'generator':'built-in image_gen', 'cities':[{ 'key':c['key'], 'label':c['label'], 'src':c['key']+'.png', 'landmark':c['landmark']} for c in cities]}
(root / 'artworks.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Built gallery and manifest for {len(cities)} artworks.')
