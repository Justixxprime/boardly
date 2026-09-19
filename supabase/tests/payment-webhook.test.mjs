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

let db, updates;
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
      if (q.op === "update") { rows().forEach((r) => Object.assign(r, q.patch)); updates.push([name, q.patch]); return Promise.resolve({ error: null }).then(res, rej); }
      return Promise.resolve({ data: rows(), error: null }).then(res, rej);
    },
  };
  return api;
}
globalThis.__createClient = () => ({ from: table });
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
  }; updates = [];
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
if (file.includes("/payment-webhook/")) {
  fresh(); await send({ reference: "book-1", amount: 500000, currency: "NGN", status: "success" });
  ok("marketplace booking path still works", db.marketplace_bookings[0].status === "paid_held");
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
