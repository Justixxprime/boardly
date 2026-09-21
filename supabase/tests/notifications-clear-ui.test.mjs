// Runs js/notifications.js against the REAL dashboard.html markup in jsdom,
// with supabase stubbed. Checks delete-one, clear-all (with confirm), cancel,
// button visibility, and that errors are shown and not swallowed.
// Run:  npm i jsdom   then   node supabase/tests/notifications-clear-ui.test.mjs
import { JSDOM } from "jsdom";
import fs from "node:fs";
const repo = new URL("../../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };
const tick = () => new Promise((r) => setTimeout(r, 20));

async function setup({ confirmAnswer = true, deleteError = null } = {}) {
  const html = fs.readFileSync(repo + "dashboard.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.toastLog = []; w.calls = [];
  w.eval(`
    function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function toast(m,k){ toastLog.push([m,k]); }
    var showConfirmModal = async () => ${confirmAnswer};
    var rows = [
      { id: "n1", type: "info", title: "Proposal accepted", body: "Good news", link_url: "", read_at: null, created_at: "2026-09-21T10:00:00Z" },
      { id: "n2", type: "info", title: "New request", body: "sent", link_url: "", read_at: "2026-09-21T10:05:00Z", created_at: "2026-09-21T09:00:00Z" } ];
    var supabaseClient = {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (t) => ({
        select: () => ({ order: () => ({ limit: async () => ({ data: rows.slice(), error: null }) }) }),
        delete: () => ({
          eq: (col, val) => {
            const run = async () => { calls.push(["delete", col, val]);
              if (${JSON.stringify(deleteError)}) return { data: null, error: ${JSON.stringify(deleteError)} };
              rows = col === "id" ? rows.filter(r => r.id !== val) : [];
              return { data: [{ id: val }], error: null }; };
            const p = run();
            p.select = () => p;
            return p;
          } }),
        update: () => ({ eq: () => ({ is: async () => ({}) }) }),
      }),
    };
  `);
  w.eval(fs.readFileSync(repo + "js/notifications.js", "utf8"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  await tick();
  return w;
}

let w = await setup();
const $ = (id) => w.document.getElementById(id);
ok("two notifications listed", w.document.querySelectorAll("#notifications-list li").length === 2);
ok("each has a delete button", w.document.querySelectorAll("[data-delete-notification]").length === 2);
ok("Clear all visible when there are notifications", !$("notifications-clear-all-btn").classList.contains("hidden"));
ok("badge shows 1 unread", $("notifications-badge").textContent === "1");

w.document.querySelector('[data-delete-notification="n1"]').click(); await tick(); await tick();
ok("delete one calls delete by id", w.calls.some((c) => c[1] === "id" && c[2] === "n1"));
ok("one left after delete", w.document.querySelectorAll("#notifications-list li").length === 1);
ok("badge hidden when nothing unread", $("notifications-badge").classList.contains("hidden"));
ok("Mark all read hidden when nothing unread", $("notifications-mark-all-btn").classList.contains("hidden"));

$("notifications-clear-all-btn").click(); await tick(); await tick();
ok("clear all deletes by user id", w.calls.some((c) => c[1] === "user_id" && c[2] === "u1"));
ok("list empty after clear", w.document.querySelectorAll("#notifications-list li").length === 0);
ok("empty message shown", !$("notifications-empty").classList.contains("hidden"));
ok("Clear all hidden when empty", $("notifications-clear-all-btn").classList.contains("hidden"));
ok("cleared toast shown", w.toastLog.some((t) => /cleared/.test(t[0])));

// cancel keeps everything
w = await setup({ confirmAnswer: false });
w.document.getElementById("notifications-clear-all-btn").click(); await tick(); await tick();
ok("cancel makes no delete call", w.calls.length === 0);
ok("cancel keeps both", w.document.querySelectorAll("#notifications-list li").length === 2);

// a real error is shown
w = await setup({ deleteError: { message: "permission denied" } });
w.document.querySelector('[data-delete-notification="n1"]').click(); await tick(); await tick();
ok("delete error shown", w.toastLog.some((t) => t[1] === "error" && /permission denied/.test(t[0])));
ok("list unchanged on error", w.document.querySelectorAll("#notifications-list li").length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
