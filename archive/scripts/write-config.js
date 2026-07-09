const fs = require("fs");
const path = require("path");

const url = process.env.VACATION_SUPABASE_URL;
const key = process.env.VACATION_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log(
    "Skipping config.js: set VACATION_SUPABASE_URL and VACATION_SUPABASE_ANON_KEY on Netlify, or include config.js in the deploy folder."
  );
  process.exit(0);
}

const content = `window.VACATION_CONFIG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, "..", "config.js"), content);
console.log("Wrote config.js for deploy.");
