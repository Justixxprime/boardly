// Runs the REAL payment-webhook edge function (or another webhook file passed
// as the first argument, e.g. invoice-payment-webhook/index.ts) under Node with
// Deno and Supabase stubbed by a tiny in-memory database. Checks signature
// verification, replay safety, amount and currency mismatches.
// Run:  npm i esbuild   then   node supabase/tests/payment-webhook.test.mjs
// Runs the REAL payment-webhook/index.ts under Node with Deno + Supabase stubbed by a tiny in-memory database.
import { transformSync } from "esbuild";
import fs from "node:fs";
import crypto from "node:crypto";
const file = process.argv[2] || new URL("../functions/payment-webhook/index.ts", import.meta.url).pathname;
const src = fs.readFileSync(file, "utf8").replace(/^import \{ createClient \} from .*$/m, "const createClient = globalThis.__createClient;");
const js = transformSync(src, { loader: "ts", format: "esm" }).code;

let db, updates, rpcCalls, rpcFail = false, updateFail = false;
// Stand-in for public.confirm_invoice_payment (schema_v85). The real SQL was
// tested on the live database in a rolled-back transaction, this copy only
// lets the Edge Function's own wiring run here.
function fakeConfirm({ p_reference, p_paid_minor, p_currency }) {
  const t = db.transactions.find((x) => x.idempotency_key === p_reference && x.type === "payment");
  if (!t) return { result: "not_found" };
  if (t.status !== "pending") return { result: "already_handled" };
  if (p_paid_minor == null || Math.round(t.amount * 100) !== p_paid_minor) return { result: "amount_mismatch" };
  if (String(p_currency || "").toUpperCase() !== String(t.currency || "NGN").toUpperCase()) return { result: "currency_mismatch" };
  t.status = "confirmed"; updates.push(["transactions", { status: "confirmed" }]);
  const inv = db.invoices.find((i) => i.id === t.invoice_id);
  if (inv) {
    const total = inv.line_items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
    const paid = db.transactions.filter((x) => x.invoice_id === inv.id && x.status === "confirmed" && ["payment", "refund"].includes(x.type)).reduce((a, x) => a + (x.type === "payment" ? x.amount : -x.amount), 0);
    inv.status = paid >= total - 0.005 ? "paid" : paid > 0 ? "partially_paid" : "sent"; updates.push(["invoices", { status: inv.status }]);
  }
  return { result: "confirmed" };
}
function table(name) {
  const q = { filters: [], ins: null, op: "select" };
  const rows = () => db[name].filter((r) => q.filters.every(([k, v]) => r[k] === v) && (!q.ins || q.ins[1].includes(r[q.ins[0]])));
  const api = {
    select() { return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    in(k, arr) { q.ins = [k, arr]; return api; },
    update(patch) { q.op = "update"; q.patch = patch; return api; },
    maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
    then(res, rej) {
      if (q.op === "update") {
        if (updateFail) return Promise.resolve({ error: { message: "db down" } }).then(res, rej);
        rows().forEach((r) => Object.assign(r, q.patch)); updates.push([name, q.patch]); return Promise.resolve({ error: null }).then(res, rej);
      }
      return Promise.resolve({ data: rows(), error: null }).then(res, rej);
    },
  };
  return api;
}
globalThis.__createClient = () => ({
  from: table,
  rpc: async (name, args) => { rpcCalls.push([name, args]); return rpcFail ? { data: null, error: { message: "boom" } } : { data: fakeConfirm(args), error: null }; },
});
let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ({ PAYSTACK_SECRET_KEY: "sk_test_secret", SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "y" })[k] } };
await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const fresh = () => {
  db = {
    marketplace_bookings: [{ id: "book-1", amount: 5000, status: "pending_payment" }],
    invoices: [{ id: "inv-1", line_items: [{ quantity: 1, unit_price: 500 }], status: "sent" }],
    transactions: [
      { id: "t-ngn", invoice_id: "inv-1", type: "payment", amount: 500, currency: "NGN", status: "pending", idempotency_key: "ref-ngn" },
      { id: "t-usd", invoice_id: "inv-1", type: "payment", amount: 500, currency: "USD", status: "pending", idempotency_key: "ref-usd" },
    ],
  }; updates = []; rpcCalls = []; rpcFail = false; updateFail = false;
};
const send = async (data, sign = true, event = "charge.success") => {
  const raw = JSON.stringify({ event, data });
  const sig = sign ? crypto.createHmac("sha512", "sk_test_secret").update(raw).digest("hex") : "deadbeef";
  return handler(new Request("http://f", { method: "POST", headers: { "x-paystack-signature": sig }, body: raw }));
};
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };
const txn = (id) => db.transactions.find((t) => t.id === id);

fresh(); let r = await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" });
ok("valid NGN payment confirms txn and marks invoice paid", r.status === 200 && txn("t-ngn").status === "confirmed" && db.invoices[0].status === "paid", JSON.stringify(db));
const n = updates.length; await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" });
ok("replayed webhook makes no further writes", updates.length === n);
fresh(); await send({ reference: "ref-usd", amount: 50000, currency: "NGN", status: "success" });
ok("USD invoice paid in NGN is NOT confirmed (currency mismatch)", txn("t-usd").status === "pending" && db.invoices[0].status === "sent");
fresh(); await send({ reference: "ref-usd", amount: 50000, currency: "USD", status: "success" });
ok("USD invoice paid in USD IS confirmed", txn("t-usd").status === "confirmed" && db.invoices[0].status === "paid");
fresh(); await send({ reference: "ref-ngn", amount: 40000, currency: "NGN", status: "success" });
ok("amount mismatch is NOT confirmed", txn("t-ngn").status === "pending");
fresh(); await send({ reference: "ref-ngn", amount: 50000, status: "success" });
ok("missing currency is NOT confirmed", txn("t-ngn").status === "pending");
fresh(); r = await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" }, false);
ok("bad signature -> 401, nothing changes", r.status === 401 && txn("t-ngn").status === "pending" && updates.length === 0);
fresh(); await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "failed" });
ok("non-success status ignored", txn("t-ngn").status === "pending");
fresh(); await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" }, true, "charge.failed");
ok("other event types ignored", txn("t-ngn").status === "pending");
fresh(); await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" });
ok("confirmation goes through one database call (confirm_invoice_payment)", rpcCalls.length === 1 && rpcCalls[0][0] === "confirm_invoice_payment" && rpcCalls[0][1].p_reference === "ref-ngn" && rpcCalls[0][1].p_paid_minor === 50000 && rpcCalls[0][1].p_currency === "NGN", JSON.stringify(rpcCalls));
fresh(); rpcFail = true; r = await send({ reference: "ref-ngn", amount: 50000, currency: "NGN", status: "success" });
ok("database failure answers 500 so Paystack retries, nothing marked paid", r.status === 500 && txn("t-ngn").status === "pending" && db.invoices[0].status === "sent", String(r.status));
fresh(); r = await send({ reference: "no-such-ref", amount: 50000, currency: "NGN", status: "success" });
ok("unknown reference answers 200 (no endless retries)", r.status === 200);
if (file.includes("/payment-webhook/")) {
  fresh(); updateFail = true; r = await send({ reference: "book-1", amount: 500000, currency: "NGN", status: "success" });
  ok("marketplace hold write failure answers 500 so Paystack retries", r.status === 500 && db.marketplace_bookings[0].status === "pending_payment", String(r.status));
}
if (file.includes("/payment-webhook/")) {
  fresh(); await send({ reference: "book-1", amount: 500000, currency: "NGN", status: "success" });
  ok("marketplace booking path still works", db.marketplace_bookings[0].status === "paid_held");
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
