// Tests the isRateLimited helper that is pasted into the six public edge functions
// (F9). Takes the real code out of each function file and checks: over the limit
// blocks, under it allows, a counter error or crash lets people through (fail open),
// the raw IP is never sent to the database, and all six copies are identical.
// Run: npm i esbuild   then   node supabase/tests/rate-limit-helper.test.mjs
import { transformSync } from "esbuild";
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };
const dir = new URL("../functions/", import.meta.url);
const names = ["submit-request", "submit-custom-form", "roadmap-vote", "respond-to-proposal", "client-portal-action", "marketplace-find-bookings-by-email"];

const extract = (src) => src.match(/async function isRateLimited\([\s\S]*?\n}\n/)[0];
const bodies = names.map((n) => extract(fs.readFileSync(new URL(n + "/index.ts", dir), "utf8")));
ok("all six copies of isRateLimited are identical", bodies.every((b) => b === bodies[0]));
ok("every function calls it", names.every((n) => /isRateLimited\(admin, request, "/.test(fs.readFileSync(new URL(n + "/index.ts", dir), "utf8"))));
ok("no function defines sha256Hex twice", names.every((n) => (fs.readFileSync(new URL(n + "/index.ts", dir), "utf8").match(/function sha256Hex/g) || []).length === 1));

const sha = `async function sha256Hex(text){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(buf)).map((b)=>b.toString(16).padStart(2,"0")).join("");}`;
const js = transformSync(sha + "\n" + bodies[0] + "\nexport { isRateLimited };", { loader: "ts", format: "esm" }).code;
const { isRateLimited } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const req = (h = {}) => new Request("https://x.test", { headers: h });
const mk = (answers) => { const calls = []; return { calls, rpc: async (fn, args) => { calls.push([fn, args]); const a = answers.shift(); if (a instanceof Error) throw a; return a; } }; };

let a = mk([{ data: false, error: null }]);
ok("blocks when the IP is over the limit", await isRateLimited(a, req({ "x-forwarded-for": "9.9.9.9" }), "f", { limit: 5, seconds: 60 }) === true);
ok("only one call needed when the IP is already over", a.calls.length === 1);

a = mk([{ data: true, error: null }, { data: false, error: null }]);
ok("blocks when the token is over its own limit", await isRateLimited(a, req(), "f", { limit: 5, seconds: 60 }, { value: "tok", limit: 3, seconds: 60 }) === true);

a = mk([{ data: true, error: null }, { data: true, error: null }]);
ok("allows when both are under", await isRateLimited(a, req(), "f", { limit: 5, seconds: 60 }, { value: "tok", limit: 3, seconds: 60 }) === false);

a = mk([{ data: null, error: { message: "db down" } }]);
ok("fails open on a counter error", await isRateLimited(a, req(), "f", { limit: 5, seconds: 60 }) === false);

a = mk([new Error("boom")]);
ok("fails open on a crash", await isRateLimited(a, req(), "f", { limit: 5, seconds: 60 }) === false);

a = mk([{ data: true, error: null }, { data: true, error: null }]);
await isRateLimited(a, req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "submit-request", { limit: 5, seconds: 60 }, { value: "secret-token", limit: 3, seconds: 60 });
const sent = JSON.stringify(a.calls);
ok("raw IP is never sent to the database", !sent.includes("203.0.113.7"));
ok("raw token is never sent to the database", !sent.includes("secret-token"));
ok("bucket names carry the function name", a.calls[0][1].p_bucket.startsWith("submit-request:ip:") && a.calls[1][1].p_bucket.startsWith("submit-request:key:"));

const same = async (ip) => { const x = mk([{ data: true, error: null }]); await isRateLimited(x, req({ "x-forwarded-for": ip }), "f", { limit: 5, seconds: 60 }); return x.calls[0][1].p_bucket; };
ok("same IP gives the same bucket, different IP a different one", (await same("1.1.1.1")) === (await same("1.1.1.1")) && (await same("1.1.1.1")) !== (await same("2.2.2.2")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
