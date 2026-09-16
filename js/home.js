/* ==========================================================================
   BOARDLY 2.0: js/home.js
   --------------------------------------------------------------------------
   Powers home.html, Phase 3 of the brief (Section 6, "the daily
   operating system"). Standalone page, own state, same pattern as
   money.js and clients.js.

   Every section here is a plain database query or plain arithmetic over
   data that already exists (tasks, invoices, transactions, clients).
   None of it is AI, a prediction, or a guess, matching brief Section 83
   ("a database query is not AI"). Sections that need a table that
   doesn't exist yet on a given install (Money's or Clients' schema
   files not run) just quietly show nothing for that part rather than
   erroring the whole page.
   ========================================================================== */

const homeState = { userId: null };

function escHome(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function fmtHomeMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

/* ---- greeting ------------------------------------------------------------ */

function renderGreeting(name) {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("home-greeting").textContent = name ? `${timeGreeting}, ${name}.` : `${timeGreeting}.`;
}

// Onboarding goals (schema_v74, signup's second, optional question):
// reorders which of Money/Work/Clients appears first, Today always
// stays first since it's the actual work timeline regardless of what
// someone said they wanted help with. Nothing is ever hidden, this
// only changes DOM order inside a plain grid with no other section
// depending on it, matching the honesty note in schema_v74's own
// comment. Anyone who skipped the question, or whose picks don't
// favor any one section, sees the exact same order Home always had.
async function reorderHomeSectionsByGoals(userId) {
  const { data, error } = await supabaseClient.from("user_settings").select("goals").eq("user_id", userId).maybeSingle();
  const goals = error ? [] : (data?.goals || []);
  if (!goals.length) return;

  const scoreFor = {
    money: ["get_paid", "track_money"].filter((g) => goals.includes(g)).length,
    work: ["manage_work", "manage_team", "run_operations"].filter((g) => goals.includes(g)).length,
    clients: ["find_clients"].filter((g) => goals.includes(g)).length,
  };
  if (scoreFor.money === 0 && scoreFor.work === 0 && scoreFor.clients === 0) return;

  const order = ["money", "work", "clients"].sort((a, b) => scoreFor[b] - scoreFor[a]);
  const grid = document.getElementById("home-sections-grid");
  const todaySection = document.getElementById("home-section-today");
  if (!grid || !todaySection) return;
  order.forEach((key) => {
    const section = document.getElementById(`home-section-${key}`);
    if (section) grid.appendChild(section); // appendChild on an existing child MOVES it, doesn't duplicate it
  });
}

/* ---- work: tasks ----------------------------------------------------------
   Tasks live outside Money/Clients' own schema files, this is the base
   tasks table that has existed since the very first schema, so no
   readiness guard is needed here the way loadClients/loadProfitability
   need one. ------------------------------------------------------------- */

async function loadTasksSummary() {
  const today = todayDate();
  const [dueTodayRes, overdueRes, blockedRes, boardsRes, completedRes] = await Promise.all([
    supabaseClient.from("tasks").select("id, title").eq("user_id", homeState.userId).neq("status", "done").eq("due_date", today),
    supabaseClient.from("tasks").select("id, title, due_date").eq("user_id", homeState.userId).neq("status", "done").lt("due_date", today),
    supabaseClient.from("tasks").select("id, title").eq("user_id", homeState.userId).neq("status", "done").not("blocked_by_id", "is", null),
    supabaseClient.from("boards").select("id").eq("user_id", homeState.userId),
    supabaseClient.from("tasks").select("id").eq("user_id", homeState.userId).eq("status", "done").gte("done_at", daysAgo(7)),
  ]);
  return {
    dueToday: dueTodayRes.data || [],
    overdue: overdueRes.data || [],
    blocked: blockedRes.data || [],
    blockedCount: (blockedRes.data || []).length,
    boardCount: (boardsRes.data || []).length,
    completedLast7Days: (completedRes.data || []).length,
  };
}

function renderToday(dueToday) {
  const list = document.getElementById("home-today-list");
  const empty = document.getElementById("home-today-empty");
  if (!dueToday.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = dueToday.map((t) => `<div class="ticket p-3 text-sm">${escHome(t.title)}</div>`).join("");
}

function renderWork(summary) {
  document.getElementById("home-work-list").innerHTML = `
    <div class="ticket p-3 flex items-center justify-between"><span>Active projects</span><span class="font-mono font-medium">${summary.boardCount}</span></div>
    <div class="ticket p-3 flex items-center justify-between"><span>Due today</span><span class="font-mono font-medium">${summary.dueToday.length}</span></div>
    <div class="ticket p-3 flex items-center justify-between"><span>Overdue</span><span class="font-mono font-medium" style="color:${summary.overdue.length ? "var(--critical)" : "inherit"}">${summary.overdue.length}</span></div>
    <div class="ticket p-3 flex items-center justify-between"><span>Blocked</span><span class="font-mono font-medium" style="color:${summary.blockedCount ? "var(--warning)" : "inherit"}">${summary.blockedCount}</span></div>
  `;
}

/* ---- money: quietly does nothing if invoices/transactions don't exist yet */

async function loadMoneySummary() {
  const [invoicesRes, transactionsRes] = await Promise.all([
    supabaseClient.from("invoices").select("id, title, status, line_items, due_date, created_at, currency"),
    supabaseClient.from("transactions").select("type, amount, status, created_at, invoice_id"),
  ]);
  if (invoicesRes.error || transactionsRes.error) return null;

  const invoices = invoicesRes.data || [];
  const transactions = transactionsRes.data || [];
  const today = todayDate();

  const invoiceTotal = (inv) => (inv.line_items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const paidForInvoice = (id) => transactions
    .filter((t) => t.invoice_id === id && t.status === "confirmed")
    .reduce((sum, t) => sum + (t.type === "payment" ? Number(t.amount) : t.type === "refund" ? -Number(t.amount) : 0), 0);

  let outstanding = 0;
  const overdueInvoices = [];
  invoices.forEach((inv) => {
    if (["cancelled", "paid", "refunded", "draft"].includes(inv.status)) return;
    const balance = invoiceTotal(inv) - paidForInvoice(inv.id);
    if (balance > 0.005) {
      outstanding += balance;
      if (inv.due_date && inv.due_date < today) {
        const daysOverdue = Math.floor((new Date(today) - new Date(inv.due_date)) / 86400000);
        overdueInvoices.push({ ...inv, balance, daysOverdue });
      }
    }
  });
  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const received = transactions.filter((t) => t.type === "payment" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0)
    - transactions.filter((t) => t.type === "refund" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = transactions.filter((t) => t.type === "expense" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0);

  const invoicesRes2 = invoices.filter((inv) => inv.created_at && inv.created_at >= daysAgo(7));
  const paymentsLast7Days = transactions.filter((t) => t.type === "payment" && t.status === "confirmed" && t.created_at >= daysAgo(7)).length;
  const failedPaymentsLast7Days = transactions.filter((t) => t.type === "payment" && t.status === "failed" && t.created_at >= daysAgo(7)).length;

  return {
    outstanding, received, expenses,
    overdueCount: overdueInvoices.length,
    overdueInvoices,
    paymentsLast7Days,
    newInvoicesLast7Days: invoicesRes2.length,
    failedPaymentsLast7Days,
  };
}

function renderMoney(summary) {
  if (!summary) {
    document.getElementById("home-money-outstanding").textContent = "n/a";
    document.getElementById("home-money-received").textContent = "n/a";
    document.getElementById("home-money-expenses").textContent = "n/a";
    return;
  }
  document.getElementById("home-money-outstanding").textContent = fmtHomeMoney(summary.outstanding);
  document.getElementById("home-money-received").textContent = fmtHomeMoney(summary.received);
  document.getElementById("home-money-expenses").textContent = fmtHomeMoney(summary.expenses);
}

/* ---- clients: quietly does nothing if the clients table doesn't exist yet */

async function loadClientsSummary() {
  const [clientsRes, invoicesRes, transactionsRes] = await Promise.all([
    supabaseClient.from("clients").select("id, name"),
    supabaseClient.from("invoices").select("id, client_id, line_items, status"),
    supabaseClient.from("transactions").select("invoice_id, type, amount, status"),
  ]);
  if (clientsRes.error) return null;

  const clients = clientsRes.data || [];
  const invoices = invoicesRes.data || [];
  const transactions = transactionsRes.data || [];
  const invoiceTotal = (inv) => (inv.line_items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const paidForInvoice = (id) => transactions
    .filter((t) => t.invoice_id === id && t.status === "confirmed")
    .reduce((sum, t) => sum + (t.type === "payment" ? Number(t.amount) : t.type === "refund" ? -Number(t.amount) : 0), 0);

  return clients.map((client) => {
    const clientInvoices = invoices.filter((inv) => inv.client_id === client.id && inv.status !== "cancelled");
    const outstanding = clientInvoices.reduce((sum, inv) => sum + Math.max(invoiceTotal(inv) - paidForInvoice(inv.id), 0), 0);
    return { ...client, outstanding };
  }).filter((c) => c.outstanding > 0.005).sort((a, b) => b.outstanding - a.outstanding);
}

function renderClients(clientsWithBalance) {
  const list = document.getElementById("home-clients-list");
  const empty = document.getElementById("home-clients-empty");
  if (clientsWithBalance === null) { list.innerHTML = ""; empty.classList.add("hidden"); return; }
  if (!clientsWithBalance.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = clientsWithBalance.slice(0, 5).map((c) => `
    <div class="ticket p-3 flex items-center justify-between text-sm">
      <span>${escHome(c.name)}</span>
      <span class="font-mono font-medium" style="color:var(--warning)">${fmtHomeMoney(c.outstanding)}</span>
    </div>`).join("");
}

/* ---- marketplace: quietly does nothing if there is no provider profile ---- */

async function loadOpenDisputeCount() {
  const { count, error } = await supabaseClient
    .from("marketplace_bookings")
    .select("id", { count: "exact", head: true })
    .eq("profile_user_id", homeState.userId)
    .eq("dispute_status", "opened");
  if (error) return 0;
  return count || 0;
}

/* ---- Silent Sentinel (Section 28) ----------------------------------------
   Deterministic pattern detection, explicitly not AI (Section 83: "a
   database query is not AI"). Every signal below is a plain threshold
   check over data already loaded for the rest of Home, nothing here
   predicts anything or scores anything opaque. Severity is a fixed,
   stated banding (Low/Medium/High/Critical per Section 28), based on
   how many days overdue something is or how much money is at stake,
   never a machine-learned judgment call.

   "Don't constantly interrupt" (Section 28): this only ever renders a
   passive list on Home, it never pops up a notification or a modal. --- */

const SENTINEL_SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const SENTINEL_SEVERITY_COLOR = { critical: "var(--critical)", high: "var(--critical)", medium: "var(--warning)", low: "var(--ink-soft)" };
const SENTINEL_SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

function daysOverdueSeverity(days) {
  if (days >= 8) return "critical";
  if (days >= 4) return "high";
  return "medium";
}

function computeSentinelSignals(taskSummary, moneySummary, openDisputeCount) {
  const signals = [];
  const today = new Date();

  taskSummary.overdue.forEach((t) => {
    const days = Math.floor((today - new Date(t.due_date)) / 86400000);
    signals.push({
      severity: daysOverdueSeverity(days),
      label: t.title,
      detail: `Overdue ${days} day${days === 1 ? "" : "s"}`,
      href: "dashboard.html",
    });
  });

  if (moneySummary) {
    moneySummary.overdueInvoices.forEach((inv) => {
      signals.push({
        severity: daysOverdueSeverity(inv.daysOverdue),
        label: inv.title,
        detail: `${fmtHomeMoney(inv.balance, inv.currency)} overdue ${inv.daysOverdue} day${inv.daysOverdue === 1 ? "" : "s"}`,
        href: "money.html",
      });
    });

    if (moneySummary.failedPaymentsLast7Days > 0) {
      signals.push({
        severity: "high",
        label: `${moneySummary.failedPaymentsLast7Days} failed payment${moneySummary.failedPaymentsLast7Days === 1 ? "" : "s"}`,
        detail: "In the last 7 days",
        href: "money.html",
      });
    }
  }

  if (openDisputeCount > 0) {
    signals.push({
      severity: "high",
      label: `${openDisputeCount} open Marketplace dispute${openDisputeCount === 1 ? "" : "s"}`,
      detail: "Payment held until resolved",
      href: "marketplace.html",
    });
  }

  taskSummary.blocked.slice(0, 3).forEach((t) => {
    signals.push({ severity: "medium", label: t.title, detail: "Blocked", href: "dashboard.html" });
  });

  return signals.sort((a, b) => SENTINEL_SEVERITY_RANK[b.severity] - SENTINEL_SEVERITY_RANK[a.severity]);
}

function renderAttention(signals) {
  const list = document.getElementById("home-attention-list");
  const empty = document.getElementById("home-attention-empty");

  if (!signals.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = signals.slice(0, 8).map((item) => `
    <a href="${item.href}" class="attention-item">
      <span class="flex items-center gap-2">
        <span class="badge" style="color:${SENTINEL_SEVERITY_COLOR[item.severity]}; background:color-mix(in srgb, ${SENTINEL_SEVERITY_COLOR[item.severity]} 14%, transparent); font-size:.625rem">${SENTINEL_SEVERITY_LABEL[item.severity]}</span>
        ${escHome(item.label)}
      </span>
      <span class="text-xs" style="color:${SENTINEL_SEVERITY_COLOR[item.severity]}">${escHome(item.detail)}</span>
    </a>`).join("");
}

/* ---- wiring ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    console.error("Home: couldn't confirm your session.", err);
    toast("Couldn't confirm your session, try reloading the page.", "error");
    return;
  }
  if (!session) return;
  homeState.userId = session.user.id;
  renderGreeting(session.user.user_metadata?.full_name || session.user.email?.split("@")[0]);

  try {
    const [taskSummary, moneySummary, clientsSummary, openDisputeCount] = await Promise.all([
      loadTasksSummary(),
      loadMoneySummary(),
      loadClientsSummary(),
      loadOpenDisputeCount(),
      reorderHomeSectionsByGoals(homeState.userId),
    ]);

    renderToday(taskSummary.dueToday);
    renderWork(taskSummary);
    renderMoney(moneySummary);
    renderClients(clientsSummary);
    const sentinelSignals = computeSentinelSignals(taskSummary, moneySummary, openDisputeCount);
    renderAttention(sentinelSignals);

    document.getElementById("home-momentum-tasks").textContent = String(taskSummary.completedLast7Days);
    document.getElementById("home-momentum-payments").textContent = moneySummary ? String(moneySummary.paymentsLast7Days) : "n/a";
    document.getElementById("home-momentum-invoices").textContent = moneySummary ? String(moneySummary.newInvoicesLast7Days) : "n/a";

    const criticalOrHigh = sentinelSignals.filter((s) => s.severity === "critical" || s.severity === "high").length;
    const subline = sentinelSignals.length
      ? criticalOrHigh > 0
        ? `${criticalOrHigh} thing${criticalOrHigh === 1 ? "" : "s"} need${criticalOrHigh === 1 ? "s" : ""} real attention today.`
        : "A few things worth a look, nothing urgent."
      : "Nothing urgent, here is where things stand.";
    document.getElementById("home-subline").textContent = subline;
  } catch (err) {
    console.error("Home: couldn't load your data.", err);
    toast("Couldn't load Home, try reloading the page.", "error");
  }
});
