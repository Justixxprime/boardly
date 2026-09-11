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
    supabaseClient.from("tasks").select("id").eq("user_id", homeState.userId).neq("status", "done").not("blocked_by_id", "is", null),
    supabaseClient.from("boards").select("id").eq("user_id", homeState.userId),
    supabaseClient.from("tasks").select("id").eq("user_id", homeState.userId).eq("status", "done").gte("done_at", daysAgo(7)),
  ]);
  return {
    dueToday: dueTodayRes.data || [],
    overdue: overdueRes.data || [],
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
    supabaseClient.from("invoices").select("id, status, line_items, due_date, created_at"),
    supabaseClient.from("transactions").select("type, amount, status, created_at"),
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
      if (inv.due_date && inv.due_date < today) overdueInvoices.push(inv);
    }
  });

  const received = transactions.filter((t) => t.type === "payment" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0)
    - transactions.filter((t) => t.type === "refund" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = transactions.filter((t) => t.type === "expense" && t.status === "confirmed").reduce((sum, t) => sum + Number(t.amount), 0);

  const invoicesRes2 = invoices.filter((inv) => inv.created_at && inv.created_at >= daysAgo(7));
  const paymentsLast7Days = transactions.filter((t) => t.type === "payment" && t.status === "confirmed" && t.created_at >= daysAgo(7)).length;

  return { outstanding, received, expenses, overdueCount: overdueInvoices.length, paymentsLast7Days, newInvoicesLast7Days: invoicesRes2.length };
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

/* ---- attention: the two deterministic signals worth surfacing up top --- */

function renderAttention(overdueTasks, moneySummary) {
  const list = document.getElementById("home-attention-list");
  const empty = document.getElementById("home-attention-empty");
  const items = [];

  overdueTasks.slice(0, 3).forEach((t) => {
    items.push({ label: t.title, detail: `Overdue since ${new Date(t.due_date).toLocaleDateString()}`, href: "dashboard.html", color: "var(--critical)" });
  });
  if (moneySummary && moneySummary.overdueCount > 0) {
    items.push({
      label: `${moneySummary.overdueCount} overdue invoice${moneySummary.overdueCount === 1 ? "" : "s"}`,
      detail: fmtHomeMoney(moneySummary.outstanding) + " outstanding",
      href: "money.html",
      color: "var(--critical)",
    });
  }

  if (!items.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = items.map((item) => `
    <a href="${item.href}" class="attention-item">
      <span>${escHome(item.label)}</span>
      <span class="text-xs" style="color:${item.color}">${escHome(item.detail)}</span>
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
    const [taskSummary, moneySummary, clientsSummary] = await Promise.all([
      loadTasksSummary(),
      loadMoneySummary(),
      loadClientsSummary(),
    ]);

    renderToday(taskSummary.dueToday);
    renderWork(taskSummary);
    renderMoney(moneySummary);
    renderClients(clientsSummary);
    renderAttention(taskSummary.overdue, moneySummary);

    document.getElementById("home-momentum-tasks").textContent = String(taskSummary.completedLast7Days);
    document.getElementById("home-momentum-payments").textContent = moneySummary ? String(moneySummary.paymentsLast7Days) : "n/a";
    document.getElementById("home-momentum-invoices").textContent = moneySummary ? String(moneySummary.newInvoicesLast7Days) : "n/a";

    const subline = taskSummary.overdue.length || (moneySummary && moneySummary.overdueCount)
      ? "A few things deserve attention today."
      : "Nothing urgent, here is where things stand.";
    document.getElementById("home-subline").textContent = subline;
  } catch (err) {
    console.error("Home: couldn't load your data.", err);
    toast("Couldn't load Home, try reloading the page.", "error");
  }
});
