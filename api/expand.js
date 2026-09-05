/* /api/expand?url=<short Google Maps link>  →  { url: "<full google.com/maps/... URL>" }

   The only server code in TravelHub. A short link (maps.app.goo.gl, goo.gl/maps, g.co) carries
   no coordinates; the browser cannot follow Google's redirect itself (no CORS headers, and the
   app's CSP connect-src does not include those hosts). This follows it server-side and hands
   the final URL back so the reservation sheet can read the place name and pin out of it.

   Deliberately narrow: an allow-list of hosts (so it is not a general redirect-follower), at
   most four hops, a five-second budget, nothing stored. Runs on Vercel as a Node function and
   in tools/serve.js for local development (see `handleExpand`). Dependency-free: Node 18+. */

const ALLOWED = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co)\/[^\s]+$/i;
const MAX_HOPS = 4;
const BUDGET_MS = 5000;

async function expandShortLink(short) {
  if (!ALLOWED.test(short)) return { status: 400, body: { error: "Not a Google Maps short link" } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUDGET_MS);
  try {
    let url = short;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (TravelHub link expander)" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).toString();
        // Google's EU consent interstitial wraps the real target in ?continue=…; unwrap it rather
        // than hand the client a consent page it cannot parse.
        const cont = /^https:\/\/consent\.google\./i.test(url) ? new URL(url).searchParams.get("continue") : null;
        if (cont && /^https:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(cont)) return { status: 200, body: { url: cont } };
        // Stop as soon as we are on a full Maps URL — that is what the client can parse.
        if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\//i.test(url)) return { status: 200, body: { url } };
        continue;
      }
      // Not a redirect: whatever we landed on is the answer (Google sometimes 200s the maps page).
      return /google\./i.test(url) ? { status: 200, body: { url } } : { status: 502, body: { error: "The link did not lead to Google Maps" } };
    }
    return { status: 502, body: { error: "Too many redirects" } };
  } catch (err) {
    return { status: 504, body: { error: err.name === "AbortError" ? "Timed out following the link" : "Could not follow the link" } };
  } finally {
    clearTimeout(timer);
  }
}

/* Shared by the Vercel handler and tools/serve.js: takes the raw `url` query value. */
async function handleExpand(rawUrl) {
  if (!rawUrl) return { status: 400, body: { error: "Missing url" } };
  return expandShortLink(String(rawUrl).trim());
}

/* Vercel Node function signature. */
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: "GET only" });
    return;
  }
  const { status, body } = await handleExpand(req.query && req.query.url);
  res.setHeader("cache-control", "no-store");
  res.status(status).json(body);
};
module.exports.handleExpand = handleExpand;
