# Deploy to Netlify (share with a friend)

## Before you deploy

1. **Supabase** — Create a project and run `supabase/schema.sql` in the SQL Editor.
2. **Config** — Copy `config.example.js` to `config.js` and add your Supabase URL and anon key.
3. **Test locally** (optional) — Open `index.html` via a simple server, or deploy first and test on Netlify.

`config.js` is gitignored. For Netlify you still need that file **on the machine or in the folder you deploy** (see step 2 below).

---

## Option A — Drag & drop (fastest)

1. Go to [https://app.netlify.com](https://app.netlify.com) and log in.
2. Make sure your project folder contains:
   - `index.html`, `app.js`, `share.js`, `styles.css`
   - `config.js` (with real keys — not the example file)
3. Zip the folder (or use Netlify Drop: drag the folder onto the deploy area).
4. Netlify gives you a URL like `https://random-name.netlify.app`.
5. Open that URL → **Create shared budget from this device** → **Copy share link** → send to your friend.

---

## Option B — Git + Netlify

1. Push the project to GitHub (do **not** commit `config.js`).
2. Netlify → **Add new site** → **Import from Git** → select the repo.
3. Build settings:
   - **Build command:** leave empty
   - **Publish directory:** `.` (project root)
4. Before or after first deploy, add `config.js` to the published site using one of:
   - **Netlify Build plugin / script** that writes `config.js` from environment variables, or
   - Deploy once via **Option A** including `config.js`, or
   - Temporarily commit `config.js` only on a private repo (not recommended for public repos).

### Optional: config from Netlify environment variables

In Netlify → **Site configuration** → **Environment variables**, add:

- `VACATION_SUPABASE_URL`
- `VACATION_SUPABASE_ANON_KEY`

Add a build command that writes `config.js`:

```bash
node scripts/write-config.js
```

(Create `scripts/write-config.js` if you use this path.)

---

## After deploy — share with a friend

1. Open your Netlify URL (must be `https://`, not `file://`).
2. If you used the app locally before, choose **Create shared budget from this device** to upload your saved trips.
3. Click **Copy share link**.
4. Friend opens the same link — you both edit one budget.
5. Use **Sync now** or wait ~20 seconds for automatic sync.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Setup screen when opening a share link | Add `config.js` on Netlify and redeploy |
| Friend sees old data | Click **Sync now** or refresh |
| Invalid share link | Link must include both `room` and `key` query params |
| Works locally but not shared | Deploy to HTTPS; Supabase + `config.js` required |

---

## Security

The share link is the password. Send it only to people you trust.
