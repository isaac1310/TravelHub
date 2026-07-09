const STORAGE_KEY = "vacation-budget-planner-v1";

const CATEGORIES = [
  "Hotel",
  "Flight",
  "Food",
  "Transport",
  "Activities",
  "Other",
];

const PAYMENT_STATUSES = ["planned", "booked", "paid"];


function normalizeCategory(category) {
  const match = CATEGORIES.find(
    (c) => c.toLowerCase() === String(category || "").toLowerCase()
  );
  return match || "Other";
}

function categoryDataAttr(category) {
  return `data-category="${escapeHtml(normalizeCategory(category))}"`;
}

function categoryBreakdown(trip) {
  const totals = {};
  for (const e of trip.expenses) {
    const cat = normalizeCategory(e.category);
    totals[cat] = (totals[cat] || 0) + Number(e.amount);
  }
  const spent = tripSpent(trip);
  return Object.entries(totals)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: spent > 0 ? (amount / spent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function renderCategoryBreakdown(trip, spent) {
  if (spent <= 0) return "";

  const rows = categoryBreakdown(trip);
  const barSegments = rows
    .map(
      (r) =>
        `<div class="category-breakdown__segment" ${categoryDataAttr(r.category)} style="width: ${r.percent.toFixed(1)}%" title="${escapeHtml(r.category)} ${r.percent.toFixed(0)}%"></div>`
    )
    .join("");

  const listItems = rows
    .map(
      (r) => `
      <li class="category-breakdown__row">
        <span class="category-tag" ${categoryDataAttr(r.category)}>${escapeHtml(normalizeCategory(r.category))}</span>
        <span class="category-breakdown__amount">${formatMoney(r.amount)}</span>
        <span class="category-breakdown__pct">${r.percent.toFixed(0)}%</span>
      </li>`
    )
    .join("");

  return `
    <div class="category-breakdown">
      <p class="category-breakdown__title">Spending by category</p>
      <div class="category-breakdown__bar" role="img" aria-label="Expense mix by category">${barSegments}</div>
      <ul class="category-breakdown__list">${listItems}</ul>
    </div>`;
}

const SEED_DATA = {
  currentFunds: 17955,
  fundHistory: [],
  trips: [
    {
      id: "trip-paris-2026",
      name: "Paris",
      year: 2026,
      budget: 10000,
      expenses: [
        {
          id: "exp-paris-hotel",
          label: "Paris Hotel",
          category: "Hotel",
          amount: 3116,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
        {
          id: "exp-paris-flight",
          label: "Paris flight",
          category: "Flight",
          amount: 3635,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
      ],
    },
    {
      id: "trip-christmas-2026",
      name: "Christmas",
      year: 2026,
      budget: 10000,
      expenses: [
        {
          id: "exp-xmas-hotel-1",
          label: "Christmas hotel 1",
          category: "Hotel",
          amount: 1721,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
        {
          id: "exp-xmas-hotel-2",
          label: "Christmas hotel 2",
          category: "Hotel",
          amount: 1617,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
        {
          id: "exp-xmas-flight",
          label: "Christmas Flight",
          category: "Flight",
          amount: 1736,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
        {
          id: "exp-xmas-hotel-3",
          label: "Christmas hotel 3",
          category: "Hotel",
          amount: 546,
          date: "",
          status: "booked",
          amountPaid: 0,
          paidDate: "",
        },
      ],
    },
  ],
};

let state = loadState();
let selectedYear = "all";

const $ = (id) => document.getElementById(id);

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeExpense(exp) {
  const amount = Math.max(0, Number(exp.amount) || 0);
  let amountPaid = Math.min(amount, Math.max(0, Number(exp.amountPaid) || 0));
  let status = PAYMENT_STATUSES.includes(exp.status) ? exp.status : "booked";
  let paidDate = exp.paidDate || "";

  if (status === "paid" && amount > 0) {
    amountPaid = amount;
  } else if (status === "planned" || status === "booked") {
    if (amountPaid >= amount && amount > 0) amountPaid = 0;
    if (amountPaid === 0) paidDate = "";
  } else if (amount > 0 && amountPaid >= amount) {
    status = "paid";
    amountPaid = amount;
  }

  if (amountPaid > 0 && amountPaid < amount && status === "paid") {
    status = "booked";
  }
  if (amountPaid === 0) paidDate = "";

  return {
    id: exp.id,
    label: exp.label || "",
    category: normalizeCategory(exp.category),
    amount,
    date: exp.date || "",
    status,
    amountPaid,
    paidDate,
  };
}

function normalizeState(data) {
  if (!Array.isArray(data.fundHistory)) data.fundHistory = [];
  if (!Array.isArray(data.rollHistory)) data.rollHistory = [];
  if (Array.isArray(data.trips)) {
    for (const trip of data.trips) {
      if (!Array.isArray(trip.expenses)) trip.expenses = [];
      trip.expenses = trip.expenses.map(normalizeExpense);
    }
  }
  return data;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        return normalizeState(parsed);
      }
    }
  } catch {
    /* use seed */
  }
  return normalizeState(structuredClone(SEED_DATA));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(n) {
  return new Intl.NumberFormat("en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function tripCommitted(trip) {
  return trip.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
}

function tripSpent(trip) {
  return tripCommitted(trip);
}

function tripPaid(trip) {
  return trip.expenses.reduce((sum, e) => sum + Number(e.amountPaid), 0);
}

function tripDue(trip) {
  return trip.expenses.reduce(
    (sum, e) => sum + Math.max(0, Number(e.amount) - Number(e.amountPaid)),
    0
  );
}

function expenseDisplayStatus(exp) {
  const amount = Number(exp.amount);
  const paid = Number(exp.amountPaid) || 0;
  if (amount > 0 && paid >= amount) return "paid";
  if (paid > 0 && paid < amount) return "partial";
  return exp.status || "booked";
}

function paymentStatusLabel(exp) {
  const display = expenseDisplayStatus(exp);
  if (display === "partial") return "Partial";
  if (display === "paid") return "Paid";
  if (display === "planned") return "Planned";
  return "Booked";
}

function expenseFormField(form, name) {
  return form.elements[name];
}

function buildExpenseFromForm(form) {
  const amount = Number(expenseFormField(form, "amount").value);
  const label = expenseFormField(form, "label").value.trim();
  const category = expenseFormField(form, "category").value;
  const date = expenseFormField(form, "date").value;
  let status = expenseFormField(form, "status").value;
  let amountPaid = Math.min(
    amount,
    Math.max(0, Number(expenseFormField(form, "amountPaid").value) || 0)
  );
  let paidDate = expenseFormField(form, "paidDate").value;

  if (!label || !CATEGORIES.includes(category) || amount <= 0) return null;

  if (status === "paid") {
    amountPaid = amount;
    if (!paidDate) paidDate = todayISO();
  } else {
    amountPaid = Math.min(amount, Math.max(0, amountPaid));
    if (amountPaid >= amount && amount > 0) {
      amountPaid = 0;
      paidDate = "";
    } else if (amountPaid === 0) {
      paidDate = "";
    }
  }

  return normalizeExpense({
    label,
    category,
    amount,
    date,
    status,
    amountPaid,
    paidDate,
  });
}

function syncExpensePaidDateVisibility() {
  const form = $("form-expense");
  if (!form) return;
  const wrap = $("expense-paid-date-wrap");
  const amountPaid = Number(expenseFormField(form, "amountPaid")?.value) || 0;
  if (wrap) wrap.hidden = amountPaid <= 0;
}

function getYears() {
  const years = new Set(state.trips.map((t) => t.year));
  return [...years].sort((a, b) => b - a);
}

function tripsForFilter() {
  if (selectedYear === "all") return [...state.trips];
  const y = Number(selectedYear);
  return state.trips.filter((t) => t.year === y);
}

function totalsForTrips(trips) {
  const totalBudget = trips.reduce((s, t) => s + Number(t.budget), 0);
  const totalCommitted = trips.reduce((s, t) => s + tripCommitted(t), 0);
  const totalPaid = trips.reduce((s, t) => s + tripPaid(t), 0);
  const totalDue = trips.reduce((s, t) => s + tripDue(t), 0);
  return {
    totalBudget,
    totalSpent: totalCommitted,
    totalCommitted,
    totalPaid,
    totalDue,
  };
}

function tripsInYear(year) {
  return state.trips.filter((t) => t.year === year);
}

function yearRolloverDetails(year) {
  return tripsInYear(year)
    .map((trip) => {
      const spent = tripSpent(trip);
      const remaining = Math.max(0, Number(trip.budget) - spent);
      return { trip, spent, remaining };
    })
    .filter((d) => d.remaining > 0);
}

function yearRolloverAvailable(year) {
  return yearRolloverDetails(year).reduce((s, d) => s + d.remaining, 0);
}

function getRollYears() {
  const years = getYears();
  const next = new Date().getFullYear() + 1;
  if (!years.includes(next)) years.unshift(next);
  return years;
}

function getRollTarget(form) {
  return form.querySelector('input[name="target"]:checked')?.value || "trips";
}

function distributeAmount(amount, weights) {
  if (weights.length === 0 || amount <= 0) return [];
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    const each = amount / weights.length;
    return weights.map(() => each);
  }
  const raw = weights.map((w) => (w / total) * amount);
  const rounded = raw.map((v) => Math.round(v * 100) / 100);
  let diff = Math.round((amount - rounded.reduce((s, v) => s + v, 0)) * 100) / 100;
  let i = 0;
  while (Math.abs(diff) >= 0.01 && i < 1000) {
    rounded[i % rounded.length] =
      Math.round((rounded[i % rounded.length] + (diff > 0 ? 0.01 : -0.01)) * 100) /
      100;
    diff = Math.round((amount - rounded.reduce((s, v) => s + v, 0)) * 100) / 100;
    i += 1;
  }
  return rounded;
}

function reduceSourceBudgets(details, amount) {
  const weights = details.map((d) => d.remaining);
  const shares = distributeAmount(amount, weights);
  details.forEach((d, i) => {
    const spent = tripSpent(d.trip);
    d.trip.budget = Math.max(spent, Number(d.trip.budget) - shares[i]);
  });
}

function renderRollPreview() {
  const preview = $("roll-preview");
  const form = $("form-roll");
  const fromYear = Number(form.fromYear.value);
  const toYear = Number(form.toYear.value);
  const target = getRollTarget(form);
  const amount = Number($("roll-amount").value) || 0;

  if (!fromYear || !toYear) {
    preview.innerHTML = "";
    return;
  }

  if (fromYear === toYear) {
    preview.className = "roll-preview roll-preview--warn";
    preview.innerHTML =
      "<p>Choose different years for the roll.</p>";
    $("roll-submit").disabled = true;
    return;
  }

  const sourceDetails = yearRolloverDetails(fromYear);
  const available = sourceDetails.reduce((s, d) => s + d.remaining, 0);
  const destTrips = tripsInYear(toYear);

  let html = `<p class="roll-preview__title">Available in ${fromYear}</p>`;

  if (sourceDetails.length === 0) {
    html += "<p>No unspent trip budget in this year.</p>";
    preview.className = "roll-preview roll-preview--warn";
    preview.innerHTML = html;
    $("roll-submit").disabled = true;
    return;
  }

  html += `<ul class="roll-preview__list">${sourceDetails
    .map(
      (d) =>
        `<li><span>${escapeHtml(d.trip.name)}</span><span>${formatMoney(d.remaining)}</span></li>`
    )
    .join("")}</ul>`;
  html += `<p class="roll-preview__total">Total available: ${formatMoney(available)}</p>`;

  if (target === "trips") {
    if (destTrips.length === 0) {
      html += `<p class="roll-preview--warn" style="margin-top:0.5rem">No trips in ${toYear}. Create trips or apply to vacation funds.</p>`;
    } else {
      const each = amount > 0 ? amount / destTrips.length : 0;
      html += `<p class="roll-preview__title" style="margin-top:0.75rem">Destination ${toYear} (even split)</p>`;
      html += `<ul class="roll-preview__list">${destTrips
        .map(
          (t) =>
            `<li><span>${escapeHtml(t.name)}</span><span>+${formatMoney(each)}</span></li>`
        )
        .join("")}</ul>`;
    }
  } else {
    html += `<p style="margin-top:0.5rem">Adds <strong>${formatMoney(amount)}</strong> to vacation funds.</p>`;
  }

  const invalidAmount = amount <= 0 || amount > available + 0.001;
  if (invalidAmount && amount > 0) {
    html += `<p class="roll-preview--warn" style="margin-top:0.5rem">Amount cannot exceed ${formatMoney(available)}.</p>`;
  }

  preview.className = "roll-preview";
  preview.innerHTML = html;

  const canSubmit =
    available > 0 &&
    amount > 0 &&
    amount <= available + 0.001 &&
    (target === "funds" || destTrips.length > 0);
  $("roll-submit").disabled = !canSubmit;
}

function populateRollYearSelects() {
  const years = getRollYears();
  const opts = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  $("roll-from-year").innerHTML = opts;
  $("roll-to-year").innerHTML = opts;

  const from = $("roll-from-year");
  const to = $("roll-to-year");
  if (years.length >= 2) {
    from.value = String(years[1] ?? years[0]);
    to.value = String(years[0]);
  }
}

function openRollDialog() {
  const form = $("form-roll");
  form.reset();
  form.date.value = todayISO();
  populateRollYearSelects();

  const fromYear = Number(form.fromYear.value);
  const available = yearRolloverAvailable(fromYear);
  $("roll-amount").value = available > 0 ? available.toFixed(2) : "";
  const tripsRadio = form.querySelector('input[name="target"][value="trips"]');
  if (tripsRadio) tripsRadio.checked = true;

  renderRollPreview();
  openDialog($("dialog-roll"));
}

function handleRollSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fromYear = Number(form.fromYear.value);
  const toYear = Number(form.toYear.value);
  const amount = Number(form.amount.value);
  const target = getRollTarget(form);
  const date = form.date.value;
  const note = form.note.value.trim();

  if (fromYear === toYear || amount <= 0) return;

  const sourceDetails = yearRolloverDetails(fromYear);
  const available = sourceDetails.reduce((s, d) => s + d.remaining, 0);
  if (amount > available + 0.001) return;

  const destTrips = tripsInYear(toYear);
  if (target === "trips" && destTrips.length === 0) return;

  const summary = `Rolled ${formatMoney(amount)} from ${fromYear} to ${toYear}`;
  if (
    !confirm(
      `${summary}\n\nSource trip budgets will be reduced. Continue?`
    )
  ) {
    return;
  }

  reduceSourceBudgets(sourceDetails, amount);

  if (target === "funds") {
    state.currentFunds += amount;
    state.fundHistory.push({
      id: uid("fund"),
      amount,
      date,
      note: note || `Rollover from ${fromYear} to ${toYear}`,
      type: "rollover",
    });
  } else {
    const shares = distributeAmount(
      amount,
      destTrips.map(() => 1)
    );
    destTrips.forEach((trip, i) => {
      trip.budget = Number(trip.budget) + shares[i];
    });
  }

  if (!state.rollHistory) state.rollHistory = [];
  state.rollHistory.push({
    id: uid("roll"),
    fromYear,
    toYear,
    amount,
    date,
    target,
    note: note || (target === "funds" ? "To vacation funds" : "To trip budgets"),
  });

  saveState();
  render();
  closeDialog($("dialog-roll"));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderYearFilter() {
  const select = $("year-filter");
  const years = getYears();
  const options = [
    `<option value="all">All years</option>`,
    ...years.map((y) => `<option value="${y}">${y}</option>`),
  ];
  select.innerHTML = options.join("");
  select.value = selectedYear;
  if (selectedYear !== "all" && !years.includes(Number(selectedYear))) {
    selectedYear = "all";
    select.value = "all";
  }
}

function renderGlobal() {
  const trips = tripsForFilter();
  const { totalBudget, totalCommitted, totalPaid, totalDue } =
    totalsForTrips(trips);
  const vsBudget = state.currentFunds - totalBudget;
  const vsCommitted = state.currentFunds - totalCommitted;
  const overBudgetGlobal = totalCommitted > totalBudget;

  const yearNote =
    selectedYear === "all"
      ? "all trips"
      : `trips in ${selectedYear}`;

  $("global-stats").innerHTML = `
    <div class="stat">
      <span class="stat__label">Current funds</span>
      <span class="stat__value">${formatMoney(state.currentFunds)}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Total budget (${yearNote})</span>
      <span class="stat__value">${formatMoney(totalBudget)}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Committed (${yearNote})</span>
      <span class="stat__value">${formatMoney(totalCommitted)}</span>
    </div>
    <div class="stat">
      <span class="stat__label">Paid (${yearNote})</span>
      <span class="stat__value">${formatMoney(totalPaid)}</span>
    </div>
    <div class="stat ${totalDue > 0 ? "stat--warn" : "stat--ok"}">
      <span class="stat__label">Still to pay (${yearNote})</span>
      <span class="stat__value">${formatMoney(totalDue)}</span>
    </div>
    <div class="stat ${vsBudget < 0 ? "stat--warn" : "stat--ok"}">
      <span class="stat__label">Funds vs budget</span>
      <span class="stat__value">${formatMoney(vsBudget)}</span>
    </div>
    <div class="stat ${vsCommitted < 0 ? "stat--warn" : "stat--ok"}">
      <span class="stat__label">Funds vs committed</span>
      <span class="stat__value">${formatMoney(vsCommitted)}</span>
    </div>
    ${
      overBudgetGlobal
        ? `<div class="stat stat--warn" style="grid-column: 1 / -1">
            <span class="stat__label">Warning</span>
            <span class="stat__value" style="font-size:0.95rem">Committed costs exceed combined trip budgets for this view.</span>
          </div>`
        : ""
    }
  `;
}

function renderExpenseItem(trip, e) {
  const display = expenseDisplayStatus(e);
  const paid = Number(e.amountPaid) || 0;
  const amount = Number(e.amount);
  const isPaid = display === "paid";
  const isPartial = display === "partial";
  const statusClass = `payment-status payment-status--${display}`;
  const partialLine =
    isPartial || (paid > 0 && !isPaid)
      ? `<div class="expense-item__paid-line">${formatMoney(paid)} / ${formatMoney(amount)} paid</div>`
      : "";

  return `
        <li class="expense-item ${isPaid ? "expense-item--paid" : ""}">
          <div class="expense-item__row">
            <div class="expense-item__info">
              <span class="expense-item__label">${escapeHtml(e.label)}</span>
              <div class="expense-item__meta">
                <span class="category-tag" ${categoryDataAttr(e.category)}>${escapeHtml(normalizeCategory(e.category))}</span>
                <span class="${statusClass}">${paymentStatusLabel(e)}</span>
                ${e.date ? ` · ${escapeHtml(e.date)}` : ""}
              </div>
              ${partialLine}
            </div>
            <span class="expense-item__amount">${formatMoney(e.amount)}</span>
          </div>
          <div class="expense-item__actions">
            ${
              isPaid
                ? `<button type="button" class="btn btn--small btn--ghost btn-mark-unpaid" data-trip-id="${trip.id}" data-expense-id="${e.id}">Mark unpaid</button>`
                : `<button type="button" class="btn btn--small btn--ghost btn-mark-paid" data-trip-id="${trip.id}" data-expense-id="${e.id}">Mark paid</button>`
            }
            <button type="button" class="btn btn--small btn--ghost btn-edit-expense" data-trip-id="${trip.id}" data-expense-id="${e.id}">Edit</button>
            <button type="button" class="btn btn--small btn--danger btn-delete-expense" data-trip-id="${trip.id}" data-expense-id="${e.id}">Delete</button>
          </div>
        </li>`;
}

function renderTripCard(trip) {
  const committed = tripCommitted(trip);
  const paid = tripPaid(trip);
  const due = tripDue(trip);
  const budget = Number(trip.budget);
  const remaining = budget - committed;
  const over = committed > budget;
  const pct =
    budget > 0
      ? Math.min(100, (committed / budget) * 100)
      : committed > 0
        ? 100
        : 0;
  const expensesHtml =
    trip.expenses.length === 0
      ? `<li class="empty-state">No expenses yet.</li>`
      : trip.expenses.map((e) => renderExpenseItem(trip, e)).join("");

  return `
    <article class="trip-card ${over ? "trip-card--over" : ""}" data-trip-id="${trip.id}">
      <div class="trip-card__head">
        <div>
          <h3 class="trip-card__title">${escapeHtml(trip.name)}</h3>
          <span class="trip-card__year">${trip.year}</span>
          ${over ? '<span class="over-badge">Over budget</span>' : ""}
        </div>
        <div class="trip-card__actions">
          <button type="button" class="btn btn--small btn--ghost btn-edit-trip" data-trip-id="${trip.id}">Edit</button>
          <button type="button" class="btn btn--small btn--danger btn-delete-trip" data-trip-id="${trip.id}">Delete</button>
        </div>
      </div>
      <div class="progress" title="${pct.toFixed(0)}% of budget committed">
        <div class="progress__bar ${over ? "progress__bar--over" : ""}" style="width: ${pct}%"></div>
      </div>
      <dl class="trip-metrics trip-metrics--payment">
        <div><dt>Budget</dt><dd>${formatMoney(budget)}</dd></div>
        <div><dt>Committed</dt><dd>${formatMoney(committed)}</dd></div>
        <div><dt>Paid</dt><dd>${formatMoney(paid)}</dd></div>
        <div><dt>Still to pay</dt><dd class="${due > 0 ? "trip-metrics__due" : ""}">${formatMoney(due)}</dd></div>
        <div><dt>Left in budget</dt><dd class="${remaining < 0 ? "over-badge" : ""}">${formatMoney(remaining)}</dd></div>
      </dl>
      <ul class="expense-list">${expensesHtml}</ul>
      <button type="button" class="btn btn--secondary btn-add-expense btn-add-expense--card" data-trip-id="${trip.id}">Add expense</button>
      ${renderCategoryBreakdown(trip, committed)}
    </article>
  `;
}

function renderTrips() {
  const trips = tripsForFilter().sort(
    (a, b) => b.year - a.year || a.name.localeCompare(b.name)
  );
  const list = $("trips-list");
  const empty = $("trips-empty");

  if (trips.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = trips.map(renderTripCard).join("");
  bindExpenseRowActions();
}

function bindExpenseRowActions() {
  const tripsList = $("trips-list");
  if (!tripsList) return;

  tripsList
    .querySelectorAll(
      ".btn-mark-paid, .btn-mark-unpaid, .btn-edit-expense, .btn-delete-expense"
    )
    .forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tripId = btn.getAttribute("data-trip-id");
        const expenseId = btn.getAttribute("data-expense-id");
        if (!tripId || !expenseId) return;

        if (btn.classList.contains("btn-mark-paid")) {
          markExpensePaid(tripId, expenseId);
        } else if (btn.classList.contains("btn-mark-unpaid")) {
          markExpenseUnpaid(tripId, expenseId);
        } else if (btn.classList.contains("btn-edit-expense")) {
          const trip = state.trips.find((t) => t.id === tripId);
          const exp = trip?.expenses.find((x) => x.id === expenseId);
          if (trip && exp) openExpenseDialog(trip.id, exp);
        } else if (btn.classList.contains("btn-delete-expense")) {
          deleteExpense(tripId, expenseId);
        }
      };
    });
}

function renderFundHistory() {
  const list = $("fund-history");
  const empty = $("fund-history-empty");

  const fundItems = (state.fundHistory || []).map((h) => ({
    date: h.date,
    label: h.note || (h.type === "rollover" ? "Rollover" : "Fund addition"),
    amount: h.amount,
    kind: h.type === "rollover" ? "roll" : "fund",
  }));

  const rollItems = (state.rollHistory || [])
    .filter((r) => r.target === "trips")
    .map((r) => ({
      date: r.date,
      label: r.note || `Roll ${r.fromYear} → ${r.toYear} (trip budgets)`,
      amount: r.amount,
      kind: "roll",
    }));

  const items = [...fundItems, ...rollItems].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  if (items.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = items
    .map((h) => {
      const prefix = h.kind === "roll" ? "↪" : "+";
      return `
    <li class="history-item history-item--${h.kind}">
      <span>${escapeHtml(h.date)} — ${escapeHtml(h.label)}</span>
      <strong>${prefix}${formatMoney(h.amount)}</strong>
    </li>`;
    })
    .join("");
}

function render() {
  renderYearFilter();
  renderGlobal();
  renderTrips();
  renderFundHistory();
}

function openDialog(dialog) {
  dialog.showModal();
}

function closeDialog(dialog) {
  dialog.close();
}

function setupDialogCloseHandlers() {
  document.querySelectorAll("[data-dialog-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dialog = btn.closest("dialog");
      if (dialog) closeDialog(dialog);
    });
  });
}

function openFundsDialog() {
  const form = $("form-funds");
  form.reset();
  form.date.value = todayISO();
  openDialog($("dialog-funds"));
}

function openTripDialog(trip = null) {
  const form = $("form-trip");
  const title = $("trip-dialog-title");
  form.reset();

  if (trip) {
    title.textContent = "Edit trip";
    form.tripId.value = trip.id;
    form.name.value = trip.name;
    form.year.value = trip.year;
    form.budget.value = trip.budget;
  } else {
    title.textContent = "New trip";
    form.tripId.value = "";
    form.year.value =
      selectedYear === "all" ? new Date().getFullYear() : Number(selectedYear);
    form.budget.value = "";
  }

  openDialog($("dialog-trip"));
}

function openExpenseDialog(tripId, expense = null) {
  const form = $("form-expense");
  const title = form.closest("dialog").querySelector(".dialog__title");
  const expenseId = expense ? expense.id : "";

  form.reset();
  expenseFormField(form, "tripId").value = tripId;
  expenseFormField(form, "expenseId").value = expenseId;
  title.textContent = expense ? "Edit expense" : "Add expense";

  const normalized = expense ? normalizeExpense(expense) : null;
  if (normalized) {
    expenseFormField(form, "label").value = normalized.label;
    expenseFormField(form, "category").value = normalized.category;
    expenseFormField(form, "amount").value = normalized.amount;
    expenseFormField(form, "date").value = normalized.date || "";
    expenseFormField(form, "status").value = normalized.status;
    expenseFormField(form, "amountPaid").value = normalized.amountPaid;
    expenseFormField(form, "paidDate").value = normalized.paidDate || "";
  } else {
    expenseFormField(form, "status").value = "booked";
    expenseFormField(form, "amountPaid").value = 0;
    expenseFormField(form, "paidDate").value = "";
  }

  syncExpensePaidDateVisibility();
  openDialog($("dialog-expense"));
}

function markExpensePaid(tripId, expenseId) {
  const trip = state.trips.find((t) => t.id === tripId);
  const exp = trip?.expenses.find((x) => x.id === expenseId);
  if (!exp) return;
  const amount = Number(exp.amount);
  exp.status = "paid";
  exp.amountPaid = amount;
  exp.paidDate = todayISO();
  saveState();
  render();
}

function markExpenseUnpaid(tripId, expenseId) {
  const trip = state.trips.find((t) => t.id === tripId);
  const exp = trip?.expenses.find((x) => x.id === expenseId);
  if (!exp) return;
  exp.status = "booked";
  exp.amountPaid = 0;
  exp.paidDate = "";
  saveState();
  render();
}

function handleFundsSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const amount = Number(form.amount.value);
  const date = form.date.value;
  const note = form.note.value.trim();

  if (amount <= 0) return;

  state.currentFunds += amount;
  state.fundHistory.push({
    id: uid("fund"),
    amount,
    date,
    note,
  });
  saveState();
  render();
  closeDialog($("dialog-funds"));
}

function handleTripSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.tripId.value;
  const name = form.name.value.trim();
  const year = Number(form.year.value);
  const budget = Number(form.budget.value);

  if (!name || budget < 0) return;

  if (id) {
    const trip = state.trips.find((t) => t.id === id);
    if (trip) {
      trip.name = name;
      trip.year = year;
      trip.budget = budget;
    }
  } else {
    state.trips.push({
      id: uid("trip"),
      name,
      year,
      budget,
      expenses: [],
    });
  }

  saveState();
  render();
  closeDialog($("dialog-trip"));
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const tripId = expenseFormField(form, "tripId").value;
  const expenseId = expenseFormField(form, "expenseId").value;
  const payload = buildExpenseFromForm(form);
  if (!payload) return;

  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;

  if (expenseId) {
    const exp = trip.expenses.find((x) => x.id === expenseId);
    if (exp) Object.assign(exp, normalizeExpense({ ...exp, ...payload }));
  } else {
    trip.expenses.push(normalizeExpense({ id: uid("exp"), ...payload }));
  }

  saveState();
  render();
  closeDialog($("dialog-expense"));
}

function deleteTrip(tripId) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const spent = tripSpent(trip);
  const msg = spent
    ? `Delete "${trip.name}" and its ${trip.expenses.length} expense(s)?`
    : `Delete "${trip.name}"?`;
  if (!confirm(msg)) return;
  state.trips = state.trips.filter((t) => t.id !== tripId);
  saveState();
  render();
}

function deleteExpense(tripId, expenseId) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const exp = trip.expenses.find((x) => x.id === expenseId);
  if (!exp || !confirm(`Delete expense "${exp.label}"?`)) return;
  trip.expenses = trip.expenses.filter((x) => x.id !== expenseId);
  saveState();
  render();
}

function bindRollEvents() {
  $("btn-roll-budget").addEventListener("click", openRollDialog);
  $("form-roll").addEventListener("submit", handleRollSubmit);

  const form = $("form-roll");
  ["fromYear", "toYear"].forEach((name) => {
    form.elements[name]?.addEventListener("change", () => {
      if (name === "fromYear") {
        const available = yearRolloverAvailable(Number(form.fromYear.value));
        if (available > 0) $("roll-amount").value = available.toFixed(2);
      }
      renderRollPreview();
    });
  });

  form.querySelectorAll('input[name="target"]').forEach((radio) => {
    radio.addEventListener("change", renderRollPreview);
  });

  $("roll-amount").addEventListener("input", renderRollPreview);

  $("roll-use-max").addEventListener("click", () => {
    const available = yearRolloverAvailable(Number(form.fromYear.value));
    if (available > 0) {
      $("roll-amount").value = available.toFixed(2);
      renderRollPreview();
    }
  });
}

function bindEvents() {
  $("year-filter").addEventListener("change", (e) => {
    selectedYear = e.target.value;
    render();
  });

  $("btn-add-funds").addEventListener("click", openFundsDialog);
  $("btn-add-trip").addEventListener("click", () => openTripDialog());
  bindRollEvents();

  $("form-funds").addEventListener("submit", handleFundsSubmit);
  $("form-trip").addEventListener("submit", handleTripSubmit);
  $("form-expense").addEventListener("submit", handleExpenseSubmit);

  $("form-expense").addEventListener("input", (e) => {
    const form = e.target.form;
    if (!form || form.id !== "form-expense") return;
    const amountEl = expenseFormField(form, "amount");
    const paidEl = expenseFormField(form, "amountPaid");
    const statusEl = expenseFormField(form, "status");
    const paidDateEl = expenseFormField(form, "paidDate");

    if (e.target.name === "amount") {
      const amount = Number(amountEl.value) || 0;
      const paid = Number(paidEl.value) || 0;
      if (paid > amount) paidEl.value = amount;
    }
    if (e.target.name === "status") {
      const status = statusEl.value;
      const amount = Number(amountEl.value) || 0;
      if (status === "paid" && amount > 0) {
        paidEl.value = amount;
        if (!paidDateEl.value) paidDateEl.value = todayISO();
      } else if (status !== "paid" && Number(paidEl.value) >= amount && amount > 0) {
        paidEl.value = 0;
        paidDateEl.value = "";
      }
    }
    syncExpensePaidDateVisibility();
  });

  $("form-expense").addEventListener("change", (e) => {
    if (e.target.form?.id === "form-expense") syncExpensePaidDateVisibility();
  });

  $("trips-list").addEventListener("click", (e) => {
    if (e.target.closest(".btn-mark-paid, .btn-mark-unpaid, .btn-edit-expense, .btn-delete-expense")) {
      return;
    }

    const addExpBtn = e.target.closest(".btn-add-expense");
    const editTripBtn = e.target.closest(".btn-edit-trip");
    const deleteTripBtn = e.target.closest(".btn-delete-trip");

    if (addExpBtn) {
      openExpenseDialog(addExpBtn.getAttribute("data-trip-id"));
      return;
    }

    const btn = editTripBtn || deleteTripBtn;
    if (!btn) return;

    const tripId = btn.getAttribute("data-trip-id");
    if (!tripId) return;

    if (btn.classList.contains("btn-edit-trip")) {
      const trip = state.trips.find((t) => t.id === tripId);
      if (trip) openTripDialog(trip);
    } else if (btn.classList.contains("btn-delete-trip")) {
      deleteTrip(tripId);
    }
  });
}

setupDialogCloseHandlers();
bindEvents();
render();
