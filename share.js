/* Optional Supabase-backed sharing for Family TravelHub.
   The app is fully local (localStorage) without config.js — this script
   exits quietly when no Supabase config is present.

   Share model: the link is the password. Creating a share uploads the
   whole state to a "room" (row) in Supabase; the URL gains ?room=<id>&key=<secret>.
   Anyone opening that link sees and edits the same data (last write wins).

   Sync model (notify-first): local edits push automatically (600ms debounce).
   Incoming changes are DETECTED on load, tab focus, and every ~60s — the user is
   notified (dot on the Sync button + toast) and changes apply when they tap
   Sync (↻ in the top bar). Outgoing edits still push automatically. */
(function () {
  const CHECK_MS = 60 * 1000; // background poll; also check on load + tab focus
  const SAVE_DEBOUNCE_MS = 600;
  let checkTimer = null;

  let supabase = null;
  let roomId = null;
  let roomSecret = null;
  let sharedMode = false;
  let lastRemoteUpdatedAt = null;
  let saveTimer = null;
  let saveInFlight = false;
  let pendingSave = false;
  let applyingRemote = false;
  let pendingRemoteInfo = null; // {by, at} — updates available, not yet applied
  let lastSyncAt = null;        // ms epoch of last successful push or applied pull
  let lastEditorInfo = null;    // {by, at} of the last applied remote payload

  function isConfigured() {
    const c = window.VACATION_CONFIG;
    return Boolean(c?.supabaseUrl && c?.supabaseAnonKey);
  }

  let statusClearTimer = null;
  function setSyncStatus(text, type) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    clearTimeout(statusClearTimer);
    el.hidden = !text;
    el.textContent = (type === "ok" ? "✓ " : "") + text;
    el.className = "sync-status" + (type ? ` sync-status--${type}` : "");
    if (type === "ok") {
      // Flash so the save is noticeable, then fade the label back to a calm "Saved".
      el.classList.remove("sync-status--flash");
      void el.offsetWidth; // restart animation
      el.classList.add("sync-status--flash");
      statusClearTimer = setTimeout(() => {
        if (sharedMode) { el.hidden = false; el.textContent = "✓ Saved"; el.className = "sync-status sync-status--ok"; }
      }, 2500);
    }
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
        p_payload: stampedPayload(),
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
      lastSyncAt = Date.now();
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

  /* Clone the state and stamp who/when — local state is never mutated. */
  function stampedPayload() {
    return {
      ...window.VacationApp.getPayload(),
      lastEditedBy: window.VacationApp.getDeviceName?.() || "",
      lastEditedAt: new Date().toISOString(),
    };
  }

  function updateSyncDot(on) {
    const dot = document.getElementById("sync-dot");
    if (dot) dot.hidden = !on;
  }

  /* Notify-first: detect newer remote data, tell the user, apply NOTHING. */
  async function checkForUpdates() {
    if (!sharedMode || !supabase || saveInFlight) return false;
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (error || !data?.payload) return false;
      const remoteAt = data.updated_at || "";
      if (lastRemoteUpdatedAt && remoteAt <= lastRemoteUpdatedAt) return false;
      pendingRemoteInfo = { by: data.payload.lastEditedBy || "Someone", at: data.payload.lastEditedAt || remoteAt };
      updateSyncDot(true);
      setSyncStatus(`${pendingRemoteInfo.by} made changes — tap Sync`, "pending");
      window.VacationApp.showUpdateToast?.(pendingRemoteInfo.by);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  /* Sync = push local edits first, then FRESH fetch (never a cached copy),
     apply if newer, and report what changed. */
  async function syncNow() {
    if (!sharedMode || !supabase) return;
    const btn = document.getElementById("btn-sync-now");
    if (btn) btn.disabled = true;
    setSyncStatus("Syncing…", "busy");
    try {
      if (pendingSave) {
        clearTimeout(saveTimer);
        clearTimeout(retryTimer);
        retryCount = 0;
        await saveRemote();
      }
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (!error && data?.payload) {
        const remoteAt = data.updated_at || "";
        if (!lastRemoteUpdatedAt || remoteAt > lastRemoteUpdatedAt) {
          const prev = structuredClone(window.VacationApp.getPayload());
          lastRemoteUpdatedAt = remoteAt;
          lastEditorInfo = { by: data.payload.lastEditedBy || "", at: data.payload.lastEditedAt || remoteAt };
          applyRemote(data.payload);
          window.VacationApp.onRemoteChanges?.(prev, data.payload);
        }
      }
      pendingRemoteInfo = null;
      updateSyncDot(false);
      lastSyncAt = Date.now();
      setSyncStatus("Synced just now", "ok");
    } catch (err) {
      console.error(err);
      setSyncStatus("Sync failed", "error");
    }
    if (btn) btn.disabled = false;
  }

  /* Keep the pill honest between events: "Synced Nm ago" (no flash). */
  setInterval(() => {
    if (!sharedMode || !lastSyncAt || pendingSave || saveInFlight || pendingRemoteInfo) return;
    const el = document.getElementById("sync-status");
    if (!el || el.classList.contains("sync-status--error")) return;
    const mins = Math.floor((Date.now() - lastSyncAt) / 60000);
    el.hidden = false;
    el.className = "sync-status sync-status--ok";
    el.textContent = "✓ Synced " + (mins < 1 ? "just now" : `${mins}m ago`);
    if (lastEditorInfo?.by) {
      const t = lastEditorInfo.at ? new Date(lastEditorInfo.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
      el.title = `Last change by ${lastEditorInfo.by}${t ? " at " + t : ""}`;
    }
  }, 60000);

  async function copyLink() {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setSyncStatus("Link copied", "ok");
    } catch {
      prompt("Copy this share link:", url);
    }
  }

  /* Once saved, the Save button stays clickable as a manual "Save now"
     (edits also auto-sync); the Copy link button appears. */
  function markSavedChrome() {
    const save = document.getElementById("btn-share");
    if (save) {
      save.disabled = false;
      save.setAttribute("aria-label", "Save now");
      save.setAttribute("title", "Save now — changes also sync automatically");
    }
    const copy = document.getElementById("btn-copy-link");
    if (copy) copy.hidden = false;
    const sync = document.getElementById("btn-sync-now");
    if (sync) sync.hidden = false;
  }

  /* Manual "Save now": flush any pending debounce and push immediately,
     with visible confirmation. */
  async function saveNow(btn) {
    if (btn) btn.disabled = true;
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
    retryCount = 0;
    pendingSave = true;
    await saveRemote().catch(console.error);
    if (btn) btn.disabled = false;
  }

  async function handleSaveClick(btn) {
    if (sharedMode) { await saveNow(btn); return; } // manual re-save with feedback
    if (!confirm("Save this trip to the cloud so it syncs across devices and can be shared by link?")) return;
    btn.disabled = true;
    await window.VacationApp.ensureDeviceName?.(); // who is stamping changes
    setSyncStatus("Saving…", "busy");
    try {
      const { data, error } = await supabase.rpc("create_shared_budget", {
        p_payload: stampedPayload(),
      });
      if (error) throw error;
      roomId = data.id;
      roomSecret = data.secret;
      sharedMode = true;
      rememberRoom(roomId, roomSecret);
      lastRemoteUpdatedAt = new Date().toISOString();
      lastSyncAt = Date.now();
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      url.searchParams.set("key", roomSecret);
      window.history.replaceState({}, "", url);
      startUpdateChecks();
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
    const syncBtn = document.getElementById("btn-sync-now");
    if (syncBtn) {
      syncBtn.addEventListener("click", () => syncNow().catch(console.error));
    }

    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get("room");
    const urlKey = params.get("key");
    const remembered = storedRoom();

    // Prefer the URL's room; fall back to the room this device already joined,
    // so a plain reload (no ?room&key) still reconnects to the shared trip.
    const room = urlRoom || remembered?.room;
    const key = (urlRoom ? urlKey : remembered?.key) || null;
    if (!room || !key) return;

    const alreadyJoined = remembered && remembered.room === room;

    // Warn before replacing local data — only when JOINING a room this device
    // hasn't used before (reloads of your own shared trip never prompt).
    if (!alreadyJoined && hasLocalTrips() &&
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
      rememberRoom(room, key);
      // Keep the URL carrying the link so Copy/refresh stay consistent.
      const url = new URL(window.location.href);
      url.searchParams.set("room", room);
      url.searchParams.set("key", key);
      window.history.replaceState({}, "", url);
      lastRemoteUpdatedAt = data.updated_at || null;
      lastEditorInfo = { by: data.payload.lastEditedBy || "", at: data.payload.lastEditedAt || "" };
      applyRemote(data.payload); // initial load: no diff — everything would be "new"
      lastSyncAt = Date.now();
      markSavedChrome();
      setSyncStatus("Shared trip loaded", "ok");
      startUpdateChecks();
      window.VacationApp.ensureDeviceName?.(); // non-blocking; needed before their first edit is stamped
    } catch (err) {
      alert(err.message || "Could not load the shared trip.");
      setSyncStatus("", "");
    }
  }

  const ROOM_STORE_KEY = "travelhub-room";
  function storedRoom() {
    try { return JSON.parse(localStorage.getItem(ROOM_STORE_KEY) || "null"); } catch { return null; }
  }
  function rememberRoom(room, key) {
    try { localStorage.setItem(ROOM_STORE_KEY, JSON.stringify({ room, key })); } catch { /* private mode */ }
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

  /* Check soon after shared mode, on tab focus, and every CHECK_MS. */
  function startUpdateChecks() {
    clearInterval(checkTimer);
    setTimeout(() => checkForUpdates().catch(console.error), 2000);
    checkTimer = setInterval(() => checkForUpdates().catch(console.error), CHECK_MS);
    if (!startUpdateChecks.bound) {
      startUpdateChecks.bound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && sharedMode) {
          checkForUpdates().catch(console.error);
        }
      });
    }
  }

  window.VacationShare = {
    notifyLocalChange,
    isShared: () => sharedMode,
    syncNow,
    checkForUpdates,
    getSyncInfo: () => ({ lastSyncAt, lastEditor: lastEditorInfo, updatesAvailable: !!pendingRemoteInfo }),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
