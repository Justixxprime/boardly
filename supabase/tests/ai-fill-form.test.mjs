// Runs the REAL supabase/functions/ai-fill-form/index.ts under Node with the
// AI provider, Supabase auth and Deno stubbed out. Checks auth, input
// limits, output sanitizing, and the per-user rate limit. No network.
// Run:  npm i esbuild   then   node supabase/tests/ai-fill-form.test.mjs
// Runs the real ai-fill-form/index.ts under Node with stubs for Deno, supabase and fetch.
import { transformSync } from "esbuild";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../functions/ai-fill-form/index.ts", import.meta.url), "utf8")
  .replace(/^import \{ createClient \} from .*$/m, "const createClient = globalThis.__createClient;");
const js = transformSync(src, { loader: "ts", format: "esm" }).code;

let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "a", GROQ_API_KEY: "g" })[k] } };
let authedUser = { id: "user-1" };
globalThis.__createClient = () => ({ auth: { getUser: async () => authedUser ? ({ data: { user: authedUser }, error: null }) : ({ data: { user: null }, error: { message: "bad" } }) } });
let aiReply = "{}";
let lastPrompt = null;
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body); lastPrompt = body.messages;
  if (typeof aiReply === "function") return aiReply(url);
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: aiReply } }], usage: { total_tokens: 10 } }) };
};
await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const call = async (body, headers = { authorization: "Bearer t" }, method = "POST") =>
  handler(new Request("http://f", { method, headers: { "content-type": "application/json", ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined }));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + extra)); };

// auth
let r = await call({ kind: "expense", text: "x" }, {});
ok("no auth header -> 401", r.status === 401);
authedUser = null; r = await call({ kind: "expense", text: "x" });
ok("bad token -> 401", r.status === 401); authedUser = { id: "user-1" };
r = await call({}, {}, "GET"); ok("GET -> 405", r.status === 405);
r = await call({ kind: "hack", text: "x" }); ok("unknown kind -> 400", r.status === 400);
r = await call({ kind: "invoice", text: "   " }); ok("empty text -> 400", r.status === 400);
r = await call({ kind: "invoice", text: "a".repeat(8001) }); ok("oversize text -> 400", r.status === 400);

// invoice: hostile + messy model output gets cleaned
aiReply = "Sure! ```json\n" + JSON.stringify({
  client_name: "  Sarah   Bello ", client_email: "not-an-email", title: "Website", currency: "usd",
  due_date: "2026-10-15", notes: null,
  line_items: [{ description: "Deposit (50%)", quantity: "1", unit_price: "225,000" }, { description: "", unit_price: 5 }, { description: "neg", unit_price: -4 }, { description: "huge", unit_price: 1e15 }, "junk"],
  injected: "DROP TABLE", is_admin: true }) + "\n```";
r = await call({ kind: "invoice", text: "Website for Sarah 450k half upfront due 15 Oct", today: "2026-09-19" });
let j = await r.json();
ok("invoice 200 with draft", r.status === 200 && j.draft, JSON.stringify(j));
ok("invoice drops bad email", !("client_email" in j.draft));
ok("invoice normalises name whitespace", j.draft.client_name === "Sarah Bello");
ok("invoice currency uppercased+allowlisted", j.draft.currency === "USD");
ok("invoice keeps only valid line (comma price parsed)", j.draft.line_items.length === 1 && j.draft.line_items[0].unit_price === 225000);
ok("invoice strips unknown keys", !("injected" in j.draft) && !("is_admin" in j.draft));
ok("prompt contains today + weekday", lastPrompt[0].content.includes("2026-09-19 (Saturday)"), lastPrompt[0].content.slice(0, 400));
ok("user text passed as user message, not system", lastPrompt[1].role === "user" && lastPrompt[1].content.includes("Sarah"));

// expense
aiReply = JSON.stringify({ category: "transport", amount: 12500, currency: "NGN", date: "2026-09-18", notes: "Bolt to client meeting" });
r = await call({ kind: "expense", text: "bolt" }); j = await r.json();
ok("expense category canonicalised", j.draft.category === "Transport" && j.draft.amount === 12500 && j.draft.date === "2026-09-18");
aiReply = JSON.stringify({ category: "Yachts", amount: -5, date: "2026-02-31" });
r = await call({ kind: "expense", text: "bolt" }); j = await r.json();
ok("expense rejects bad category, negative amount, impossible date", Object.keys(j.draft).length === 0, JSON.stringify(j));

// retainer
aiReply = JSON.stringify({ client_name: "Acme", name: "Website maintenance", amount: "75000", currency: "NGN", hours_included: 10, billing_day: 31, status: "ACTIVE" });
r = await call({ kind: "retainer", text: "x" }); j = await r.json();
ok("retainer billing_day 31 rejected (max 28), rest kept", !("billing_day" in j.draft) && j.draft.amount === 75000 && j.draft.status === "active");

// lead/client
aiReply = JSON.stringify({ name: "Sarah Bello", email: "SARAH@Acme.ng", phone: "0803 555 0142", company: null, stage: "contacted", notes: "Found via Instagram" });
r = await call({ kind: "lead", text: "x" }); j = await r.json();
ok("lead fields cleaned (email lowercased, phone kept, null dropped)", j.draft.email === "sarah@acme.ng" && j.draft.phone === "0803 555 0142" && !("company" in j.draft) && j.draft.stage === "contacted");
aiReply = JSON.stringify({ name: "X", phone: "call me maybe", stage: "vip" });
r = await call({ kind: "client", text: "x" }); j = await r.json();
ok("bad phone + bad stage dropped", !("phone" in j.draft) && !("stage" in j.draft));

// model garbage / provider failure
aiReply = "I cannot help with that"; r = await call({ kind: "client", text: "x" });
ok("non-JSON reply -> 502 friendly", r.status === 502);
aiReply = () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
r = await call({ kind: "client", text: "x" }); j = await r.json();
ok("provider error -> 502 with reason", r.status === 502 && /rate limited/.test(j.error), JSON.stringify(j));

// rate limit (per user): this user has made many calls already; push over 40
aiReply = JSON.stringify({ name: "A" }); let got429 = false;
for (let i = 0; i < 45; i++) { const x = await call({ kind: "client", text: "x" }); if (x.status === 429) { got429 = true; break; } }
ok("rate limit kicks in for one user", got429);
authedUser = { id: "user-2" }; r = await call({ kind: "client", text: "x" });
ok("other user unaffected by that limit", r.status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
