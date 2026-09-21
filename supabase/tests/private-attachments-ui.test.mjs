// Checks the private attachments code (signed links) in js/dashboard.js and js/proofing.js
// with Supabase stubbed. No browser and no network needed, only Node.
// Run:  node supabase/tests/private-attachments-ui.test.mjs
import fs from "node:fs";
import vm from "node:vm";
const repo = new URL("../../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };

const dash = fs.readFileSync(repo + "js/dashboard.js", "utf8");
const proof = fs.readFileSync(repo + "js/proofing.js", "utf8");
const slice = (from, to) => {
  const a = dash.indexOf(from), b = dash.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error("marker not found: " + from + " / " + to);
  return dash.slice(a, b);
};
const helpers = slice("function isImageUrl(url) {", "function attachmentVisual(url)");
const listAndSigning = slice("function taskAttachmentList(task) {", "// 5b3. DEV FEATURES");
const uploads = slice("const ATTACHMENT_MAX_BYTES", "// Uploads several files one after another");

const SB = "https://cafhqxzjujvxmarvkbxd.supabase.co";
const pub = (path) => `${SB}/storage/v1/object/public/task-attachments/${encodeURI(path)}`;

function makeCtx({ signFails = false } = {}) {
  const log = { signCalls: [], updates: [], uploads: [], events: [], toasts: [], publicUrlCalls: 0, proofQueries: [] };
  const ctx = vm.createContext({
    console, Date, Set, Map, Promise, URL, encodeURI, decodeURIComponent, String, Array, Object, JSON,
    setInterval: () => 0, window: {},
    document: { addEventListener() {}, visibilityState: "visible", getElementById: () => null },
    state: { userId: "user-1", tasks: [], loaded: true, attachmentsReady: true, editingId: null, proofingCounts: {}, proofingReady: true },
    toast: (m, k) => log.toasts.push([m, k]),
    renderBoard: () => log.events.push("render"),
    renderAttachmentList: () => log.events.push("renderList"),
    escapeHTML: (s) => String(s),
    log,
    supabaseClient: {
      storage: { from: () => ({
        upload: async (path, file) => { log.uploads.push(path); return { error: null }; },
        getPublicUrl: () => { log.publicUrlCalls++; return { data: { publicUrl: "x" } }; },
        createSignedUrls: async (paths, expires) => {
          log.signCalls.push({ paths: [...paths], expires }); log.events.push("sign");
          if (signFails) return { data: null, error: { message: "boom" } };
          return { data: paths.map((p) => ({ error: null, path: p, signedUrl: `${SB}/storage/v1/object/sign/task-attachments/${encodeURI(p)}?token=T${log.signCalls.length}` })), error: null };
        },
      }) },
      from: (table) => ({
        update: (payload) => ({ eq: async (col, id) => { log.updates.push({ table, payload, col, id }); return { error: null }; } }),
        select: () => { const q = { _f: [], eq(c, v) { this._f.push(["eq", c, v]); return this; }, in(c, v) { this._f.push(["in", c, v]); return this; },
          order() { return this; },
          then(res) { log.proofQueries.push(this._f); res({ data: [], error: null }); } }; return q; },
        insert: (row) => ({ select: () => ({ single: async () => { log.proofQueries.push(["insert", row]); return { data: { id: "p1", ...row }, error: null }; } }) }),
      }),
    },
  });
  vm.runInContext(helpers, ctx);
  vm.runInContext(listAndSigning, ctx);
  vm.runInContext(uploads, ctx);
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

// ---- 1. reading the path out of links ----
{
  const c = makeCtx();
  const p1 = "u1/t1-1788533317347-Codex Image Sep 4, 2026, 03_38_00 PM.png";
  ok("old public link with spaces and commas decodes to the real path", run(c, `attachmentPathFromUrl(${JSON.stringify(pub(p1))})`) === p1);
  ok("signed link decodes to the same path", run(c, `attachmentPathFromUrl(${JSON.stringify(SB + "/storage/v1/object/sign/task-attachments/" + encodeURI(p1) + "?token=abc")})`) === p1);
  ok("plain pasted link has no path", run(c, `attachmentPathFromUrl("https://www.canva.com/design/x")`) === null);
  ok("attachmentKey prefers the path, falls back to the link", run(c, `attachmentKey({path:"a/b.png",url:"u"})`) === "a/b.png" && run(c, `attachmentKey({url:"https://x.y/z"})`) === "https://x.y/z");
}

// ---- 2. batch signing: ONE call for the whole board, old + new shapes ----
{
  const c = makeCtx();
  run(c, `state.tasks = [
    { id: "t1", attachments: [{ url: ${JSON.stringify(pub("u1/t1-1-a.png"))}, name: "a.png" }, { url: "https://www.canva.com/design/x", name: "canva" }] },
    { id: "t2", attachments: [{ path: "u2/t2-2-b.pdf", name: "b.pdf" }, { url: ${JSON.stringify(pub("u1/t1-1-a.png"))}, name: "dup" }] },
    { id: "t3", attachments: [] },
    { id: "t4", attachment_url: ${JSON.stringify(pub("u4/t4-4-legacy.png"))}, attachment_name: "legacy.png" },
  ];`);
  const changed = await run(c, `signTaskAttachmentUrls(state.tasks)`);
  ok("first pass makes links", changed === true);
  ok("exactly ONE createSignedUrls call for the whole board", c.log.signCalls.length === 1, JSON.stringify(c.log.signCalls));
  ok("paths in that call are unique and complete", JSON.stringify(c.log.signCalls[0].paths.sort()) === JSON.stringify(["u1/t1-1-a.png", "u2/t2-2-b.pdf", "u4/t4-4-legacy.png"]), JSON.stringify(c.log.signCalls[0].paths));
  ok("links live 6 hours", c.log.signCalls[0].expires === 21600);
  const t1 = run(c, `state.tasks[0].attachments`);
  ok("old public-url attachment got its path from the url", t1[0].path === "u1/t1-1-a.png");
  ok("old public-url attachment now holds a SIGNED link", /\/object\/sign\/task-attachments\/.*\?token=/.test(t1[0].url));
  ok("plain pasted link is untouched, no path", t1[1].path === undefined && t1[1].url === "https://www.canva.com/design/x");
  ok("new-style attachment (path only) got a link", /\/object\/sign\//.test(run(c, `state.tasks[1].attachments[0].url`)));
  ok("legacy single-column task resolves to the signed link", /\/object\/sign\//.test(run(c, `taskAttachmentList(state.tasks[3])[0].url`)) && run(c, `taskAttachmentList(state.tasks[3])[0].path`) === "u4/t4-4-legacy.png");
  const again = await run(c, `signTaskAttachmentUrls(state.tasks)`);
  ok("second pass uses the cache, no network", again === false && c.log.signCalls.length === 1);
  const one = await run(c, `signTaskAttachmentUrls([state.tasks[0]])`);
  ok("per-task refresh (edit modal) is free when links are fresh", one === false && c.log.signCalls.length === 1);
  // near expiry -> new call
  run(c, `for (const v of attachmentSignCache.values()) v.expiresAt = Date.now() + 60 * 1000;`);
  const renewed = await run(c, `signTaskAttachmentUrls([state.tasks[0]])`);
  ok("a link close to expiring is renewed", renewed === true && c.log.signCalls.length === 2 && c.log.signCalls[1].paths.length === 1);
}

// ---- 3. signing failure does not loop and does not wipe links ----
{
  const c = makeCtx({ signFails: true });
  run(c, `state.tasks = [{ id: "t1", attachments: [{ path: "u1/t1-1-a.png", name: "a.png", url: "OLD" }] }];`);
  await run(c, `signTaskAttachmentUrls(state.tasks)`);
  ok("failed signing keeps whatever url was there", run(c, `state.tasks[0].attachments[0].url`) === "OLD");
  const before = c.log.signCalls.length;
  const again = await run(c, `signTaskAttachmentUrls(state.tasks)`);
  ok("a failure is not retried in a tight loop", again === false && c.log.signCalls.length === before);
}

// ---- 4. realtime: an incoming row is comparable with the copy we hold ----
{
  const c = makeCtx();
  run(c, `state.tasks = [{ id: "t1", attachments: [{ path: "u1/t1-1-a.png", name: "a.png" }] }];`);
  await run(c, `signTaskAttachmentUrls(state.tasks)`);
  const incoming = run(c, `(() => { const row = { id: "t1", attachments: [{ path: "u1/t1-1-a.png", name: "a.png" }] }; hydrateTaskAttachments(row); return row; })()`);
  ok("hydrated incoming row equals the held row when nothing changed (no pointless re-render)", JSON.stringify(incoming) === run(c, `JSON.stringify(state.tasks[0])`));
}

// ---- 5. saving: database never gets a signed link ----
{
  const c = makeCtx();
  run(c, `state.tasks = [{ id: "t1", attachments: [] }];`);
  const err = await run(c, `persistAttachmentList("t1", [
    { path: "u1/t1-1-a.png", name: "a.png", url: "${SB}/storage/v1/object/sign/task-attachments/u1/t1-1-a.png?token=SECRET",
      versions: [{ path: "u1/t1-0-old.png", url: "https://old-public-link", name: "old.png", replacedAt: "2026-09-21" }] },
    { url: "https://www.canva.com/design/x", name: "canva" } ])`);
  const u = c.log.updates[0];
  const dbText = JSON.stringify(u.payload);
  ok("no error", !err);
  ok("no signed token reaches the database", !dbText.includes("SECRET") && !dbText.includes("token="), dbText);
  ok("storage file saved as path + name", u.payload.attachments[0].path === "u1/t1-1-a.png" && u.payload.attachments[0].url === undefined);
  ok("old versions saved by path too", u.payload.attachments[0].versions[0].path === "u1/t1-0-old.png" && u.payload.attachments[0].versions[0].url === undefined);
  ok("plain pasted link keeps its url", u.payload.attachments[1].url === "https://www.canva.com/design/x");
  ok("legacy column holds the plain link when it is last", u.payload.attachment_url === "https://www.canva.com/design/x");
  ok("the on-screen task still has a working signed link", /\?token=/.test(run(c, `state.tasks[0].attachments[0].url`)));

  run(c, `state.tasks = [{ id: "t2", attachments: [] }];`);
  await run(c, `persistAttachmentList("t2", [{ path: "u1/t2-1-z.png", name: "z.png" }])`);
  ok("legacy column is empty when the last attachment is a storage file", c.log.updates[1].payload.attachment_url === null);
  ok("links are made BEFORE the board is redrawn", c.log.events.indexOf("sign") !== -1 && c.log.events.indexOf("sign") < c.log.events.indexOf("render"), c.log.events.join(","));
}

// ---- 6. uploading ----
{
  const c = makeCtx();
  run(c, `state.tasks = [{ id: "11111111-2222-3333-4444-555555555555", attachments: [] }];`);
  const file = { name: "logo v2.png", size: 1000 };
  await run(c, `uploadAttachment("11111111-2222-3333-4444-555555555555", ${JSON.stringify(file)})`);
  ok("upload path is <user>/<task>-<time>-<name>", /^user-1\/11111111-2222-3333-4444-555555555555-\d+-logo v2\.png$/.test(c.log.uploads[0]), c.log.uploads[0]);
  ok("getPublicUrl is never used", c.log.publicUrlCalls === 0);
  const saved = c.log.updates[0].payload.attachments[0];
  ok("saved attachment has the path and no link", saved.path === c.log.uploads[0] && saved.url === undefined && saved.name === "logo v2.png");
  ok("the new file shows up with a signed link on screen", /\/object\/sign\//.test(run(c, `state.tasks[0].attachments[0].url`)));

  const c2 = makeCtx();
  await run(c2, `uploadAttachment("temp-123", ${JSON.stringify(file)})`);
  ok("a task that is still saving (temp id) refuses uploads politely", c2.log.uploads.length === 0 && c2.log.toasts.length === 1);
}

// ---- 7. replacing a file and restoring an old version ----
{
  const c = makeCtx();
  const tid = "11111111-2222-3333-4444-555555555555";
  run(c, `state.tasks = [{ id: "${tid}", attachments: [{ url: ${JSON.stringify(pub(`user-1/${tid}-1-first.png`))}, name: "first.png" }] }];`);
  await run(c, `signTaskAttachmentUrls(state.tasks)`);
  await run(c, `replaceAttachment("${tid}", 0, { name: "second.png", size: 10 })`);
  const rep = c.log.updates.at(-1).payload.attachments[0];
  ok("replaced: new file saved by path", /^user-1\/.*-second\.png$/.test(rep.path) && rep.url === undefined);
  ok("replaced: old file kept as a version by path", rep.versions[0].path === `user-1/${tid}-1-first.png` && rep.versions[0].url === undefined);
  await run(c, `restoreAttachmentVersion("${tid}", 0, 0)`);
  const res = c.log.updates.at(-1).payload.attachments[0];
  ok("restored: the old file is current again, by path", res.path === `user-1/${tid}-1-first.png` && res.url === undefined);
  ok("restored: the file we moved away from is now a version", res.versions[0].path === rep.path);
  ok("restored file has a working link on screen", /\/object\/sign\//.test(run(c, `state.tasks[0].attachments[0].url`)));
}

// ---- 8. proofing matches on path ----
{
  const c = makeCtx();
  vm.runInContext(proof, c);
  run(c, `state.proofingReady = true;`); // proofing.js starts it false until its own check runs
  await run(c, `loadProofComments("https://signed?token=1", "u1/t1-1-a.png")`);
  ok("pins for a storage file are looked up by PATH", JSON.stringify(c.log.proofQueries.at(-1)) === JSON.stringify([["eq", "attachment_path", "u1/t1-1-a.png"]]), JSON.stringify(c.log.proofQueries.at(-1)));
  await run(c, `loadProofComments("https://www.canva.com/x.png", null)`);
  ok("pins for a plain pasted link are looked up by LINK", JSON.stringify(c.log.proofQueries.at(-1)) === JSON.stringify([["eq", "attachment_url", "https://www.canva.com/x.png"]]));
  run(c, `state.proofingContext = { task: { id: "t1", board_id: "b1" }, attachmentUrl: "https://signed?token=1", attachmentPath: "u1/t1-1-a.png" };
          renderProofingPins = () => {}; renderProofingCommentsList = () => {};`);
  await run(c, `createProofPin(10, 20, "too big")`);
  const ins = c.log.proofQueries.filter((q) => q[0] === "insert").at(-1)[1];
  ok("a new pin on a storage file saves the path and NOT the short-lived link", ins.attachment_path === "u1/t1-1-a.png" && ins.attachment_url === null, JSON.stringify(ins));
  run(c, `state.proofingContext = { task: { id: "t1", board_id: "b1" }, attachmentUrl: "https://www.canva.com/x.png", attachmentPath: null };`);
  await run(c, `createProofPin(1, 2, "plain")`);
  const ins2 = c.log.proofQueries.filter((q) => q[0] === "insert").at(-1)[1];
  ok("a new pin on a plain link saves the link", ins2.attachment_url === "https://www.canva.com/x.png" && ins2.attachment_path === null);
  c.log.proofQueries.length = 0;
  run(c, `state.tasks = [{ id: "t1", attachments: [{ path: "u1/t1-1-a.png", name: "a.png", url: "${SB}/x/a.png?token=1" }, { url: "https://www.canva.com/x.png", name: "c" }] }];`);
  await run(c, `refreshProofingCounts(state.tasks[0])`);
  const kinds = c.log.proofQueries.map((q) => q.map((f) => f[1]).join("/"));
  ok("badge counts ask by path for files and by link for plain links", kinds.some((k) => k.includes("attachment_path")) && kinds.some((k) => k.includes("attachment_url")), JSON.stringify(kinds));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
