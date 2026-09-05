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

  /* A check that cannot run must say so rather than returning true. Two checks used to
     `return true` early at desktop width — the FAB clearance one and the sticky-bar occlusion
     one — so a desktop run reported them green without exercising anything. That is the same
     passes-for-the-wrong-reason shape as the v1.10.2 CSS bug, and it hid the fact that the
     suite has to be run at phone width to mean anything. Return skip("why") instead. */
  const SKIP = Symbol("skip");
  function skip(reason) { return { [SKIP]: true, reason: reason || "not applicable here" }; }
  const isSkip = (r) => Boolean(r && typeof r === "object" && r[SKIP]);

  function check(name, fn) {
    let ok = false, skipped = false, detail = "";
    try {
      const r = fn();
      if (isSkip(r)) { skipped = true; ok = true; detail = r.reason; }
      else {
        ok = r === true || r === undefined;
        if (!ok) detail = String(r);
      }
    } catch (err) {
      ok = false;
      detail = (err && err.message) || String(err);
    }
    results.push({ group: currentGroup, name, ok, skipped, detail });
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
      releaseV1103();
      releaseV1104();
      releaseV1110();
      releaseV1111();
      releaseV1112();
      releaseV1113();
      releaseV1105();
      releaseV1120();
      releaseV1130();
      releaseV1140();
      releaseV1150();
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
      if (typeof L === "undefined") return skip("Leaflet CDN blocked");
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

    /* #3 — the general property the old attachment checks were really proving: a deletion on
       one side must stick, and an addition on the other must survive. Attachments are gone as
       of v1.11.0, so this runs on the checklist, which is the remaining add/remove-only list.
       (The attachment versions also exercised a reduce-and-rehydrate base shape that no longer
       exists — the base is stored verbatim now.) */

    check("an item deleted remotely stays deleted", () => {
      const note = (id) => ({ id, text: id, done: false });
      const agreed = wrap([], { checklist: [note("n1"), note("n2")] });
      const local = clone(agreed);                          // untouched, still holds both
      const remote = wrap([], { checklist: [note("n1")] }); // n2 deleted there
      const ids = m3(agreed, local, remote).state.checklist.map((c) => c.id).join(",");
      return eq(ids, "n1", "n2 must not resurrect");
    });

    check("an item added locally still survives a merge", () => {
      const note = (id) => ({ id, text: id, done: false });
      const agreed = wrap([], { checklist: [note("n1")] });
      const local = wrap([], { checklist: [note("n1"), note("mine")] });
      const remote = clone(agreed);
      const ids = m3(agreed, local, remote).state.checklist.map((c) => c.id).sort().join(",");
      return eq(ids, "mine,n1");
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

    /* The base used to be stored in a reduced shape because inline base64 attachments could
       not fit twice in localStorage. With attachments gone it is stored verbatim, and what
       matters now is that it round-trips faithfully — a lossy base makes the merge confidently
       wrong, which is worse than having no base at all. */
    check("the stored merge base round-trips without loss", () => {
      const payload = wrap([makeTrip({ id: "t1", budget: 1234 })], {
        checklist: [{ id: "n1", text: "Passports", done: true }],
        currentFunds: 4321,
      });
      const round = JSON.parse(JSON.stringify(payload));
      return eq(JSON.stringify(round), JSON.stringify(payload), "base round-trip");
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
      if (typeof L === "undefined") return skip("Leaflet CDN blocked");
      const rows = [...document.querySelectorAll("#itinerary-view .mapstop__pin")]
        .filter((el) => !el.classList.contains("mapstop__pin--hotel"))
        .filter((el) => !el.classList.contains("mapstop__pin--nogeo"))
        .map((el) => el.textContent.trim());
      const pins = [...document.querySelectorAll(".map-pin")]
        .filter((el) => !el.classList.contains("map-pin--hotel"))
        .map((el) => el.textContent.trim());
      if (!pins.length) return skip("nothing geocoded in the seed data");
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
    /* v1.15.0 changed the lead: it is now funds vs committed (see releaseV1150), and still-to-pay
       moved into the tile grid. These two guard the same principle — one lead number, never
       repeated as a tile — against the new figures. */
    check("the budget lead number equals funds vs committed", () => {
      const lead = document.querySelector(".answer-card__value");
      if (!lead) return skip("budget screen not rendered in this pass");
      const { totalCommitted } = totalsForTrips(tripsForFilter());
      return lead.textContent.includes(formatMoney(Math.abs(state.currentFunds - totalCommitted)))
        ? true : `lead reads "${lead.textContent.trim()}"`;
    });

    check("the lead figure is not repeated in the tile grid", () => {
      const labels = [...document.querySelectorAll("#global-stats .stat__label")].map((l) => l.textContent);
      if (!labels.length) return true;
      return labels.some((l) => /Funds vs committed/i.test(l)) ? "funds-vs-committed is both the lead and a tile" : true;
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

  /* ===== 1b10. v1.10.3 — expense ids, occlusion, overflow, blueprints v2 =====
     The expense-id bug shipped in the very first commit and was invisible to every
     existing check, because nothing here had ever round-tripped an expense through
     the real dialog. These drive the form the way a person does. */

  function releaseV1103() {
    group("v1.10.3");

    const form = () => document.getElementById("form-expense");
    const fld = (n) => form().querySelector(`[name="${n}"]`);

    /* Fill and submit the real form, so buildExpenseFromForm and handleExpenseSubmit
       are both exercised — testing them apart is what let the bug through. */
    function submitExpense(tripId, over, expense) {
      openExpenseDialog(tripId, expense || null);
      const v = Object.assign(
        { label: "Selftest row", category: "Food", amount: "120", date: "2026-09-17",
          status: "booked", amountPaid: "0", paidDate: "" },
        over || {}
      );
      for (const [k, val] of Object.entries(v)) fld(k).value = val;
      form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      closeDialog(document.getElementById("dialog-expense"));
    }

    const testTrip = () => state.trips[0];

    check("a newly added expense has a real id", () => {
      const trip = testTrip();
      if (!trip) return true;
      const before = trip.expenses.length;
      submitExpense(trip.id, { label: "Row A" });
      if (trip.expenses.length !== before + 1) return "the expense was not added";
      const added = trip.expenses[trip.expenses.length - 1];
      return added.id ? true : `id is ${JSON.stringify(added.id)}`;
    });

    check("editing an expense keeps its id", () => {
      const trip = testTrip();
      if (!trip) return true;
      /* Seed the row directly with a known-good id rather than adding it through the
         form. Going through the form first made this check useless: with the bug present
         the added row already had id "", so "" was compared against "" and it passed. */
      const seeded = makeExpense({ id: "exp-known-1", label: "Row B" });
      trip.expenses.push(seeded);
      submitExpense(trip.id, { label: "Row B renamed", amount: "250" }, seeded);
      const after = trip.expenses.find((x) => x.label === "Row B renamed");
      if (!after) return "the edit did not apply";
      return eq(after.id, "exp-known-1", "id after edit");
    });

    check("two added expenses get distinct ids", () => {
      const trip = testTrip();
      if (!trip) return true;
      submitExpense(trip.id, { label: "Row C" });
      submitExpense(trip.id, { label: "Row D" });
      const ids = trip.expenses.slice(-2).map((e) => e.id);
      if (ids.some((i) => !i)) return `an id is empty: ${JSON.stringify(ids)}`;
      return ids[0] !== ids[1] ? true : `both ids are ${ids[0]}`;
    });

    check("row actions still resolve an expense after an edit", () => {
      const trip = testTrip();
      if (!trip) return true;
      submitExpense(trip.id, { label: "Row E" });
      const added = trip.expenses[trip.expenses.length - 1];
      submitExpense(trip.id, { label: "Row E edited" }, added);
      const target = trip.expenses.find((x) => x.label === "Row E edited");
      // This is the lookup every row button performs; an empty id made it fail silently.
      return trip.expenses.find((x) => x.id === target.id) === target
        ? true : "the row's own id no longer finds it";
    });

    check("the repair migration backfills an empty id and is idempotent", () => {
      const broken = {
        trips: [{ id: "trip-r", name: "R", year: 2026, budget: 100, expenses: [
          makeExpense({ id: "", label: "Broken" }),
          makeExpense({ id: "exp-keep", label: "Fine" }),
        ] }],
        items: [], version: 2,
      };
      const once = normalizeState(JSON.parse(JSON.stringify(broken)));
      const exps = once.trips[0].expenses;
      if (!exps[0].id) return "the empty id was not repaired";
      if (exps[1].id !== "exp-keep") return "a good id was rewritten";
      // Same input must give the same id on every device, or a sync duplicates the row.
      const twice = normalizeState(JSON.parse(JSON.stringify(broken)));
      if (twice.trips[0].expenses[0].id !== exps[0].id) return "the repaired id is not deterministic";
      // And re-running over already-repaired data must not change anything.
      const again = normalizeState(JSON.parse(JSON.stringify(once)));
      return eq(again.trips[0].expenses[0].id, exps[0].id, "id after a second pass");
    });

    check("a repaired expense survives a merge instead of being dropped", () => {
      // merge3List filters on `e.id`, so an empty id vanished on the next sync.
      const mk = () => ({
        trips: [{ id: "trip-r", name: "R", year: 2026, budget: 100,
          expenses: [makeExpense({ id: "", label: "Broken" })] }],
        items: [], version: 2,
      });
      const base = normalizeState(mk());
      const local = normalizeState(JSON.parse(JSON.stringify(mk())));
      const remote = normalizeState(JSON.parse(JSON.stringify(mk())));
      const merged = merge3(base, local, remote).state;
      if (!merged) return "the merge was blocked";
      const exps = merged.trips.find((t) => t.id === "trip-r").expenses;
      if (exps.length !== 1) return `expected 1 expense after merge, got ${exps.length}`;
      return truthy(exps[0].id, "merged expense id");
    });

    check("two-up dialog rows can shrink below their inputs' natural width", () => {
      const row = document.querySelector("#dialog-item .roll-years");
      if (!row) return "no .roll-years row found";
      const cols = getComputedStyle(row).gridTemplateColumns;
      // `1fr` resolves to minmax(auto, 1fr) and could never shrink — that was the overflow.
      const field = row.querySelector(".field");
      if (field && getComputedStyle(field).minWidth !== "0px") return "the field can still force its column wider";
      return /px/.test(cols) ? true : `unexpected columns: ${cols}`;
    });

    /* Layout checks need a real viewport. Some automation harnesses run the page at
       0x0, where every rect is meaningless — measuring there reports failures that do
       not exist. Skip rather than lie. */
    const laidOut = () => window.innerWidth >= 320 && window.innerHeight >= 320;

    /* Pin the dialog to the family's phone width rather than trusting the harness
       viewport. At a roomy 514px `1fr 1fr` fits and this check passed against its own
       mutant — the overflow only appears at ~412px and below. */
    const PHONE_W = 412;

    check("no dialog form scrolls sideways at phone width", () => {
      if (!laidOut()) return skip("viewport too small to measure");
      const bad = [];
      document.querySelectorAll("dialog form").forEach((f) => {
        const d = f.closest("dialog");
        const wasOpen = d.open;
        const prevStyle = d.style.cssText;
        if (!wasOpen) d.showModal();
        d.style.width = PHONE_W + "px";
        d.style.maxWidth = PHONE_W + "px";
        /* The per-type groups in #dialog-item are `hidden`, so their .roll-years rows had
           zero width and could not overflow — the flight fields are exactly the ones that
           clip. Reveal every group for the measurement, then put them back. */
        const hidden = [...f.querySelectorAll("[data-item-group][hidden]")];
        hidden.forEach((g) => { g.hidden = false; });
        if (f.clientWidth > 0 && f.scrollWidth > f.clientWidth + 1) {
          bad.push(`${d.id} ${f.scrollWidth}>${f.clientWidth}`);
        }
        hidden.forEach((g) => { g.hidden = true; });
        d.style.cssText = prevStyle;
        if (!wasOpen) d.close();
      });
      return bad.length ? bad.join(", ") : true;
    });

    check("the itinerary reserves enough room to clear the FAB", () => {
      if (!laidOut()) return skip("viewport too small to measure");
      /* The FAB is appended by renderItinerary, so it does not exist while the suite sits
         on the Trips screen — without this the check returned true and passed its mutant. */
      const trip = state.trips.find((t) => t.startDate && t.endDate);
      if (!trip) return true;
      const prevTrip = itineraryTripId;
      itineraryTripId = trip.id;
      renderItinerary();
      try {
        const view = document.getElementById("itinerary-view");
        const fab = document.querySelector(".fab");
        if (!view) return "the itinerary did not render";
        const fabStyle = fab && getComputedStyle(fab);
        if (!fabStyle || fabStyle.position !== "fixed") return skip("desktop layout — no FAB");
        /* Computed values, not getBoundingClientRect: the itinerary screen may be
           display:none while another tab is active, and every rect is then 0 — which
           made this check pass against its own mutant. */
        const reserved = parseFloat(getComputedStyle(view).paddingBottom) || 0;
        const needed = (parseFloat(fabStyle.bottom) || 0) + (parseFloat(fabStyle.height) || 0);
        return reserved >= needed
          ? true : `reserved ${reserved}px but the FAB's top edge is ${Math.round(needed)}px up`;
      } finally {
        itineraryTripId = prevTrip;
      }
    });

    check("a focused field is not left under the sticky action bar", () => {
      if (!laidOut()) return skip("viewport too small to measure");
      const d = document.getElementById("dialog-expense");
      const wasOpen = d.open;
      openExpenseDialog(state.trips[0] ? state.trips[0].id : "x");
      const actions = d.querySelector(".dialog__actions");
      if (getComputedStyle(actions).position !== "sticky") {
        if (!wasOpen) closeDialog(d);
        return skip("desktop layout — the action bar is not sticky");
      }
      /* Force a short scroll box. On a tall harness viewport the whole form fits, the bar
         never pins over anything, and this passed with the fix entirely removed. A real
         phone in landscape — or any 88dvh shorter than the form — is the failing case. */
      const prevStyle = d.style.cssText;
      d.style.maxHeight = "380px";
      /* Payment status became a segmented control in v1.11.0, so it is a hidden input and
         cannot be focused. Any real field below the fold proves the same property. */
      const field = d.querySelector('[name="amountPaid"]');
      field.focus();
      const overlap = field.closest(".field").getBoundingClientRect().bottom
        - actions.getBoundingClientRect().top;
      d.style.cssText = prevStyle;
      if (!wasOpen) closeDialog(d);
      // Padding reserves the room; the focusin handler does the scrolling.
      return overlap <= 0 ? true : `the focused field is ${Math.round(overlap)}px under the Save bar`;
    });

    check("the itinerary step cards carry the featured trip", () => {
      renderTripsScreen();
      const card = document.querySelector('#steps .step-card[data-go="itinerary"]');
      if (!card) return "no itinerary step card rendered";
      const featured = featuredTrip();
      if (!featured) return true;
      return eq(card.getAttribute("data-trip-id"), featured.id, "step card trip id");
    });

    check("every blueprint has both a landmark and its city context", () => {
      const keys = Object.keys(MONUMENTS);
      if (keys.length < 19) return `only ${keys.length} cities`;
      const bad = keys.filter((k) => !MONUMENTS[k] || !MONUMENTS[k].fg || !MONUMENTS[k].bg);
      if (bad.length) return `missing a layer: ${bad.join(", ")}`;
      const art = coverArt({ name: "x", destinations: ["Paris, France"] });
      const paths = (art.match(/<path /g) || []).length;
      return paths === 2 ? true : `coverArt drew ${paths} paths`;
    });

    check("the new cities each resolve to their own blueprint", () => {
      const t = (d) => ({ name: "x", destination: d, destinations: [d] });
      const cases = {
        telaviv: "Tel Aviv, Israel", jerusalem: "Jerusalem, Israel",
        budapest: "Budapest, Hungary", berlin: "Berlin, Germany",
        lisbon: "Lisboa, Portugal", madrid: "Madrid, Spain",
        tokyo: "Tokyo, Japan", bangkok: "Bangkok, Thailand",
      };
      for (const [key, dest] of Object.entries(cases)) {
        const got = monumentFor(t(dest));
        if (got !== MONUMENTS[key]) return `${dest} did not resolve to ${key}`;
        if (got === MONUMENTS.generic) return `${dest} fell back to generic`;
      }
      return monumentFor(t("Nowhere, Atlantis")) === MONUMENTS.generic
        ? true : "an unknown city no longer falls back";
    });
  }

  /* ===== 1b11. v1.10.4 — a select's option list must not dismiss the sheet =====
     Android draws a <select>'s option list over the upper part of the screen, which for a
     bottom-sheet dialog is the backdrop. Dismissing it delivered the tap through to the
     page, the dialog saw a backdrop tap, and it closed — losing the edit. The dirty-form
     guard did not catch it because the stray tap beats `change`. */

  function releaseV1104() {
    group("v1.10.4");

    // What the browser reports for a backdrop hit: both events target the dialog itself.
    function strayBackdropTap(dialog) {
      dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    const expenseDialog = () => document.getElementById("dialog-expense");

    check("picking from a select does not dismiss the sheet", () => {
      const trip = state.trips[0];
      if (!trip) return true;
      const d = expenseDialog();
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      // Category, not status: status became a segmented control in v1.11.0. The guard still
      // has to hold for the selects that remain.
      const sel = d.querySelector('[name="category"]');
      // While the option list is open the select holds focus — that is the signal.
      // (v1.10.4 armed a timer from pointerdown here; v1.10.5 keys off focus instead,
      // because on a real phone the list stays open longer than any sane window.)
      sel.focus();
      // The option list closing, before `change` has had a chance to dirty the form.
      strayBackdropTap(d);
      const survived = d.open;
      closeDialog(d);
      return survived ? true : "the sheet closed when the option list was dismissed";
    });

    check("the same stray tap after a change is also survived", () => {
      const trip = state.trips[0];
      if (!trip) return true;
      const d = expenseDialog();
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      // Category, not status: status became a segmented control in v1.11.0. The guard still
      // has to hold for the selects that remain.
      const sel = d.querySelector('[name="category"]');
      sel.value = "Flight";
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      strayBackdropTap(d);
      const survived = d.open;
      closeDialog(d);
      return survived ? true : "the sheet closed after the status was changed";
    });

    check("a real backdrop tap still dismisses a clean sheet", () => {
      // The grace window must not break tap-outside-to-close, which is the whole point of
      // the v1.6.1 behaviour. No select involved, so nothing is suppressed.
      const d = document.getElementById("dialog-funds");
      openFundsDialog();
      if (!d.open) return "the funds dialog did not open";
      strayBackdropTap(d);
      const closed = !d.open;
      if (d.open) closeDialog(d);
      return closed ? true : "a clean sheet no longer closes on a backdrop tap";
    });

    check("the grace window is bounded", () => {
      // An unbounded suppression would silently disable tap-outside after any select use.
      return SELECT_POPUP_GRACE_MS > 0 && SELECT_POPUP_GRACE_MS <= 1500
        ? true : `grace is ${SELECT_POPUP_GRACE_MS}ms`;
    });
  }

  /* ===== 1b12. v1.10.5 — the select guard must not depend on a clock =====
     v1.10.4's 700ms window failed on the real S24: the option list stays open while you
     read it, so picking "Paid" seconds after touching the select dismissed outside the
     window. The guard now keys off focus — Android keeps the select focused while its
     list is open — and the first backdrop tap blurs instead of closing. */

  function releaseV1105() {
    group("v1.10.5");

    function strayBackdropTap(dialog) {
      dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    check("a backdrop tap with a focused select blurs it, not the sheet", () => {
      const trip = state.trips[0];
      if (!trip) return true;
      const d = document.getElementById("dialog-expense");
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      // Category, not status: status became a segmented control in v1.11.0. The guard still
      // has to hold for the selects that remain.
      const sel = d.querySelector('[name="category"]');
      sel.focus();
      // No `change` was dispatched, so the old time window is unarmed — only the
      // focus check can save the sheet here. This is the slow-reader case that
      // escaped v1.10.4 on the phone.
      strayBackdropTap(d);
      const stayedOpen = d.open;
      const blurred = document.activeElement !== sel;
      closeDialog(d);
      if (!stayedOpen) return "the sheet closed while the select was focused";
      return blurred ? true : "the select kept focus, so tap-outside is dead until it moves";
    });

    check("the second backdrop tap, after the blur, dismisses a clean sheet", () => {
      const trip = state.trips[0];
      if (!trip) return true;
      const d = document.getElementById("dialog-expense");
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      // Category, not status: status became a segmented control in v1.11.0. The guard still
      // has to hold for the selects that remain.
      const sel = d.querySelector('[name="category"]');
      sel.focus();
      strayBackdropTap(d);   // settles the popup: blurs, stays open
      strayBackdropTap(d);   // a deliberate tap outside — no select focused now
      const closed = !d.open;
      if (d.open) closeDialog(d);
      return closed ? true : "tap-outside stayed disabled after the select was blurred";
    });

    check("focus in another dialog's select does not shield this one", () => {
      // dialog.contains(activeElement) scopes the guard; without it, any focused
      // select anywhere would make every sheet undismissable.
      const funds = document.getElementById("dialog-funds");
      openFundsDialog();
      const outside = document.querySelector("#form-expense [name='status']");
      // A select outside the funds dialog holding focus must not protect it.
      if (outside) outside.focus();
      funds.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
      funds.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const closed = !funds.open;
      if (funds.open) closeDialog(funds);
      if (outside) outside.blur();
      return closed ? true : "an unrelated focused select disabled tap-outside";
    });
  }

  /* ===== 1b12. v1.11.0 — the Codex review, five enhancements ===== */

  function releaseV1110() {
    group("v1.11.0");

    const datedTrip = () => state.trips.find((t) => t.startDate && t.endDate);
    const shift = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
    /* A fixed reference date, not today's: "the last day of the trip" and "the day after it
       ends" cannot be exercised against a moving clock. */
    const REF = "2026-06-15";
    const tt = (start, end, today) =>
      tripTiming({ name: "x", startDate: start, endDate: end, destinations: [] }, today || REF);

    /* The suite runs with whatever screen the app booted on — usually Trips — so
       #screen-itinerary is display:none and everything inside it measures 0 and cannot be
       focused. Several checks were skipping or failing purely for that reason. Make it
       visible for the duration, then put the previous screen back. This changes visibility
       only; it does not seed any state. */
    function withScreenVisible(screenId, render, fn) {
      const screens = [...document.querySelectorAll(".screen")];
      const wasActive = screens.filter((s) => s.classList.contains("is-active"));
      screens.forEach((s) => s.classList.toggle("is-active", s.id === screenId));
      try {
        render();  // re-render now that the screen has a real box
        return fn();
      } finally {
        screens.forEach((s) => s.classList.remove("is-active"));
        wasActive.forEach((s) => s.classList.add("is-active"));
        render();
      }
    }
    function withItineraryVisible(fn) {
      return withScreenVisible("screen-itinerary", renderItinerary, fn);
    }
    window.__withScreenVisible = withScreenVisible; // later groups reuse it

    /* ---- saveState reports failure ---- */

    check("saveState reports whether the write landed", () => {
      if (saveState() !== true) return "a normal save did not return true";
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
      const realAlert = window.alert; window.alert = () => {};
      let got;
      try { got = quietly(() => saveState()); }
      finally { Storage.prototype.setItem = real; window.alert = realAlert; }
      // Dead rollback code in every caller is what a silent `undefined` bought.
      return got === false ? true : `a failed save returned ${JSON.stringify(got)}`;
    });

    /* ---- trip timing and order ---- */

    check("the timing label is right at every boundary", () => {
      const today = REF;
      const cases = [
        [shift(today, 2), shift(today, 5), "upcoming", "in 2 days"],
        [shift(today, 1), shift(today, 4), "upcoming", "Tomorrow"],
        [today, shift(today, 3), "travelling", "Travelling now · day 1 of 4"],
        [shift(today, -1), shift(today, 2), "travelling", "Travelling now · day 2 of 4"],
        [shift(today, -3), today, "travelling", "Travelling now · day 4 of 4"],
        [today, today, "travelling", "Travelling now · day 1 of 1"],
        ["", "", "undated", ""],
      ];
      for (const [s, e, state_, text] of cases) {
        const r = tt(s, e);
        if (r.state !== state_ || r.text !== text) {
          return `${s || "(undated)"}..${e || "-"} gave [${r.state}] "${r.text}", wanted [${state_}] "${text}"`;
        }
      }
      // The day after it ends must flip to past — off-by-one here is the likely bug.
      const ended = tt(shift(today, -4), shift(today, -1));
      return ended.state === "past" ? true : `a finished trip reads [${ended.state}]`;
    });

    check("the countdown uses a local date, not a UTC one", () => {
      /* todayISO() goes through toISOString(), which is UTC — in Israel it names YESTERDAY
         between midnight and 03:00, so the countdown would be a day out at night. Comparing
         the two helpers at midday proves nothing, because they agree then. Probe an instant
         near midnight instead, where a UTC conversion lands on a different calendar day. */
      const probes = [new Date(2026, 0, 15, 0, 30), new Date(2026, 0, 15, 23, 30)];
      const differs = probes.filter((d) => d.toISOString().slice(0, 10) !== "2026-01-15");
      if (!differs.length) return skip("this machine runs at UTC — no local/UTC divergence to detect");
      for (const d of differs) {
        const got = todayLocalISO(d);
        if (got !== "2026-01-15") return `${d.getHours()}:30 local resolved to ${got}, not the local date`;
      }
      return true;
    });

    check("one trip order: travelling, then soonest, then finished, then undated", () => {
      const today = todayLocalISO();
      const mk = (name, s, e) => makeTrip({ id: "t-" + name, name, startDate: s, endDate: e });
      const trips = [
        mk("past-old", shift(today, -60), shift(today, -55)),
        mk("undated", "", ""),
        mk("later", shift(today, 40), shift(today, 44)),
        mk("now", shift(today, -1), shift(today, 1)),
        mk("past-recent", shift(today, -10), shift(today, -8)),
        mk("soon", shift(today, 5), shift(today, 9)),
      ];
      const order = sortTripsByUpcoming(trips).map((t) => t.name);
      return eq(order.join(","), "now,soon,later,past-recent,past-old,undated", "order");
    });

    check("the featured trip is the one you are on or the next one", () => {
      const featured = featuredTrip();
      if (!featured) return skip("no trips in state");
      const dated = sortTripsByUpcoming(state.trips.filter((t) => getMeta(t).startDate));
      if (!dated.length) return skip("no dated trips");
      return featured.id === dated[0].id
        ? true : `featured is ${featured.name}, first in order is ${dated[0].name}`;
    });

    /* ---- Trips-screen cards ---- */

    check("every trip card can be edited and opens its own itinerary", () => {
      renderTripsScreen();
      const cards = [...document.querySelectorAll("#trip-cards .tripcard")];
      if (!cards.length) return skip("no trip cards rendered");
      const sorted = sortTripsByUpcoming(state.trips);
      for (let i = 0; i < cards.length; i++) {
        const want = sorted[i].id;
        const edit = cards[i].querySelector("[data-edit-trip]");
        const itin = cards[i].querySelector('[data-go="itinerary"]');
        if (!edit) return `card ${i} has no Edit control`;
        if (edit.getAttribute("data-edit-trip") !== want) return `card ${i} edits the wrong trip`;
        // Carried no trip id at all before v1.11.0, so it opened whatever was last viewed.
        if (!itin || itin.getAttribute("data-trip-id") !== want) {
          return `card ${i} Itinerary button targets ${itin?.getAttribute("data-trip-id")}, wanted ${want}`;
        }
      }
      return true;
    });

    check("the step cards send Route to the map and Day by Day to the timeline", () => {
      renderTripsScreen();
      const byTitle = (t) => [...document.querySelectorAll("#steps .step-card")]
        .find((c) => c.querySelector(".step-card__title").textContent === t);
      const day = byTitle("Day by Day"), route = byTitle("Route");
      if (!day || !route) return "step cards missing";
      // "Explore attractions" was removed in v1.11.1 — it only reopened the timeline.
      if (byTitle("Explore attractions")) return "the Explore attractions card is back";
      return eq(day.getAttribute("data-subtab-target"), "timeline", "Day by Day") === true
        && eq(route.getAttribute("data-subtab-target"), "maps", "Route") === true
        ? true : "wrong sub-tab targets";
    });

    /* ---- Bookings ---- */

    check("a booking card opens its own reservation", () => {
      renderBookings();
      const cards = [...document.querySelectorAll(".booking[data-item]")];
      /* Not a skip: if reservations exist but no card is bindable, the feature is broken —
         and letting absence skip is exactly how a mutation that stripped data-item slipped
         past this check once already. */
      const rendered = document.querySelectorAll(".booking").length;
      if (!rendered) return skip("no reservations in state to render");
      if (!cards.length) return `${rendered} booking card(s) rendered, none carrying data-item`;
      // The parity doc claimed this worked for releases while nothing was bound at all.
      const bad = cards.filter((c) => !state.items.some((i) => i.id === c.getAttribute("data-item")));
      if (bad.length) return `${bad.length} card(s) point at a missing item`;
      const first = cards[0];
      const item = state.items.find((i) => i.id === first.getAttribute("data-item"));
      const d = document.getElementById("dialog-item");
      first.click();
      const opened = d.open && $("form-item").querySelector('[name="itemId"]')?.value === item.id;
      if (d.open) closeDialog(d);
      return opened ? true : "tapping a booking did not open that reservation";
    });

    /* ---- Itinerary navigation ---- */

    check("both tablists honour the tab contract", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      renderItinerary();
      const lists = [...document.querySelectorAll('[role="tablist"]')];
      if (lists.length < 2) return `expected 2 tablists, found ${lists.length}`;
      for (const list of lists) {
        const tabs = [...list.querySelectorAll('[role="tab"]')];
        if (!tabs.length) return `${list.getAttribute("aria-label")} has no tabs`;
        const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
        if (selected.length !== 1) return `${list.getAttribute("aria-label")} has ${selected.length} selected tabs`;
        // aria-selected must agree with the visual state, or they tell different stories.
        if (!selected[0].classList.contains("is-active")) return "aria-selected disagrees with is-active";
        const focusable = tabs.filter((t) => t.tabIndex === 0);
        if (focusable.length !== 1) return `roving tabindex broken: ${focusable.length} tabs are focusable`;
        if (focusable[0] !== selected[0]) return "the focusable tab is not the selected one";
        if (tabs.some((t) => t.getAttribute("aria-controls") !== "itinerary-view")) return "aria-controls missing";
      }
      return document.getElementById("itinerary-view")?.getAttribute("role") === "tabpanel"
        ? true : "the panel is not a tabpanel";
    });

    check("arrow keys move between trip tabs", () => {
      if (state.trips.filter((t) => getMeta(t).startDate).length < 2) return skip("needs two dated trips");
      return withItineraryVisible(() => {
      const before = itineraryTripId;
      const sw = document.getElementById("itinerary-switcher");
      sw.querySelector('[role="tab"][aria-selected="true"]').focus();
      sw.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const moved = itineraryTripId !== before;
      // Focus must land on the newly active tab, which a re-render had destroyed.
      const active = document.getElementById("itinerary-switcher")
        .querySelector('[role="tab"][aria-selected="true"]');
      const focused = document.activeElement === active;
      itineraryTripId = before;
      if (!moved) return "ArrowRight did not change the trip";
      return focused ? true : "focus did not follow the activated tab";
      });
    });

    check("an unrelated re-render does not steal focus into a tab", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      return withItineraryVisible(() => {
        const other = document.getElementById("btn-overflow");
        if (!other) return skip("app bar not rendered");
        other.focus();
        if (document.activeElement !== other) return skip("this element cannot hold focus here");
        renderItinerary(); // not a tab activation
        return document.activeElement === other
          ? true : `focus moved to ${document.activeElement?.tagName}.${document.activeElement?.className}`;
      });
    });

    check("the view toggle and the day strip share one sticky header", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      renderItinerary();
      const sticky = document.getElementById("itin-sticky");
      if (!sticky) return "no sticky header";
      if (!sticky.querySelector(".switcher--sub")) return "the view toggle is not in the header";
      if (!sticky.querySelector(".daystrip")) return "the day strip is not in the header";
      if (document.querySelector("#itinerary-view .daystrip")) return "the strip is still inside the scrolling view";
      if (getComputedStyle(sticky).position !== "sticky") return skip("desktop layout — header is not sticky");
      // Derived, not hardcoded: a day-jump would otherwise land with its heading hidden.
      const margin = parseFloat(getComputedStyle(document.querySelector(".day")).scrollMarginTop) || 0;
      const h = stickyHeaderHeight();
      return margin >= h ? true : `scroll-margin-top ${margin}px is under the ${h}px header`;
    });

    check("the drag edge zone starts below the sticky header", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      return withItineraryVisible(() => {
      const h = stickyHeaderHeight();
      if (!h) return skip("desktop layout — no sticky header");
      /* A degenerate viewport puts the BOTTOM edge zone above the top one (innerHeight - 72
         goes negative), so the clear-of-the-zone probe lands inside it and both calls scroll. */
      if (window.innerHeight < h + DRAG_EDGE_PX * 3) return skip("viewport too short to separate the two edge zones");
      /* Measured from the viewport top, the whole zone sat under the header, so dragging
         upward scrolled while the card was hidden behind the chrome. */
      const calls = [];
      const realScrollBy = window.scrollBy;
      window.scrollBy = (x, y) => calls.push(y);
      try {
        autoScrollForDrag(h + DRAG_EDGE_PX - 5); // just inside the zone
        autoScrollForDrag(h + DRAG_EDGE_PX + 40); // clear of it
      } finally { window.scrollBy = realScrollBy; }
      if (calls.length !== 1) return `expected exactly one scroll, got ${calls.length}`;
      return calls[0] < 0 ? true : `scrolled ${calls[0]}, expected upward`;
      });
    });

    check("scrolling picks the day under the header", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      return withItineraryVisible(() => {
      if (!stickyHeaderHeight()) return skip("desktop layout — no sticky header");
      const isos = eachDay(trip).map(isoOf);
      if (isos.length < 2) return skip("needs a multi-day trip");
      const prevY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      try {
        window.scrollTo(0, 0);
        const first = dayUnderHeader(isos);
        window.scrollTo(0, Math.max(0, maxScroll));
        const last = dayUnderHeader(isos);
        if (first !== isos[0]) return `at the top it picked ${first}, wanted ${isos[0]}`;
        if (maxScroll <= 0) return skip("page too short to scroll at this viewport");
        // Monotonic: further down the page must never pick an earlier day.
        return isos.indexOf(last) >= isos.indexOf(first)
          ? true : `scrolling down went backwards: ${first} -> ${last}`;
      } finally { window.scrollTo(0, prevY); }
      });
    });

    check("the scroll spy never re-renders the itinerary", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      return withItineraryVisible(() => {
      if (!dayScrollHandler) return skip("desktop layout — spy not armed");
      /* This is the check that matters most: renderItinerary rebuilds the whole timeline, so
         calling it per scroll event would be catastrophic. */
      let calls = 0;
      const real = window.renderItinerary;
      window.renderItinerary = function (...a) { calls++; return real.apply(this, a); };
      try {
        const prevY = window.scrollY;
        const prevIso = timelineDayIso;
        window.scrollTo(0, 300);
        /* Run the spy's actual work, not just the handler that queues a frame — cancelling the
           frame would leave the mutated body untested, which is how this check passed against
           its own mutant the first time. Clearing timelineDayIso first forces it past the
           "nothing changed" guard, which a short trip would otherwise never get past. */
        timelineDayIso = null;
        syncDayFromScroll();
        window.scrollTo(0, prevY);
        timelineDayIso = null;
        syncDayFromScroll();
        timelineDayIso = prevIso;
      } finally { window.renderItinerary = real; }
      return calls === 0 ? true : `the spy triggered ${calls} re-render(s)`;
      });
    });

    check("a jump and a drag both suppress the scroll spy", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      return withItineraryVisible(() => {
      const isos = eachDay(trip).map(isoOf);
      if (isos.length < 2 || !stickyHeaderHeight()) return skip("needs a multi-day trip on mobile");

      // A tap-to-jump animates through every day between; the highlight must not strobe.
      scrollToDay(isos[0]);
      const suppressedByJump = nowMs() < programmaticScrollUntil;
      programmaticScrollUntil = 0;

      // v1.10.2's drag auto-scrolls the window; that is the drag moving, not the user reading.
      const prevCtx = dragCtx;
      dragCtx = { active: true };
      timelineDayIso = isos[0];
      const prevY = window.scrollY;
      window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
      dayScrollHandler?.();
      if (dayScrollRaf) { cancelAnimationFrame(dayScrollRaf); dayScrollRaf = 0; }
      const unchangedDuringDrag = timelineDayIso === isos[0];
      dragCtx = prevCtx;
      window.scrollTo(0, prevY);

      if (!suppressedByJump) return "a programmatic jump did not suppress the spy";
      return unchangedDuringDrag ? true : "the spy moved the day while a card was being dragged";
      });
    });

    check("the scroll spy is torn down on the map tab", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      return withItineraryVisible(() => {
        itinerarySubTab = "timeline";
        renderItinerary();
        if (!dayScrollHandler) return skip("desktop layout — spy never armed");
        itinerarySubTab = "maps";
        renderItinerary();
        const stripGone = !document.querySelector(".daystrip");
        const handlerGone = !dayScrollHandler;
        itinerarySubTab = "timeline";
        if (!stripGone) return "the day strip is still rendered on the map tab";
        // A live handler would keep reading nodes the re-render destroyed.
        return handlerGone ? true : "the scroll handler outlived the timeline";
      });
    });

    /* ---- Accessibility ---- */

    check("secondary text clears 4.5:1 on every surface", () => {
      const cs = getComputedStyle(document.documentElement);
      const tok = (n) => cs.getPropertyValue(n).trim();
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = (hex) => {
        const h = hex.replace("#", "");
        if (h.length !== 6) return null;
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const ratio = (a, b) => {
        const x = lum(a), y = lum(b);
        if (x === null || y === null) return null;
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      // Computed from the token so this survives a future colour change rather than pinning one.
      const muted = tok("--muted");
      const bad = [];
      for (const sfc of ["--surface", "--bg", "--cream-2", "--cream"]) {
        const r = ratio(muted, tok(sfc));
        if (r === null) return `could not read ${sfc}`;
        if (r < 4.5) bad.push(`${sfc} ${r.toFixed(2)}`);
      }
      return bad.length ? `${muted} fails: ${bad.join(", ")}` : true;
    });

    check("every dialog is named", () => {
      const bad = [];
      document.querySelectorAll("dialog").forEach((d) => {
        const id = d.getAttribute("aria-labelledby");
        const target = id && document.getElementById(id);
        if (!target || !target.textContent.trim()) bad.push(d.id || "(unnamed dialog)");
      });
      return bad.length ? `unnamed: ${bad.join(", ")}` : true;
    });

    check("there is one live region and it can announce", () => {
      const el = document.getElementById("a11y-live");
      if (!el) return "no live region";
      if (el.getAttribute("aria-live") !== "polite") return "not a polite live region";
      // A hidden region never announces — that is why neither #toast nor #sync-status can be one.
      if (el.hidden || getComputedStyle(el).display === "none") return "the live region is hidden";
      announce("selftest announcement");
      const got = el.textContent;
      announce("");
      return got === "selftest announcement" ? true : `announce() wrote ${JSON.stringify(got)}`;
    });

    check("row controls say which item they act on", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      renderItinerary();
      const more = document.querySelector(".act__more");
      const add = document.querySelector(".act--add");
      if (!more) return skip("no reservation with a ⋯ button at this width");
      const item = state.items.find((i) => i.id === more.getAttribute("data-item-more"));
      const label = more.getAttribute("aria-label") || "";
      // "Edit, Delete, Edit, Delete…" with no object is what a screen reader used to hear.
      if (!item || !label.includes(item.title)) return `⋯ is labelled "${label}"`;
      const addLabel = add?.getAttribute("aria-label") || "";
      return /\d/.test(addLabel) ? true : `Add reservation is labelled "${addLabel}" for every day`;
    });

    /* ---- reported by Isaac after testing v1.11.0 on the phone ---- */

    check("payment status is tap targets, not a native select", () => {
      /* Two fixes for "picking Paid closes the sheet" failed on the real device — v1.10.4 timed
         a window from touching the select, v1.10.5 keyed off focus. Both guessed at how Android
         delivers the option-list dismissal. There is no option list any more. */
      const d = document.getElementById("dialog-expense");
      const trip = state.trips[0];
      if (!trip) return skip("no trips");
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      try {
        if (d.querySelector("select[name='status']")) return "payment status is still a <select>";
        const hidden = d.querySelector("input[type=hidden][name='status']");
        if (!hidden) return "the form no longer carries a status value";
        const segs = [...document.querySelectorAll("#expense-status [data-status]")];
        if (segs.length !== 3) return `expected 3 segments, found ${segs.length}`;
        // Exactly one pressed, and it must agree with the value the form will submit.
        const pressed = segs.filter((b) => b.getAttribute("aria-pressed") === "true");
        if (pressed.length !== 1) return `${pressed.length} segments are pressed`;
        if (pressed[0].getAttribute("data-status") !== hidden.value) {
          return `the pressed segment says ${pressed[0].getAttribute("data-status")}, the form says ${hidden.value}`;
        }
        // Tapping one must set the value, move the pressed state, and NOT close the sheet.
        segs.find((b) => b.getAttribute("data-status") === "paid").click();
        if (!d.open) return "tapping a segment closed the sheet";
        if (hidden.value !== "paid") return `the form value is ${hidden.value} after tapping Paid`;
        return segs.filter((b) => b.getAttribute("aria-pressed") === "true")[0]
          ?.getAttribute("data-status") === "paid" ? true : "the pressed state did not move";
      } finally {
        if (d.open) closeDialog(d);
      }
    });

    check("picking Paid fills the amount paid", () => {
      const trip = state.trips.find((t) => t.expenses && t.expenses.length);
      if (!trip) return skip("no trip with an expense");
      const d = document.getElementById("dialog-expense");
      openExpenseDialog(trip.id, trip.expenses[0]);
      try {
        // This reconciliation used to live in the form's `input` handler, which a hidden input
        // never fires — so it had to move into setExpenseStatus.
        document.querySelector('#expense-status [data-status="paid"]').click();
        const amount = Number(d.querySelector('[name="amount"]').value) || 0;
        const paid = Number(d.querySelector('[name="amountPaid"]').value) || 0;
        if (amount > 0 && paid !== amount) return `amount ${amount} but amountPaid ${paid}`;
        document.querySelector('#expense-status [data-status="booked"]').click();
        return Number(d.querySelector('[name="amountPaid"]').value) === 0
          ? true : "switching away from Paid left the paid amount behind";
      } finally {
        if (d.open) closeDialog(d);
      }
    });

    check("the itinerary header sticks below the app bar, not under it", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      return withItineraryVisible(() => {
        const bar = document.querySelector(".appbar");
        const hdr = document.getElementById("itin-sticky");
        if (!bar || !hdr) return "app bar or itinerary header missing";
        if (getComputedStyle(hdr).position !== "sticky") return skip("desktop layout — header not sticky");
        /* Both are sticky at the top. With the header also at top:0 it slid UNDERNEATH the app
           bar, hiding the Timeline/Maps toggle — which on the map tab read as "the map covers
           the sticky header". */
        const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h")) || 0;
        if (barH <= 0) return "the app bar height was never measured";
        const top = parseFloat(getComputedStyle(hdr).top) || 0;
        return top >= barH
          ? true : `the header sticks at ${top}px but the app bar is ${barH}px tall`;
      });
    });

    check("destinations sit directly under the trip name", () => {
      /* Isaac added a second city by typing it into "Trip name" — the field a dialog opens on —
         while Destinations sat three fields below behind a ghost button. The route strip then
         correctly showed one city, which read as the edit being lost. Order is the fix. */
      const form = document.getElementById("form-trip");
      const fields = [...form.querySelectorAll(".field")];
      const nameIdx = fields.findIndex((f) => f.querySelector("[name='name']"));
      const destIdx = fields.findIndex((f) => f.querySelector("#dest-rows"));
      if (nameIdx < 0 || destIdx < 0) return "trip name or destinations field missing";
      if (destIdx !== nameIdx + 1) {
        return `destinations is ${destIdx - nameIdx} fields below the name, not 1`;
      }
      const label = fields[destIdx].querySelector(".field__label")?.textContent || "";
      if (!/route/i.test(label)) return `the label "${label}" does not say what destinations do`;
      // A ghost button is what made it missable in the first place.
      const add = document.getElementById("dest-add");
      return add && !add.classList.contains("btn--ghost")
        ? true : "the add-destination button is still a ghost";
    });

    check("adding a destination reaches the route strip", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      const before = { destinations: [...(getMeta(trip).destinations || [])], destination: trip.destination };
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      try {
        return withItineraryVisible(() => {
          openTripDialog(trip);
          document.getElementById("dest-add").click();
          const rows = [...document.querySelectorAll("#dest-rows .dest-input")];
          if (rows.length < 2) return "the + button did not add a row";
          rows[rows.length - 1].value = "Vienna, Austria";
          document.getElementById("form-trip")
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          if (!(getMeta(trip).destinations || []).includes("Vienna, Austria")) {
            return "the new destination never reached state";
          }
          renderItinerary();
          const route = document.querySelector("#itinerary-view .route")?.textContent || "";
          return /Vienna/.test(route) ? true : `the route strip reads "${route.replace(/\s+/g, " ").trim()}"`;
        });
      } finally {
        Object.assign(trip, { destinations: before.destinations, destination: before.destination });
        saveState();
        renderItinerary();
      }
    });

    check("the sticky header's background reaches both screen edges", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "maps";
      const res = withItineraryVisible(() => {
        const hdr = document.getElementById("itin-sticky");
        if (getComputedStyle(hdr).position !== "sticky") return skip("desktop layout — not sticky");
        /* .map-layout uses `margin: 0 -1rem` to reach the screen edges. A header inset by the
           same gutter left the map visible in the strips either side of it, which reads exactly
           like the map overlapping the header — the bug Isaac reported twice. Its opaque
           background has to be full-bleed even though its content stays aligned. */
        const r = hdr.getBoundingClientRect();
        if (r.left > 0.5 || r.right < window.innerWidth - 0.5) {
          return `the header spans ${Math.round(r.left)}..${Math.round(r.right)} of ${window.innerWidth}px`;
        }
        // And it must still be opaque, or the map shows through regardless of width.
        const bg = getComputedStyle(hdr).backgroundColor;
        return /rgba\(.*,\s*0(\.\d+)?\)$/.test(bg) ? `the header background is ${bg}` : true;
      });
      itinerarySubTab = "timeline";
      renderItinerary();
      return res;
    });

    check("the map cannot paint over the sticky header", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "maps";
      const res = withItineraryVisible(() => {
        const canvas = document.getElementById("map-canvas");
        if (!canvas) return skip("the map did not render (Leaflet blocked?)");
        /* position:relative alone is NOT a stacking context, so Leaflet's own panes (z-index
           200-700) competed directly with the sticky header at 19-20 and won. */
        const z = getComputedStyle(canvas).zIndex;
        return z !== "auto" && Number(z) <= 0
          ? true : `the map canvas has z-index ${z}, so Leaflet's panes escape it`;
      });
      itinerarySubTab = "timeline";
      renderItinerary();
      return res;
    });

    check("the shared list reads as a checklist you can tick", () => {
      renderFamily();
      const input = document.getElementById("checklist-input");
      if (!input) return "the checklist input is missing";
      /* Removing attachments left this described as "notes", which read as free text even though
         every row has always had a checkbox. Isaac asked for a checklist; it already was one. */
      if (/note/i.test(input.placeholder)) return `the placeholder still says "${input.placeholder}"`;
      const head = document.getElementById("screen-family").textContent;
      if (!/tick/i.test(head)) return "nothing tells you the items can be ticked";
      /* And the tick target must be the row, not a 20px box. Measured on a throwaway row when
         the list is empty — inserting a node to read a CSS rule is not seeding app state, and
         skipping here would have hidden the two assertions above that DID run. */
      const list = document.getElementById("shared-list");
      if (!list) return "the shared list is missing";
      let label = list.querySelector("label");
      let probe = null;
      if (!label) {
        probe = document.createElement("li");
        probe.innerHTML = '<input type="checkbox" /><label>probe</label>';
        list.appendChild(probe);
        label = probe.querySelector("label");
      }
      /* Computed min-height, not a rect: Family is display:none unless it is the active screen,
         and every rect is then 0 — the third time this release that a hidden screen made one of
         my own checks lie. getComputedStyle still reports the specified value. */
      const min = parseFloat(getComputedStyle(label).minHeight) || 0;
      probe?.remove();
      return min >= 44 ? true : `the tick target's min-height is ${min}px`;
    });

    check("the select guard survives pointerdown blurring the select", () => {
      /* QA found the v1.10.5 guard was structurally unreachable: pointerdown on the backdrop
         blurs the select before the click handler runs, so document.activeElement was never
         still a select by the time it looked. Read at pointerdown instead. This check drives
         the real sequence — focus, pointerdown, blur, click — so a guard that reads focus too
         late fails it. */
      const d = document.getElementById("dialog-expense");
      const trip = state.trips[0];
      if (!trip) return skip("no trips");
      openExpenseDialog(trip.id, trip.expenses[0] || null);
      try {
        const sel = d.querySelector("select[name='category']");
        if (!sel) return skip("no select left in this dialog");
        sel.focus();
        if (document.activeElement !== sel) return skip("this element cannot hold focus here");
        // The browser's real order: pointerdown lands, focus leaves the select, then click.
        d.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
        sel.blur();
        d.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        if (!d.open) return "the sheet closed on the first outside tap after using a select";
        // A second outside tap, with no select involved, must still dismiss a clean sheet.
        d.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
        d.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return d.open ? "a clean sheet no longer dismisses on a deliberate outside tap" : true;
      } finally {
        if (d.open) closeDialog(d);
      }
    });

    check("a located hotel pins even when it is the day's only stop", () => {
      /* isMappable excludes hotels and flights, so a day whose only located reservation IS the
         hotel had `stops.length === 0` and the loop bailed before registering the pin. QA proved
         it by switching that reservation's type to Attraction and watching the pin appear. */
      const trip = state.trips.find((t) => getMeta(t).startDate && getMeta(t).endDate);
      if (!trip) return skip("no dated trip");
      const hotel = state.items.find((i) => i.tripId === trip.id && i.type === "hotel");
      if (!hotel) return skip("no hotel on this trip");
      const before = { lat: hotel.location.lat, lng: hotel.location.lng };
      const prevTab = itinerarySubTab, prevFilter = mapDayFilter;
      try {
        hotel.location.lat = 48.8566;
        hotel.location.lng = 2.3522;
        mapDayFilter = "all";
        itinerarySubTab = "maps";
        renderItinerary();
        // The list row is the observable part; the Leaflet marker needs the CDN.
        const rows = document.querySelectorAll("#itinerary-view .mapstop").length;
        return rows > 0 ? true : "a geocoded hotel produced no stop row at all";
      } finally {
        hotel.location.lat = before.lat;
        hotel.location.lng = before.lng;
        itinerarySubTab = prevTab;
        mapDayFilter = prevFilter;
        renderItinerary();
      }
    });

    check("Family lists trips in the one shared order", () => {
      renderFamily();
      /* .member-trip__name, not a guessed selector: my first attempt looked for `.trip-row` and
         `article`, neither of which Family renders, so `shown` was empty and the comparison
         passed against a reversed order. */
      const shown = [...document.querySelectorAll("#screen-family .member-trip__name")]
        .map((el) => el.textContent.trim());
      const expected = sortTripsByUpcoming(state.trips)
        .filter((t) => (getMeta(t).travelers || []).length)
        .map((t) => t.name);
      if (expected.length < 2) return skip("needs two trips with travellers");
      if (!shown.length) return "Family rendered no trip rows to compare";
      return shown.join(",") === expected.join(",")
        ? true : `Family lists ${shown.join(",")}, the shared order is ${expected.join(",")}`;
    });

    /* ---- attachments removed ---- */

    check("the documents key does not survive a load and save", () => {
      const withDocs = {
        trips: [makeTrip()], items: [], version: 2,
        documents: [{ id: "d1", name: "pass.pdf", size: 10, dataUrl: "data:application/pdf;base64,AAA" }],
      };
      const loaded = normalizeState(JSON.parse(JSON.stringify(withDocs)));
      if ("documents" in loaded) return "documents survived normalizeState";
      // Nothing may re-introduce it on the way back out either.
      const saved = JSON.parse(JSON.stringify(loaded));
      return "documents" in saved ? "documents came back on save" : true;
    });

    check("an old payload with attachments merges cleanly", () => {
      /* A device still on v1.10.x will keep sending them until it reloads. The merge must
         accept that payload, drop the attachments, and preserve everything else — rather than
         throwing on the missing addRemoveOnly path that used to handle them. */
      const doc = { id: "d1", name: "old.pdf", size: 10, dataUrl: "data:application/pdf;base64,AAA" };
      const base = normalizeState({ trips: [makeTrip({ id: "t1" })], items: [], version: 2, documents: [doc] });
      const local = normalizeState({ trips: [makeTrip({ id: "t1", budget: 999 })], items: [], version: 2, documents: [doc] });
      const remote = normalizeState({ trips: [makeTrip({ id: "t1" })], items: [], version: 2, documents: [doc] });
      const res = merge3(base, local, remote);
      if (!res.state) return `the merge refused: ${JSON.stringify(res.stats)}`;
      if ("documents" in res.state) return "the merged state carries documents";
      return eq(res.state.trips[0].budget, 999, "the local edit survived");
    });

    check("Family offers notes only, with nothing to attach", () => {
      renderFamily();
      if (document.getElementById("family-doc-upload")) return "the attach control is still rendered";
      if (document.querySelector("[data-doc-del]")) return "a document row is still rendered";
      // The checklist itself must still work — the point was to remove attachments, not notes.
      return document.getElementById("checklist-add") && document.getElementById("shared-list")
        ? true : "the shared checklist is missing";
    });

    check("a legacy payload cannot reach live state through a merge", () => {
      /* Raised in review as a live bug — merge3 starts from `{ ...remote }`, so a payload from
         a device still on v1.10.5 looked like it would put `documents` back into state. It does
         not: merge3 returns `normalizeState(merged)`, which strips the key. Kept as a guard,
         because that single normalise is now the only thing standing between an old client's
         base64 and both localStorage and the next outbound push. */
      const legacy = {
        trips: [makeTrip({ id: "t1" })], items: [], version: 2,
        documents: [{ id: "d1", name: "old.pdf", size: 10, dataUrl: "data:application/pdf;base64,AAA" }],
      };
      const before = structuredClone(state);
      try {
        const stats = window.VacationApp.mergeWithBase(normalizeState(structuredClone(legacy)), legacy);
        if (!stats) return "the merge returned nothing";
        if ("documents" in state) return "documents came back into live state";
        const stored = localStorage.getItem(STORAGE_KEY) || "";
        return stored.includes("base64") ? "base64 reached localStorage" : true;
      } finally {
        state = before;
        saveState();
      }
    });

    check("the merge base never stores legacy attachments", () => {
      /* The other half of the same review finding. Four of writeMergeBase's call sites pass a
         payload straight from the server; storing one verbatim could exceed the localStorage
         quota, and its catch then DELETES the base — after which the next pull has no base and
         wholesale-replaces, discarding local edits. */
      const KEY = "travelhub-sync-base";
      const prev = localStorage.getItem(KEY);
      try {
        const big = "data:application/pdf;base64," + "A".repeat(200000);
        window.VacationShare?.__writeMergeBaseForTest?.({
          trips: [], items: [], version: 2,
          documents: [{ id: "d1", name: "big.pdf", size: 1, dataUrl: big }],
        });
        const stored = localStorage.getItem(KEY);
        if (stored === null) return skip("share.js did not expose the base writer");
        if (stored.includes("base64")) return "attachment body was stored in the merge base";
        return JSON.parse(stored).documents === undefined
          ? true : "the documents key survived into the base";
      } finally {
        if (prev === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, prev);
      }
    });

    check("leaving the itinerary stops the scroll spy", () => {
      const trip = datedTrip();
      if (!trip) return skip("no dated trip");
      itineraryTripId = trip.id;
      itinerarySubTab = "timeline";
      /* Deliberately NOT withItineraryVisible: its cleanup re-renders on a hidden screen, which
         tears the spy down by itself — so wrapping this check made it pass with the fix removed.
         Route to the itinerary for real, leave the spy armed, then route away. */
      const prevHash = location.hash;
      try {
        location.hash = "#itinerary";
        router();
        if (!dayScrollHandler) return skip("desktop layout — spy never armed");
        /* Screens are hidden with display:none, so the spy's day nodes survive with zero rects:
           every day then reads as above the header, the last one wins, and scrolling an
           unrelated screen rewrote timelineDayIso — which is what the FAB pre-fills. */
        location.hash = "#budget";
        router();
        return dayScrollHandler ? "the scroll handler survived leaving the itinerary" : true;
      } finally {
        location.hash = prevHash || "#trips";
        router();
      }
    });

    check("nothing still points at the removed document code", () => {
      const gone = ["docsTotalBytes", "docsUsageLabel", "documentListHtml", "addDocumentFiles",
                    "bindDocumentActions", "DOC_MAX_BYTES", "DOC_TOTAL_MAX_BYTES"];
      /* A dangling reference to deleted code throws at runtime on a path nobody clicked, which
         is exactly what a test suite will not catch by itself. */
      const alive = gone.filter((n) => typeof window[n] !== "undefined");
      return alive.length ? `still defined: ${alive.join(", ")}` : true;
    });

    /* ---- the harness itself ---- */

    check("a skipped check is reported as skipped, not passed", () => {
      const before = results.length;
      check("(probe) deliberately skipped", () => skip("probe"));
      const rec = results[results.length - 1];
      results.length = before; // don't leave the probe in the report
      if (!rec.skipped) return "a skip was not marked skipped";
      return rec.ok === true ? true : "a skip should not count as a failure either";
    });
  }

  /* ===== 1b13. v1.11.1 — fund additions can be edited and undone ===== */

  function releaseV1111() {
    group("v1.11.1");

    /* Every check here restores the ledger in a finally: currentFunds and fundHistory are the
       one pair in this app that must agree, and a half-restored state would poison the checks
       that follow. */
    function withLedger(fn) {
      const funds = state.currentFunds;
      const hist = structuredClone(state.fundHistory || []);
      const realAlert = window.alert, realConfirm = window.confirm;
      window.alert = () => {};
      window.confirm = () => true;
      try { return fn(); }
      finally {
        state.currentFunds = funds;
        state.fundHistory = hist;
        window.alert = realAlert;
        window.confirm = realConfirm;
        saveState();
        render();
      }
    }

    check("a fund addition can be removed, and the pot follows", () => withLedger(() => {
      const before = state.currentFunds;
      state.fundHistory.push({ id: "f-test", amount: 250, date: "2026-08-04", note: "probe" });
      state.currentFunds = before + 250;
      renderFundHistory();
      const btn = document.querySelector('[data-fund-del="f-test"]');
      if (!btn) return "no remove control on a fund addition";
      if (!/probe/.test(btn.getAttribute("aria-label") || "")) return "the control does not name the entry";
      if (!removeFundAddition("f-test")) return "removeFundAddition refused a plain addition";
      if (state.fundHistory.some((h) => h.id === "f-test")) return "the entry survived";
      return eq(state.currentFunds, before, "pot after removal");
    }));

    check("editing an addition applies the difference, not the whole amount", () => withLedger(() => {
      const before = state.currentFunds;
      state.fundHistory.push({ id: "f-edit", amount: 250, date: "2026-08-04", note: "probe" });
      state.currentFunds = before + 250;
      renderFundHistory();
      /* The pot is a running total that rollovers also draw from, so re-adding the new amount
         would double-count and recomputing it from fundHistory would erase those rollovers. */
      openFundsDialog(state.fundHistory.find((h) => h.id === "f-edit"));
      const f = document.getElementById("form-funds");
      if (f.fundId.value !== "f-edit") return "the dialog did not enter edit mode";
      if (Number(f.amount.value) !== 250) return "the dialog did not prefill the amount";
      f.amount.value = "400";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const entry = state.fundHistory.find((h) => h.id === "f-edit");
      if (!entry || entry.amount !== 400) return `the entry reads ${entry && entry.amount}`;
      return eq(state.currentFunds, before + 400, "pot after editing 250 to 400");
    }));

    check("the row body edits and the trash button does not", () => withLedger(() => {
      state.fundHistory.push({ id: "f-row", amount: 10, date: "2026-08-04", note: "probe" });
      state.currentFunds += 10;
      renderFundHistory();
      const row = document.querySelector('[data-fund-edit="f-row"]');
      if (!row) return "the row is not tappable";
      row.click();
      const d = document.getElementById("dialog-funds");
      const opened = d.open && document.getElementById("form-funds").fundId.value === "f-row";
      if (d.open) closeDialog(d);
      return opened ? true : "tapping the row did not open it for editing";
    }));

    check("a rollover offers neither edit nor remove", () => withLedger(() => {
      state.fundHistory.push({ id: "f-roll", amount: 99, date: "2026-08-04", note: "Rollover", type: "rollover" });
      state.currentFunds += 99;
      renderFundHistory();
      /* A rollover already ran reduceSourceBudgets, which clamps on tripSpent() and is not
         idempotent — reversing it would leave the budgets and the ledger disagreeing. */
      if (document.querySelector('[data-fund-edit="f-roll"]')) return "a rollover row is editable";
      if (document.querySelector('[data-fund-del="f-roll"]')) return "a rollover row is removable";
      return removeFundAddition("f-roll") === false
        ? true : "removeFundAddition acted on a rollover";
    }));

    check("the pot is never taken below zero", () => withLedger(() => {
      // Money already rolled onward: the entry is larger than what is left in the pot.
      state.fundHistory = [{ id: "f-big", amount: 5000, date: "2026-08-04", note: "probe" }];
      state.currentFunds = 200;
      renderFundHistory();
      if (removeFundAddition("f-big") !== false) return "removing overdrew the pot";
      if (state.currentFunds !== 200) return `the pot moved to ${state.currentFunds}`;

      // And on the edit path, which is the *lowering* direction — raising can never overdraw.
      openFundsDialog(state.fundHistory[0]);
      const f = document.getElementById("form-funds");
      f.amount.value = "100";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const stillOpen = document.getElementById("dialog-funds").open;
      if (document.getElementById("dialog-funds").open) closeDialog(document.getElementById("dialog-funds"));
      if (state.currentFunds !== 200) return `editing down overdrew the pot to ${state.currentFunds}`;
      if (state.fundHistory[0].amount !== 5000) return "the entry changed despite the refusal";
      // The dialog must stay open so the edit is not silently thrown away.
      return stillOpen ? true : "the dialog closed and lost the edit";
    }));
  }

  /* ===== 1b14. v1.11.2 — Family keyboard and checklist editing ===== */

  function releaseV1112() {
    group("v1.11.2");

    function withChecklist(fn) {
      const backup = structuredClone(state.checklist || []);
      try { return fn(); }
      finally { state.checklist = backup; saveState(); renderFamily(); }
    }

    check("opening Family does not steal focus into the add field", () => withChecklist(() => {
      /* renderFamily called input.focus() unconditionally, so the phone keyboard opened every
         time the tab was viewed — a text cursor when all you wanted was to read the list. */
      return window.__withScreenVisible("screen-family", renderFamily, () => {
        document.body.focus();
        const input = document.getElementById("checklist-input");
        if (!input) return "the add field is missing";
        renderFamily();
        return document.activeElement !== document.getElementById("checklist-input")
          ? true : "focus jumped to the add field just from opening the tab";
      });
    }));

    check("adding an item keeps the cursor for the next one", () => withChecklist(() => {
      /* focus() is a no-op on a display:none screen, so this has to run with Family visible —
         the fifth check this release to be caught by that. */
      return window.__withScreenVisible("screen-family", renderFamily, () => {
        const input = document.getElementById("checklist-input");
        input.value = "Probe item";
        document.getElementById("checklist-add").click();
        // The focus IS wanted here — you are mid-flow adding several things.
        const focused = document.activeElement === document.getElementById("checklist-input");
        if (!state.checklist.some((c) => c.text === "Probe item")) return "the item was not added";
        return focused ? true : "the cursor left the field after adding";
      });
    }));

    check("a checklist item can be edited, not only deleted", () => withChecklist(() => {
      state.checklist = [{ id: "chk-probe", text: "Passprts", done: false }];
      renderFamily();
      const btn = document.querySelector('[data-chk-edit="chk-probe"]');
      if (!btn) return "no edit control on a checklist item";
      btn.click();
      const input = document.querySelector(".checklist__edit");
      if (!input) return "the row did not become editable";
      if (input.value !== "Passprts") return `the editor prefilled "${input.value}"`;
      input.value = "Passports";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      const item = state.checklist.find((c) => c.id === "chk-probe");
      // The id must survive, or ticking and deleting break the way expenses once did.
      return item && item.text === "Passports" && item.id === "chk-probe"
        ? true : `the item reads ${JSON.stringify(item)}`;
    }));

    check("Escape abandons a checklist edit", () => withChecklist(() => {
      state.checklist = [{ id: "chk-esc", text: "Keep me", done: true }];
      renderFamily();
      document.querySelector('[data-chk-edit="chk-esc"]').click();
      const input = document.querySelector(".checklist__edit");
      if (!input) return "the row did not become editable";
      input.value = "discard me";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const item = state.checklist.find((c) => c.id === "chk-esc");
      if (item.text !== "Keep me") return `Escape saved "${item.text}"`;
      return item.done === true ? true : "the ticked state was lost";
    }));

    check("editing leaves ticking and deleting working", () => withChecklist(() => {
      state.checklist = [{ id: "chk-both", text: "Tickets", done: false }];
      renderFamily();
      document.querySelector('[data-chk-edit="chk-both"]').click();
      const input = document.querySelector(".checklist__edit");
      input.value = "Tickets and passes";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      document.querySelector('[data-chk="chk-both"]').click();
      if (!state.checklist[0].done) return "ticking stopped working after an edit";
      const del = document.querySelector('[data-chk-del="chk-both"]');
      if (!del) return "the delete control vanished";
      // Both controls must name the NEW text, not the text it was created with.
      return /Tickets and passes/.test(del.getAttribute("aria-label") || "")
        ? true : `delete is labelled "${del.getAttribute("aria-label")}"`;
    }));
 
    /* The Bookings filter used to be All / Flights / Hotels / Other, where "Other" swept up six
       of the eight types — attractions, restaurants, cafés, shops, transport and other. It was
       the biggest bucket and told you nothing. */

    function withBookings(items, fn) {
      const backup = structuredClone(state.items);
      const filterBackup = bookingsFilter;
      const trip = state.trips[0];
      if (!trip) return "no trip to hang reservations on";
      try {
        state.items = items.map((it, i) => ({
          id: `bk-probe-${i}`, tripId: trip.id, title: `Probe ${i}`, date: "", startTime: "",
          endTime: "", location: { name: "" }, details: "", confirmation: "", ...it,
        }));
        renderBookings();
        return fn(trip);
      } finally {
        state.items = backup;
        bookingsFilter = filterBackup;
        renderBookings();
      }
    }

    const chipValues = () =>
      [...document.querySelectorAll("#bookings-body [data-bookings-filter]")]
        .map((c) => c.getAttribute("data-bookings-filter"));

    check("the Bookings filter offers one chip per type present", () =>
      withBookings(
        [{ type: "flight" }, { type: "restaurant" }, { type: "restaurant" }, { type: "transport" }],
        () => {
          const got = chipValues();
          const want = ["all", "flight", "restaurant", "transport"];
          // Order follows ITEM_TYPES so the chips do not reshuffle as data changes.
          return got.join(",") === want.join(",")
            ? true : `chips are ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
        }
      ));

    check("no chip is offered for a type with no reservations", () =>
      withBookings([{ type: "hotel" }], () => {
        const got = chipValues();
        if (got.includes("flight")) return "a Flights chip appeared with no flights";
        // Eight types exist; only the one in use may show.
        return got.length === 2 ? true : `${got.length} chips for a single hotel: ${got.join(",")}`;
      }));

    check("each chip carries its count", () =>
      withBookings([{ type: "cafe" }, { type: "cafe" }, { type: "cafe" }, { type: "store" }], () => {
        const cafe = document.querySelector('[data-bookings-filter="cafe"]');
        if (!cafe) return "no Cafés chip";
        const count = cafe.querySelector(".filter-chip__count");
        if (!count) return "the chip shows no count";
        if (count.textContent.trim() !== "3") return `the count reads "${count.textContent.trim()}"`;
        const all = document.querySelector('[data-bookings-filter="all"] .filter-chip__count');
        if (all.textContent.trim() !== "4") return `All reads "${all.textContent.trim()}", expected 4`;
        /* The count is inside the label, so a screen reader would say "Cafés 3" — the
           aria-label spells it out instead. */
        return /3 bookings/.test(cafe.getAttribute("aria-label") || "")
          ? true : `aria-label is "${cafe.getAttribute("aria-label")}"`;
      }));

    check("Other now means the literal other type, not everything unclassified", () =>
      withBookings([{ type: "other", title: "Spa" }, { type: "restaurant", title: "Le Comptoir" }], () => {
        document.querySelector('[data-bookings-filter="other"]').click();
        const titles = [...document.querySelectorAll("#bookings-body .booking__title")]
          .map((t) => t.textContent);
        if (titles.length !== 1) return `Other showed ${titles.length} cards: ${titles.join(" | ")}`;
        return /Spa/.test(titles[0]) ? true : `Other showed "${titles[0]}"`;
      }));

    check("selecting a type shows only that type", () =>
      withBookings([{ type: "flight", title: "LY315" }, { type: "hotel", title: "Hotel Bel" }], () => {
        document.querySelector('[data-bookings-filter="hotel"]').click();
        const titles = [...document.querySelectorAll("#bookings-body .booking__title")]
          .map((t) => t.textContent);
        if (titles.length !== 1 || !/Hotel Bel/.test(titles[0])) return `showed ${titles.join(" | ")}`;
        const chip = document.querySelector('[data-bookings-filter="hotel"]');
        // Single-select: exactly one chip active, and it says so out loud.
        const active = document.querySelectorAll("#bookings-body .filter-chip.is-active").length;
        if (active !== 1) return `${active} chips are active at once`;
        return chip.getAttribute("aria-pressed") === "true"
          ? true : "the active chip does not report aria-pressed";
      }));

    check("a filter whose last reservation is gone falls back to All", () =>
      withBookings([{ type: "flight" }, { type: "store", title: "Galeries" }], () => {
        document.querySelector('[data-bookings-filter="store"]').click();
        /* Deleting the only shop also deletes its chip — without the fallback you are left on a
           filter with no cards and nothing to tap to get out of it. */
        state.items = state.items.filter((i) => i.type !== "store");
        renderBookings();
        if (bookingsFilter !== "all") return `the filter stayed on "${bookingsFilter}"`;
        return document.querySelectorAll("#bookings-body .booking").length === 1
          ? true : "the flight did not come back into view";
      }));

    /* The appbar + used to open the *trip* form on every screen but Budget and Family — so on
       Bookings, a list of reservations, it asked you to name a new holiday. */

    function withScreen(hash, fn) {
      const backHash = location.hash;
      const backFilter = bookingsFilter;
      const backTrip = itineraryTripId;
      ["dialog-item", "dialog-trip"].forEach((id) => { const d = document.getElementById(id); if (d?.open) closeDialog(d); });
      try { location.hash = hash; return fn(); }
      finally {
        ["dialog-item", "dialog-trip"].forEach((id) => { const d = document.getElementById(id); if (d?.open) closeDialog(d); });
        location.hash = backHash; bookingsFilter = backFilter; itineraryTripId = backTrip;
      }
    }

    const tapAdd = () => document.getElementById("btn-appbar-add").click();

    check("the + on Bookings adds a reservation, not a trip", () =>
      withScreen("#bookings", () => {
        tapAdd();
        if (document.getElementById("dialog-trip").open) return "it opened the new-trip form";
        const dlg = document.getElementById("dialog-item");
        if (!dlg.open) return "nothing opened";
        const title = document.getElementById("item-dialog-title").textContent;
        return /Add booking/.test(title) ? true : `the dialog is titled "${title}"`;
      }));

    check("Bookings asks which trip, since it spans all of them", () =>
      withScreen("#bookings", () => {
        if (state.trips.length < 2) return skip("only one trip exists");
        tapAdd();
        const field = document.getElementById("item-trip-field");
        if (field.hidden) return "the trip picker stayed hidden";
        const btns = [...field.querySelectorAll("[data-trip-choice]")];
        if (btns.length !== state.trips.length) return `${btns.length} choices for ${state.trips.length} trips`;
        const pressed = btns.filter((b) => b.getAttribute("aria-pressed") === "true");
        if (pressed.length !== 1) return `${pressed.length} trips are selected at once`;
        // Picking a different trip must actually retarget the reservation.
        const other = btns.find((b) => b !== pressed[0]);
        other.click();
        const form = document.getElementById("form-item");
        return form.tripId.value === other.getAttribute("data-trip-choice")
          ? true : `the form still targets ${form.tripId.value}`;
      }));

    check("the active filter prefills the type", () =>
      withScreen("#bookings", () => {
        const form = document.getElementById("form-item");
        /* Poison the field first. Without this the check passed against a mutant that never
           opened the reservation dialog at all — it was reading a leftover value from an
           earlier check rather than anything this tap did. */
        form.reset();
        form.type.value = "attraction";
        bookingsFilter = "hotel";
        tapAdd();
        if (!document.getElementById("dialog-item").open) return "the reservation dialog did not open";
        return form.type.value === "hotel" ? true : `a new reservation defaulted to "${form.type.value}"`;
      }));

    check("the + on the Itinerary adds to the trip and day you are looking at", () =>
      withScreen("#itinerary", () => {
        const trip = state.trips.find((t) => getMeta(t).startDate);
        if (!trip) return skip("no dated trip to open");
        setItineraryTrip(trip.id);
        renderItinerary();
        const iso = timelineDayIso;
        tapAdd();
        const form = document.getElementById("form-item");
        if (!document.getElementById("dialog-item").open) return "the reservation dialog did not open";
        if (form.tripId.value !== trip.id) return `it targeted ${form.tripId.value}, not the open trip`;
        // The trip is implied by the screen, so asking again would be noise.
        if (!document.getElementById("item-trip-field").hidden) return "it asked which trip anyway";
        return !iso || form.date.value === iso ? true : `the date defaulted to "${form.date.value}", not ${iso}`;
      }));

    check("the + on Trips still adds a trip", () =>
      withScreen("#trips", () => {
        tapAdd();
        if (document.getElementById("dialog-item").open) return "it opened the reservation form";
        return document.getElementById("dialog-trip").open ? true : "nothing opened";
      }));

    check("with no trips at all, + falls back to creating one", () => {
      const backup = structuredClone(state.trips);
      try {
        return withScreen("#bookings", () => {
          state.trips = [];
          tapAdd();
          /* A reservation with no trip to belong to is not a thing the model can hold — this is
             the one case where the trip form is the right answer on Bookings. */
          return document.getElementById("dialog-trip").open ? true : "it offered an orphan reservation";
        });
      } finally { state.trips = backup; renderBookings(); }
    });

    /* A family that keeps its history will have a dozen trips. The picker started as a wrapping
       segmented control, which at eight trips was 156px of pill blob with the text breaking
       inside the buttons. */

    function withManyTrips(fn) {
      const backup = structuredClone(state.trips);
      const seed = state.trips[0];
      if (!seed) return "no trip to clone";
      const mk = (name, start, end) => ({
        ...structuredClone(seed), id: "many-" + name, name, expenses: [],
        destination: name, destinations: [name], startDate: start, endDate: end,
      });
      /* All eight ahead of us. The picker drops finished trips, so a fixture that is half past
         only offers four — which fits without scrolling and quietly stops the layout check
         proving anything. The past-trip filter has its own fixture below. */
      try {
        state.trips = [
          mk("Paris", "2099-09-16", "2099-09-21"),
          mk("Yule", "2099-12-10", "2099-12-16"),
          mk("Tokyo", "2100-03-04", "2100-03-15"),
          mk("Manhattan", "2100-08-01", "2100-08-09"),
          mk("Kyoto", "2101-04-02", "2101-04-09"),
          mk("Oslo", "2101-09-11", "2101-09-18"),
          mk("Cairo", "2102-01-05", "2102-01-11"),
          mk("Lima", "2102-06-20", "2102-06-28"),
        ];
        return fn();
      } finally { state.trips = backup; renderBookings(); }
    }

    check("the trip picker stays one line however many trips there are", () =>
      withManyTrips(() =>
        withScreen("#bookings", () => {
          tapAdd();
          const box = document.getElementById("item-trip-choice");
          const chip = box.firstElementChild;
          const rowH = Math.round(box.getBoundingClientRect().height);
          const chipH = Math.round(chip.getBoundingClientRect().height);
          // One row means the strip is no taller than a chip plus its own small padding.
          if (rowH > chipH + 12) return `${rowH}px of picker for a ${chipH}px chip — it wrapped`;
          if (chipH < 44) return `chips are ${chipH}px, under the touch target`;
          return box.scrollWidth > box.clientWidth
            ? true : "eight trips fitted without scrolling, so this proves nothing";
        })
      ));

    check("finished trips are not offered to book into", () => {
      const backup = structuredClone(state.trips);
      const seed = state.trips[0];
      if (!seed) return skip("no trip to clone");
      const mk = (name, start, end) => ({
        ...structuredClone(seed), id: "mix-" + name, name, expenses: [],
        destination: name, destinations: [name], startDate: start, endDate: end,
      });
      try {
        state.trips = [
          mk("Rome", "2024-04-02", "2024-04-09"),
          mk("Athens", "2025-06-20", "2025-06-28"),
          mk("Paris", "2099-09-16", "2099-09-21"),
          mk("Tokyo", "2100-03-04", "2100-03-15"),
        ];
        return withScreen("#bookings", () => {
          tapAdd();
          const names = [...document.querySelectorAll("[data-trip-choice]")]
            .map((b) => b.getAttribute("data-trip-choice").replace("mix-", ""));
          /* You do not book a holiday you have already taken. Seeing past *bookings* is a
             separate need, parked for v2 — see design/V2-PLAN.md. */
          const past = names.filter((n) => ["Rome", "Athens"].includes(n));
          if (past.length) return `finished trips are still offered: ${past.join(", ")}`;
          return names.join(",") === "Paris,Tokyo"
            ? true : `expected Paris, Tokyo — got ${names.join(", ") || "nothing"}`;
        });
      } finally { state.trips = backup; renderBookings(); }
    });

    check("with nothing upcoming, the picker offers the finished trips", () => {
      const backup = structuredClone(state.trips);
      const seed = state.trips[0];
      if (!seed) return skip("no trip to clone");
      const mk = (name, start, end) => ({
        ...structuredClone(seed), id: "old-" + name, name, expenses: [],
        destination: name, destinations: [name], startDate: start, endDate: end,
      });
      try {
        // Two, so the picker actually shows — with one trip it is hidden and proves nothing.
        state.trips = [mk("Rome", "2024-04-02", "2024-04-09"), mk("Athens", "2025-06-20", "2025-06-28")];
        return withScreen("#bookings", () => {
          tapAdd();
          const names = [...document.querySelectorAll("[data-trip-choice]")]
            .map((b) => b.getAttribute("data-trip-choice").replace("old-", ""));
          /* Filtering to nothing would leave an empty picker and a form pointing at a trip with
             no chip — the family that stops planning still has to be able to add a receipt. */
          if (!names.length) return "the picker came back empty";
          return names.length === 2
            ? true : `only ${names.join(", ")} was offered`;
        });
      } finally { state.trips = backup; renderBookings(); }
    });

    check("a finished trip you are already on keeps its chip", () => {
      const backup = structuredClone(state.trips);
      const backTrip = itineraryTripId;
      const seed = state.trips[0];
      if (!seed) return skip("no trip to clone");
      const mk = (name, start, end) => ({
        ...structuredClone(seed), id: "sel-" + name, name, expenses: [],
        destination: name, destinations: [name], startDate: start, endDate: end,
      });
      try {
        state.trips = [mk("Rome", "2024-04-02", "2024-04-09"), mk("Tokyo", "2100-03-04", "2100-03-15")];
        // You were just looking at the finished trip on the Itinerary, so that is what + targets.
        itineraryTripId = "sel-Rome";
        return withScreen("#bookings", () => {
          tapAdd();
          const names = [...document.querySelectorAll("[data-trip-choice]")]
            .map((b) => b.getAttribute("data-trip-choice").replace("sel-", ""));
          const form = document.getElementById("form-item");
          if (form.tripId.value !== "sel-Rome") return `the form targets "${form.tripId.value}"`;
          return names.includes("Rome") && names.includes("Tokyo")
            ? true : `the selected finished trip has no chip: ${names.join(", ") || "none"}`;
        });
      } finally { state.trips = backup; itineraryTripId = backTrip; renderBookings(); }
    });

    check("the picker opens on an upcoming trip, not an old one", () =>
      withManyTrips(() =>
        withScreen("#bookings", () => {
          tapAdd();
          const id = document.getElementById("form-item").tripId.value;
          const trip = state.trips.find((t) => t.id === id);
          if (!trip) return `the form targets "${id}", which is not a trip`;
          return tripTiming(trip).state !== "past"
            ? true : `it defaulted to ${trip.name}, which has already happened`;
        })
      ));
  }

  function releaseV1113() {
    group("v1.11.3");

    /* Timeline and Maps each kept their own idea of "the day". Scroll the timeline to day 5,
       tap Maps, and you got the whole trip — or whichever day the map happened to be left on. */

    const dated = () => state.trips.find((t) => t.startDate && t.endDate && eachDay(t).length > 2);

    function onItinerary(fn) {
      const backTab = itinerarySubTab, backTrip = itineraryTripId;
      const backIso = timelineDayIso, backFilter = mapDayFilter, backChosen = dayChosen;
      const backY = window.scrollY;
      try { return window.__withScreenVisible("screen-itinerary", renderItinerary, fn); }
      finally {
        itinerarySubTab = backTab; itineraryTripId = backTrip; timelineDayIso = backIso;
        mapDayFilter = backFilter; dayChosen = backChosen;
        window.scrollTo(0, backY); renderItinerary();
      }
    }

    const tapSubTab = (key) =>
      document.querySelector(`.switcher--sub [data-subtab="${key}"]`)?.click();

    check("the day you scrolled to is the day the map opens on", () => {
      const trip = dated();
      if (!trip) return skip("no multi-day trip");
      return onItinerary(() => {
        itineraryTripId = trip.id; itinerarySubTab = "timeline";
        mapDayFilter = "all"; renderItinerary();
        if (!stickyHeaderHeight()) return skip("desktop layout — no sticky day strip");
        const isos = eachDay(trip).map(isoOf);
        const target = isos[2];
        // Go through the strip: the same code path a scroll ends in, minus the flaky scrolling.
        const chip = document.querySelector(`[data-strip-day="${target}"]`);
        if (!chip) return "the day strip has no chip for that day";
        chip.click();
        if (!dayChosen) return "tapping a day did not count as choosing one";
        tapSubTab("maps");
        return mapDayFilter === target
          ? true : `the map opened on "${mapDayFilter}", not ${target}`;
      });
    });

    check("a real scroll, not just a tap, carries the day across", () => {
      const trip = dated();
      if (!trip) return skip("no multi-day trip");
      return onItinerary(() => {
        itineraryTripId = trip.id; itinerarySubTab = "timeline";
        timelineDayIso = null; dayChosen = false; mapDayFilter = "all"; renderItinerary();
        if (!stickyHeaderHeight()) return skip("desktop layout — no sticky day strip");
        const isos = eachDay(trip).map(isoOf);
        /* Point the strip at a later day, then scroll to the top so the spy has somewhere to move
           it back to. Scrolling *down* proves nothing on the seed trip: it is four days in ~580px,
           so the day under the header never changes. */
        timelineDayIso = isos[isos.length - 1];
        dayChosen = false;
        window.scrollTo(0, 0);
        /* Two things this has to defeat: the rAF throttle, so call the body directly rather than
           waiting a frame that may never come; and a previous check's jump leaving the
           programmatic-scroll guard armed, which made this order-dependent the first time. */
        programmaticScrollUntil = 0;
        syncDayFromScroll(true);
        if (timelineDayIso === isos[isos.length - 1]) return "the scroll spy did not move the day";
        if (!dayChosen) return "a scroll did not count as choosing a day";
        const scrolledTo = timelineDayIso;
        tapSubTab("maps");
        return mapDayFilter === scrolledTo
          ? true : `scrolled to ${scrolledTo} but the map shows "${mapDayFilter}"`;
      });
    });

    check("Maps still opens on the whole trip when you have not picked a day", () => {
      const trip = dated();
      if (!trip) return skip("no multi-day trip");
      return onItinerary(() => {
        itineraryTripId = trip.id; itinerarySubTab = "timeline";
        /* The scroll spy sets a day the instant the timeline renders. Carrying that would mean
           the map never opened on the full route, which is the point of the map. */
        timelineDayIso = null; dayChosen = false; mapDayFilter = "all";
        renderItinerary();
        tapSubTab("maps");
        return mapDayFilter === "all"
          ? true : `the map filtered itself to "${mapDayFilter}" without being asked`;
      });
    });

    check("a day picked on the map is where the timeline lands", () => {
      const trip = dated();
      if (!trip) return skip("no multi-day trip");
      return onItinerary(() => {
        itineraryTripId = trip.id; itinerarySubTab = "maps";
        const isos = eachDay(trip).map(isoOf);
        mapDayFilter = isos[1];
        renderItinerary();
        tapSubTab("timeline");
        return timelineDayIso === isos[1]
          ? true : `the timeline came back on "${timelineDayIso}", not ${isos[1]}`;
      });
    });

    check("the map's day chips match the timeline's", () => {
      const trip = dated();
      if (!trip) return skip("no multi-day trip");
      return onItinerary(() => {
        itineraryTripId = trip.id;
        const shape = (sel) => {
          const chips = [...document.querySelectorAll(sel)];
          if (!chips.length) return null;
          const c = chips[0], r = c.getBoundingClientRect();
          return {
            text: c.textContent.trim(),
            dow: c.querySelector(".dc-dow")?.textContent || "",
            num: c.querySelector(".dc-num")?.textContent || "",
            w: Math.round(r.width), h: Math.round(r.height),
          };
        };
        itinerarySubTab = "maps"; renderItinerary();
        const mp = shape('[data-day]:not([data-day="all"])');
        if (!mp) return "the map has no day chips";
        /* Checked at every width, not only on the phone. The tile styling used to live inside the
           <=900px block, so adding the two spans made the desktop chip read "Wed16" crammed into
           a 40px pill — worse than the bare number it replaced. */
        if (!mp.dow) return "the map chip has no day-of-week line";
        const chip = document.querySelector('[data-day]:not([data-day="all"])');
        if (getComputedStyle(chip).flexDirection !== "column")
          return "the two lines are not stacked — they run together";
        itinerarySubTab = "timeline"; renderItinerary();
        const tl = shape("[data-strip-day]");
        // Above 900px the timeline's strip is hidden, so there is nothing to compare against.
        if (!tl || !stickyHeaderHeight()) return skip("desktop layout — the timeline has no strip");
        if (mp.dow !== tl.dow || mp.num !== tl.num)
          return `timeline shows "${tl.dow}/${tl.num}", the map "${mp.dow}/${mp.num}"`;
        return mp.w === tl.w && mp.h === tl.h
          ? true : `timeline chips are ${tl.w}x${tl.h}, the map's ${mp.w}x${mp.h}`;
      });
    });

    check("switching trips does not carry the old trip's day", () => {
      const trips = state.trips.filter((t) => t.startDate && t.endDate);
      if (trips.length < 2) return skip("needs two dated trips");
      return onItinerary(() => {
        itineraryTripId = trips[0].id;
        timelineDayIso = eachDay(trips[0]).map(isoOf)[1];
        dayChosen = true;
        // The ISO belongs to the old trip's calendar and means nothing in the new one.
        setItineraryTrip(trips[1].id);
        if (dayChosen) return "the new trip inherited a chosen day";
        itinerarySubTab = "timeline"; mapDayFilter = "all"; renderItinerary();
        tapSubTab("maps");
        return mapDayFilter === "all"
          ? true : `the new trip's map opened filtered to "${mapDayFilter}"`;
      });
    });
  }

  /* ===== v1.12.0 — text contrast =====
     The coral is a fill colour that had been doing text duty, at ratios as low as 2.62:1 on a
     number about money. The fix was a set of *-text tokens, and the thing worth guarding is not
     "the tokens exist" but "the tokens still clear 4.5:1 against every warm surface" — the
     margins are thin (0.17 on --cream for --muted, 0.23 for --brand-text), so a nudge to any
     surface token silently breaks them. Everything below is computed from the live custom
     properties, never from a hard-coded hex, so editing a token moves the test with it. */

  function releaseV1120() {
    group("v1.12.0");

    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function rgbOf(value) {
      // Resolve any CSS colour (hex, rgb(), name) to channels via the browser itself.
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      const m = resolved.match(/-?[\d.]+/g);
      return m ? m.slice(0, 3).map(Number) : null;
    }
    function luminance(rgb) {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(a, b) {
      const x = luminance(rgbOf(a)), y = luminance(rgbOf(b));
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }

    /* Every background a token-coloured label can land on. --brand-soft and --cream are the
       tight ones; checking only against white would pass tokens that fail in the sidebar. */
    const SURFACES = ["--surface", "--bg", "--cream-2", "--cream", "--brand-soft"];
    const TEXT_TOKENS = ["--brand-text", "--warn-text", "--success-text", "--danger-text", "--muted"];

    TEXT_TOKENS.forEach((token) => {
      check(`${token} clears 4.5:1 on every warm surface`, () => {
        const colour = css(token);
        if (!colour) return `${token} is not defined`;
        const failures = SURFACES
          .map((s) => ({ s, r: ratio(colour, css(s)) }))
          .filter((x) => x.r < 4.5)
          .map((x) => `${x.s}=${x.r.toFixed(2)}`);
        return failures.length ? `${token} (${colour}) fails on ${failures.join(", ")}` : true;
      });
    });

    check("the coral fill token is NOT used as text anywhere", () => {
      /* The point of the split: if --brand ever creeps back onto glyphs the ratios above stop
         describing the app. Walks rendered text nodes rather than the stylesheet, so it also
         catches inline styles and JS-set colours. */
      const brand = rgbOf(css("--brand")).join(",");
      const offenders = [];
      document.querySelectorAll("body *").forEach((el) => {
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) return;
        const c = getComputedStyle(el).color.match(/-?[\d.]+/g);
        if (c && c.slice(0, 3).join(",") === brand) offenders.push(el.className || el.tagName);
      });
      return offenders.length ? `--brand used as text on: ${offenders.slice(0, 5).join(", ")}` : true;
    });

    /* The hero and the trip-card covers are the one place text sits on a GRADIENT rather than
       on a flat token, so the surface loop above cannot see them — and it is where the worst
       ratio in the app lived (white on salmon, 2.06:1). Rather than asserting a particular
       remedy, this reads the gradient's own colour stops out of the computed background and
       checks the text against each one. That survives the decision going either way: darken
       the salmon and keep white text, or keep the salmon and darken the text. */
    function gradientStops(el) {
      const bg = getComputedStyle(el).backgroundImage;
      const stops = bg.match(/rgba?\([^)]+\)/g) || [];
      // Drop fully-transparent stops: they contribute nothing to what sits behind the glyphs.
      return stops.filter((s) => Number((s.match(/-?[\d.]+/g) || [])[3] ?? 1) > 0.5);
    }

    [
      { sel: ".hero", label: "hero", minRatio: 4.5 },
      { sel: ".tripcard__cover h3", label: "trip-card cover title", minRatio: 3 },
    ].forEach(({ sel, label, minRatio }) => {
      check(`${label} text clears ${minRatio}:1 on every stop of the coral gradient`, () => {
        const el = document.querySelector(sel);
        if (!el) return skip(`no ${label} on screen`);
        // The gradient is painted by .hero / .tripcard__cover, which may be an ancestor.
        const painted = el.closest(".hero, .tripcard__cover");
        const stops = gradientStops(painted);
        if (!stops.length) return `no gradient stops found behind the ${label}`;
        const colour = getComputedStyle(el).color;
        const bad = stops
          .map((s) => ({ s, r: ratio(colour, s) }))
          .filter((x) => x.r < minRatio)
          .map((x) => `${x.s}=${x.r.toFixed(2)}`);
        return bad.length ? `${label} text ${colour} fails on ${bad.join(", ")}` : true;
      });
    });

    /* v1.12.1. The ≤900px rule `.act__actions { display: none }` is written against the
       bare class, so it also hid the Family member row's rename/remove — a row that has no
       ⋯ menu to fall back on. Result: for several releases you could not rename or remove a
       family member on a phone at all, while desktop worked fine. Both review agents missed
       it because both tested Family at desktop width.

       This asserts reachability, not styling: the control must have a real box AND a tap
       area, because display:none and a 0-height overlay fail a user identically. It only
       runs below the breakpoint, since above it there is nothing to prove. */
    check("family member actions stay reachable at phone width", () => {
      if (window.innerWidth > 900) return skip("desktop width — the mobile rule is not in play");
      const members = [...document.querySelectorAll(".member")];
      if (!members.length) return skip("no family members in the document");
      /* Deliberately computed-style, not getBoundingClientRect: the suite runs with Trips
         active, so the whole Family section is display:none and every rect is 0x0 — which
         would fail identically whether or not the bug is present. An element inside a
         display:none subtree still reports its OWN specified display, so this reads the
         thing that actually broke (`.act__actions { display: none }` catching the member
         row) without needing the screen on-shelf. */
      const problems = [];
      members.forEach((m) => {
        const name = m.querySelector(".member__name")?.textContent?.trim() || "?";
        const actions = m.querySelector(".act__actions");
        if (!actions) return problems.push(`${name}: no actions container`);
        if (getComputedStyle(actions).display === "none") {
          return problems.push(`${name}: actions are display:none at ${window.innerWidth}px`);
        }
        [
          ["rename", "[data-member-edit]"],
          ["remove", "[data-member-del]"],
        ].forEach(([label, sel]) => {
          const btn = m.querySelector(sel);
          if (!btn) return problems.push(`${name}: no ${label} button`);
          if (getComputedStyle(btn).display === "none") {
            return problems.push(`${name}: ${label} is display:none`);
          }
          // ::after is the tap overlay and is sized in fixed px, so it reads correctly here too.
          const a = getComputedStyle(btn, "::after");
          const w = parseFloat(a.width) || 0;
          const h = parseFloat(a.height) || 0;
          if (w < 42 || h < 44) problems.push(`${name}: ${label} tap area ${w}x${h}`);
        });
      });
      return problems.length ? problems.join("; ") : true;
    });

    check("expense row actions are 44px tall at phone width", () => {
      /* These are .btn--small, not .icon-btn--small, so the v1.12.0 tap-target work missed
         them: a max-width:600px rule overrode the 44px base down to 40 for exactly the row
         where Delete sits last. min-height is read from computed style so this holds while
         the Budget screen is off-shelf. */
      if (window.innerWidth > 600) return skip("above the rule's breakpoint");
      const btns = [...document.querySelectorAll(".expense-item__actions .btn")];
      if (!btns.length) return skip("no expense rows in the document");
      const bad = btns
        .map((b) => ({ n: b.getAttribute("aria-label") || b.textContent.trim(), h: parseFloat(getComputedStyle(b).minHeight) || 0 }))
        .filter((x) => x.h < 44);
      return bad.length ? `${bad.length} action(s) under 44px, e.g. ${bad[0].n} at ${bad[0].h}` : true;
    });

    check("avatar initials are legible on all three family colours", () => {
      /* The fills are light pastels chosen to tell people apart, so the initial on top of them
         has to be dark; white measured 2.29–2.43:1 across the three. */
      const avatars = [...document.querySelectorAll(".avatar")];
      if (!avatars.length) return skip("no avatars rendered on this screen");
      const bad = avatars
        .map((a) => {
          const cs = getComputedStyle(a);
          return { bg: cs.backgroundColor, r: ratio(cs.color, cs.backgroundColor) };
        })
        .filter((x) => x.r < 4.5)
        .map((x) => `${x.bg}=${x.r.toFixed(2)}`);
      return bad.length ? `initials fail on ${[...new Set(bad)].join(", ")}` : true;
    });

    check("small icon buttons expose a >=42x44 tap target", () => {
      const btn = document.querySelector(".icon-btn--small");
      if (!btn) return skip("no compact icon buttons rendered on this screen");
      const after = getComputedStyle(btn, "::after");
      const w = parseFloat(after.width), h = parseFloat(after.height);
      if (!w || !h) return "no ::after overlay found on .icon-btn--small";
      return (w >= 42 && h >= 44) ? true : `tap overlay is ${w}x${h}`;
    });

    check("the appbar + names what it will actually do", () => {
      /* It used to say "New trip" on Itinerary and Bookings while opening the reservation
         dialog. Asserted per screen because the mismatch only existed on two of the five. */
      const add = document.getElementById("btn-appbar-add");
      if (!add) return "btn-appbar-add missing";
      const expected = {
        trips: "New trip", itinerary: "Add booking", budget: "Add funds",
        bookings: "Add booking", family: "Add checklist item",
      };
      const startHash = location.hash;
      const wrong = [];
      try {
        for (const [screen, label] of Object.entries(expected)) {
          location.hash = "#" + screen;
          router();  // synchronous; the hashchange listener would not have run yet
          const actual = add.getAttribute("aria-label");
          if (actual !== label) wrong.push(`${screen}: "${actual}" (want "${label}")`);
        }
      } finally {
        location.hash = startHash || "#trips";
        try { router(); } catch (e) { /* restoring the screen isn't what we're testing */ }
      }
      return wrong.length ? wrong.join("; ") : true;
    });

    check("fund history shows a formatted date, never raw ISO", () => {
      const formatted = fmtHistoryDate("2026-07-08");
      if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return `still ISO: ${formatted}`;
      return formatted.includes("2026") ? true : `lost the year: ${formatted}`;
    });

    check("fmtHistoryDate passes junk through instead of throwing", () =>
      eq(fmtHistoryDate("not-a-date"), "not-a-date", "junk date"));
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

  /* ===== v1.13.0 — the adopted half of the September journey review =====
     Each check is a bug the review found and we confirmed in code. Everything that touches
     state (the checklist undo, the rename) puts things back before returning. */
  function releaseV1130() {
    group("v1.13.0");

    check("a dated trip files under its start date's year, not the typed one", () => {
      /* A Feb-2027 trip saved with Year 2026 sat in the 2026 budget showing 2027 dates. */
      const r1 = eq(tripYearFor("2027-02-10", "2026"), 2027, "dated");
      if (r1 !== true) return r1;
      return eq(tripYearFor("", "2026"), 2026, "undated keeps the typed year");
    });

    check("picking a start date fills Year and locks the field", () => {
      openTripDialog();
      const form = document.getElementById("form-trip");
      form.year.value = "2026";
      form.startDate.value = "2027-02-10";
      form.startDate.dispatchEvent(new Event("input", { bubbles: true }));
      const out = [
        eq(form.year.value, "2027", "year"),
        eq(form.year.readOnly, true, "readOnly"),
        eq(document.getElementById("trip-year-hint").hidden, false, "hint shown"),
      ].filter((r) => r !== true);
      form.startDate.value = "";
      form.startDate.dispatchEvent(new Event("input", { bubbles: true }));
      const unlocked = eq(form.year.readOnly, false, "unlocks when the date is cleared");
      closeDialog(document.getElementById("dialog-trip"));
      return out.length ? out.join("; ") : unlocked;
    });

    check("the reservation type picker is a radiogroup and Edit focuses the current type", () => {
      /* The <select> is aria-hidden, so AT heard nine plain buttons; and showModal() put the
         keyboard on Flight while Hotel was the one lit. */
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      const item = { id: "probe-item", type: "hotel", title: "Probe", flightNo: "", departAirport: "",
        arrivalAirport: "", date: "2027-02-10", endDate: "2027-02-12", startTime: "", endTime: "",
        location: { name: "" }, confirmation: "", notes: "" };
      openItemDialog(tripId, item);
      const grid = document.getElementById("type-grid");
      const opts = [...grid.querySelectorAll("[data-type-opt]")];
      const hotel = opts.find((b) => b.getAttribute("data-type-opt") === "hotel");
      const problems = [];
      if (grid.getAttribute("role") !== "radiogroup") problems.push("grid is not a radiogroup");
      if (opts.some((b) => b.getAttribute("role") !== "radio")) problems.push("an option is not role=radio");
      if (hotel.getAttribute("aria-checked") !== "true") problems.push("Hotel not aria-checked");
      const others = opts.filter((b) => b !== hotel && b.getAttribute("aria-checked") !== "false");
      if (others.length) problems.push(`${others.length} other option(s) not aria-checked=false`);
      if (document.activeElement !== hotel) {
        problems.push(`focus is on ${document.activeElement?.getAttribute?.("data-type-opt") || document.activeElement?.tagName}, not Hotel`);
      }
      closeDialog(document.getElementById("dialog-item"));
      return problems.length ? problems.join("; ") : true;
    });

    check("Who-are-you has a way out and does not save a name when you take it", () => {
      /* It was the one dialog without Cancel, and Escape left ensureDeviceName's promise
         hanging inside the Share flow. The resolve-on-close is async, so this asserts the
         visible half and the persistence half; the promise is covered by the manual plan. */
      const dlg = document.getElementById("dialog-whoami");
      if (!dlg.querySelector("[data-dialog-close]")) return "no Cancel/close control in the dialog";
      const before = getDeviceName();
      openDialog(dlg);
      dlg.querySelector("[data-dialog-close]").click();
      const stillClosed = eq(dlg.open, false, "closed by the button");
      if (stillClosed !== true) { closeDialog(dlg); return stillClosed; }
      return eq(getDeviceName(), before, "device name untouched");
    });

    check("Escape keeps a half-filled sheet open but lets an untouched one go", () => {
      /* The backdrop path had this guard since v1.10; Escape and Android Back (both `cancel`)
         still threw typed input away. */
      const dlg = document.getElementById("dialog-trip");
      openTripDialog();
      const clean = new Event("cancel", { cancelable: true });
      dlg.dispatchEvent(clean);
      const r1 = eq(clean.defaultPrevented, false, "clean form: cancel allowed");
      dlg.querySelector('[name="name"]').value = "probe";
      const dirty = new Event("cancel", { cancelable: true });
      dlg.dispatchEvent(dirty);
      const r2 = eq(dirty.defaultPrevented, true, "dirty form: cancel blocked");
      dlg.querySelector('[name="name"]').value = "";
      closeDialog(dlg);
      return [r1, r2].filter((r) => r !== true).join("; ") || true;
    });

    check("who-are-you is exempt from the Escape guard", () => {
      const dlg = document.getElementById("dialog-whoami");
      openDialog(dlg);
      dlg.querySelector('[name="name"]').value = "probe";
      const ev = new Event("cancel", { cancelable: true });
      dlg.dispatchEvent(ev);
      dlg.querySelector('[name="name"]').value = "";
      closeDialog(dlg);
      return eq(ev.defaultPrevented, false, "whoami cancel must never be blocked");
    });

    check("each Trips step card is exactly one control", () => {
      /* role=button div wrapping a real button with the same data-go: two overlapping targets. */
      renderTripsScreen();
      const cards = [...document.querySelectorAll("#steps .step-card")];
      if (!cards.length) return "no step cards rendered";
      const bad = cards.filter((c) => c.tagName !== "BUTTON" || c.querySelector("button, [role=button], [tabindex]"));
      if (bad.length) return `${bad.length} card(s) are not a single <button>`;
      const targets = document.querySelectorAll("#steps [data-go]").length;
      return eq(targets, cards.length, "navigation targets per card");
    });

    check("deleting a checklist item offers Undo and Undo puts it back where it was", () => {
      const probe = { id: "probe-undo-" + Date.now(), text: "probe item", done: false };
      const snapshot = state.checklist.slice();
      try {
        state.checklist.splice(Math.min(1, state.checklist.length), 0, probe);
        const index = state.checklist.indexOf(probe);
        renderFamily();
        const del = document.querySelector(`[data-chk-del="${probe.id}"]`);
        if (!del) return "no delete button rendered for the probe";
        del.click();
        if (state.checklist.some((c) => c.id === probe.id)) return "item not removed";
        const toast = document.getElementById("toast");
        const btn = document.getElementById("toast-view");
        if (toast.hidden) return "no toast after delete";
        if (btn.hidden || btn.textContent.trim() !== "Undo") return `toast action is "${btn.textContent.trim()}", not Undo`;
        btn.click();
        const back = state.checklist.findIndex((c) => c.id === probe.id);
        if (back < 0) return "Undo did not restore the item";
        return eq(back, index, "restored index");
      } finally {
        state.checklist = snapshot;
        saveState();
        renderFamily();
        document.getElementById("toast").hidden = true;
      }
    });

    check("renaming a member is inline, never a prompt()", () => {
      const members = [...document.querySelectorAll("#family-body .member")];
      renderFamily();
      const btn = document.querySelector("#family-body [data-member-edit]");
      if (!btn) return skip("no members to rename in this data set");
      const name = btn.getAttribute("data-member-edit");
      const realPrompt = window.prompt;
      let prompted = false;
      window.prompt = () => { prompted = true; return null; };
      try {
        btn.click();
        const input = document.querySelector("#family-body .member__edit");
        if (prompted) return "rename still calls prompt()";
        if (!input) return "no inline input appeared";
        const r1 = eq(input.value, name, "prefilled with the current name");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        const still = state.trips.every((t) => !(t.travelers || []).includes(name)) ? "name lost after Escape" : true;
        const gone = document.querySelector("#family-body .member__edit") ? "input still present after Escape" : true;
        return [r1, still, gone].filter((r) => r !== true).join("; ") || true;
      } finally {
        window.prompt = realPrompt;
        renderFamily();
      }
    });
  }

  /* ===== v1.14.0 — Past trips, Import place, Today card =====
     Everything that touches state backs it up and puts it back. Time-dependent checks pass a
     fixed clock (REF / nowMin) rather than reading the real one. */
  function releaseV1140() {
    group("v1.14.0");

    const REF = "2026-06-15";
    const shift = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
    const mk = (name, s, e, over) => makeTrip({ id: "t-" + name, name, startDate: s, endDate: e, ...(over || {}) });
    const item = (over) => normalizeItem({ id: "it-" + Math.random().toString(36).slice(2, 8), tripId: "t-now", type: "attraction",
      title: "x", date: "", endDate: "", startTime: "", endTime: "", location: { name: "", lat: null, lng: null }, ...over });
    const withTrips = (trips, items, fn) => {
      const bt = state.trips, bi = state.items, bId = itineraryTripId, bPast = itinerarySwitcherShowPast;
      state.trips = trips; state.items = items || [];
      try { return fn(); }
      finally { state.trips = bt; state.items = bi; itineraryTripId = bId; itinerarySwitcherShowPast = bPast; render(); }
    };

    /* ---- foundation: the cancelled flag ---- */

    check("normalizeTripMeta coerces cancelled to a strict boolean, idempotently", () => {
      const cases = [[undefined, false], [true, true], ["true", false], [1, false], [false, false]];
      for (const [input, want] of cases) {
        const t = makeTrip({ cancelled: input });
        normalizeTripMeta(t);
        if (t.cancelled !== want) return `cancelled=${JSON.stringify(input)} became ${t.cancelled}, wanted ${want}`;
        normalizeTripMeta(t);
        if (t.cancelled !== want) return "a second normalize changed the flag";
      }
      return true;
    });

    check("tripArchived: finished by dates, cancelled by flag, upcoming and undated stay live", () => {
      const r = [
        eq(tripArchived(mk("a", "2026-06-01", "2026-06-10"), REF), true, "ended trip"),
        eq(tripArchived(mk("b", "2026-07-01", "2026-07-05", { cancelled: true }), REF), true, "cancelled future trip"),
        eq(tripArchived(mk("c", "2026-07-01", "2026-07-05"), REF), false, "upcoming trip"),
        eq(tripArchived(mk("d", "2026-06-14", "2026-06-16"), REF), false, "travelling trip"),
        eq(tripArchived(mk("e", "", ""), REF), false, "undated trip"),
        eq(tripArchived(mk("f", "", "", { cancelled: true }), REF), true, "undated but cancelled"),
      ].filter((x) => x !== true);
      return r.length ? r.join("; ") : true;
    });

    check("a cancelled future trip sorts with the finished ones", () => {
      const today = todayLocalISO();
      const trips = [
        mk("past", shift(today, -10), shift(today, -8)),
        // Starts BEFORE "soon": by dates alone it would sort second, so this only passes if
        // the flag is what moves it into the finished block.
        mk("cancelled", shift(today, 2), shift(today, 4), { cancelled: true }),
        mk("soon", shift(today, 5), shift(today, 9)),
        mk("now", shift(today, -1), shift(today, 1)),
      ];
      return eq(sortTripsByUpcoming(trips).map((t) => t.name).join(","), "now,soon,cancelled,past", "order");
    });

    check("featuredTrip never features a cancelled trip, even one travelling today", () => {
      const today = todayLocalISO();
      return withTrips([
        mk("cancelled", shift(today, -1), shift(today, 1), { cancelled: true }),
        mk("soon", shift(today, 5), shift(today, 9)),
      ], [], () => eq(featuredTrip()?.name, "soon", "featured"));
    });

    check("the trip dialog shows the Cancelled box only when editing, and saving round-trips it", () => {
      const today = todayLocalISO();
      const trip = mk("edit-me", shift(today, 5), shift(today, 9));
      return withTrips([trip], [], () => {
        openTripDialog();
        const field = document.getElementById("trip-cancelled-field");
        const hiddenOnNew = field.hidden;
        closeDialog(document.getElementById("dialog-trip"));
        if (!hiddenOnNew) return "the Cancelled box is offered on a new trip";
        openTripDialog(trip);
        if (field.hidden) return "the Cancelled box is hidden when editing";
        const form = document.getElementById("form-trip");
        form.cancelled.checked = true;
        form.requestSubmit();
        if (state.trips[0].cancelled !== true) return "ticking the box did not save cancelled=true";
        openTripDialog(state.trips[0]);
        if (!form.cancelled.checked) return "the box did not reflect the saved flag";
        form.cancelled.checked = false;
        form.requestSubmit();
        return eq(state.trips[0].cancelled, false, "unticked and saved");
      });
    });

    check("diffStates reports cancelling and reinstating a trip", () => {
      const base = { ...state, trips: [mk("Rome", "2026-07-01", "2026-07-05")], items: [], checklist: [] };
      const after = { ...base, trips: [mk("Rome", "2026-07-01", "2026-07-05", { cancelled: true })] };
      const texts = (a, b) => diffStates(a, b).map((c) => c.text).join(" | ");
      const r1 = /cancelled trip Rome/.test(texts(base, after)) ? true : `cancel not reported: ${texts(base, after)}`;
      const r2 = /reinstated trip Rome/.test(texts(after, base)) ? true : `reinstate not reported: ${texts(after, base)}`;
      return [r1, r2].filter((x) => x !== true).join("; ") || true;
    });

    check("a cancelled card says Cancelled instead of counting down", () => {
      const html = renderTripOverviewCard(mk("c", shift(todayLocalISO(), 5), shift(todayLocalISO(), 9), { cancelled: true }));
      if (!/tag--cancelled/.test(html)) return "no Cancelled badge";
      return /in \d+ days/.test(html) ? "the countdown is still shown" : true;
    });

    /* ---- A: the fold ---- */

    check("Trips files finished and cancelled trips under Past trips, live ones above", () => {
      const today = todayLocalISO();
      return withTrips([
        mk("past", shift(today, -10), shift(today, -8)),
        mk("soon", shift(today, 5), shift(today, 9)),
        mk("cancelled", shift(today, 20), shift(today, 24), { cancelled: true }),
      ], [], () => window.__withScreenVisible("screen-trips", renderTripsScreen, () => {
        const names = (sel) => [...document.querySelectorAll(`${sel} .tripcard h3`)].map((h) => h.textContent).join(",");
        const fold = document.getElementById("past-trips");
        return [
          eq(names("#trip-cards"), "soon", "live cards"),
          eq(names("#trip-cards-past"), "cancelled,past", "past cards"),
          eq(fold.hidden, false, "fold shown"),
          eq(document.getElementById("past-trips-count").textContent, "2", "count"),
        ].filter((x) => x !== true).join("; ") || true;
      }));
    });

    check("the Past trips fold is hidden when nothing is archived, and stays open across a re-render", () => {
      const today = todayLocalISO();
      const fold = document.getElementById("past-trips");
      const r1 = withTrips([mk("soon", shift(today, 5), shift(today, 9))], [], () => {
        renderTripsScreen();
        return eq(fold.hidden, true, "hidden with nothing archived");
      });
      if (r1 !== true) return r1;
      return withTrips([mk("past", shift(today, -10), shift(today, -8)), mk("soon", shift(today, 5), shift(today, 9))], [], () => {
        renderTripsScreen();
        if (fold.hidden) return "fold hidden although a past trip exists";
        fold.open = true;
        renderTripsScreen();
        const r = eq(fold.open, true, "open survives re-render");
        fold.open = false;
        return r;
      });
    });

    check("the Bookings picker leaves cancelled trips out", () => {
      const today = todayLocalISO();
      return withTrips([
        mk("soon", shift(today, 5), shift(today, 9)),
        mk("cancelled", shift(today, 20), shift(today, 24), { cancelled: true }),
      ], [], () => {
        buildTripChoice("t-soon");
        const names = [...document.querySelectorAll("[data-trip-choice]")].map((b) => b.getAttribute("data-trip-choice"));
        return names.includes("t-cancelled") ? `picker offers the cancelled trip: ${names.join(",")}` : eq(names.join(","), "t-soon", "offered");
      });
    });

    check("Bookings folds a past trip's reservations and still counts them in the chips", () => {
      const today = todayLocalISO();
      const trips = [mk("past", shift(today, -10), shift(today, -8)), mk("soon", shift(today, 5), shift(today, 9))];
      const items = [
        item({ tripId: "t-past", type: "hotel", title: "Old hotel", date: shift(today, -10), endDate: shift(today, -8) }),
        item({ tripId: "t-soon", type: "hotel", title: "New hotel", date: shift(today, 5), endDate: shift(today, 9) }),
      ];
      const bf = bookingsFilter;
      return withTrips(trips, items, () => {
        try {
          bookingsFilter = "all";
          renderBookings();
          const fold = document.getElementById("bookings-past");
          if (!fold) return "no Past trips fold on Bookings";
          if (!fold.querySelector(".booking-group__title")?.textContent.includes("past")) return "the past trip is not inside the fold";
          // Live groups are direct children of the body (v1.15.0: <details class="booking-group">).
          const liveTitles = [...document.querySelectorAll("#bookings-body > .booking-group .booking-group__title")].map((h) => h.textContent);
          if (liveTitles.some((t) => t.includes("past"))) return "the past trip is also listed live";
          if (!liveTitles.length) return "no live group is a direct child of the body — the leak check would pass for the wrong reason";
          const all = document.querySelector('[data-bookings-filter="all"] .filter-chip__count')?.textContent;
          return eq(all, "2", "All chip counts folded bookings too");
        } finally { bookingsFilter = bf; }
      });
    });

    check("the Itinerary switcher hides past trips behind Past trips (N) and opens it for a selected past trip", () => {
      const today = todayLocalISO();
      const trips = [mk("past", shift(today, -10), shift(today, -8)), mk("soon", shift(today, 5), shift(today, 9))];
      return withTrips(trips, [], () => {
        itinerarySwitcherShowPast = false;
        itineraryTripId = "t-soon";
        renderItinerary();
        const sw = document.getElementById("itinerary-switcher");
        const tabs = () => [...sw.querySelectorAll("[data-trip]")].map((b) => b.getAttribute("data-trip")).join(",");
        const toggle = sw.querySelector("[data-switcher-past]");
        if (!toggle) return "no Past trips toggle";
        if (tabs() !== "t-soon") return `tabs while folded: ${tabs()}`;
        if (toggle.getAttribute("role") === "tab") return "the toggle is a tab and would join the arrow-key roving";
        itineraryTripId = "t-past";
        renderItinerary();
        return eq(tabs(), "t-soon,t-past", "tabs when the selected trip is past");
      });
    });

    /* ---- B: Import place from a Google Maps paste ---- */

    check("parseMapsPaste reads a full Maps URL into a name and a pin", () => {
      const a = parseMapsPaste("https://www.google.com/maps/place/Eiffel+Tower/@48.8583,2.2944,17z/data=!3m1");
      const b = parseMapsPaste("https://www.google.com/maps/search/Le+Comptoir+du+Relais/@48.8531,2.3387,17z");
      const c = parseMapsPaste("https://maps.google.com/?q=Sacr%C3%A9-C%C5%93ur,48.8867,2.3431");
      const r = [
        eq(a && a.kind, "place", "a.kind"), eq(a && a.name, "Eiffel Tower", "a.name"), eq(a && a.lat, 48.8583, "a.lat"),
        eq(b && b.name, "Le Comptoir du Relais", "b.name (search)"),
        eq(c && c.kind, "place", "c.kind (q=)"), eq(c && c.name, "Sacré-Cœur", "c.name"),
      ].filter((x) => x !== true);
      return r.length ? r.join("; ") : true;
    });

    check("parseMapsPaste flags a short link, gives bare coordinates no name, and ignores plain text", () => {
      const r = [
        eq(parseMapsPaste("https://maps.app.goo.gl/AbC12dEf")?.kind, "short", "maps.app.goo.gl"),
        eq(parseMapsPaste("https://goo.gl/maps/xyz")?.kind, "short", "goo.gl/maps"),
        eq(parseMapsPaste("48.8583, 2.2944")?.kind, "coords", "bare coords"),
        eq(parseMapsPaste("London Eye"), null, "plain text"),
      ].filter((x) => x !== true);
      return r.length ? r.join("; ") : true;
    });

    check("pasting a Maps link into the name field fills name, location and pin; a typed name is kept", () => {
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      const url = "https://www.google.com/maps/place/Eiffel+Tower/@48.8583,2.2944,17z";
      openItemDialog(tripId);
      const form = document.getElementById("form-item");
      try {
        form.title.value = url;
        form.title.dispatchEvent(new Event("input", { bubbles: true }));
        const r1 = [
          eq(form.title.value, "Eiffel Tower", "title"),
          eq(form.locationName.value, "Eiffel Tower", "location"),
          eq(form.locLat.value, "48.8583", "lat"),
        ].filter((x) => x !== true);
        if (r1.length) return r1.join("; ");
        form.title.value = "Dinner";
        form.locationName.value = url;
        form.locationName.dispatchEvent(new Event("input", { bubbles: true }));
        return [
          eq(form.title.value, "Dinner", "typed title kept"),
          eq(form.locationName.value, "Eiffel Tower", "location from paste"),
        ].filter((x) => x !== true).join("; ") || true;
      } finally { closeDialog(document.getElementById("dialog-item")); }
    });

    check("a short Maps link is handled by the paste branch and does not search Photon", () => {
      /* v1.15.0 turned the guidance into a request to /api/expand; stub fetch so the suite never
         hits the network, and assert the branch that both versions share. */
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      const realFetch = window.fetch;
      window.fetch = () => new Promise(() => {});
      openItemDialog(tripId);
      const form = document.getElementById("form-item");
      try {
        const timerBefore = locSuggestTimer;
        form.locationName.value = "https://maps.app.goo.gl/AbC12dEf";
        form.locationName.dispatchEvent(new Event("input", { bubbles: true }));
        const el = document.getElementById("loc-suggest");
        if (el.hidden || !/short/i.test(el.textContent)) return `no status shown: "${el.textContent.trim().slice(0, 60)}"`;
        if (form.locLat.value) return "a short link produced a pin";
        // The paste branch returns before the Photon timer is (re)armed, so the handle is unchanged.
        return locSuggestTimer === timerBefore ? true : "a Photon search was scheduled for the URL";
      } finally { window.fetch = realFetch; closeDialog(document.getElementById("dialog-item")); }
    });

    /* ---- C: the Today card ---- */

    const dayTrip = () => mk("now", "2026-06-14", "2026-06-16");
    const timed = (title, s, e, over) => item({ title, date: "2026-06-15", startTime: s, endTime: e || "", ...(over || {}) });
    const card = (items, nowMin, trip) => withTrips([trip || dayTrip()], items, () => renderTodayCard(trip || dayTrip(), "2026-06-15", nowMin));
    const rowOf = (html, label) => { const m = html.match(new RegExp(`data-today-row="${label}"[\\s\\S]*?today__title">([^<]*)`)); return m ? m[1].trim() : ""; };

    check("Today: the item in progress is Now and the following one is Next", () => {
      const html = card([timed("Louvre", "09:00", "11:00"), timed("Lunch", "12:30", "14:00")], 10 * 60);
      return [eq(rowOf(html, "now"), "Louvre", "Now"), eq(rowOf(html, "next"), "Lunch", "Next")].filter((x) => x !== true).join("; ") || true;
    });

    check("Today: an item without an end time stays Now until the next one starts; in a gap nothing is Now", () => {
      const a = card([timed("Walk", "09:00"), timed("Lunch", "12:30")], 11 * 60);
      const b = card([timed("Walk", "09:00"), timed("Lunch", "12:30")], 12 * 60 + 45);
      const c = card([timed("Museum", "09:00", "10:00"), timed("Lunch", "12:00")], 11 * 60);
      return [
        eq(rowOf(a, "now"), "Walk", "open-ended Now"),
        eq(rowOf(b, "now"), "Lunch", "Now after the next start"), eq(rowOf(b, "next"), "", "no Next after the last"),
        eq(rowOf(c, "now"), "", "gap: no Now"), eq(rowOf(c, "next"), "Lunch", "gap: Next"),
      ].filter((x) => x !== true).join("; ") || true;
    });

    check("Today: after the last item it says done, shows tomorrow's first item, or the last day", () => {
      const items = [timed("Museum", "09:00", "10:00"), item({ title: "Boat", date: "2026-06-16", startTime: "10:00" })];
      const a = card(items, 23 * 60);
      const last = mk("now", "2026-06-13", "2026-06-15");
      const b = withTrips([last], [timed("Museum", "09:00", "10:00")], () => renderTodayCard(last, "2026-06-15", 23 * 60));
      return [
        /Done for today/.test(a) ? true : "no Done for today",
        eq(rowOf(a, "tomorrow"), "Boat", "Tomorrow row"),
        /Last day of the trip/.test(b) ? true : "no Last day text",
        rowOf(b, "tomorrow") ? "a Tomorrow row on the last day" : true,
      ].filter((x) => x !== true).join("; ") || true;
    });

    check("Today: an empty day offers Add to today, prefilled with the date", () => {
      const html = card([], 10 * 60);
      if (!/Nothing planned today/.test(html) || !/data-today-add/.test(html)) return "no empty-day prompt";
      // Now the real thing: a trip spanning the real today, rendered in the hero, and the button tapped.
      const today = todayLocalISO();
      const trip = mk("live", shift(today, -1), shift(today, 1));
      return withTrips([trip], [], () => {
        renderTripsScreen();
        const btn = document.querySelector("#trips-hero [data-today-add]");
        if (!btn) return "no Add to today button in the hero";
        btn.click();
        const form = document.getElementById("form-item");
        try {
          return [eq(form.date.value, today, "date"), eq(form.tripId.value, "t-live", "trip")].filter((x) => x !== true).join("; ") || true;
        } finally { closeDialog(document.getElementById("dialog-item")); }
      });
    });

    check("Today: Tonight is the hotel whose stay covers tonight, not the one you check out of", () => {
      const h1 = item({ type: "hotel", title: "Old hotel", date: "2026-06-13", endDate: "2026-06-15", endTime: "11:00" });
      const h2 = item({ type: "hotel", title: "New hotel", date: "2026-06-15", endDate: "2026-06-17", startTime: "15:00" });
      const a = card([h1, h2], 9 * 60);
      const b = card([h1], 9 * 60);
      return [
        eq(rowOf(a, "tonight"), "New hotel", "Tonight"),
        eq(rowOf(a, "next"), "Check-out · Old hotel", "check-out is Next before 11:00"),
        eq(rowOf(b, "tonight"), "", "no Tonight after checking out"),
      ].filter((x) => x !== true).join("; ") || true;
    });

    check("Today: untimed items are listed as also today, capped at two", () => {
      const html = card([timed("Louvre", "09:00", "11:00"), item({ id: "u-1", title: "A", date: "2026-06-15" }), item({ id: "u-2", title: "B", date: "2026-06-15" }), item({ id: "u-3", title: "C", date: "2026-06-15" })], 10 * 60);
      const m = html.match(/Also today: ([^<]*)/);
      if (!m) return "no Also today line";
      const r = eq(m[1].trim(), "A, B +1 more", "also today");
      if (r !== true) return r;
      // Still listed once the timed items are over — untimed plans do not expire at the last timed one.
      const late = card([timed("Louvre", "09:00", "11:00"), item({ id: "u-1", title: "A", date: "2026-06-15" })], 23 * 60);
      return /Also today: A/.test(late) ? true : "untimed items vanish after the last timed one";
    });

    check("the hero carries the Today card only while travelling, and Full day opens today's timeline", () => {
      const today = todayLocalISO();
      const r1 = withTrips([mk("later", shift(today, 5), shift(today, 9))], [], () => {
        renderTripsScreen();
        return document.getElementById("hero-today") ? "Today card shown for an upcoming trip" : true;
      });
      if (r1 !== true) return r1;
      const hash = location.hash, sub = itinerarySubTab, day = timelineDayIso;
      try {
        return withTrips([mk("live", shift(today, -1), shift(today, 1))], [], () => {
          renderTripsScreen();
          const full = document.querySelector("#hero-today [data-go=itinerary]");
          if (!full) return "no Today card / Full day button while travelling";
          if (full.getAttribute("data-day-target") !== today) return "Full day does not target today";
          full.click();
          /* The day itself is applied after the async hashchange render (the render arms the
             scroll spy, which would overwrite it) — the QA pass exercises that; here we assert
             what is set synchronously. */
          return [eq(itineraryTripId, "t-live", "trip"), eq(itinerarySubTab, "timeline", "sub-tab")]
            .filter((x) => x !== true).join("; ") || true;
        });
      } finally { location.hash = hash; itinerarySubTab = sub; timelineDayIso = day; }
    });

    check("Today rows link to Google Maps by coordinates", () => {
      const html = card([timed("Louvre", "09:00", "11:00", { location: { name: "Louvre", lat: 48.8606, lng: 2.3376 } })], 10 * 60);
      return /query=48\.8606,2\.3376/.test(html) ? true : "no coordinate Maps link in the Now row";
    });
  }

  /* ===== v1.15.0 — Delete trip in the dialog, expense fold memory, Bookings groups, linked
     expenses, short-link expansion plumbing, the overview card ===== */
  function releaseV1150() {
    group("v1.15.0");

    const shift = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
    const today = todayLocalISO();
    const mk = (name, s, e, over) => makeTrip({ id: "t-" + name, name, startDate: s, endDate: e, expenses: [], ...(over || {}) });
    const item = (over) => normalizeItem({ id: "it-" + Math.random().toString(36).slice(2, 8), tripId: "t-soon", type: "attraction",
      title: "x", date: "", endDate: "", startTime: "", endTime: "", location: { name: "", lat: null, lng: null }, ...over });
    const withTrips = (trips, items, fn) => {
      const bt = state.trips, bi = state.items, bFunds = state.currentFunds, bFilter = bookingsFilter;
      const bGroups = new Map(bookingsGroupOpen), bFocus = bookingsFocusTrip, bFold = new Set(expensesFoldOpen);
      state.trips = trips; state.items = items || [];
      try { return fn(); }
      finally {
        state.trips = bt; state.items = bi; state.currentFunds = bFunds; bookingsFilter = bFilter;
        bookingsGroupOpen = bGroups; bookingsFocusTrip = bFocus; expensesFoldOpen.clear(); bFold.forEach((id) => expensesFoldOpen.add(id));
        document.getElementById("toast").hidden = true; undoAction = null;
        render();
      }
    };
    const withConfirm = (answer, fn) => {
      const real = window.confirm; let asked = "";
      window.confirm = (msg) => { asked = String(msg); return answer; };
      try { return fn(() => asked); } finally { window.confirm = real; }
    };

    /* ---- B: Delete trip from the Edit dialog ---- */

    check("the Edit trip dialog offers Delete; a new trip does not", () => {
      const trip = mk("soon", shift(today, 5), shift(today, 9));
      return withTrips([trip], [], () => {
        openTripDialog();
        const onNew = document.getElementById("trip-delete-row").hidden;
        closeDialog(document.getElementById("dialog-trip"));
        openTripDialog(trip);
        const onEdit = document.getElementById("trip-delete-row").hidden;
        closeDialog(document.getElementById("dialog-trip"));
        return [eq(onNew, true, "hidden on New"), eq(onEdit, false, "shown on Edit")].filter((x) => x !== true).join("; ") || true;
      });
    });

    check("Delete trip: declining keeps the trip and the dialog; confirming removes trip + bookings and closes it", () => {
      const trip = mk("soon", shift(today, 5), shift(today, 9));
      const dlg = document.getElementById("dialog-trip");
      return withTrips([trip], [item({ tripId: "t-soon", title: "Museum", date: shift(today, 6) })], () => {
        openTripDialog(trip);
        const declined = withConfirm(false, (asked) => {
          document.getElementById("trip-delete").click();
          return [eq(state.trips.length, 1, "trip kept"), eq(dlg.open, true, "dialog still open"), /Museum|1 booking/.test(asked()) ? true : `confirm text: ${asked()}`];
        }).filter((x) => x !== true);
        if (declined.length) { closeDialog(dlg); return declined.join("; "); }
        return withConfirm(true, () => {
          document.getElementById("trip-delete").click();
          return [eq(state.trips.length, 0, "trip removed"), eq(state.items.length, 0, "its bookings removed"), eq(dlg.open, false, "dialog closed")]
            .filter((x) => x !== true).join("; ") || true;
        });
      });
    });

    /* ---- C: expense fold memory ---- */

    check("Budget: a fold you opened stays open after marking an expense paid", () => {
      if (window.innerWidth > 900) return skip("desktop layout — folds are always open");
      const trip = mk("soon", shift(today, 5), shift(today, 9), { year: Number(today.slice(0, 4)), expenses: [
        makeExpense({ id: "e-1", label: "Hotel", amount: 500, status: "booked", amountPaid: 0 }),
      ] });
      return withTrips([trip], [], () => window.__withScreenVisible("screen-budget", renderTrips, () => {
        const fold = () => document.querySelector('[data-trip-fold="t-soon"]');
        if (!fold()) return "no fold rendered";
        if (fold().open) return "fold open by default at phone width";
        fold().open = true;
        fold().dispatchEvent(new Event("toggle"));
        if (!expensesFoldOpen.has("t-soon")) return "toggle did not record the open fold";
        markExpensePaid("t-soon", "e-1");
        return eq(fold()?.open, true, "fold still open after marking paid");
      }));
    });

    check("Budget: adding an expense opens its trip's fold", () => {
      const trip = mk("soon", shift(today, 5), shift(today, 9), { year: Number(today.slice(0, 4)) });
      return withTrips([trip], [], () => {
        expensesFoldOpen.delete("t-soon");
        openExpenseDialog("t-soon");
        const form = document.getElementById("form-expense");
        form.elements.label.value = "probe"; form.elements.amount.value = "10";
        form.requestSubmit();
        return [eq(state.trips[0].expenses.length, 1, "expense added"), eq(expensesFoldOpen.has("t-soon"), true, "fold marked open")]
          .filter((x) => x !== true).join("; ") || true;
      });
    });

    /* ---- D + G + E: Bookings groups, focus, notes ---- */

    const threeTrips = () => [
      mk("now", shift(today, -1), shift(today, 1)),
      mk("soon", shift(today, 5), shift(today, 9)),
      mk("past", shift(today, -10), shift(today, -8)),
    ];
    const threeItems = () => [
      item({ tripId: "t-now", title: "Now hotel", type: "hotel", date: shift(today, -1), endDate: shift(today, 1), notes: "Ask for a quiet room" }),
      item({ tripId: "t-soon", title: "Soon flight", type: "flight", date: shift(today, 5) }),
      item({ tripId: "t-past", title: "Past hotel", type: "hotel", date: shift(today, -10), endDate: shift(today, -8) }),
    ];
    const openGroups = () => [...document.querySelectorAll("#bookings-body [data-trip-group]")].filter((d) => d.open).map((d) => d.getAttribute("data-trip-group")).join(",");

    check("Bookings: only the trip you are on is open; without one, the next upcoming", () => {
      const r1 = withTrips(threeTrips(), threeItems(), () => {
        bookingsGroupOpen = new Map(); bookingsFocusTrip = null; bookingsFilter = "all";
        renderBookings();
        return eq(openGroups(), "t-now", "travelling trip open");
      });
      if (r1 !== true) return r1;
      return withTrips(threeTrips().filter((t) => t.id !== "t-now"), threeItems().filter((i) => i.tripId !== "t-now"), () => {
        bookingsGroupOpen = new Map(); bookingsFocusTrip = null; bookingsFilter = "all";
        renderBookings();
        return eq(openGroups(), "t-soon", "next upcoming open when nothing is live");
      });
    });

    check("Bookings: a group you closed stays closed across a filter re-render", () =>
      withTrips(threeTrips(), threeItems(), () => {
        bookingsGroupOpen = new Map(); bookingsFocusTrip = null; bookingsFilter = "all";
        renderBookings();
        const now = document.querySelector('[data-trip-group="t-now"]');
        now.open = false; now.dispatchEvent(new Event("toggle"));
        const soon = document.querySelector('[data-trip-group="t-soon"]');
        soon.open = true; soon.dispatchEvent(new Event("toggle"));
        renderBookings(); // what a chip tap does
        return eq(openGroups(), "t-soon", "remembered choice");
      }));

    check("Bookings: the Trips step card opens the featured trip's group only", () =>
      withTrips(threeTrips(), threeItems(), () => {
        bookingsGroupOpen = new Map(); bookingsFilter = "all";
        renderTripsScreen();
        const step = document.querySelector('#steps .step-card[data-go="bookings"]');
        if (!step) return "no Bookings step card";
        if (step.getAttribute("data-trip-id") !== featuredTrip().id) return "step card does not carry the featured trip";
        bookingsFocusTrip = "t-soon"; // what clicking the card sets (the hash change itself is async)
        renderBookings();
        return [eq(openGroups(), "t-soon", "focused group only"), eq(bookingsFocusTrip, null, "focus consumed")]
          .filter((x) => x !== true).join("; ") || true;
      }));

    check("Bookings card shows the booking's notes, two lines max, and omits the line when empty", () =>
      withTrips(threeTrips(), threeItems(), () => {
        bookingsGroupOpen = new Map(); bookingsFocusTrip = null; bookingsFilter = "all";
        renderBookings();
        const withNotes = document.querySelector('.booking[data-item] .booking__notes');
        if (!withNotes || !/quiet room/.test(withNotes.textContent)) return "notes not rendered";
        const clamp = getComputedStyle(withNotes).webkitLineClamp;
        if (String(clamp) !== "2") return `line clamp is ${clamp}`;
        const cards = [...document.querySelectorAll(".booking[data-item]")];
        const without = cards.filter((c) => !c.querySelector(".booking__notes"));
        return without.length === cards.length - 1 ? true : `${cards.length - without.length} cards carry a notes line, expected 1`;
      }));

    /* ---- F: one word ---- */

    check("the word is Bookings: dialog title, add label, group badges", () => {
      const r = [];
      // The appbar + label per screen is asserted by the v1.12.0 check; here the dialog and the nav.
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      openItemDialog(tripId);
      const title = document.getElementById("item-dialog-title").textContent;
      closeDialog(document.getElementById("dialog-item"));
      if (title !== "Add booking") r.push(`dialog title "${title}"`);
      const nav = [...document.querySelectorAll("[data-nav] span")].map((s) => s.textContent);
      if (!nav.includes("Bookings")) r.push(`nav: ${nav.join(",")}`);
      return r.length ? r.join("; ") : true;
    });

    /* ---- H: linked expenses ---- */

    check("every booking type maps to a Budget category that exists, and Shopping is one of them", () => {
      const missing = ITEM_TYPES.filter((t) => !TYPE_TO_CATEGORY[t]);
      const unknown = Object.values(TYPE_TO_CATEGORY).filter((c) => !CATEGORIES.includes(c));
      const opts = [...document.querySelectorAll('#form-expense [name="category"] option')].map((o) => o.value);
      return [
        missing.length ? `types without a category: ${missing.join(",")}` : true,
        unknown.length ? `categories not in CATEGORIES: ${unknown.join(",")}` : true,
        eq(TYPE_TO_CATEGORY.store, "Shopping", "store"),
        opts.includes("Shopping") ? true : "Shopping missing from the dialog select",
        eq(normalizeCategory("shopping"), "Shopping", "normalizeCategory"),
      ].filter((x) => x !== true).join("; ") || true;
    });

    check("Add expense from a booking prefills label, category and date, and the saved expense is linked", () => {
      const trips = threeTrips(), items = threeItems();
      return withTrips(trips, items, () => {
        const flight = state.items.find((i) => i.id && i.tripId === "t-soon");
        openExpenseForItem(flight);
        const form = document.getElementById("form-expense");
        const pre = [
          eq(form.elements.label.value, "Soon flight", "label"),
          eq(form.elements.category.value, "Flight", "category"),
          eq(form.elements.date.value, shift(today, 5), "date"),
          eq(form.elements.itemId.value, flight.id, "itemId"),
          eq(document.activeElement, form.elements.amount, "amount focused"),
        ].filter((x) => x !== true);
        if (pre.length) { closeDialog(document.getElementById("dialog-expense")); return pre.join("; "); }
        form.elements.amount.value = "1200";
        form.requestSubmit();
        const trip = state.trips.find((t) => t.id === "t-soon");
        const exp = trip.expenses[0];
        if (!exp) return "no expense saved";
        const r = [
          eq(exp.itemId, flight.id, "saved itemId"),
          eq(linkedExpense(flight)?.id, exp.id, "linkedExpense finds it"),
          eq(normalizeExpense({ ...exp }).itemId, flight.id, "normalizeExpense keeps itemId"),
        ].filter((x) => x !== true);
        if (r.length) return r.join("; ");
        // The ⋯ sheet now says Open expense; the Bookings card shows the status instead of the button.
        openItemActionsSheet(trip, flight.id);
        const label = document.querySelector("[data-item-action-label]").textContent;
        closeDialog(document.getElementById("dialog-item-actions"));
        bookingsGroupOpen = new Map(); bookingsFocusTrip = null; bookingsFilter = "all";
        renderBookings();
        const card = document.querySelector(`.booking[data-item="${flight.id}"]`);
        const other = document.querySelector(`.booking[data-item="${items[0].id}"]`);
        return [
          eq(label, "Open expense", "sheet label once linked"),
          card?.querySelector(".payment-status") ? true : "linked card shows no payment status",
          card?.querySelector("[data-add-expense]") ? "linked card still offers Add expense" : true,
          other?.querySelector("[data-add-expense]") ? true : "unlinked card lacks Add expense",
        ].filter((x) => x !== true).join("; ") || true;
      });
    });

    check("deleting a linked booking deletes its expense too, says so, and Undo restores both; deleting the expense is one-way", () => {
      const trips = threeTrips(), items = threeItems();
      const flight = items[1];
      trips[1].expenses.push(makeExpense({ id: "e-link", label: "Soon flight", amount: 1200, status: "booked", amountPaid: 0, itemId: flight.id }));
      return withTrips(trips, items, () => {
        const trip = () => state.trips.find((t) => t.id === "t-soon");
        const r = withConfirm(true, (asked) => {
          deleteItem(flight.id);
          return [
            /expense will be deleted too/.test(asked()) ? true : `confirm text: ${asked()}`,
            eq(state.items.some((i) => i.id === flight.id), false, "booking removed"),
            eq(trip().expenses.length, 0, "linked expense removed"),
            eq(document.getElementById("toast-view").textContent.trim(), "Undo", "Undo offered"),
          ];
        }).filter((x) => x !== true);
        if (r.length) return r.join("; ");
        document.getElementById("toast-view").click();
        const back = [
          eq(state.items.some((i) => i.id === flight.id), true, "booking restored"),
          eq(trip().expenses.some((e) => e.id === "e-link"), true, "expense restored"),
        ].filter((x) => x !== true);
        if (back.length) return back.join("; ");
        // One way: the expense goes, the booking stays.
        return withConfirm(true, () => {
          deleteExpense("t-soon", "e-link");
          return [eq(trip().expenses.length, 0, "expense removed"), eq(state.items.some((i) => i.id === flight.id), true, "booking kept")]
            .filter((x) => x !== true).join("; ") || true;
        });
      });
    });

    /* ---- A: short-link plumbing that can be asserted synchronously ---- */

    check("a short Maps link asks /api/expand and shows an opening state, never Photon", () => {
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      const realFetch = window.fetch; const calls = [];
      window.fetch = (url) => { calls.push(String(url)); return new Promise(() => {}); }; // never settles: we only assert the request
      openItemDialog(tripId);
      const form = document.getElementById("form-item");
      try {
        const timerBefore = locSuggestTimer;
        form.locationName.value = "https://maps.app.goo.gl/AbC12dEf";
        form.locationName.dispatchEvent(new Event("input", { bubbles: true }));
        const el = document.getElementById("loc-suggest");
        return [
          calls.length === 1 && /^\/api\/expand\?url=https%3A%2F%2Fmaps\.app\.goo\.gl%2FAbC12dEf$/.test(calls[0]) ? true : `fetch calls: ${calls.join(" | ") || "none"}`,
          /Opening/.test(el.textContent) && !el.hidden ? true : `status: "${el.textContent.trim().slice(0, 50)}"`,
          eq(locSuggestTimer, timerBefore, "Photon timer untouched"),
          eq(form.locLat.value, "", "no pin yet"),
        ].filter((x) => x !== true).join("; ") || true;
      } finally { window.fetch = realFetch; closeDialog(document.getElementById("dialog-item")); }
    });

    check("an expanded full URL applied against the short paste swaps the short link for the place", () => {
      const tripId = (state.trips[0] && state.trips[0].id) || "probe";
      openItemDialog(tripId);
      const form = document.getElementById("form-item");
      try {
        const short = "https://maps.app.goo.gl/AbC12dEf";
        form.title.value = short;
        applyMapsPaste(form, parseMapsPaste("https://www.google.com/maps/place/Eiffel+Tower/@48.8583,2.2944,17z"), short);
        return [eq(form.title.value, "Eiffel Tower", "title"), eq(form.locationName.value, "Eiffel Tower", "location"), eq(form.locLat.value, "48.8583", "pin")]
          .filter((x) => x !== true).join("; ") || true;
      } finally { closeDialog(document.getElementById("dialog-item")); }
    });

    /* ---- K: the overview card ---- */

    check("Budget overview leads with Funds vs committed, in words", () => {
      const y = Number(today.slice(0, 4));
      const trip = mk("soon", shift(today, 5), shift(today, 9), { year: y, budget: 12000, expenses: [
        makeExpense({ id: "e-1", label: "Hotel", amount: 10000, status: "booked", amountPaid: 4000 }),
      ] });
      return withTrips([trip], [], () => {
        const sy = selectedYear; selectedYear = "all";
        try {
          state.currentFunds = 9447; renderGlobal();
          const card = () => document.querySelector("#global-answer .answer-card");
          const r1 = [
            /Funds vs committed/.test(card().textContent) ? true : "label missing",
            /553/.test(card().textContent) && /short/.test(card().textContent) ? true : `text: ${card().textContent.replace(/\s+/g, " ").trim().slice(0, 80)}`,
            card().classList.contains("answer-card--short") ? true : "no short class",
          ].filter((x) => x !== true);
          if (r1.length) return r1.join("; ");
          state.currentFunds = 12300; renderGlobal();
          const tiles = document.getElementById("global-stats").textContent;
          return [
            /2,300/.test(card().textContent) && /to spare/.test(card().textContent) ? true : "positive case not in words",
            card().classList.contains("answer-card--clear") ? true : "no clear class",
            /Still to pay/.test(tiles) ? true : "Still to pay tile missing",
            /Funds vs committed/.test(tiles) ? "Funds vs committed still duplicated in the tiles" : true,
          ].filter((x) => x !== true).join("; ") || true;
        } finally { selectedYear = sy; }
      });
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

    /* Attachments were removed in v1.11.0. The old check here proved a javascript: dataUrl
       could not survive normalisation; the stronger guarantee now is that the whole key is
       dropped, so no such URL can reach the DOM or cross the wire at all — including from an
       older client still sending them. */
    check("a payload from an older client loses its attachments", () => {
      const d = normalizeState({
        trips: [makeTrip()], items: [], version: 2,
        documents: [
          { id: "d1", name: "evil", dataUrl: "javascript:alert(1)" },
          { id: "d2", name: "ok", dataUrl: "data:application/pdf;base64,AAA" },
        ],
      });
      if ("documents" in d) return `documents survived as ${JSON.stringify(d.documents)}`;
      // And it must not throw or lose anything else on the way through.
      return eq(d.trips.length, 1, "trips survived");
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

  const verdict = (r) => (r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL");

  function tally() {
    const skipped = results.filter((r) => r.skipped).length;
    const fail = results.filter((r) => !r.ok).length;
    return { pass: results.length - fail - skipped, skipped, fail };
  }

  function report() {
    const { pass, skipped, fail } = tally();
    /* `skipped` is reported separately and NOT counted as a pass — a check that could not run
       is not evidence of anything, and counting it green is how two of them hid at desktop
       width for a whole release. */
    window.__selftest = { pass, fail, skipped, results };

    console.table(results.map((r) => ({ group: r.group, check: r.name, result: verdict(r), detail: r.detail })));
    console.log(`%cselftest: ${pass} passed, ${skipped} skipped, ${fail} failed`,
      `font-weight:bold;color:${fail ? "#c0392b" : skipped ? "#b7791f" : "#1e8449"}`);
    if (skipped) {
      console.log("%cskipped checks did NOT run — re-run at phone width (412px) for full coverage",
        "color:#b7791f");
    }

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

    const { pass, skipped, fail } = tally();
    const colour = (r) => (r.skipped ? "#b7791f" : r.ok ? "#1e8449" : "#c0392b");
    const rows = results.map((r) =>
      `<tr><td style="padding:2px 8px 2px 0;color:${colour(r)}">${verdict(r)}</td>` +
      `<td style="padding:2px 8px 2px 0;color:#888">${r.group}</td>` +
      `<td style="padding:2px 0">${r.name}${r.detail ? `<div style="color:${colour(r)}">${r.detail}</div>` : ""}</td></tr>`
    ).join("");

    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
         <strong style="color:${fail ? "#c0392b" : skipped ? "#b7791f" : "#1e8449"}">selftest — ${pass} passed${skipped ? `, ${skipped} skipped` : ""}, ${fail} failed</strong>
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
