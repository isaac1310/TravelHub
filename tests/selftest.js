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
