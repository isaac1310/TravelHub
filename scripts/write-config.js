const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/* ---- build-info.js — always written, even without Supabase config ----
   Vercel injects VERCEL_* at build time. Locally these are absent and the
   commit reads "dev", so a local checkout is never mistaken for a real build. */
const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const buildInfo = {
  commit: sha ? sha.slice(0, 7) : "dev",
  branch: process.env.VERCEL_GIT_COMMIT_REF || "",
  env: process.env.VERCEL_ENV || "local",
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(root, "build-info.js"),
  `window.VACATION_BUILD = ${JSON.stringify(buildInfo, null, 2)};\n`
);
console.log(`Wrote build-info.js (${buildInfo.commit} / ${buildInfo.env}).`);

/* ---- config.js — only when the Supabase env vars are set ----
   Otherwise the committed config.js stays in place. */
const url = process.env.VACATION_SUPABASE_URL;
const key = process.env.VACATION_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log(
    "Skipping config.js: set VACATION_SUPABASE_URL and VACATION_SUPABASE_ANON_KEY in the Vercel project settings, or include config.js in the deploy folder."
  );
  process.exit(0);
}

fs.writeFileSync(
  path.join(root, "config.js"),
  `window.VACATION_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`
);
console.log("Wrote config.js for deploy.");
