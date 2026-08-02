/* TravelHub smoke test — run with ?selftest=1
 *
 * No dependencies, no build step. Every function it exercises is already a
 * top-level global in index.html's inline script.
 *
 * The bias here is deliberate: most assertions cover bugs that actually shipped
 * (see REVIEW.md). A suite that only tests what was never broken is decoration.
 *
 * Results land on window.__selftest = { pass, fail, results } so a browser agent
 * or CI can assert on them without re-implementing anything.
 */
(function () {
  "use strict";

  const results = [];
  let currentGroup = "";

  function group(name) { currentGroup = name; }

  function check(name, fn) {
    let ok = false, detail = "";
    try {
      const r = fn();
      ok = r === true || r === undefined;
      if (!ok) detail = String(r);
    } catch (err) {
      ok = false;
      detail = (err && err.message) || String(err);
    }
    results.push({ group: currentGroup, name, ok, detail });
    return ok;
  }

  /* Assertion helpers return a description on failure rather than throwing, so a
     single bad check can't abort the run and skip the restore. */
  function eq(actual, expected, label) {
    if (actual === expected) return true;
    return `${label || "value"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  function near(actual, expected, tol, label) {
    if (Math.abs(actual - expected) <= (tol == null ? 0.01 : tol)) return true;
    return `${label || "value"}: expected ~${expected}, got ${actual}`;
  }
  function truthy(v, label) {
    return v ? true : `${label || "value"}: expected truthy, got ${JSON.stringify(v)}`;
  }

  /* Some checks deliberately provoke failures the app logs via console.error.
     Left unmuted they look like real errors — and would trip a "no console errors"
     check against the deployed site. Silence only for the duration. */
  function quietly(fn) {
    const realError = console.error;
    console.error = () => {};
    try { return fn(); } finally { console.error = realError; }
  }

  /* ---------- fixtures ---------- */

  function makeTrip(over) {
    return Object.assign({
      id: "trip-test", name: "Test", year: 2026, budget: 1000,
      destination: "Paris, France", startDate: "2026-09-16", endDate: "2026-09-19",
      travelers: ["A", "B"], cover: "paris",
      expenses: [],
    }, over || {});
  }
  function makeExpense(over) {
    return Object.assign({
      id: "exp-test", label: "Thing", category: "Food", amount: 100,
      date: "2026-09-16", status: "booked", amountPaid: 0, paidDate: "",
    }, over || {});
  }

  /* ---------- the run ---------- */

  function run() {
    /* Refuse outright in a shared room. This suite stubs localStorage.setItem to
       throw and mutates `state`; if a restore failed partway through we would
       corrupt a family member's real trip data and then sync it. Not worth it. */
    if (window.VacationShare && window.VacationShare.isShared && window.VacationShare.isShared()) {
      const msg = "Self-test refused: this device is joined to a shared room. Open a local-only session to run it.";
      console.warn(msg);
      window.__selftest = { pass: 0, fail: 0, refused: true, message: msg, results: [] };
      renderPanel(msg);
      return;
    }

    const stateBackup = structuredClone(state);
    const storageBackup = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      storageBackup[k] = localStorage.getItem(k);
    }
    const realSetItem = Storage.prototype.setItem;
    const realAlert = window.alert;

    try {
      regressionGuards();
      syncTimestamps();
      buildTraceability();
      joinMerge();
      threeWayMerge();
      baselineLifecycle();
      polishV19();
      polishV191();
      releaseV110();
      releaseV1101();
      releaseV1102();
      dialogBehaviour();
      trustBoundary();
      budgetMath();
      dataSafety();
    } finally {
      Storage.prototype.setItem = realSetItem;
      window.alert = realAlert;
      state = stateBackup;
      localStorage.clear();
      Object.keys(storageBackup).forEach((k) => realSetItem.call(localStorage, k, storageBackup[k]));
      try { render(); } catch (e) { /* rendering isn't what we're testing */ }
    }

    report();
  }

  /* ===== 1. Regression guards — bugs that actually shipped ===== */

  function regressionGuards() {
    group("regression");

    check("escapeHtml escapes double quotes", () =>
      eq(escapeHtml('a"b'), "a&quot;b"));

    check("escapeHtml escapes single quotes", () =>
      eq(escapeHtml("a'b"), "a&#39;b"));

    check("escapeHtml still escapes angle brackets and ampersand", () =>
      eq(escapeHtml("<&>"), "&lt;&amp;&gt;"));

    // The real exploit shape: a shared payload breaking out of an attribute.
    check("attribute breakout produces no event handler", () => {
      const el = document.createElement("div");
      const evil = '" onmouseover="window.__xss=1';
      el.innerHTML = `<span title="${escapeHtml(evil)}">x</span>`;
      const span = el.querySelector("span");
      if (span.hasAttribute("onmouseover")) return "onmouseover attribute was injected";
      return eq(span.getAttribute("title"), evil, "title round-trip");
    });

    check("saveState survives a storage quota error", () => {
      let alerts = 0;
      const realSetItem = Storage.prototype.setItem;
      // The app warns once per session; clear the latch so a re-run isn't a false pass.
      saveFailureWarned = false;
      window.alert = () => { alerts++; };
      Storage.prototype.setItem = function () {
        const e = new Error("full"); e.name = "QuotaExceededError"; throw e;
      };
      try {
        quietly(() => { saveState(); saveState(); }); // second failure must stay quiet
      } catch (err) {
        return "saveState threw: " + err.message;
      } finally {
        // Restore immediately — leaving it stubbed would fail every later check.
        Storage.prototype.setItem = realSetItem;
      }
      return eq(alerts, 1, "alert count across two failed saves");
    });

    check("trip.year is coerced so the year filter matches", () => {
      const d = normalizeState({ trips: [makeTrip({ year: "2026" })], items: [], version: 2 });
      const y = d.trips[0].year;
      if (typeof y !== "number") return "year is " + typeof y + ", not number";
      return eq(y, 2026);
    });

    check("map canvas has non-zero width at 375px", () => {
      // Reproduces the flex-column align-items bug without resizing the window.
      const host = document.createElement("div");
      host.style.cssText = "width:375px;position:absolute;left:-9999px;top:0";
      host.innerHTML = '<div class="map-layout"><div class="map-canvas"></div><div class="map-list"></div></div>';
      document.body.appendChild(host);
      const layout = host.querySelector(".map-layout");
      layout.style.display = "flex";
      layout.style.flexDirection = "column";
      const w = host.querySelector(".map-canvas").getBoundingClientRect().width;
      host.remove();
      return w > 0 ? true : "map-canvas collapsed to 0px wide in a flex column";
    });

    check("maps tab degrades to a Retry button when Leaflet is missing", () => {
      const realL = window.L;
      try {
        delete window.L;
        const trip = state.trips[0];
        if (!trip) return "no trip available to render";
        itineraryTripId = trip.id;
        itinerarySubTab = "maps";
        renderItinerary();
        if (document.getElementById("map-canvas")) return "canvas rendered despite Leaflet being absent";
        return truthy(document.getElementById("btn-map-retry"), "retry button");
      } finally {
        if (realL) window.L = realL;
      }
    });

    check("Retry rebuilds the map once Leaflet is back", () => {
      if (typeof L === "undefined") return true; // CDN blocked; nothing to prove
      const btn = document.getElementById("btn-map-retry");
      if (btn) btn.click(); else renderItinerary();
      return truthy(document.querySelector(".leaflet-container"), "leaflet container");
    });
  }

  /* ===== 1b. Sync timestamp comparison =====
     Postgres returns "…+00:00", browsers produce "…Z". Parsing to epoch before comparing
     is the correct thing to do, though measurement showed the two forms rarely disagree
     in practice — the differing digits fall before the separator. The bug that actually
     broke device-to-device sync was seeding the baseline from the DEVICE clock; that one
     needs the two-browser test in SUPABASE-CHECK.md, not a unit check. */

  function syncTimestamps() {
    group("sync");

    const ts = window.VacationShare?._ts;

    check("timestamp helper is exposed by share.js", () =>
      typeof ts === "function" ? true : "VacationShare._ts missing — is share.js loaded?");

    if (typeof ts !== "function") return;

    check("a later server timestamp compares as newer", () =>
      ts("2026-07-31T17:41:00+00:00") > ts("2026-07-31T17:40:00.000Z")
        ? true : "later server time did not compare as newer");

    /* The one case where the two forms genuinely diverge: the same instant written
       "+00:00" vs ".000Z" is EQUAL, but as strings '+' sorts before '.', so a string
       compare invents an ordering. Harmless in today's call sites, wrong the moment
       anyone writes >= against it. */
    check("the same instant in both formats is equal, not ordered", () => {
      const pg = "2026-07-31T17:40:00+00:00";
      const js = "2026-07-31T17:40:00.000Z";
      if (ts(pg) !== ts(js)) return `parsed to different epochs: ${ts(pg)} vs ${ts(js)}`;
      return pg < js ? true : "fixture no longer demonstrates the string-ordering trap";
    });

    check("timestamp helper tolerates junk without throwing", () =>
      eq(ts(undefined), 0, "undefined") === true
      && eq(ts(""), 0, "empty") === true
      && eq(ts("not a date"), 0, "garbage") === true
        ? true : "junk input did not fall back to 0");
  }

  /* ===== 1b2. Build traceability =====
     The sidebar is display:none on mobile, so the version line that lives in it is
     invisible on a phone — the one device where a stale build hides. */

  function buildTraceability() {
    group("traceability");

    check("version label includes the release and the commit", () => {
      const label = versionLabel();
      if (!label.includes(APP_VERSION)) return `missing release name: "${label}"`;
      const commit = window.VACATION_BUILD?.commit;
      if (commit && !label.includes(commit)) return `missing commit ${commit}: "${label}"`;
      return true;
    });

    check("at least one version element is reachable outside the sidebar", () => {
      const outside = [...document.querySelectorAll("[data-app-version]")]
        .filter((el) => !el.closest(".sidebar"));
      return outside.length
        ? true
        : "every version element is inside .sidebar, which is hidden on mobile";
    });

    check("every version element is populated", () => {
      const empty = [...document.querySelectorAll("[data-app-version]")]
        .filter((el) => !el.textContent.trim());
      return empty.length ? `${empty.length} version element(s) left blank` : true;
    });
  }

  /* ===== 1b3. Join merge =====
     The rule: ADD ids the room lacks, room's version stands on a shared id, and NEVER
     rewrite an id — reservation ids are derived from expense ids (`item-${exp.id}`), so
     a rename would orphan reservations from their costs. */

  function joinMerge() {
    group("merge");

    const merge = window.VacationApp?.mergeStates;

    check("mergeStates is exposed", () =>
      typeof merge === "function" ? true : "VacationApp.mergeStates missing");

    if (typeof merge !== "function") return;

    const trip = (id, over) => Object.assign(
      { id, name: id, year: 2026, budget: 1000, destination: "", startDate: "", endDate: "",
        travelers: [], cover: "", expenses: [] }, over || {});

    check("trips the room lacks are added; shared ids are not duplicated", () => {
      const local = { trips: [trip("trip-paris-2026"), trip("trip-mine")], items: [], version: 2 };
      const room  = { trips: [trip("trip-paris-2026"), trip("trip-theirs")], items: [], version: 2 };
      const { state, stats } = merge(local, room);
      const ids = state.trips.map((t) => t.id).sort();
      if (ids.length !== new Set(ids).size) return "duplicate trip ids: " + ids.join(",");
      return eq(ids.join(","), "trip-mine,trip-paris-2026,trip-theirs", "merged ids") === true
        && eq(stats.addedTrips, 1, "addedTrips") === true
        ? true : `ids=${ids.join(",")} added=${stats.addedTrips}`;
    });

    check("on a shared id the room's version stands, and divergence is counted", () => {
      const local = { trips: [trip("trip-paris-2026", { budget: 9999 })], items: [], version: 2 };
      const room  = { trips: [trip("trip-paris-2026", { budget: 1000 })], items: [], version: 2 };
      const { state, stats } = merge(local, room);
      if (state.trips.length !== 1) return "expected exactly one Paris, got " + state.trips.length;
      return eq(state.trips[0].budget, 1000, "room budget wins") === true
        && eq(stats.divergedTrips, 1, "divergedTrips") === true
        ? true : `budget=${state.trips[0].budget} diverged=${stats.divergedTrips}`;
    });

    check("identical trips on both sides are not flagged as divergent", () => {
      const local = { trips: [trip("trip-paris-2026")], items: [], version: 2 };
      const room  = { trips: [trip("trip-paris-2026")], items: [], version: 2 };
      return eq(merge(local, room).stats.divergedTrips, 0);
    });

    // The invariant that keeps reservations attached to their costs.
    check("no id is ever rewritten by the merge", () => {
      const local = {
        trips: [trip("trip-mine", { expenses: [{ id: "exp-1", label: "Hotel", category: "Hotel", amount: 100, date: "", status: "booked", amountPaid: 0, paidDate: "" }] })],
        items: [{ id: "item-exp-1", tripId: "trip-mine", type: "hotel", title: "H", location: {} }],
        version: 2,
      };
      const room = { trips: [trip("trip-paris-2026")], items: [], version: 2 };
      const { state } = merge(local, room);
      const mine = state.trips.find((t) => t.id === "trip-mine");
      if (!mine) return "local trip was dropped";
      if (mine.expenses[0]?.id !== "exp-1") return "expense id changed to " + mine.expenses[0]?.id;
      const item = state.items.find((i) => i.id === "item-exp-1");
      if (!item) return "derived item id was rewritten or dropped";
      return eq(item.tripId, "trip-mine", "item still points at its trip");
    });

    check("money ledgers are unioned, never overwritten", () => {
      const local = { trips: [], items: [], version: 2,
        fundHistory: [{ id: "f-local", amount: 500, date: "2026-01-01" }] };
      const room  = { trips: [], items: [], version: 2,
        fundHistory: [{ id: "f-room", amount: 300, date: "2026-01-02" }] };
      const ids = merge(local, room).state.fundHistory.map((f) => f.id).sort().join(",");
      return eq(ids, "f-local,f-room");
    });

    check("currentFunds keeps local additions the room never saw", () => {
      const local = { trips: [], items: [], version: 2, currentFunds: 1500,
        fundHistory: [{ id: "f-room", amount: 1000 }, { id: "f-local", amount: 500 }] };
      const room  = { trips: [], items: [], version: 2, currentFunds: 1000,
        fundHistory: [{ id: "f-room", amount: 1000 }] };
      // room's 1000 + the 500 it never saw
      return eq(merge(local, room).state.currentFunds, 1500);
    });

    check("share links parse; junk is rejected", () => {
      const parse = window.VacationShare?._parseShareLink;
      if (typeof parse !== "function") return "VacationShare._parseShareLink missing";
      const full = parse("https://example.com/?room=abc&key=def");
      if (full?.room !== "abc" || full?.key !== "def") return "full URL not parsed: " + JSON.stringify(full);
      const bare = parse("  room=abc&key=def  ");
      if (bare?.room !== "abc") return "bare query not parsed: " + JSON.stringify(bare);
      if (parse("hello") !== null) return "junk accepted";
      if (parse("") !== null) return "empty accepted";
      if (parse("https://example.com/?room=abc") !== null) return "link missing the key was accepted";
      return true;
    });
  }

  /* ===== 1b4. Three-way merge =====
     The scenario this exists for: Moran renames a trip, Itzik changes its budget,
     neither has synced. Both edits must survive. Everything else here guards a way
     that merge could silently corrupt data instead of visibly failing. */

  function threeWayMerge() {
    group("merge3");

    const m3 = window.VacationApp?.merge3;

    check("merge3 is exposed", () =>
      typeof m3 === "function" ? true : "VacationApp.merge3 missing");

    if (typeof m3 !== "function") return;

    const trip = (id, over) => Object.assign(
      { id, name: id, year: 2026, budget: 1000, destination: "", startDate: "", endDate: "",
        travelers: [], cover: "", expenses: [] }, over || {});
    const wrap = (trips, over) => Object.assign({ trips, items: [], version: 2 }, over || {});
    const clone = (o) => JSON.parse(JSON.stringify(o));

    // THE scenario.
    check("different fields on the same trip both survive", () => {
      const base = wrap([trip("t1", { name: "Paris", budget: 1000 })]);
      const local = clone(base);  local.trips[0].budget = 2500;   // Itzik
      const remote = clone(base); remote.trips[0].name = "Paris trip"; // Moran
      const t = m3(base, local, remote).state.trips[0];
      return eq(t.budget, 2500, "Itzik's budget") === true && eq(t.name, "Paris trip", "Moran's name") === true
        ? true : `budget=${t.budget} name=${t.name}`;
    });

    check("same field changed on both sides takes the server value", () => {
      const base = wrap([trip("t1", { budget: 1000 })]);
      const local = clone(base);  local.trips[0].budget = 2500;
      const remote = clone(base); remote.trips[0].budget = 3000;
      return eq(m3(base, local, remote).state.trips[0].budget, 3000);
    });

    check("a local deletion propagates and does not resurrect", () => {
      const base = wrap([trip("t1"), trip("t2")]);
      const local = wrap([trip("t2")]);        // t1 deleted here
      const remote = clone(base);              // still present remotely, untouched
      const ids = m3(base, local, remote).state.trips.map((t) => t.id);
      return eq(ids.join(","), "t2", "t1 should stay deleted");
    });

    check("a remote deletion propagates", () => {
      const base = wrap([trip("t1"), trip("t2")]);
      const local = clone(base);
      const remote = wrap([trip("t2")]);
      return eq(m3(base, local, remote).state.trips.map((t) => t.id).join(","), "t2");
    });

    check("delete on one side vs edit on the other keeps the edit", () => {
      const base = wrap([trip("t1", { budget: 1000 })]);
      const local = wrap([]);                                    // deleted here
      const remote = clone(base); remote.trips[0].budget = 4000; // edited there
      const trips = m3(base, local, remote).state.trips;
      return eq(trips.length, 1, "kept") === true && eq(trips[0].budget, 4000, "their edit") === true
        ? true : JSON.stringify(trips.map((t) => t.id));
    });

    check("additions from both sides are kept", () => {
      const base = wrap([trip("t1")]);
      const local = wrap([trip("t1"), trip("mine")]);
      const remote = wrap([trip("t1"), trip("theirs")]);
      const ids = m3(base, local, remote).state.trips.map((t) => t.id).sort().join(",");
      return eq(ids, "mine,t1,theirs");
    });

    // trip.expenses render in raw array order, so a rebuild must not shuffle them.
    check("expense order is preserved, additions appended", () => {
      const exp = (id) => ({ id, label: id, category: "Food", amount: 10, date: "", status: "booked", amountPaid: 0, paidDate: "" });
      const base = wrap([trip("t1", { expenses: [exp("a"), exp("b"), exp("c")] })]);
      const local = clone(base);  local.trips[0].expenses.push(exp("mine"));
      const remote = clone(base); remote.trips[0].expenses.push(exp("theirs"));
      const ids = m3(base, local, remote).state.trips[0].expenses.map((e) => e.id).join(",");
      return eq(ids, "a,b,c,mine,theirs");
    });

    check("running totals apply both deltas", () => {
      const base = wrap([], { currentFunds: 1000, fundHistory: [] });
      const local = wrap([], { currentFunds: 1500, fundHistory: [{ id: "f1", amount: 500 }] });
      const remote = wrap([], { currentFunds: 1200, fundHistory: [{ id: "f2", amount: 200 }] });
      // 1000 + 500 + 200 — not 1500 and not 1200
      return eq(m3(base, local, remote).state.currentFunds, 1700);
    });

    /* trip.budget is a running total whose deltas live in rollHistory. Replaying is
       unsafe (reduceSourceBudgets clamps on tripSpent and isn't idempotent), so a
       double rollover must refuse rather than leave ledger and balances disagreeing. */
    check("a rollover on both devices is refused, not merged", () => {
      const base = wrap([trip("t1")], { rollHistory: [] });
      const local = wrap([trip("t1", { budget: 800 })], { rollHistory: [{ id: "r1", amount: 200 }] });
      const remote = wrap([trip("t1", { budget: 700 })], { rollHistory: [{ id: "r2", amount: 300 }] });
      const res = m3(base, local, remote);
      return eq(res.stats.blocked, "rollover", "blocked") === true && eq(res.state, null, "no state") === true
        ? true : JSON.stringify(res.stats);
    });

    check("a rollover on one device only still merges", () => {
      const base = wrap([trip("t1", { budget: 1000 })], { rollHistory: [] });
      const local = wrap([trip("t1", { budget: 800 })], { rollHistory: [{ id: "r1", amount: 200 }] });
      const remote = clone(base);
      const res = m3(base, local, remote);
      if (res.stats.blocked) return "blocked when it shouldn't be";
      return eq(res.state.trips[0].budget, 800, "the rolling side's budget stands");
    });

    check("reservations orphaned by a deleted trip are dropped and counted", () => {
      const item = (id, tripId) => ({ id, tripId, type: "other", title: id, location: {} });
      const base = wrap([trip("t1")], { items: [] });
      const local = wrap([trip("t1")], { items: [item("i1", "t1")] }); // added here
      const remote = wrap([], { items: [] });                          // trip deleted there
      const res = m3(base, local, remote);
      return eq(res.state.items.length, 0, "orphan dropped") === true
        && eq(res.stats.orphansDropped, 1, "counted") === true
        ? true : `items=${res.state.items.length} dropped=${res.stats.orphansDropped}`;
    });

    check("travellers removed on one side stay removed", () => {
      const base = wrap([trip("t1", { travelers: ["Itzik", "Moran"] })]);
      const local = clone(base);  local.trips[0].travelers = ["Itzik"];              // removed Moran
      const remote = clone(base); remote.trips[0].travelers = ["Itzik", "Moran", "Goni"]; // added Goni
      const t = m3(base, local, remote).state.trips[0].travelers.sort().join(",");
      return eq(t, "Goni,Itzik");
    });

    // Guards the derived item-<expenseId> linkage.
    check("merge never rewrites an id", () => {
      const item = (id, tripId) => ({ id, tripId, type: "hotel", title: "H", location: {} });
      const base = wrap([trip("t1")], { items: [item("item-exp-9", "t1")] });
      const local = clone(base);  local.trips[0].budget = 50;
      const remote = clone(base); remote.trips[0].name = "Renamed";
      const res = m3(base, local, remote).state;
      return eq(res.items[0].id, "item-exp-9", "item id") === true
        && eq(res.trips[0].id, "t1", "trip id") === true ? true : "an id was rewritten";
    });
  }

  /* ===== 1b5. Baseline lifecycle =====
     Two external reviews found five bugs in v1.8.0, none of which merge3 unit tests
     could catch: they were all about WHEN the base is written and advanced, not about
     the merge itself. These are the regression guards. */

  function baselineLifecycle() {
    group("lifecycle");

    const m3 = window.VacationApp?.merge3;
    if (typeof m3 !== "function") { check("merge3 available", () => "missing"); return; }

    const trip = (id, over) => Object.assign(
      { id, name: id, year: 2026, budget: 1000, destination: "", startDate: "", endDate: "",
        travelers: [], cover: "", expenses: [] }, over || {});
    const wrap = (trips, over) => Object.assign({ trips, items: [], version: 2 }, over || {});
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const doc = (id) => ({ id, name: id + ".pdf", type: "application/pdf", size: 10,
      dataUrl: "data:application/pdf;base64,AAAA", uploadedAt: "" });

    /* #1 — the reviewer's reproduction. Merge, push FAILS so the base stays at the
       remote we fetched, then a newer remote arrives. The merged local edit must
       survive; if the base had been promoted to the merged state it would revert. */
    check("a merged edit survives a failed push and a later remote update", () => {
      const base0 = wrap([trip("t1", { budget: 100 })]);
      const local = clone(base0); local.trips[0].budget = 200;   // my unsent edit
      const remote1 = clone(base0); remote1.trips[0].name = "Renamed";
      const merged = m3(base0, local, remote1).state;
      if (merged.trips[0].budget !== 200) return "first merge lost the edit";

      // Push failed → base is remote1 (what the server actually has), not `merged`.
      const remote2 = clone(remote1); remote2.trips[0].destination = "Rome";
      const after = m3(remote1, merged, remote2).state;
      return eq(after.trips[0].budget, 200, "budget after second merge");
    });

    /* #3 — deletions of attachments must stick, and not be re-uploaded.
       The base MUST be built the way share.js really stores and rehydrates it:
       persisted as `{id}` only (no body), then bodies restored from the remote. A
       remotely-deleted document has no body to restore, so it stays a bare `{id}` and
       compares as "changed" against the local full copy — which is precisely how the
       deletion used to be undone. Testing with full bodies in the base hides the bug. */
    const storedBase = (payload) => ({ ...payload, documents: (payload.documents || []).map((d) => ({ id: d.id })) });
    const rehydrate = (base, remote) => {
      const known = new Map((remote.documents || []).map((d) => [d.id, d]));
      return { ...base, documents: (base.documents || []).map((d) => known.get(d.id) || { id: d.id }) };
    };

    check("a document deleted remotely stays deleted", () => {
      const agreed = wrap([], { documents: [doc("d1"), doc("d2")] });
      const local = clone(agreed);                         // untouched, still holds both
      const remote = wrap([], { documents: [doc("d1")] }); // d2 deleted there
      const base0 = rehydrate(storedBase(agreed), remote); // d2 has no body to restore
      const ids = m3(base0, local, remote).state.documents.map((d) => d.id).join(",");
      return eq(ids, "d1", "d2 must not resurrect");
    });

    check("a document added locally still survives a merge", () => {
      const agreed = wrap([], { documents: [doc("d1")] });
      const local = wrap([], { documents: [doc("d1"), doc("mine")] });
      const remote = clone(agreed);
      const base0 = rehydrate(storedBase(agreed), remote);
      const ids = m3(base0, local, remote).state.documents.map((d) => d.id).sort().join(",");
      return eq(ids, "d1,mine");
    });

    /* #4 — an expense-only change counts as editing the trip, so a concurrent trip
       delete must not silently take the expense with it. */
    check("deleting a trip loses to an expense added on the other device", () => {
      const exp = (id) => ({ id, label: id, category: "Food", amount: 10, date: "",
        status: "booked", amountPaid: 0, paidDate: "" });
      const base0 = wrap([trip("t1", { expenses: [] })]);
      const local = wrap([]);                                       // trip deleted here
      const remote = clone(base0); remote.trips[0].expenses.push(exp("e1")); // expense added there
      const res = m3(base0, local, remote).state;
      if (res.trips.length !== 1) return `trip was dropped (${res.trips.length} trips)`;
      return eq(res.trips[0].expenses.length, 1, "the expense survived");
    });

    check("a genuinely untouched trip is still deleted", () => {
      const base0 = wrap([trip("t1"), trip("t2")]);
      const local = wrap([trip("t2")]);
      const remote = clone(base0);
      return eq(m3(base0, local, remote).state.trips.map((t) => t.id).join(","), "t2");
    });

    // The base must never carry document bodies — localStorage has no room for them.
    check("the stored base strips document bodies", () => {
      const big = "data:application/pdf;base64," + "A".repeat(300000);
      const payload = wrap([], { documents: [{ id: "d1", name: "big.pdf", size: 1, dataUrl: big }] });
      const shaped = { ...payload, documents: (payload.documents || []).map((d) => ({ id: d.id })) };
      const bytes = JSON.stringify(shaped).length;
      if (JSON.stringify(shaped).includes("AAAA")) return "document body leaked into the base";
      return bytes < 50000 ? true : `base is ${bytes} bytes, expected well under 50KB`;
    });
  }

  /* ===== 1b5. v1.9.0 — pins, Maps links, bidi ===== */

  function polishV19() {
    group("v1.9.0");

    check("gmapsLink uses coordinates when the stop is geocoded", () => {
      const item = { title: "Hotel Ibis", location: { name: "Hotel Ibis", lat: 48.8629, lng: 2.3364 } };
      const url = gmapsLink(item, { destination: "Paris, France" });
      if (!url.includes("48.8629,2.3364")) return "did not use coordinates: " + url;
      return url.includes("Ibis") ? "still searching by name: " + url : true;
    });

    check("gmapsLink falls back to a name search without coordinates", () => {
      const item = { title: "Somewhere", location: { name: "Le Comptoir", lat: null, lng: null } };
      const url = gmapsLink(item, { destination: "Paris" });
      return url.includes("Le%20Comptoir") || url.includes("Le+Comptoir")
        ? true : "name missing from fallback: " + url;
    });

    /* The bug this replaced: letters[idx % 26] gave stop 27 a second "A", on both
       the map and the list, with nothing to tell them apart. */
    check("stop numbers restart each day and never duplicate within one", () => {
      const trip = state.trips.find((t) => t.startDate && t.endDate);
      if (!trip) return true; // nothing dated to render
      itineraryTripId = trip.id;
      itinerarySubTab = "maps";
      mapDayFilter = "all";
      renderItinerary();
      const byDay = new Map();
      let currentDay = null;
      document.querySelectorAll("#itinerary-view .map-day-head, #itinerary-view .mapstop__pin").forEach((el) => {
        if (el.classList.contains("map-day-head")) { currentDay = el.textContent; byDay.set(currentDay, []); return; }
        if (el.classList.contains("mapstop__pin--hotel")) return;
        if (currentDay) byDay.get(currentDay).push(el.textContent.trim());
      });
      for (const [day, labels] of byDay) {
        if (!labels.length) continue;
        if (new Set(labels).size !== labels.length) return `duplicate stop number on ${day}: ${labels.join(",")}`;
        if (labels[0] !== "1") return `${day} starts at ${labels[0]}, not 1`;
        if (labels.some((l) => !/^\d+$/.test(l))) return `non-numeric label on ${day}: ${labels.join(",")}`;
      }
      return true;
    });

    check("map pins carry the same labels as the list rows", () => {
      if (typeof L === "undefined") return true; // CDN blocked
      const rows = [...document.querySelectorAll("#itinerary-view .mapstop__pin")]
        .filter((el) => !el.classList.contains("mapstop__pin--hotel"))
        .filter((el) => !el.classList.contains("mapstop__pin--nogeo"))
        .map((el) => el.textContent.trim());
      const pins = [...document.querySelectorAll(".map-pin")]
        .filter((el) => !el.classList.contains("map-pin--hotel"))
        .map((el) => el.textContent.trim());
      if (!pins.length) return true; // nothing geocoded in the seed data
      return eq(pins.join(","), rows.join(","), "pin labels vs row labels");
    });

    check("user text picks its own direction, times and codes stay LTR", () => {
      const probe = document.createElement("div");
      probe.innerHTML = '<span class="act__title">x</span><span class="act__time">08:30</span><span class="ltr">TO3450</span>';
      document.body.appendChild(probe);
      // Read the values out while the probe is still in the document — a detached
      // element's computed style is empty, which silently fails every assertion.
      const title = getComputedStyle(probe.querySelector(".act__title")).unicodeBidi;
      const timeDir = getComputedStyle(probe.querySelector(".act__time")).direction;
      const codeBidi = getComputedStyle(probe.querySelector(".ltr")).unicodeBidi;
      probe.remove();
      if (title !== "plaintext") return `.act__title unicode-bidi is "${title}", expected plaintext`;
      if (timeDir !== "ltr") return `.act__time direction is "${timeDir}", expected ltr`;
      if (!/isolate/.test(codeBidi)) return `.ltr unicode-bidi is "${codeBidi}", expected isolate`;
      return true;
    });

    check("text inputs accept Hebrew with auto direction", () => {
      const missing = [...document.querySelectorAll('input[type="text"], textarea')]
        .filter((el) => el.getAttribute("dir") !== "auto");
      return missing.length ? `${missing.length} input(s) without dir="auto"` : true;
    });

    check("the itinerary screen offers a trip edit", () => {
      const trip = state.trips.find((t) => t.startDate && t.endDate);
      if (!trip) return true;
      itineraryTripId = trip.id;
      renderItinerary();
      // Scope to the itinerary screen — the Trips hero has its own edit button.
      const container = document.getElementById("itinerary-view")?.parentElement;
      return truthy(container?.querySelector("[data-edit-trip]"), "edit-trip button on the itinerary screen");
    });
  }

  /* ===== 1b6. v1.9.1 — shared numbering, folds, touch ===== */

  function polishV191() {
    group("v1.9.1");

    const datedTrip = () => state.trips.find((t) => t.startDate && t.endDate);

    check("the timeline badge is the same number as the map pin", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      const isos = eachDay(trip).map(isoOf);
      for (const iso of isos) {
        const numbers = stopNumbers(trip, iso);
        if (!numbers.size) continue;
        // Rebuild the map side for this day and compare against the shared source.
        const mapped = itemsForDay(trip, iso).filter(isMappable).map((e) => numbers.get(e.item.id));
        const expected = mapped.map((_, i) => String(i + 1));
        if (mapped.join(",") !== expected.join(",")) {
          return `${iso}: numbering is ${mapped.join(",")}, expected ${expected.join(",")}`;
        }
      }
      return true;
    });

    check("only mappable reservations are numbered", () => {
      const trip = datedTrip();
      if (!trip) return true;
      for (const iso of eachDay(trip).map(isoOf)) {
        const numbers = stopNumbers(trip, iso);
        for (const e of itemsForDay(trip, iso)) {
          const numbered = numbers.has(e.item.id);
          if (numbered !== Boolean(isMappable(e))) {
            return `${e.item.type}${e.checkout ? " (checkout)" : ""} numbered=${numbered}`;
          }
        }
      }
      return true;
    });

    check("numbering ignores the day filter", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = eachDay(trip).map(isoOf)[0];
      const before = [...stopNumbers(trip, iso).entries()].join("|");
      const prev = mapDayFilter;
      mapDayFilter = iso;
      const during = [...stopNumbers(trip, iso).entries()].join("|");
      mapDayFilter = prev;
      return eq(during, before, "numbers changed with the filter");
    });

    /* The fold is per-device UI state. If it ever reached `state`, saveState()
       would call notifyLocalChange() and push it to the whole family. */
    check("collapsing a day never touches the synced payload", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      const iso = eachDay(trip).map(isoOf)[0];
      const before = JSON.stringify(window.VacationApp.getPayload());
      collapsedDays.add(iso);
      renderItinerary();
      const after = JSON.stringify(window.VacationApp.getPayload());
      collapsedDays.delete(iso);
      renderItinerary();
      return eq(after, before, "payload changed when a day was collapsed");
    });

    check("a collapsed day hides its items but keeps its date", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      const iso = eachDay(trip).map(isoOf)[0];
      collapsedDays.add(iso);
      renderItinerary();
      const el = document.getElementById(`day-${iso}`);
      const hasItems = !!el?.querySelector(".day__items");
      const toggle = el?.querySelector("[data-day-toggle]");
      const expanded = toggle?.getAttribute("aria-expanded");
      collapsedDays.delete(iso);
      renderItinerary();
      if (hasItems) return "items still rendered while collapsed";
      if (!toggle) return "no toggle button on the day";
      return eq(expanded, "false", "aria-expanded while collapsed");
    });

    check("the day toggle is a real button, focusable and labelled", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      renderItinerary();
      const toggle = document.querySelector("[data-day-toggle]");
      if (!toggle) return "no day toggle rendered";
      if (toggle.tagName !== "BUTTON") return `toggle is a <${toggle.tagName.toLowerCase()}>, not a button`;
      return truthy(toggle.getAttribute("aria-label"), "aria-label");
    });

    check("notes are open when adding, folded on a bare mobile edit", () => {
      const more = document.getElementById("item-more");
      if (!more) return "disclosure not found";
      const trip = datedTrip();
      if (!trip) return true;
      openItemDialog(trip.id, null);           // add
      const onAdd = more.open;
      closeDialog(document.getElementById("dialog-item"));
      const bare = state.items.find((i) => !i.confirmation && !i.notes);
      let onEdit = null;
      if (bare) {
        openItemDialog(trip.id, bare);
        onEdit = more.open;
        closeDialog(document.getElementById("dialog-item"));
      }
      if (!onAdd) return "notes folded when adding";
      // On desktop the disclosure is open regardless; only assert the mobile rule.
      if (bare && window.innerWidth <= 900 && onEdit) return "notes open on a bare edit at mobile width";
      return true;
    });

    check("interactive controls meet the 44px touch target", () => {
      const probe = document.createElement("div");
      probe.innerHTML = '<button class="btn">a</button><button class="btn btn--small">b</button><button class="icon-btn">c</button>';
      document.body.appendChild(probe);
      const sizes = [...probe.children].map((el) => {
        const cs = getComputedStyle(el);
        return { cls: el.className, h: parseFloat(cs.minHeight) || parseFloat(cs.height) };
      });
      probe.remove();
      const small = sizes.filter((s) => s.h < 44);
      return small.length ? small.map((s) => `${s.cls}=${s.h}px`).join(", ") : true;
    });
  }

  /* ===== 1b7. v1.10.0 — destinations, covers, answer card ===== */

  function releaseV110() {
    group("v1.10.0");

    const wrap = (t) => ({ trips: [t], items: [], version: 2 });
    const base = (over) => Object.assign(
      { id: "t1", name: "T", year: 2026, budget: 100, startDate: "", endDate: "", travelers: [], cover: "", expenses: [] },
      over || {});

    check("a legacy destination string migrates to a one-item list", () => {
      const t = normalizeState(wrap(base({ destination: "Paris, France" }))).trips[0];
      return eq(JSON.stringify(t.destinations), '["Paris, France"]');
    });

    check("destination stays mirrored from the first entry", () => {
      const t = normalizeState(wrap(base({ destinations: ["Paris, France", "Lyon, France"] }))).trips[0];
      return eq(t.destination, "Paris, France");
    });

    check("blank destination rows are dropped", () => {
      const t = normalizeState(wrap(base({ destinations: [" Paris, France ", "", "  ", "Lyon, France"] }))).trips[0];
      return eq(JSON.stringify(t.destinations), '["Paris, France","Lyon, France"]');
    });

    /* migrateToV2 writes trip.destination after the trips are normalised, so a
       list that's merely empty must still recover from the mirror. */
    check("an empty list recovers from the mirror", () => {
      const t = normalizeState(wrap(base({ destinations: [], destination: "Rome, Italy" }))).trips[0];
      return eq(JSON.stringify(t.destinations), '["Rome, Italy"]');
    });

    check("normalising twice is not lossy", () => {
      const once = normalizeState(wrap(base({ destinations: ["Paris, France", "Lyon, France"] })));
      const twice = normalizeState(JSON.parse(JSON.stringify(once)));
      return eq(JSON.stringify(twice.trips[0].destinations), '["Paris, France","Lyon, France"]');
    });

    check("the trip title still uses the first city", () => {
      const t = normalizeState(wrap(base({ name: "Euro trip", destinations: ["Paris, France", "Lyon, France"] }))).trips[0];
      return eq(nameWithCity(t), "Euro trip · Paris");
    });

    check("geocoding biases across every destination", () => {
      const t = normalizeState(wrap(base({ destinations: ["Paris, France", "Lyon, France"] }))).trips[0];
      return eq(JSON.stringify(tripCities(t)), '["Paris","Lyon"]');
    });

    /* Arrays compare by reference, so a plain !== would flag a change on every
       sync and bury the real ones. */
    check("an unchanged destination list reports no diff", () => {
      const a = ["Paris, France", "Lyon, France"];
      const b = ["Paris, France", "Lyon, France"];
      return JSON.stringify(a) === JSON.stringify(b) ? true : "identical lists compared unequal";
    });

    /* The three generated-cover checks that lived here were removed in v1.10.1:
       coverFor() no longer exists. Monuments are covered in the v1.10.1 group. */
    check("the budget lead number equals still-to-pay", () => {
      const lead = document.querySelector(".answer-card__value");
      if (!lead) return true; // budget screen not rendered in this pass
      const { totalDue } = totalsForTrips(tripsForFilter());
      return eq(lead.textContent.trim(), formatMoney(totalDue));
    });

    check("still-to-pay is not repeated in the tile grid", () => {
      const labels = [...document.querySelectorAll("#global-stats .stat__label")].map((l) => l.textContent);
      if (!labels.length) return true;
      return labels.some((l) => /Still to pay/i.test(l)) ? "still-to-pay is both the lead and a tile" : true;
    });
  }

  /* ===== 1b8. v1.10.1 — ordering, fold, selected day, monuments ===== */

  function releaseV1101() {
    group("v1.10.1");

    const datedTrip = () => state.trips.find((t) => t.startDate && t.endDate);

    const mkItem = (id, iso, tripId, over) => Object.assign({
      id, tripId, type: "attraction", title: id, details: "", flightNo: "",
      date: iso, endDate: "", startTime: "", endTime: "",
      location: { name: id }, confirmation: "", notes: "",
    }, over || {});

    /* Untimed items used to tie at the 1440 time-default and be separated only by
       localeCompare on a random id, so they shuffled. */
    check("untimed additions keep the order they were added", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = [];
        const added = ["first", "second", "third"].map((n) => {
          const it = normalizeItem(mkItem(n, iso, trip.id));
          it.sortIndex = nextDayPosition(trip.id, iso);
          state.items.push(it);
          return n;
        });
        const shown = itemsForDay(trip, iso).map((e) => e.item.title);
        return eq(shown.join(","), added.join(","), "render order vs insertion order");
      } finally { state.items = keep; }
    });

    check("a timed addition still sorts by time, not to the end", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = [];
        const late = normalizeItem(mkItem("untimed", iso, trip.id));
        late.sortIndex = nextDayPosition(trip.id, iso);
        state.items.push(late);
        state.items.push(normalizeItem(mkItem("early", iso, trip.id, { startTime: "08:00" })));
        return eq(itemsForDay(trip, iso).map((e) => e.item.title).join(","), "early,untimed");
      } finally { state.items = keep; }
    });

    /* handleItemSubmit rebuilds the item from the form, which carries no
       sortIndex — so Object.assign was resetting it and every edit undid a
       reorder. */
    check("editing an item preserves its manual position", () => {
      const original = normalizeItem(mkItem("x", "2026-09-16", "t"));
      original.sortIndex = 1465;
      const rebuilt = normalizeItem({ ...original, title: "renamed" });
      rebuilt.sortIndex = original.sortIndex; // the fix
      Object.assign(original, rebuilt);
      return eq(original.sortIndex, 1465);
    });

    check("the untimed migration is deterministic and idempotent", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const payload = () => ({
        trips: [{ ...trip, expenses: [] }],
        items: ["zc", "za", "zb"].map((n) => mkItem(n, iso, trip.id, { sortIndex: 0 })),
        version: 2,
      });
      const a = normalizeState(payload());
      const b = normalizeState(payload());
      const key = (s) => JSON.stringify(s.items.map((i) => [i.id, i.sortIndex]).sort());
      if (key(a) !== key(b)) return "two devices produced different positions";
      const again = normalizeState(JSON.parse(JSON.stringify(a)));
      if (key(again) !== key(a)) return "re-running the migration changed the positions";
      return a.items.every((i) => i.sortIndex > 0) ? true : "an item was left unpositioned";
    });

    check("the date strip selects a day without unfolding it", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      const iso = eachDay(trip).map(isoOf)[0];
      collapsedDays.add(iso);
      renderItinerary();
      document.querySelector(`[data-strip-day="${iso}"]`)?.click();
      const stillFolded = collapsedDays.has(iso);
      const selected = timelineDayIso === iso;
      collapsedDays.delete(iso);
      renderItinerary();
      if (!stillFolded) return "tapping the chip unfolded the day";
      return selected ? true : "the chip did not become the selected day";
    });

    check("the active chip survives a re-render", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      timelineDayIso = eachDay(trip).map(isoOf)[1];
      renderItinerary();
      const active = document.querySelector(".daychip.is-active")?.getAttribute("data-strip-day");
      return eq(active, timelineDayIso, "active chip after render");
    });

    check("a new reservation defaults to the selected day", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const isos = eachDay(trip).map(isoOf);
      const prevSub = itinerarySubTab, prevMap = mapDayFilter, prevDay = timelineDayIso;
      try {
        itinerarySubTab = "timeline"; mapDayFilter = "all"; timelineDayIso = isos[2];
        if (defaultAddDate(isos) !== isos[2]) return "timeline selection ignored";
        itinerarySubTab = "maps"; mapDayFilter = isos[1];
        if (defaultAddDate(isos) !== isos[1]) return "maps day filter ignored";
        timelineDayIso = null; mapDayFilter = "all"; itinerarySubTab = "timeline";
        return isos.includes(defaultAddDate(isos)) ? true : "fallback returned a date outside the trip";
      } finally { itinerarySubTab = prevSub; mapDayFilter = prevMap; timelineDayIso = prevDay; }
    });

    check("a monument is chosen per city, with a fallback", () => {
      const t = (d) => ({ name: "x", destination: d, destinations: [d] });
      const paris = monumentFor(t("Paris, France"));
      if (paris !== monumentFor(t("PARIS, France"))) return "matching is case sensitive";
      if (paris === monumentFor(t("Rome, Italy"))) return "two cities share one monument";
      if (monumentFor(t("Pressburg")) !== monumentFor(t("Bratislava"))) return "alias not matched";
      const unknown = monumentFor(t("Nowhere, Atlantis"));
      return unknown === MONUMENTS.generic ? true : "an unknown city did not fall back";
    });

    check("cover art is inline, right-aligned and never stretched", () => {
      const art = coverArt({ name: "x", destinations: ["Paris, France"] });
      if (/https?:\/\//.test(art)) return "cover art fetches something remote";
      if (!/preserveAspectRatio="xMaxYMax meet"/.test(art)) return "aspect ratio would stretch the monument";
      return /<svg/.test(art) ? true : "cover art is not an svg";
    });

    check("the carousel is gone and the day list is not truncated", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "maps";
      mapDayFilter = eachDay(trip).map(isoOf)[0];
      renderItinerary();
      const reel = document.querySelector(".stopreel");
      const collapsed = document.getElementById("map-list")?.classList.contains("map-list--collapsed");
      mapDayFilter = "all";
      if (reel) return "the carousel is still rendered";
      return collapsed ? "the list is still collapsed for a selected day" : true;
    });
  }

  /* ===== 1b9. v1.10.2 — tap a card to edit, press and hold to drag ===== */

  function releaseV1102() {
    group("v1.10.2");

    const datedTrip = () => state.trips.find((t) => t.startDate && t.endDate);

    const mk = (id, iso, tripId, over) => Object.assign({
      id, tripId, type: "attraction", title: id, details: "", flightNo: "",
      date: iso, endDate: "", startTime: "", endTime: "",
      location: { name: id }, confirmation: "", notes: "", sortIndex: 0,
    }, over || {});

    /* The card carried no item id at all before v1.10.2, so a delegated tap
       handler had nothing to read. This is the precondition for both features. */
    check("timeline cards expose their item id", () => {
      const trip = datedTrip();
      if (!trip) return true;
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      renderItinerary();
      const cards = [...document.querySelectorAll("#itinerary-body .act")];
      if (!cards.length) return true;
      const real = cards.filter((c) => !c.classList.contains("act--add"));
      if (!real.length) return true;
      return real.every((c) => c.hasAttribute("data-item")) ? true : "a reservation card has no data-item";
    });

    /* "Add reservation" is itself an .act. A blanket closest(".act") handler
       would hijack it, so it must never carry an item id. */
    check("the add button is not a tap-to-edit target", () => {
      const adds = [...document.querySelectorAll("#itinerary-body .act--add")];
      return adds.every((a) => !a.hasAttribute("data-item")) ? true : "act--add carries data-item";
    });

    check("check-out rows are marked and not draggable", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const keep = state.items;
      try {
        state.items = [
          mk("v2-hotel", trip.startDate, trip.id, {
            type: "hotel", title: "Hotel", endDate: trip.endDate, endTime: "11:00",
          }),
        ];
        itineraryTripId = trip.id;
        renderItinerary();
        const co = document.querySelector("#itinerary-body .act--checkout");
        if (!co) return "no check-out row rendered";
        if (!co.hasAttribute("data-item")) return "the check-out row is not tappable";
        // The drag handler selects on :not(.act--checkout) — this class is the guard.
        return co.matches(".act[data-item]:not(.act--checkout)")
          ? "the check-out row would still lift" : true;
      } finally {
        state.items = keep;
        renderItinerary();
      }
    });

    /* placeItemAtIndex is the drop. Index counts slots in the day EXCLUDING the
       item being moved, so 0 means first. */
    check("a drop lands the item at the target slot", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = ["a", "b", "c", "d"].map((id, i) =>
          mk(id, iso, trip.id, { sortIndex: 1450 + i * 10 })
        );
        // Move "a" (first) to slot 2 of the remaining [b, c, d] → b, c, a, d.
        if (!placeItemAtIndex(trip, "a", 2)) return "placeItemAtIndex reported no change";
        const order = itemsForDay(trip, iso).map((e) => e.item.id);
        return order.join(",") === "b,c,a,d" ? true : "order is " + order.join(",");
      } finally { state.items = keep; }
    });

    check("a drop leaves the other items' relative order intact", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = ["a", "b", "c", "d", "e"].map((id, i) =>
          mk(id, iso, trip.id, { sortIndex: 1450 + i * 10 })
        );
        placeItemAtIndex(trip, "d", 0);
        const order = itemsForDay(trip, iso).map((e) => e.item.id);
        return order.join(",") === "d,a,b,c,e" ? true : "order is " + order.join(",");
      } finally { state.items = keep; }
    });

    /* Every untimed item migrated to 1450 + 10n in v1.10.1, and a midpoint
       between two equal keys wouldn't move at all. moveItemInDay nudges; so must this. */
    check("a drop between equal sort keys still moves the item", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        /* Four equal keys, dropping into slot 1 — the only shape that puts an
           equal key on BOTH sides, so the midpoint lands back on the item's own
           value. Slot 0 and the last slot take the /2 and +10 branches instead
           and would pass without the nudge. Fractional indices can't honour the
           exact slot when every neighbour ties; moving at all is the contract. */
        state.items = ["a", "b", "c", "d"].map((id) => mk(id, iso, trip.id, { sortIndex: 1450 }));
        const before = itemsForDay(trip, iso).map((e) => e.item.id).join(",");
        placeItemAtIndex(trip, "a", 1);
        const after = itemsForDay(trip, iso).map((e) => e.item.id).join(",");
        return after !== before ? true : "the item did not move (" + after + ")";
      } finally { state.items = keep; }
    });

    check("a drop past the end appends rather than overflowing the day", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = ["a", "b", "c"].map((id, i) => mk(id, iso, trip.id, { sortIndex: 1450 + i * 10 }));
        placeItemAtIndex(trip, "a", 99);
        const order = itemsForDay(trip, iso).map((e) => e.item.id);
        const moved = state.items.find((i) => i.id === "a");
        if (moved.date !== iso) return "the drop changed the item's day";
        return order.join(",") === "b,c,a" ? true : "order is " + order.join(",");
      } finally { state.items = keep; }
    });

    /* A drag is confined to its own day: the drop never touches item.date. */
    check("a drop never moves an item to another day", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const keep = state.items;
      try {
        state.items = [
          mk("a", trip.startDate, trip.id, { sortIndex: 1450 }),
          mk("z", trip.endDate, trip.id, { sortIndex: 1450 }),
        ];
        placeItemAtIndex(trip, "a", 99);
        return state.items.find((i) => i.id === "a").date === trip.startDate
          ? true : "the item changed day";
      } finally { state.items = keep; }
    });

    check("sort keys stay positive", () => {
      const trip = datedTrip();
      if (!trip) return true;
      const iso = trip.startDate;
      const keep = state.items;
      try {
        state.items = ["a", "b"].map((id, i) => mk(id, iso, trip.id, { sortIndex: 0.02 + i * 0.01 }));
        placeItemAtIndex(trip, "b", 0);
        return state.items.every((i) => i.sortIndex > 0) ? true : "a sortIndex hit zero or below";
      } finally { state.items = keep; }
    });

    /* The lifted card is position:fixed against the viewport. A later @media block
       sets `.act { position: relative }` at the same specificity — which silently won
       until the rule was doubled to `.act.act--lifted`. The data assertions all still
       passed while the card rendered in the wrong place, so this is checked directly. */
    check("a lifted card is positioned against the viewport, above the FAB", () => {
      const probe = document.querySelector("#itinerary-body .act[data-item]");
      if (!probe) return true;
      probe.classList.add("act--lifted");
      const cs = getComputedStyle(probe);
      const pos = cs.position;
      const z = Number(cs.zIndex);
      probe.classList.remove("act--lifted");
      if (pos !== "fixed") return "position is " + pos + ", not fixed";
      return z > 35 ? true : "z-index " + z + " does not clear the FAB";
    });

    check("the gesture handlers are bound to the static container", () => {
      renderItinerary();
      const body = document.getElementById("itinerary-body");
      if (!body) return true;
      const before = body.dataset.gesturesBound;
      renderItinerary();
      // Binding is idempotent: a re-render must not stack a second set of listeners.
      return before === "1" && body.dataset.gesturesBound === "1"
        ? true : "gestures are not bound exactly once";
    });

    /* Drag is pointer-only. The buttons are the keyboard and assistive path and
       were explicitly kept — losing them would strand keyboard users. */
    check("the move up/down buttons survive", () => {
      renderItinerary();
      return document.querySelector("#itinerary-body [data-move-item]")
        ? true : "the move buttons are gone";
    });
  }

  /* ===== 1c. Dialog dismissal =====
     Tapping outside must close a dialog, but must NOT discard half-typed input. */

  function dialogBehaviour() {
    group("dialogs");

    // Synthesise the backdrop tap: a real pointerdown+click whose target is the
    // dialog itself, which is what the browser reports for a backdrop hit.
    function backdropTap(dialog) {
      dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    check("backdrop tap closes a dialog with no form input", () => {
      const dlg = document.getElementById("dialog-changes"); // no form
      if (!dlg) return "dialog-changes not found";
      openDialog(dlg);
      if (!dlg.open) return "dialog did not open";
      backdropTap(dlg);
      const closed = !dlg.open;
      if (dlg.open) closeDialog(dlg);
      return closed ? true : "dialog stayed open after backdrop tap";
    });

    check("a click on dialog CONTENT does not close it", () => {
      const dlg = document.getElementById("dialog-changes");
      openDialog(dlg);
      const child = dlg.querySelector("*");
      if (!child) { closeDialog(dlg); return "no child element to click"; }
      dlg.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const stillOpen = dlg.open;
      closeDialog(dlg);
      return stillOpen ? true : "content click closed the dialog";
    });

    check("backdrop tap does NOT discard a half-filled form", () => {
      const dlg = document.getElementById("dialog-trip");
      const form = dlg?.querySelector("form");
      if (!form) return "dialog-trip form not found";
      openDialog(dlg);
      const field = form.querySelector('input[name="name"], input[type="text"]');
      if (!field) { closeDialog(dlg); return "no text field to dirty"; }
      const original = field.value;
      field.value = "half typed trip name";
      backdropTap(dlg);
      const stayedOpen = dlg.open;
      field.value = original;
      if (dlg.open) closeDialog(dlg);
      return stayedOpen ? true : "dialog closed and discarded typed input";
    });
  }

  /* ===== 2. Trust boundary — everything a shared payload controls ===== */

  function trustBoundary() {
    group("trust-boundary");

    check("ids are restricted to a safe charset", () =>
      eq(safeId('a"b<c>d e/f'), "a_b_c_d_e_f"));

    check("id sanitising keeps tripId references resolvable", () => {
      const d = normalizeState({
        trips: [makeTrip({ id: "trip a/b" })],
        items: [{ id: "item 1", tripId: "trip a/b", type: "hotel", title: "H", location: {} }],
        version: 2,
      });
      return eq(d.items[0].tripId, d.trips[0].id, "item.tripId -> trip.id");
    });

    check("traveler entries are coerced to strings", () => {
      const d = normalizeState({ trips: [makeTrip({ travelers: [1, null, { toString: () => "x" }] })], items: [], version: 2 });
      return d.trips[0].travelers.every((t) => typeof t === "string")
        ? true : "non-string traveler survived: " + JSON.stringify(d.trips[0].travelers);
    });

    check("unknown item type clamps to 'other'", () => {
      const d = normalizeState({
        trips: [makeTrip()],
        items: [{ id: "i1", tripId: "trip-test", type: "<script>", title: "T", location: {} }],
        version: 2,
      });
      return eq(d.items[0].type, "other");
    });

    check("unknown expense category clamps to 'Other'", () =>
      eq(normalizeCategory("<img onerror=x>"), "Other"));

    check("documents with a non-data URL are dropped", () => {
      const d = normalizeState({
        trips: [makeTrip()], items: [], version: 2,
        documents: [
          { id: "d1", name: "evil", dataUrl: "javascript:alert(1)" },
          { id: "d2", name: "ok", dataUrl: "data:application/pdf;base64,AAA" },
        ],
      });
      if (d.documents.length !== 1) return "expected 1 surviving document, got " + d.documents.length;
      return eq(d.documents[0].id, "d2");
    });

    check("malformed payload does not throw", () => {
      normalizeState({ trips: [{ id: "x" }], items: [null, {}], checklist: [null], documents: [null], version: 2 });
      return true;
    });
  }

  /* ===== 3. Budget and rollover math ===== */

  function budgetMath() {
    group("budget");

    check("categoryBreakdown percentages sum to 100", () => {
      const trip = makeTrip({ expenses: [
        makeExpense({ id: "a", category: "Food", amount: 200 }),
        makeExpense({ id: "b", category: "Hotel", amount: 600 }),
        makeExpense({ id: "c", category: "Food", amount: 200 }),
      ]});
      const rows = categoryBreakdown(trip);
      const sum = rows.reduce((s, r) => s + r.percent, 0);
      if (rows[0].category !== "Hotel") return "rows not sorted by amount desc";
      const food = rows.find((r) => r.category === "Food");
      if (food.amount !== 400) return "Food not aggregated: " + food.amount;
      return near(sum, 100, 0.01, "percent sum");
    });

    check("categoryBreakdown handles a zero-spend trip", () => {
      const rows = categoryBreakdown(makeTrip({ expenses: [] }));
      return eq(rows.length, 0);
    });

    check("totalsForTrips matches hand-computed values", () => {
      const trips = [
        makeTrip({ id: "t1", budget: 1000, expenses: [makeExpense({ id: "a", amount: 300, amountPaid: 100 })] }),
        makeTrip({ id: "t2", budget: 500, expenses: [makeExpense({ id: "b", amount: 200, amountPaid: 200 })] }),
      ];
      const t = totalsForTrips(trips);
      return eq(t.totalBudget, 1500, "budget") === true
        && eq(t.totalCommitted, 500, "committed") === true
        && eq(t.totalPaid, 300, "paid") === true
        && eq(t.totalDue, 200, "due") === true
        ? true
        : `budget=${t.totalBudget} committed=${t.totalCommitted} paid=${t.totalPaid} due=${t.totalDue}`;
    });

    check("expenseDisplayStatus: unpaid / partial / paid", () => {
      const unpaid = expenseDisplayStatus(makeExpense({ amount: 100, amountPaid: 0, status: "booked" }));
      const partial = expenseDisplayStatus(makeExpense({ amount: 100, amountPaid: 40 }));
      const paid = expenseDisplayStatus(makeExpense({ amount: 100, amountPaid: 100 }));
      return eq(unpaid, "booked", "unpaid") === true
        && eq(partial, "partial", "partial") === true
        && eq(paid, "paid", "paid") === true
        ? true : `${unpaid}/${partial}/${paid}`;
    });

    check("amountPaid can never exceed amount", () => {
      const e = normalizeExpense(makeExpense({ amount: 100, amountPaid: 250 }));
      return e.amountPaid <= e.amount ? true : `amountPaid ${e.amountPaid} exceeds amount ${e.amount}`;
    });

    check("status 'paid' forces amountPaid to the full amount", () => {
      const e = normalizeExpense(makeExpense({ amount: 100, amountPaid: 10, status: "paid" }));
      return eq(e.amountPaid, 100, "amountPaid") === true && eq(e.status, "paid", "status") === true
        ? true : `status=${e.status} paid=${e.amountPaid}`;
    });

    /* Deliberate invariant, enforced identically in buildExpenseFromForm: a
       booked/planned expense never carries a full payment — that's what status
       "paid" is for. Locked in here so a refactor can't quietly change how money
       is recorded. Partial payments must survive untouched. */
    check("booked + full payment is normalised to zero, partial survives", () => {
      const full = normalizeExpense(makeExpense({ amount: 100, amountPaid: 100, status: "booked" }));
      const part = normalizeExpense(makeExpense({ amount: 100, amountPaid: 40, status: "booked" }));
      return eq(full.amountPaid, 0, "full payment on booked") === true
        && eq(part.amountPaid, 40, "partial payment on booked") === true
        ? true : `full=${full.amountPaid} partial=${part.amountPaid}`;
    });

    check("negative amounts floor at zero", () => {
      const e = normalizeExpense(makeExpense({ amount: -50, amountPaid: -10 }));
      return eq(e.amount, 0, "amount") === true && eq(e.amountPaid, 0, "amountPaid") === true
        ? true : `amount=${e.amount} paid=${e.amountPaid}`;
    });

    check("rollover never leaves a budget below what's already spent", () => {
      const trips = [
        makeTrip({ id: "r1", budget: 1000, expenses: [makeExpense({ id: "a", amount: 400 })] }),
        makeTrip({ id: "r2", budget: 800, expenses: [makeExpense({ id: "b", amount: 100 })] }),
      ];
      const details = trips.map((trip) => ({ trip, spent: tripSpent(trip), remaining: Math.max(0, trip.budget - tripSpent(trip)) }));
      reduceSourceBudgets(details, 1300); // drain everything available
      for (const t of trips) {
        if (Number(t.budget) < tripSpent(t)) return `${t.id} budget ${t.budget} < spent ${tripSpent(t)}`;
        if (Number(t.budget) < 0) return `${t.id} budget went negative`;
      }
      return true;
    });

    check("distributeAmount splits without losing cents", () => {
      const shares = distributeAmount(100, [1, 1, 1]);
      return near(shares.reduce((s, v) => s + v, 0), 100, 0.001, "share sum");
    });

    check("formatMoney handles zero, negative and large values", () => {
      [0, -1234.5, 9876543].forEach((n) => formatMoney(n));
      return typeof formatMoney(0) === "string" ? true : "formatMoney did not return a string";
    });

    check("year filter selects the right trips", () => {
      state.trips = [makeTrip({ id: "y1", year: 2025 }), makeTrip({ id: "y2", year: 2026 })];
      const years = getYears();
      if (years[0] !== 2026) return "getYears not sorted desc: " + JSON.stringify(years);
      return eq(tripsInYear(2026).length, 1, "trips in 2026");
    });
  }

  /* ===== 4. Data safety ===== */

  function dataSafety() {
    group("data-safety");

    check("normalizeState round-trips through JSON losslessly", () => {
      const original = normalizeState({
        trips: [makeTrip({ expenses: [makeExpense()] })],
        items: [], version: 2,
      });
      const round = normalizeState(JSON.parse(JSON.stringify(original)));
      return eq(JSON.stringify(round), JSON.stringify(original), "round-trip");
    });

    check("loadState falls back to seed on corrupt JSON without wiping storage", () => {
      const realSetItem = Storage.prototype.setItem;
      realSetItem.call(localStorage, STORAGE_KEY, "{not json");
      const realAlert = window.alert;
      window.alert = () => {};
      try {
        const s = quietly(() => loadState());
        if (!s || !Array.isArray(s.trips)) return "loadState did not return usable state";
        return truthy(localStorage.getItem(STORAGE_KEY), "stored data still present");
      } finally {
        window.alert = realAlert;
      }
    });

    check("pre-join backup key is readable and restorable", () => {
      const realSetItem = Storage.prototype.setItem;
      const payload = JSON.stringify({ trips: [makeTrip()], items: [], version: 2 });
      realSetItem.call(localStorage, PRE_JOIN_BACKUP_KEY, payload);
      const restored = localStorage.getItem(PRE_JOIN_BACKUP_KEY);
      if (restored !== payload) return "backup did not round-trip";
      const parsed = normalizeState(JSON.parse(restored));
      return truthy(parsed.trips.length, "restored trips");
    });
  }

  /* ---------- reporting ---------- */

  function report() {
    const pass = results.filter((r) => r.ok).length;
    const fail = results.length - pass;
    window.__selftest = { pass, fail, results };

    console.table(results.map((r) => ({ group: r.group, check: r.name, result: r.ok ? "PASS" : "FAIL", detail: r.detail })));
    console.log(`%cselftest: ${pass} passed, ${fail} failed`,
      `font-weight:bold;color:${fail ? "#c0392b" : "#1e8449"}`);

    renderPanel();
  }

  function renderPanel(refusedMessage) {
    document.getElementById("selftest-panel")?.remove();
    const panel = document.createElement("div");
    panel.id = "selftest-panel";
    panel.style.cssText = [
      "position:fixed", "inset:auto 12px 12px 12px", "z-index:100000",
      "max-height:60vh", "overflow:auto", "background:#fff", "color:#222",
      "border-radius:12px", "box-shadow:0 8px 40px rgba(0,0,0,.3)",
      "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace", "padding:14px 16px",
    ].join(";");

    if (refusedMessage) {
      panel.innerHTML = `<strong>Self-test refused</strong><p style="margin:.5rem 0 0">${refusedMessage}</p>`;
      document.body.appendChild(panel);
      return;
    }

    const pass = results.filter((r) => r.ok).length;
    const fail = results.length - pass;
    const rows = results.map((r) =>
      `<tr><td style="padding:2px 8px 2px 0;color:${r.ok ? "#1e8449" : "#c0392b"}">${r.ok ? "PASS" : "FAIL"}</td>` +
      `<td style="padding:2px 8px 2px 0;color:#888">${r.group}</td>` +
      `<td style="padding:2px 0">${r.name}${r.detail ? `<div style="color:#c0392b">${r.detail}</div>` : ""}</td></tr>`
    ).join("");

    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
         <strong style="color:${fail ? "#c0392b" : "#1e8449"}">selftest — ${pass} passed, ${fail} failed</strong>
         <button type="button" onclick="this.closest('#selftest-panel').remove()"
           style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">close</button>
       </div><table style="border-collapse:collapse">${rows}</table>`;
    document.body.appendChild(panel);
  }

  // The app boots on DOMContentLoaded; this file is deferred, so wait for it too.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(run, 0));
  } else {
    setTimeout(run, 0);
  }
})();
