// Runs js/ai-fill.js against the REAL clients.html and money.html markup in
// jsdom, with the edge function stubbed. Checks the strip is injected, resets
// on reopen, hides when editing, fills the right fields, and never saves.
// Run:  npm i jsdom   then   node supabase/tests/ai-fill-ui.test.mjs
import { JSDOM } from "jsdom";
import fs from "node:fs";
const repo = new URL("../../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };
const tick = () => new Promise((r) => setTimeout(r, 20));

async function setup(page) {
  const html = fs.readFileSync(repo + page, "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.crypto.randomUUID ??= () => "id-" + Math.random();
  w.toastLog = []; w.toast = (m, k) => w.toastLog.push([m, k]);
  w.calls = [];
  w.supabaseClient = {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
    functions: { invoke: async (name, opts) => { w.calls.push([name, opts]); return w.nextReply; } },
  };
  w.eval(fs.readFileSync(repo + "js/ai-fill.js", "utf8") + "\nwindow.AiFill = AiFill;");
  return w;
}
const open = (w, id) => w.document.getElementById(id).classList.remove("hidden");
const close = (w, id) => w.document.getElementById(id).classList.add("hidden");

// ---------- clients page ----------
{
  const w = await setup("clients.html");
  const src = fs.readFileSync(repo + "js/clients.js", "utf8");
  const block = src.match(/  AiFill\.register\(\{\n    modalId: "client-modal"[\s\S]*?\n  \}\);\n/)[0];
  w.clientsState = { editingClientId: null, pipelineReady: true };
  w.eval(block);
  const strip = () => w.document.querySelector("#client-modal [data-ai-fill]");
  ok("clients: strip injected under header", !!strip() && strip().previousElementSibling.querySelector("#client-modal-title"));
  // open as "New lead"
  w.document.getElementById("client-modal-title").textContent = "New lead"; open(w, "client-modal"); await tick();
  ok("clients: visible when creating", !strip().classList.contains("hidden"));
  w.nextReply = { data: { draft: { name: "Sarah Bello", email: "sarah@acme.ng", phone: "0803 555 0142", stage: "contacted", notes: "IG" }, error: null }, error: null };
  w.nextReply = { data: { draft: { name: "Sarah Bello", email: "sarah@acme.ng", phone: "0803 555 0142", stage: "contacted", notes: "IG" } }, error: null };
  strip().querySelector("[data-ai-toggle]").click();
  ok("clients: panel opens", !strip().querySelector("[data-ai-panel]").classList.contains("hidden"));
  strip().querySelector("[data-ai-text]").value = "Sarah from Acme";
  strip().querySelector("[data-ai-run]").click(); await tick();
  const [fn, opts] = w.calls[0];
  ok("clients: calls ai-fill-form with kind=lead, today, auth header", fn === "ai-fill-form" && opts.body.kind === "lead" && /^\d{4}-\d{2}-\d{2}$/.test(opts.body.today) && opts.headers.Authorization === "Bearer tok", JSON.stringify(opts));
  const v = (id) => w.document.getElementById(id).value;
  ok("clients: form fields filled", v("client-name-input") === "Sarah Bello" && v("client-email-input") === "sarah@acme.ng" && v("client-phone-input") === "0803 555 0142" && v("client-stage-input") === "contacted" && v("client-notes-input") === "IG");
  ok("clients: nothing saved (no db calls, only function invoke)", w.calls.length === 1);
  // reopen as "New client" -> kind switches, panel reset
  close(w, "client-modal"); w.document.getElementById("client-modal-title").textContent = "New client"; open(w, "client-modal"); await tick();
  ok("clients: reset on reopen", strip().querySelector("[data-ai-panel]").classList.contains("hidden") && strip().querySelector("[data-ai-text]").value === "");
  strip().querySelector("[data-ai-text]").value = "x"; strip().querySelector("[data-ai-run]").click(); await tick();
  ok("clients: kind=client from title", w.calls[1][1].body.kind === "client");
  // edit mode hides strip
  close(w, "client-modal"); w.clientsState.editingClientId = "abc"; w.document.getElementById("client-modal-title").textContent = "Edit client"; open(w, "client-modal"); await tick();
  ok("clients: hidden when editing", strip().classList.contains("hidden"));
  // function error surfaces real reason from body
  close(w, "client-modal"); w.clientsState.editingClientId = null; open(w, "client-modal"); await tick();
  w.nextReply = { data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "You've used AI fill a lot in the last hour." }) } } };
  strip().querySelector("[data-ai-text]").value = "x"; strip().querySelector("[data-ai-run]").click(); await tick();
  ok("clients: real server error message shown in toast", w.toastLog.some(([m, k]) => k === "error" && m.includes("used AI fill a lot")), JSON.stringify(w.toastLog));
  // empty draft
  w.nextReply = { data: { draft: {} }, error: null };
  strip().querySelector("[data-ai-run]").click(); await tick();
  ok("clients: empty draft gives friendly message", /couldn't find anything/.test(strip().querySelector("[data-ai-status]").textContent));
}

// ---------- money page ----------
{
  const w = await setup("money.html");
  const src = fs.readFileSync(repo + "js/money.js", "utf8");
  const fnBlock = src.match(/function findSavedClientByName[\s\S]*?\n\}\n\nfunction registerMoneyAiFill\(\) \{[\s\S]*?\n\}\n/)[0];
  w.moneyState = { editingInvoiceId: null, editingRetainerId: null, builderItems: [], clients: [{ id: "c1", name: "Sarah Bello", email: "saved@acme.ng" }] };
  w.renderCount = 0; w.renderInvoiceItems = () => { w.renderCount++; }; w.updateInvoiceBuilderTotal = () => {};
  w.eval(fnBlock + "\nregisterMoneyAiFill();");
  const strip = (id) => w.document.querySelector(`#${id} [data-ai-fill]`);
  ok("money: strips on all three modals", ["invoice-builder-modal", "expense-modal", "retainer-builder-modal"].every((id) => !!strip(id)));
  const v = (id) => w.document.getElementById(id).value;
  const runIn = async (id, text = "x") => { strip(id).querySelector("[data-ai-text]").value = text; strip(id).querySelector("[data-ai-run]").click(); await tick(); };

  // invoice, matched saved client
  w.document.getElementById("invoice-client-select").innerHTML = '<option value="">one-off</option><option value="c1">Sarah Bello</option>';
  open(w, "invoice-builder-modal"); await tick();
  w.nextReply = { data: { draft: { client_name: "sarah bello", title: "Website", currency: "USD", due_date: "2026-10-15", line_items: [{ description: "Deposit (50%)", quantity: 1, unit_price: 225000 }] } }, error: null };
  await runIn("invoice-builder-modal");
  ok("invoice: fields + currency + due date", v("invoice-title-input") === "Website" && v("invoice-currency") === "USD" && v("invoice-due-date") === "2026-10-15");
  ok("invoice: matched saved client (id, canonical name, saved email)", v("invoice-client-select") === "c1" && v("invoice-client-name") === "Sarah Bello" && v("invoice-client-email") === "saved@acme.ng");
  ok("invoice: line items replaced with fresh ids and rendered", w.moneyState.builderItems.length === 1 && w.moneyState.builderItems[0].unit_price === 225000 && w.renderCount === 1);
  // invoice with no items -> heads up, items untouched
  w.nextReply = { data: { draft: { title: "Logo" } }, error: null }; await runIn("invoice-builder-modal");
  ok("invoice: no amount gives heads-up and keeps items", /couldn't find an amount/.test(strip("invoice-builder-modal").querySelector("[data-ai-status]").textContent) && w.moneyState.builderItems.length === 1);
  // editing hides
  close(w, "invoice-builder-modal"); w.moneyState.editingInvoiceId = "inv1"; open(w, "invoice-builder-modal"); await tick();
  ok("invoice: hidden when editing", strip("invoice-builder-modal").classList.contains("hidden"));

  // expense: non-NGN warning, category select
  open(w, "expense-modal"); await tick();
  w.nextReply = { data: { draft: { category: "Transport", amount: 20, currency: "USD", date: "2026-09-18", notes: "Uber" } }, error: null };
  await runIn("expense-modal");
  ok("expense: fields filled", v("expense-category") === "Transport" && v("expense-amount") === "20" && v("expense-date") === "2026-09-18" && v("expense-notes") === "Uber");
  ok("expense: warns when currency is not NGN", /saved in NGN/.test(strip("expense-modal").querySelector("[data-ai-status]").textContent));

  // retainer: unknown client warning
  open(w, "retainer-builder-modal"); await tick();
  w.nextReply = { data: { draft: { client_name: "Nobody Ltd", name: "Maintenance", amount: 75000, currency: "NGN", hours_included: 10, billing_day: 1, status: "active" } }, error: null };
  await runIn("retainer-builder-modal");
  ok("retainer: fields filled", v("retainer-name-input") === "Maintenance" && v("retainer-amount-input") === "75000" && v("retainer-hours-input") === "10" && v("retainer-billing-day-input") === "1" && v("retainer-status-select") === "active");
  ok("retainer: unknown client is flagged, not silently linked", /isn't one of your saved clients/.test(strip("retainer-builder-modal").querySelector("[data-ai-status]").textContent) && v("retainer-client-select") === "");
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
