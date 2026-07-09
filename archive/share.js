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
  let pollTimer = null;

  function isConfigured() {
    const c = window.VACATION_CONFIG;
    return Boolean(c?.supabaseUrl && c?.supabaseAnonKey);
  }

  function getRoomFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const key = params.get("key");
    if (room && key) return { room, key };
    return null;
  }

  function setShareUrl(room, key) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("room", room);
    url.searchParams.set("key", key);
    window.history.replaceState({}, "", url);
  }

  function getShareUrl() {
    if (!roomId || !roomSecret) return window.location.href;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("room", roomId);
    url.searchParams.set("key", roomSecret);
    return url.toString();
  }

  function showScreen(id) {
    ["screen-setup", "screen-welcome", "app-shell"].forEach((screenId) => {
      const el = document.getElementById(screenId);
      if (el) el.hidden = screenId !== id;
    });
  }

  function setSyncStatus(text, type) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    el.textContent = text;
    el.className = "sync-status";
    if (type) el.classList.add(`sync-status--${type}`);
  }

  function initClient() {
    if (!isConfigured() || !window.supabase?.createClient) return null;
    const { supabaseUrl, supabaseAnonKey } = window.VACATION_CONFIG;
    return window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  }

  function updateWelcomeScreen() {
    const summaryEl = document.getElementById("welcome-local-summary");
    const btnLocal = document.getElementById("btn-create-shared-local");
    const btnEmpty = document.getElementById("btn-create-shared-empty");
    const summary = window.VacationApp.getLocalImportSummary();

    if (!summaryEl || !btnLocal || !btnEmpty) return;

    if (summary.hasLocal) {
      summaryEl.hidden = false;
      summaryEl.innerHTML = `
        <p class="welcome-summary__title">Data on this device</p>
        <ul class="welcome-summary__list">
          <li><strong>${summary.tripCount}</strong> trip(s)</li>
          <li><strong>${summary.expenseCount}</strong> expense(s)</li>
          <li>Funds: <strong>${formatMoneySummary(summary.currentFunds)}</strong></li>
        </ul>
        <p class="welcome-summary__note">Import uploads this data to the cloud for sharing.</p>`;
      btnLocal.hidden = false;
      btnEmpty.classList.remove("btn--primary");
      btnEmpty.classList.add("btn--secondary");
    } else {
      summaryEl.hidden = true;
      btnLocal.hidden = true;
      btnEmpty.classList.remove("btn--secondary");
      btnEmpty.classList.add("btn--primary");
    }
  }

  function formatMoneySummary(n) {
    return new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(n);
  }

  async function createRoom(useLocal) {
    const app = window.VacationApp;
    if (useLocal) {
      app.importFromThisDevice();
    } else {
      app.useSeedData();
    }
    const payload = app.getPayload();
    const { data, error } = await supabase.rpc("create_shared_budget", {
      p_payload: payload,
    });
    if (error) throw error;
    roomId = data.id;
    roomSecret = data.secret;
    sharedMode = true;
    setShareUrl(roomId, roomSecret);
    lastRemoteUpdatedAt = new Date().toISOString();
    showScreen("app-shell");
    updateShareChrome();
    setSyncStatus("Shared · link ready", "ok");
    startPolling();
    app.render();
  }

  async function loadRemote() {
    const { data, error } = await supabase.rpc("fetch_shared_budget", {
      p_id: roomId,
      p_secret: roomSecret,
    });
    if (error) throw error;
    if (!data?.payload) {
      throw new Error("Invalid or expired share link.");
    }
    window.VacationApp.setPayload(data.payload);
    lastRemoteUpdatedAt = data.updated_at || null;
    return data;
  }

  async function saveRemote() {
    if (!sharedMode || !supabase) return;
    saveInFlight = true;
    setSyncStatus("Saving…", "busy");
    const payload = window.VacationApp.getPayload();
    const { data, error } = await supabase.rpc("save_shared_budget", {
      p_id: roomId,
      p_secret: roomSecret,
      p_payload: payload,
    });
    saveInFlight = false;
    pendingSave = false;
    if (error) {
      setSyncStatus("Save failed", "error");
      throw error;
    }
    if (!data?.ok) {
      setSyncStatus("Save failed", "error");
      throw new Error("Could not save budget.");
    }
    lastRemoteUpdatedAt = data.updated_at || lastRemoteUpdatedAt;
    setSyncStatus("Saved", "ok");
  }

  function queueSave() {
    if (!sharedMode) return;
    pendingSave = true;
    setSyncStatus("Unsaved changes", "pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await saveRemote();
      } catch (err) {
        console.error(err);
      }
    }, SAVE_DEBOUNCE_MS);
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
      window.VacationApp.setPayload(data.payload);
      lastRemoteUpdatedAt = remoteAt;
      setSyncStatus("Synced from cloud", "ok");
    } catch (err) {
      console.error(err);
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pullIfNewer, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function updateShareChrome() {
    const bar = document.getElementById("share-bar");
    if (bar) bar.hidden = !sharedMode;
  }

  async function copyShareLink() {
    const url = getShareUrl();
    await navigator.clipboard.writeText(url);
    setSyncStatus("Link copied", "ok");
  }

  async function handleCreateShared(useLocal, button) {
    button.disabled = true;
    setSyncStatus("Creating…", "busy");
    try {
      await createRoom(useLocal);
    } catch (err) {
      alert(err.message || "Could not create shared budget.");
      button.disabled = false;
    }
  }

  function bindShareUi() {
    document
      .getElementById("btn-create-shared-local")
      ?.addEventListener("click", (e) => {
        handleCreateShared(true, e.currentTarget);
      });

    document
      .getElementById("btn-create-shared-empty")
      ?.addEventListener("click", (e) => {
        handleCreateShared(false, e.currentTarget);
      });

    document.getElementById("btn-copy-link")?.addEventListener("click", async () => {
      try {
        await copyShareLink();
      } catch {
        prompt("Copy this link:", getShareUrl());
      }
    });

    document.getElementById("btn-sync-now")?.addEventListener("click", async () => {
      setSyncStatus("Syncing…", "busy");
      await pullIfNewer();
      if (!pendingSave && !saveInFlight) {
        setSyncStatus("Up to date", "ok");
      }
    });
  }

  function loadConfigScript() {
    return new Promise((resolve) => {
      if (window.VACATION_CONFIG) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "config.js";
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  async function bootstrap() {
    await loadConfigScript();
    bindShareUi();
    const room = getRoomFromUrl();

    if (!isConfigured()) {
      if (room) {
        showScreen("screen-setup");
        return;
      }
      window.VacationApp.initLocal();
      showScreen("app-shell");
      updateShareChrome();
      return;
    }

    supabase = initClient();
    if (!supabase) {
      showScreen("screen-setup");
      return;
    }

    if (room) {
      roomId = room.room;
      roomSecret = room.key;
      sharedMode = true;
      showScreen("app-shell");
      updateShareChrome();
      setSyncStatus("Loading…", "busy");
      try {
        await loadRemote();
        setSyncStatus("Shared budget loaded", "ok");
        startPolling();
        window.VacationApp.render();
      } catch (err) {
        alert(err.message || "Could not load shared budget.");
        showScreen("screen-welcome");
        sharedMode = false;
        roomId = null;
        roomSecret = null;
      }
      return;
    }

    window.VacationApp.initLocal();
    updateWelcomeScreen();
    showScreen("screen-welcome");
  }

  window.VacationShare = {
    bootstrap,
    isShared: () => sharedMode,
    queueSave,
    getShareUrl,
  };
})();
