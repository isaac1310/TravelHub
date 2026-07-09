/* Optional Supabase-backed sharing for Family TravelHub.
   The app is fully local (localStorage) without config.js — this script
   exits quietly when no Supabase config is present.

   Share model: the link is the password. Creating a share uploads the
   whole state to a "room" (row) in Supabase; the URL gains ?room=<id>&key=<secret>.
   Anyone opening that link sees and edits the same data (last write wins,
   pulled every 20s). */
(function () {
  const POLL_MS = 20000;
  const SAVE_DEBOUNCE_MS = 600;

  let supabase = null;
  let roomId = null;
  let roomSecret = null;
  let sharedMode = false;
  let lastRemoteUpdatedAt = null;
  let saveTimer = null;
  let saveInFlight = false;
  let pendingSave = false;
  let applyingRemote = false;

  function isConfigured() {
    const c = window.VACATION_CONFIG;
    return Boolean(c?.supabaseUrl && c?.supabaseAnonKey);
  }

  function setSyncStatus(text, type) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text;
    el.className = "sync-status" + (type ? ` sync-status--${type}` : "");
  }

  function getShareUrl() {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("room", roomId);
    url.searchParams.set("key", roomSecret);
    return url.toString();
  }

  function applyRemote(payload) {
    applyingRemote = true;
    try {
      window.VacationApp.setPayload(payload);
    } finally {
      applyingRemote = false;
    }
  }

  async function saveRemote() {
    if (!sharedMode || !supabase) return;
    saveInFlight = true;
    setSyncStatus("Saving…", "busy");
    const { data, error } = await supabase.rpc("save_shared_budget", {
      p_id: roomId,
      p_secret: roomSecret,
      p_payload: window.VacationApp.getPayload(),
    });
    saveInFlight = false;
    pendingSave = false;
    if (error || !data?.ok) {
      setSyncStatus("Save failed", "error");
      return;
    }
    lastRemoteUpdatedAt = data.updated_at || lastRemoteUpdatedAt;
    setSyncStatus("Saved", "ok");
  }

  function notifyLocalChange() {
    if (!sharedMode || applyingRemote) return;
    pendingSave = true;
    setSyncStatus("Unsaved changes", "pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveRemote().catch(console.error), SAVE_DEBOUNCE_MS);
  }

  async function pullIfNewer() {
    if (!sharedMode || saveInFlight || pendingSave) return;
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (error || !data?.payload) return;
      const remoteAt = data.updated_at || "";
      if (lastRemoteUpdatedAt && remoteAt <= lastRemoteUpdatedAt) return;
      lastRemoteUpdatedAt = remoteAt;
      applyRemote(data.payload);
      setSyncStatus("Synced", "ok");
    } catch (err) {
      console.error(err);
    }
  }

  async function copyLink() {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setSyncStatus("Link copied", "ok");
    } catch {
      prompt("Copy this share link:", url);
    }
  }

  async function handleShareClick(btn) {
    if (sharedMode) {
      copyLink();
      return;
    }
    if (!confirm("Create a share link? Anyone with the link can view and edit this trip data.")) return;
    btn.disabled = true;
    setSyncStatus("Creating link…", "busy");
    try {
      const { data, error } = await supabase.rpc("create_shared_budget", {
        p_payload: window.VacationApp.getPayload(),
      });
      if (error) throw error;
      roomId = data.id;
      roomSecret = data.secret;
      sharedMode = true;
      lastRemoteUpdatedAt = new Date().toISOString();
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      url.searchParams.set("key", roomSecret);
      window.history.replaceState({}, "", url);
      setInterval(pullIfNewer, POLL_MS);
      await copyLink();
    } catch (err) {
      console.error(err);
      setSyncStatus("Share failed", "error");
    } finally {
      btn.disabled = false;
    }
  }

  function loadConfigScript() {
    return new Promise((resolve) => {
      if (window.VACATION_CONFIG) return resolve();
      const script = document.createElement("script");
      script.src = "config.js";
      script.onload = resolve;
      script.onerror = resolve; // no config.js → local-only mode
      document.head.appendChild(script);
    });
  }

  async function bootstrap() {
    await loadConfigScript();
    if (!isConfigured() || !window.supabase?.createClient) return;
    supabase = window.supabase.createClient(
      window.VACATION_CONFIG.supabaseUrl,
      window.VACATION_CONFIG.supabaseAnonKey
    );

    const btn = document.getElementById("btn-share");
    if (btn) {
      btn.hidden = false;
      btn.addEventListener("click", () => handleShareClick(btn));
    }

    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const key = params.get("key");
    if (room && key) {
      roomId = room;
      roomSecret = key;
      sharedMode = true;
      setSyncStatus("Loading shared trip…", "busy");
      try {
        const { data, error } = await supabase.rpc("fetch_shared_budget", {
          p_id: roomId,
          p_secret: roomSecret,
        });
        if (error || !data?.payload) throw new Error("Invalid or expired share link.");
        lastRemoteUpdatedAt = data.updated_at || null;
        applyRemote(data.payload);
        setSyncStatus("Shared trip loaded", "ok");
        setInterval(pullIfNewer, POLL_MS);
      } catch (err) {
        alert(err.message || "Could not load the shared trip.");
        sharedMode = false;
        roomId = null;
        roomSecret = null;
        setSyncStatus("", "");
      }
    }
  }

  window.VacationShare = { notifyLocalChange, isShared: () => sharedMode };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
