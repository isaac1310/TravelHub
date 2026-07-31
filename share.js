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
  const CHECK_MS = 20 * 1000; // background poll; also check on load + tab focus
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
  let suppressPush = false;   // true while a join is applied but not yet committed
  let pendingRemoteInfo = null; // {by, at} — updates available, not yet applied
  let lastNotifiedRemoteAt = null; // toast fired for this updated_at — don't re-nag
  let lastSyncAt = null;        // ms epoch of last successful push or applied pull
  let lastEditorInfo = null;    // {by, at} of the last applied remote payload

  function isConfigured() {
    const c = window.VACATION_CONFIG;
    return Boolean(c?.supabaseUrl && c?.supabaseAnonKey);
  }

  /* Compare timestamps as epoch milliseconds, never as strings. Postgres serialises
     timestamptz as "…+00:00" while a browser produces "…Z"; comparing those two shapes
     with < / > is not chronological, and getting it wrong means a device silently stops
     seeing everyone else's changes. */
  function ts(value) {
    const n = Date.parse(value);
    return Number.isNaN(n) ? 0 : n;
  }

  /* Mobile chip mirrors the status pill in compact form. */
  function setChip(text, type) {
    const chip = document.getElementById("sync-chip");
    if (!chip) return;
    chip.hidden = false;
    const label = document.getElementById("sync-chip-text");
    if (label) {
      label.textContent =
        type === "ok" ? "✓" :
        type === "busy" ? "…" :
        type === "error" ? "!" :
        type === "pending" ? "↻" : "✓";
    }
    chip.className = "sync-chip" + (type ? ` sync-chip--${type}` : "");
    chip.title = text || "Sync now";
  }

  let statusClearTimer = null;
  function setSyncStatus(text, type) {
    setChip(text, type);
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

  /* The room id + secret are a capability token. Once they're persisted locally we
     drop them from the address bar, so no tile/geocode request leaks them in a
     Referer header and they stay out of the visible URL. The share link itself is
     still available via Copy link. (They can't live in the fragment — the app uses
     hash routing.) */
  function stripCredentialsFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("room") && !url.searchParams.has("key")) return;
    url.searchParams.delete("room");
    url.searchParams.delete("key");
    window.history.replaceState({}, "", url);
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

  /* Saves overwrite the whole document, so pushing on top of someone else's newer
     save would silently discard their work. Check first and hand the decision to
     the user. This narrows the window but can't close it — two devices can still
     pass the check at the same instant. */
  async function remoteIsAhead() {
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (error || !data?.payload) return false;
      const remoteAt = data.updated_at || "";
      if (!lastRemoteUpdatedAt || ts(remoteAt) <= ts(lastRemoteUpdatedAt)) return false;
      pendingRemoteInfo = { by: data.payload.lastEditedBy || "Someone", at: data.payload.lastEditedAt || remoteAt };
      return true;
    } catch {
      return false; // can't tell — let the save attempt proceed and report its own error
    }
  }

  /* The server caps a room at 8 MB via pg_column_size — the TOAST-compressed jsonb.
     The client can't measure that exactly (Blob measures raw JSON and over-estimates),
     so this is an early warning with a margin, not the authority. Documents are the
     only thing big enough to matter, so they're what gets left behind; the server's
     own error is still handled below in case this estimate was wrong. */
  const SIZE_WARN_BYTES = 7 * 1024 * 1024;

  function payloadWithinCap() {
    const payload = stampedPayload();
    const size = new Blob([JSON.stringify(payload)]).size;
    if (size <= SIZE_WARN_BYTES || !Array.isArray(payload.documents) || !payload.documents.length) {
      return { payload, dropped: [] };
    }
    // Keep documents on this device; sync everything else rather than nothing.
    const dropped = payload.documents.map((d) => d.name);
    return { payload: { ...payload, documents: [] }, dropped };
  }

  function isTooLarge(err) {
    return /too large|payload/i.test(String(err?.message || err?.hint || ""));
  }

  function reportTooLarge() {
    setSyncStatus("Too big to sync — remove some documents", "error");
    window.VacationApp.showSyncErrorToast?.(
      "This trip is too large to sync. Remove some attached documents (Family → Shared checklist) and it'll save again."
    );
  }

  function reportDroppedDocs(names) {
    setSyncStatus("Saved without documents", "ok");
    window.VacationApp.showSyncErrorToast?.(
      `Saved, but ${names.length} document${names.length === 1 ? "" : "s"} stayed on this device only (too large to share): ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`
    );
  }

  async function saveRemote() {
    if (!sharedMode || !supabase) return;
    clearTimeout(retryTimer);
    if (await remoteIsAhead()) {
      updateSyncDot(true);
      setSyncStatus(`${pendingRemoteInfo.by} saved changes — tap Sync before saving`, "pending");
      window.VacationApp.showUpdateToast?.(pendingRemoteInfo.by);
      return; // pendingSave stays true; the user's edits are kept locally
    }
    saveInFlight = true;
    setSyncStatus("Saving…", "busy");
    let failed = false;
    try {
      const { payload, dropped } = payloadWithinCap();
      const { data, error } = await supabase.rpc("save_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
        p_payload: payload,
      });
      if (isTooLarge(error)) {
        // The server is the authority on size; report it rather than retrying
        // forever against a wall.
        saveInFlight = false;
        reportTooLarge();
        return;
      }
      failed = Boolean(error || !data?.ok);
      if (!failed) {
        lastRemoteUpdatedAt = data.updated_at || lastRemoteUpdatedAt;
        if (dropped.length) reportDroppedDocs(dropped);
      }
    } catch (err) {
      if (isTooLarge(err)) { saveInFlight = false; reportTooLarge(); return; }
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
      // The pill is easy to miss; make a give-up visible.
      window.VacationApp.showSyncErrorToast?.("Couldn't save to the cloud — your edits are kept on this device.");
    }
  }

  function notifyLocalChange() {
    // suppressPush keeps a join local-only until the user has committed to it.
    if (!sharedMode || applyingRemote || suppressPush) return;
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
    const chipDot = document.getElementById("sync-chip-dot");
    if (chipDot) chipDot.hidden = !on;
  }

  /* Apply incoming changes automatically when nothing local is at risk, which is almost
     always. Only when this device has unsaved edits does a human need to decide, and then
     we fall back to notifying and let them tap Sync. */
  async function checkForUpdates() {
    if (!sharedMode || !supabase || saveInFlight) return false;
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (error || !data?.payload) return false;
      const remoteAt = data.updated_at || "";
      if (lastRemoteUpdatedAt && ts(remoteAt) <= ts(lastRemoteUpdatedAt)) return false;

      const by = data.payload.lastEditedBy || "Someone";

      if (!pendingSave) {
        // Safe to apply: nothing unsaved here to overwrite.
        const prev = structuredClone(window.VacationApp.getPayload());
        lastRemoteUpdatedAt = remoteAt;
        lastNotifiedRemoteAt = remoteAt;
        lastEditorInfo = { by, at: data.payload.lastEditedAt || remoteAt };
        applyRemote(data.payload);
        window.VacationApp.onRemoteChanges?.(prev, data.payload);
        pendingRemoteInfo = null;
        updateSyncDot(false);
        lastSyncAt = Date.now();
        setSyncStatus(`Updated — ${by} made changes`, "ok");
        window.VacationApp.showUpdateToast?.(by, { applied: true });
        return true;
      }

      // Unsaved local edits: don't touch them, ask for a decision.
      pendingRemoteInfo = { by, at: data.payload.lastEditedAt || remoteAt };
      updateSyncDot(true);
      setSyncStatus(`${by} made changes — tap Sync`, "pending");
      // Toast only ONCE per remote update — the dot + pill remain the quiet reminder.
      if (!lastNotifiedRemoteAt || ts(remoteAt) > ts(lastNotifiedRemoteAt)) {
        lastNotifiedRemoteAt = remoteAt;
        window.VacationApp.showUpdateToast?.(by);
      }
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  /* Sync = FRESH fetch (never a cached copy), apply if newer, THEN push.
     Pulling first matters: pushing first would send state that predates the remote
     change, and applying the remote afterwards would overwrite the local edits we
     were trying to save. Whole-document storage rules out a field-level merge, so
     order is the only protection available. */
  async function syncNow() {
    if (!sharedMode || !supabase) return;
    const btn = document.getElementById("btn-sync-now");
    if (btn) btn.disabled = true;
    setSyncStatus("Syncing…", "busy");
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (!error && data?.payload) {
        const remoteAt = data.updated_at || "";
        if (!lastRemoteUpdatedAt || ts(remoteAt) > ts(lastRemoteUpdatedAt)) {
          const prev = structuredClone(window.VacationApp.getPayload());
          lastRemoteUpdatedAt = remoteAt;
          lastNotifiedRemoteAt = remoteAt;
          lastEditorInfo = { by: data.payload.lastEditedBy || "", at: data.payload.lastEditedAt || remoteAt };
          applyRemote(data.payload);
          window.VacationApp.onRemoteChanges?.(prev, data.payload);
        }
      }
      if (pendingSave) {
        clearTimeout(saveTimer);
        clearTimeout(retryTimer);
        retryCount = 0;
        await saveRemote();
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
    /* A room holds EVERYTHING on this device, not one trip — and pressing this on a
       second device makes a separate room that will never sync with the first. Both
       facts have to be in the prompt; the old copy promised the opposite. */
    if (!confirm(
      "Put all the trips on this device into a new shared space?\n\n" +
      "You'll get a link to send to the family.\n\n" +
      "If someone already shared with you, close this and tap \"Join a shared trip\" instead — " +
      "sharing here creates a separate copy that won't sync with theirs."
    )) return;
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
      /* Seed the baseline from the SERVER's clock, not this device's. create_shared_budget
         returns only {id, secret}, so read the row back once. A device-clock baseline that
         runs ahead of the server makes every future remote change compare as "older", and
         this device silently never sees the family's edits again. */
      lastRemoteUpdatedAt = await fetchServerUpdatedAt();
      lastSyncAt = Date.now();
      stripCredentialsFromUrl();
      startUpdateChecks();
      markSavedChrome();
      updateRoomChrome();
      setSyncStatus("Saved", "ok");
      await copyLink();
    } catch (err) {
      console.error(err);
      setSyncStatus("Save failed", "error");
      btn.disabled = false;
    }
  }

  /* Read back the row's server-side updated_at. Returns null on failure, which is the
     safe value: a null baseline means "unknown", so the next check treats remote as
     newer and self-heals rather than locking this device out of updates. */
  async function fetchServerUpdatedAt() {
    try {
      const { data, error } = await supabase.rpc("fetch_shared_budget", {
        p_id: roomId,
        p_secret: roomSecret,
      });
      if (error || !data) return null;
      return data.updated_at || null;
    } catch {
      return null;
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
    updateRoomChrome(); // "Local only" until proven otherwise

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

    if (alreadyJoined) {
      // Reconnecting to our own room on a plain reload: adopt the room's copy
      // wholesale. Nothing to merge — this device's edits are already up there.
      setSyncStatus("Loading shared trip…", "busy");
      try {
        const { data, error } = await supabase.rpc("fetch_shared_budget", { p_id: room, p_secret: key });
        if (error || !data?.payload) throw new Error("Invalid or expired share link.");
        roomId = room;
        roomSecret = key;
        sharedMode = true;
        stripCredentialsFromUrl();
        lastRemoteUpdatedAt = data.updated_at || null;
        lastEditorInfo = { by: data.payload.lastEditedBy || "", at: data.payload.lastEditedAt || "" };
        applyRemote(data.payload);
        lastSyncAt = Date.now();
        markSavedChrome();
        setSyncStatus("Shared trip loaded", "ok");
        startUpdateChecks();
        updateRoomChrome();
        window.VacationApp.ensureDeviceName?.();
      } catch (err) {
        alert(err.message || "Could not load the shared trip.");
        setSyncStatus("", "");
      }
      return;
    }

    // First time on this device: merge rather than replace.
    const res = await joinRoom(room, key);
    if (!res.ok && res.reason !== "cancelled") alert(res.reason);
    if (!res.ok) {
      // Strip the params so a refresh doesn't re-prompt.
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("key");
      window.history.replaceState({}, "", url);
    }
  }

  /* Accepts a full share link, or a bare "room=…&key=…" query string. Deliberately
     NOT a short code: fetch_shared_budget needs both the id and the 64-hex secret,
     and the secret is the authorisation — there is nothing shorter to type. */
  function parseShareLink(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const read = (params) => {
      const room = params.get("room");
      const key = params.get("key");
      return room && key ? { room, key } : null;
    };
    try {
      const url = new URL(raw, window.location.origin);
      const fromUrl = read(url.searchParams);
      if (fromUrl) return fromUrl;
    } catch { /* not a URL — fall through */ }
    try {
      return read(new URLSearchParams(raw.replace(/^[?#]/, "")));
    } catch {
      return null;
    }
  }

  /* Join a room, merging what's already on this device instead of replacing it.
     Read-only until the user confirms: nothing is applied and nothing is pushed
     before that point, so a mistaken link can't touch someone else's data. */
  async function joinRoom(room, key) {
    if (!supabase) return { ok: false, reason: "Sharing isn't configured on this device." };

    if (sharedMode && roomId && roomId !== room) {
      const ok = confirm(
        `This device is synced to trip ${shortRoom(roomId)}.\n\n` +
        `Leave it and join ${shortRoom(room)} instead?`
      );
      if (!ok) return { ok: false, reason: "cancelled" };
    }

    setSyncStatus("Opening shared trip…", "busy");
    let data;
    try {
      const res = await supabase.rpc("fetch_shared_budget", { p_id: room, p_secret: key });
      if (res.error || !res.data?.payload) throw new Error("That share link didn't work — it may be mistyped or expired.");
      data = res.data;
    } catch (err) {
      setSyncStatus("", "");
      return { ok: false, reason: err.message || "Could not open the shared trip." };
    }

    /* Preview the merge before changing anything. Whole-document sync means any
       local trip we keep WILL be uploaded on the next edit, so this has to be
       asked up front — a "not now" that silently uploads later would be a lie. */
    const preview = window.VacationApp.previewMerge?.(data.payload) || { addedTrips: 0, addedItems: 0, addedOther: 0, divergedTrips: 0 };
    const localAdds = preview.addedTrips + preview.addedItems + preview.addedOther;
    if (localAdds > 0) {
      const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const bits = [];
      if (preview.addedTrips) bits.push(plural(preview.addedTrips, "trip"));
      if (preview.addedItems) bits.push(plural(preview.addedItems, "reservation"));
      if (preview.addedOther) bits.push(plural(preview.addedOther, "other item"));
      const onlyOne = bits.length === 1 && localAdds === 1;
      const ok = confirm(
        `Join this shared trip?\n\n` +
        `This device has ${bits.join(", ")} that ${onlyOne ? "isn't" : "aren't"} in it. ` +
        `Joining adds ${onlyOne ? "it" : "them"} for everyone in the family.\n\n` +
        (preview.divergedTrips
          ? `${plural(preview.divergedTrips, "trip")} also ${preview.divergedTrips === 1 ? "exists" : "exist"} in both — ` +
            `the shared version is kept, and yours stays available under "Restore my old data".`
          : "")
      );
      if (!ok) { setSyncStatus("", ""); return { ok: false, reason: "cancelled" }; }
    }

    backupBeforeJoin();

    // Apply locally with pushes suppressed, so committing to the room is a
    // separate, deliberate step below rather than a side effect of rendering.
    suppressPush = true;
    let stats;
    try {
      applyingRemote = true;
      try { stats = window.VacationApp.mergePayload(data.payload); }
      finally { applyingRemote = false; }
    } finally {
      suppressPush = false;
    }

    roomId = room;
    roomSecret = key;
    sharedMode = true;
    rememberRoom(room, key);
    stripCredentialsFromUrl();
    lastRemoteUpdatedAt = data.updated_at || null;
    lastEditorInfo = { by: data.payload.lastEditedBy || "", at: data.payload.lastEditedAt || "" };
    lastSyncAt = Date.now();
    markSavedChrome();
    startUpdateChecks();
    window.VacationApp.ensureDeviceName?.();

    // Only now, and only if this device actually contributed something.
    if (localAdds > 0) {
      pendingSave = true;
      await saveRemote();
    } else {
      setSyncStatus("Shared trip opened", "ok");
    }

    if (stats?.divergedTrips) {
      window.VacationApp.showSyncErrorToast?.(
        `${stats.divergedTrips} of your trips also exist here — the shared version is shown. Yours: Menu → Restore my old data.`
      );
    }
    updateRoomChrome();
    return { ok: true, stats };
  }

  function backupBeforeJoin() {
    try {
      const raw = localStorage.getItem("vacation-budget-planner-v1");
      if (raw) localStorage.setItem("vacation-budget-backup-before-join", raw);
    } catch { /* private mode */ }
  }

  function shortRoom(id) { return String(id || "").slice(0, 6); }

  /* Show WHICH room this device is in. Two devices side by side then reveal a
     mismatch at a glance — the failure that made "sync is broken" so hard to see. */
  function updateRoomChrome() {
    const label = sharedMode ? `Shared · ${shortRoom(roomId)}` : "Local only";
    document.querySelectorAll("[data-room-identity]").forEach((el) => {
      el.textContent = label;
      el.title = sharedMode ? `Synced to shared trip ${roomId}` : "Not shared — only on this device";
    });
    document.querySelectorAll("[data-when-shared]").forEach((el) => { el.hidden = !sharedMode; });
    document.querySelectorAll("[data-when-local]").forEach((el) => { el.hidden = sharedMode; });
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
    // Don't poll a backgrounded tab — it wastes mobile data and the visibilitychange
    // handler below catches up the moment the user returns.
    checkTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      checkForUpdates().catch(console.error);
    }, CHECK_MS);
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
    _ts: ts, // exposed for the smoke test — timestamp comparison is easy to break silently
    _parseShareLink: parseShareLink, // ditto
    getSyncInfo: () => ({ lastSyncAt, lastEditor: lastEditorInfo, updatesAvailable: !!pendingRemoteInfo }),
    getRoomId: () => (sharedMode ? roomId : null),
    getShareUrl,
    joinFromLink: async (input) => {
      const parsed = parseShareLink(input);
      if (!parsed) return { ok: false, reason: "That doesn't look like a share link. Paste the whole link you were sent." };
      return joinRoom(parsed.room, parsed.key);
    },
    startSharing: () => {
      const btn = document.getElementById("btn-share");
      return handleSaveClick(btn || document.createElement("button"));
    },
    copyLink,
    refreshChrome: updateRoomChrome,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
