// Runs js/collaboration.js against the REAL dashboard.html markup in jsdom,
// with supabase stubbed. Checks the People list renders, Remove is owner only,
// cancel does nothing, confirm calls the remove_board_member function, and the
// fallback plain delete works when the function is missing.
// Run:  npm i jsdom   then   node supabase/tests/remove-member-ui.test.mjs
import { JSDOM } from "jsdom";
import fs from "node:fs";
const repo = new URL("../../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };
const tick = () => new Promise((r) => setTimeout(r, 20));

function setup({ isOwner = true, rpcError = null, confirmAnswer = true } = {}) {
  const html = fs.readFileSync(repo + "dashboard.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.toastLog = []; w.calls = []; w.logged = [];
  w.eval(`
    var state = { userId: "owner-1", currentBoardId: "b1", tasks: [
      { id: "t1", assigned_to: "u-amaka" }, { id: "t2", assigned_to: "owner-1" } ],
      boards: [{ id: "b1", user_id: ${JSON.stringify(isOwner ? "owner-1" : "someone-else")} }], boardMembers: [] };
    function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function toast(m,k){ toastLog.push([m,k]); }
    function logSecurityEvent(t,d){ logged.push(t); }
    function can(){ return true; }
    var showConfirmModal = async () => ${confirmAnswer};
    var renderCalls = 0; function renderBoard(){ renderCalls++; }
    var membersOnServer = [
      { id: "m1", board_id: "b1", invited_email: "amaka@x.com", user_id: "u-amaka", role: "editor", accepted_at: "2026-09-01" },
      { id: "m2", board_id: "b1", invited_email: "pending@x.com", user_id: null, role: "viewer", accepted_at: null } ];
    var supabaseClient = {
      rpc: async (name, args) => { calls.push(["rpc", name, args.p_member_id]);
        if (${JSON.stringify(rpcError)}) return { data: null, error: ${JSON.stringify(rpcError)} };
        membersOnServer = membersOnServer.filter(m => m.id !== args.p_member_id);
        return { data: { ok: true, unassigned_tasks: 1 }, error: null }; },
      from: (table) => ({
        select: () => ({ eq: async () => ({ data: membersOnServer.slice(), error: null }), limit: async () => ({ error: null }) }),
        delete: () => ({ eq: (c, id) => ({ select: async () => { calls.push(["delete", table, id]); membersOnServer = membersOnServer.filter(m => m.id !== id); return { data: [{ id }], error: null }; } }) }),
      }),
    };
  `);
  w.eval(fs.readFileSync(repo + "js/collaboration.js", "utf8"));
  w.eval(`state.collabReady = true;`);
  return w;
}

// 1. list renders, owner sees Remove on both rows
let w = setup();
await w.eval(`loadBoardMembers()`); await tick();
ok("people list is visible", !w.document.getElementById("invite-members-wrap").classList.contains("hidden"));
ok("both people listed", w.document.querySelectorAll("[data-member-row]").length === 2);
ok("pending label shown", w.document.getElementById("invite-members-list").textContent.includes("invite pending"));
ok("owner sees Remove buttons", w.document.querySelectorAll("[data-remove-member]").length === 2);

// 2. confirm -> rpc called, tasks unassigned, list refreshed
w.document.querySelector('[data-remove-member="m1"]').click(); await tick(); await tick();
ok("calls remove_board_member", w.calls.some((c) => c[0] === "rpc" && c[1] === "remove_board_member" && c[2] === "m1"));
ok("assigned task cleared locally", w.eval(`state.tasks.find(t=>t.id==="t1").assigned_to`) === null);
ok("owner's own task untouched", w.eval(`state.tasks.find(t=>t.id==="t2").assigned_to`) === "owner-1");
ok("list now has 1 person", w.document.querySelectorAll("[data-member-row]").length === 1);
ok("board re-rendered", w.eval(`renderCalls`) === 1);
ok("security event logged", w.logged.includes("member_removed"));

// 3. cancelling the confirm does nothing
w = setup({ confirmAnswer: false });
await w.eval(`loadBoardMembers()`); await tick();
w.document.querySelector('[data-remove-member="m2"]').click(); await tick();
ok("cancel makes no server call", w.calls.length === 0);
ok("cancel keeps the person", w.document.querySelectorAll("[data-member-row]").length === 2);

// 4. non-owner never sees Remove
w = setup({ isOwner: false });
await w.eval(`loadBoardMembers()`); await tick();
ok("non-owner sees no Remove buttons", w.document.querySelectorAll("[data-remove-member]").length === 0);
await w.eval(`removeBoardMember("m1")`);
ok("non-owner call is refused before the server", w.calls.length === 0);

// 5. function missing -> plain delete fallback
w = setup({ rpcError: { code: "PGRST202", message: "Could not find the function" } });
await w.eval(`loadBoardMembers()`); await tick();
w.document.querySelector('[data-remove-member="m2"]').click(); await tick(); await tick();
ok("falls back to plain delete", w.calls.some((c) => c[0] === "delete" && c[2] === "m2"));
ok("pending invite cancelled toast", w.toastLog.some((t) => /cancelled/.test(t[0])));

// 6. real error is shown, not swallowed
w = setup({ rpcError: { code: "42501", message: "Only the board owner can remove people" } });
await w.eval(`loadBoardMembers()`); await tick();
w.document.querySelector('[data-remove-member="m1"]').click(); await tick(); await tick();
ok("real error shown", w.toastLog.some((t) => t[1] === "error" && /owner/.test(t[0])));
ok("no fallback delete on a real error", !w.calls.some((c) => c[0] === "delete"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
