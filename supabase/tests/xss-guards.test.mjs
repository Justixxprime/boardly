// Static guards for finding F10. Reads the real js/ and html files and fails if:
//  1. any escape helper returns div.innerHTML without also escaping quotes
//  2. a link or image address is put in href or src straight from a variable
//     that holds something a person typed (must go through safeUrl)
//  3. safeUrl lets a dangerous link through
// Run: node supabase/tests/xss-guards.test.mjs
import fs from "node:fs";
import path from "node:path";
const repo = new URL("../../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + e)); };

const files = [
  ...fs.readdirSync(repo + "js").filter((f) => f.endsWith(".js")).map((f) => "js/" + f),
  ...fs.readdirSync(repo).filter((f) => f.endsWith(".html")),
];

// 1. escape helpers
let helpers = 0, badHelpers = [];
for (const f of files) {
  const src = fs.readFileSync(repo + f, "utf8");
  for (const m of src.matchAll(/return div\.innerHTML(.*)$/gm)) {
    helpers++;
    if (!/replace\(\/"\/g, "&quot;"\)/.test(m[1]) || !/&#39;/.test(m[1])) badHelpers.push(f);
  }
}
ok(`found the escape helpers (${helpers})`, helpers >= 17);
ok("every escape helper also escapes quotes", badHelpers.length === 0, badHelpers.join(", "));

// 2. raw user links in href or src
const USER_LINK = /(attachment\.url|a\.url|attachmentUrl|coverUrl|published_url|git_pr_url|stagingUrl|meetingLink|portfolio_url)/;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(repo + f, "utf8");
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/(href|src)=\\?"\$\{([^}]*)\}\\?"/g)) {
      const expr = m[2];
      // any interpolation straight into href or src must be safeUrl, or one of the few internal links
      const internal = /^(l\.href|item\.href|src|href)$/.test(expr.trim());
      if (!/safeUrl\(/.test(expr) && !internal) bad.push(`${f}:${i + 1} ${expr}`);
    }
  });
}
ok("no raw user link inside href or src", bad.length === 0, bad.join(" | "));

// 3. safeUrl behaviour, taken from the real file
const sc = fs.readFileSync(repo + "js/supabase-client.js", "utf8");
const fn = sc.match(/function safeUrl[\s\S]*?\n}\n/)[0] + sc.match(/function isSafeNavUrl[\s\S]*?\n}\n/)[0];
const { safeUrl, isSafeNavUrl } = new Function(fn + "; return { safeUrl, isSafeNavUrl };")();
const blocked = ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "\u0001javascript:1"];
ok("safeUrl blocks dangerous schemes", blocked.every((u) => safeUrl(u) === ""), blocked.map((u) => JSON.stringify(safeUrl(u))).join(","));
ok("safeUrl keeps normal links", safeUrl("https://a.com/x.png?a=1&b=2") === "https://a.com/x.png?a=1&amp;b=2" && safeUrl("mailto:a@b.com") === "mailto:a@b.com" && safeUrl("dashboard.html?open=1") === "dashboard.html?open=1");
ok("safeUrl cannot be broken out of an attribute", !/["'<>]/.test(safeUrl('https://x.com/" onmouseover="alert(1)')));
ok("isSafeNavUrl", !isSafeNavUrl("javascript:1") && !isSafeNavUrl("data:x") && isSafeNavUrl("https://a.com") && isSafeNavUrl("home.html"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
