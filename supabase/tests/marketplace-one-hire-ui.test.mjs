// Checks the job page for "one hire per job" (schema_v86) in a simulated page.
// It is NOT a real browser and does not touch the real database: the database
// rules are copied into a tiny in-memory stand-in below.
// Run:  node supabase/tests/marketplace-one-hire-ui.test.mjs
import { JSDOM } from "jsdom";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../marketplace.html", import.meta.url), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const src = fs.readFileSync(new URL("../../js/marketplace-public.js", import.meta.url), "utf8");

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => { if (cond) { passed++; console.log("PASS " + name); } else { failed++; console.log("FAIL " + name + " " + extra); } };

function makeWorld(viewer) {
  const db = {
    marketplace_opportunities: [{ id: "job1", user_id: "poster", title: "Logo", description: "d", status: "open", currency: "NGN", created_at: "2026-09-01" }],
    marketplace_applications: [
      { id: "a1", opportunity_id: "job1", applicant_user_id: "u1", message: "m", proposed_price: 1000, status: "submitted", created_at: "2026-09-02" },
      { id: "a2", opportunity_id: "job1", applicant_user_id: "u2", message: "m", proposed_price: 2000, status: "submitted", created_at: "2026-09-03" },
      { id: "a3", opportunity_id: "job1", applicant_user_id: "u3", message: "m", proposed_price: 3000, status: "submitted", created_at: "2026-09-04" },
    ],
    marketplace_profiles: [],
  };
  const from = (table) => {
    const q = { filters: [], op: "select", patch: null };
    const rows = () => db[table].filter((r) => q.filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(k, v) { q.filters.push([k, v]); return b; }, in(k, v) { q.filters.push([k, v]); return b; },
      update(patch) { q.op = "update"; q.patch = patch; return b; },
      maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
      then(res, rej) {
        if (q.op === "update") {
          const hit = rows();
          hit.forEach((r) => {
            Object.assign(r, q.patch);
            // the database rule from schema_v86
            if (table === "marketplace_applications" && q.patch.status === "accepted") {
              db.marketplace_opportunities.find((j) => j.id === r.opportunity_id).status = "closed";
              db.marketplace_applications.filter((o) => o.opportunity_id === r.opportunity_id && o.id !== r.id && o.status === "submitted").forEach((o) => { o.status = "declined"; });
            }
          });
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res, rej);
        }
        return Promise.resolve({ data: rows(), error: null }).then(res, rej);
      },
    };
    return b;
  };
  const dom = new JSDOM(html, { url: "https://example.test/marketplace.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const confirms = [];
  w.confirm = (m) => { confirms.push(m); return true; };
  w.alert = (m) => { throw new Error("unexpected alert: " + m); };
  w.toast = () => {};
  w.SUPABASE_URL = "https://x.supabase.co";
  w.supabaseClient = { from, auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }), getSession: async () => ({ data: { session: null } }) } };
  w.eval(src);
  return { w, db, confirms };
}
const tick = () => new Promise((r) => setTimeout(r, 30));
const hidden = (w, id) => w.document.getElementById(id).classList.contains("hidden");

// 1. poster, open job with 3 waiting applications
{
  const { w, db, confirms } = makeWorld("poster");
  await w.eval("mktOpenJob('job1')"); await tick();
  ok("open job: Close button shown, hired note hidden", !hidden(w, "mkt-job-owner-actions") && hidden(w, "mkt-job-hired-note") && !hidden(w, "mkt-job-toggle-btn"));
  w.document.querySelector('[data-respond-application="a2"][data-status="accepted"]').click(); await tick(); await tick();
  ok("accept dialog says it closes the job and names the 2 others", confirms.length === 1 && /closes the job/.test(confirms[0]) && /declines the 2 other waiting applications/.test(confirms[0]), confirms[0]);
  ok("after accept: job is closed, a2 accepted, others declined", db.marketplace_opportunities[0].status === "closed" && db.marketplace_applications.map((a) => a.status).join() === "declined,accepted,declined");
  ok("after accept: page reloaded, Reopen hidden and hired note shown", hidden(w, "mkt-job-toggle-btn") && !hidden(w, "mkt-job-hired-note"));
  ok("after accept: no Accept or Decline buttons left", !w.document.querySelector("[data-respond-application]"));
}

// 2. single application: dialog does not mention "other" applications
{
  const { w, db, confirms } = makeWorld("poster");
  db.marketplace_applications.splice(1);
  await w.eval("mktOpenJob('job1')"); await tick();
  w.document.querySelector('[data-respond-application="a1"][data-status="accepted"]').click(); await tick(); await tick();
  ok("single application: dialog says it closes the job, no 'other' count", /closes the job/.test(confirms[0]) && !/other waiting/.test(confirms[0]), confirms[0]);
}

// 3. poster, job with nobody hired and closed by hand: Reopen still there
{
  const { w, db } = makeWorld("poster");
  db.marketplace_opportunities[0].status = "closed";
  await w.eval("mktOpenJob('job1')"); await tick();
  ok("closed by hand, nobody hired: Reopen job button shown", !hidden(w, "mkt-job-toggle-btn") && hidden(w, "mkt-job-hired-note") && w.document.getElementById("mkt-job-toggle-btn").textContent === "Reopen job");
}

// 4. applicant whose application was declined sees the new wording
{
  const { w, db } = makeWorld("u1");
  db.marketplace_applications[0].status = "declined"; db.marketplace_opportunities[0].status = "closed";
  await w.eval("mktOpenJob('job1')"); await tick();
  const t = w.document.getElementById("mkt-my-application-status").textContent;
  ok("declined applicant sees 'not chosen' wording", /not chosen/.test(t) && /hired someone else/.test(t), t);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
