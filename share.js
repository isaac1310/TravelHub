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

  const RETRY_DELAYS_MS = [5000, 15000, 45000];
  let retryCount = 0;
  let retryTimer = null;

  async function saveRemote() {
    if (!sharedMode || !supabase) return;
    clearTimeout(retryTimer);
    saveInFlight = true;
    setSyncStatus("Saving…", "busy");
    let failed = false;
    try {
      const { data, error } = await supabase.rpc("save_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
        p_payload: window.VacationApp.getPayload(),
      });
      failed = Boolean(error || !data?.ok);
      if (!failed) lastRemoteUpdatedAt = data.updated_at || lastRemoteUpdatedAt;
    } catch {
      failed = true; // network error
    }
    saveInFlight = false;
    if (!failed) {
      pendingSave = false;
      retryCount = 0;
      setSyncStatus("Saved", "ok");
      return;
    }
    // Keep pendingSave true so polling doesn't clobber unsaved local edits,
    // and retry with backoff. A new local edit also re-queues a save.
    if (retryCount < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryCount];
      retryCount += 1;
      setSyncStatus(`Save failed — retrying in ${Math.round(delay / 1000)}s`, "error");
      retryTimer = setTimeout(() => saveRemote().catch(console.error), delay);
    } else {
      setSyncStatus("Save failed — check your connection, edits kept locally", "error");
    }
  }

  function notifyLocalChange() {
    if (!sharedMode || applyingRemote) return;
    retryCount = 0; // fresh edit restarts the retry budget
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

  /* Reflect saved state in the app bar: Save button becomes a non-actionable
     "Saved" indicator and the Copy link button appears. */
  function markSavedChrome() {
    const save = document.getElementById("btn-share");
    if (save) {
      save.disabled = true;
      save.setAttribute("aria-label", "Saved to cloud");
      save.setAttribute("title", "Saved to cloud — changes sync automatically");
    }
    const copy = document.getElementById("btn-copy-link");
    if (copy) copy.hidden = false;
  }

  async function handleSaveClick(btn) {
    if (sharedMode) return; // already saved; edits auto-sync
    if (!confirm("Save this trip to the cloud so it syncs across devices and can be shared by link?")) return;
    btn.disabled = true;
    setSyncStatus("Saving…", "busy");
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
      markSavedChrome();
      setSyncStatus("Saved", "ok");
      await copyLink();
    } catch (err) {
      console.error(err);
      setSyncStatus("Save failed", "error");
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

    const sub = document.getElementById("budget-subtitle");
    if (sub) sub.textContent = "Trips, budgets, and expenses by year · synced to cloud when saved";

    const btn = document.getElementById("btn-share");
    if (btn) {
      btn.hidden = false;
      btn.addEventListener("click", () => handleSaveClick(btn));
    }
    const copyBtn = document.getElementById("btn-copy-link");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => copyLink().catch(() => {}));
    }

    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const key = params.get("key");
    if (!room || !key) return;

    // Warn before replacing existing local data (only if there is any).
    if (hasLocalTrips() &&
        !confirm("Open shared trip? This replaces the trip data on this device.")) {
      // Cancelled: stay local-only, strip the room params so refresh won't re-prompt.
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("key");
      window.history.replaceState({}, "", url);
      return;
    }

    setSyncStatus("Loading shared trip…", "busy");
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: room,
        p_secret: key,
      });
      if (error || !data?.payload) throw new Error("Invalid or expired share link.");
      // Only now commit to shared mode (Cancel above never reaches here).
      roomId = room;
      roomSecret = key;
      sharedMode = true;
      lastRemoteUpdatedAt = data.updated_at || null;
      applyRemote(data.payload);
      markSavedChrome();
      setSyncStatus("Shared trip loaded", "ok");
      setInterval(pullIfNewer, POLL_MS);
    } catch (err) {
      alert(err.message || "Could not load the shared trip.");
      setSyncStatus("", "");
    }
  }

  function hasLocalTrips() {
    try {
      const raw = localStorage.getItem("vacation-budget-planner-v1");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.trips) && parsed.trips.length > 0;
    } catch {
      return false;
    }
  }

  window.VacationShare = { notifyLocalChange, isShared: () => sharedMode };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
