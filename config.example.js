/* Copy this file to config.js and fill in your Supabase project's values.
   Supabase dashboard → Project Settings → API:
   - supabaseUrl:  "Project URL"
   - supabaseAnonKey: the publishable / "anon public" key (safe in client code)

   NOTE: for the hosted app, config.js IS committed to the repo on purpose so
   GitHub Pages can enable Save/sharing. The publishable key is designed to be
   public; access to any trip is still gated by the secret in its share link.
   Do NOT put the service_role/secret key here. */
window.VACATION_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
};
