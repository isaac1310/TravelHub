/* Static file server for local development. No dependencies, no build step — the same
   philosophy as the app itself.

   Two ports are configured in .claude/launch.json and the difference matters:

     8722  the app you click around in, holding your real trips
     8723  the self-test sandbox, `?selftest=1`

   They are separate ORIGINS, so the browser gives each its own localStorage. That is the whole
   point. On one port the suite's probe data and your real data share a single key
   ("vacation-budget-planner-v1"), and a run that restores its backup will happily restore over
   an edit you made while it was running — which cost a real debugging session in v1.11.0, when
   four failures turned out to be a QA agent clicking on the same port.

   Usage: node tools/serve.js [port]        (or set PORT) */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8722);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const file = path.resolve(ROOT, rel);

    // Never serve outside the repo, whatever the request path claims.
    if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, "index.html")) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found: " + rel);
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        // Editing a single file and reloading must show the edit, always.
        "cache-control": "no-store",
      });
      res.end(body);
    });
  })
  .listen(PORT, () => console.log(`TravelHub on http://localhost:${PORT}`));
