// Checks marketplace-find-bookings-by-email: it must never return tokens or
// booking data, must email links on a fixed site base, escape HTML, escape SQL
// LIKE wildcards, rate limit per address, and fail honestly. Real function,
// stubbed Deno, Supabase and Brevo.
// Run:  npm i esbuild   then   node supabase/tests/find-bookings-by-email.test.mjs
import { transformSync } from "esbuild"; import fs from "node:fs";
const src=fs.readFileSync(new URL("../functions/marketplace-find-bookings-by-email/index.ts", import.meta.url),"utf8").replace(/^import \{ createClient \} from .*$/m,"const createClient = globalThis.__cc;");
const js=transformSync(src,{loader:"ts",format:"esm"}).code; let handler;
let rows=[{id:"b1",description:"Logo <script>x</script>",amount:5000,currency:"NGN",status:"paid_held",created_at:"2026-09-01T10:00:00Z",access_token:"tok-1"}];
let lastIlike=null;
globalThis.__cc=()=>({from:()=>({select:()=>({ilike:(c,v)=>{lastIlike=v;return {order:()=>({limit:async()=>({data:rows,error:null})})};}})})});
let env={BREVO_API_KEY:"k",BREVO_SENDER_EMAIL:"hi@boardly.app",SUPABASE_URL:"x",SUPABASE_SERVICE_ROLE_KEY:"y"};
globalThis.Deno={serve:(h)=>{handler=h;},env:{get:(k)=>env[k]}};
let mails=[]; let brevoOk=true;
globalThis.fetch=async(url,opts)=>{mails.push({url,body:JSON.parse(opts.body)});return {ok:brevoOk,status:brevoOk?201:500,json:async()=>({})};};
await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const call=(email,method="POST")=>handler(new Request("http://f",{method,headers:{"content-type":"application/json"},body:method==="POST"?JSON.stringify({email}):undefined}));
let pass=0,fail=0; const ok=(n,c,e="")=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n+(c?"":" "+e));};

let r=await call("client@x.com"); let j=await r.json(); let raw=JSON.stringify(j);
ok("response never contains a token or booking data", r.status===200 && j.ok && !raw.includes("tok-1") && !raw.includes("b1") && !("bookings" in j), raw);
ok("one email sent to the typed address via Brevo", mails.length===1 && mails[0].url.includes("brevo") && mails[0].body.to[0].email==="client@x.com");
const html=mails[0].body.htmlContent;
ok("email has the booking link on the FIXED site base", html.includes("https://justixxprime.github.io/boardly/booking-status.html?id=b1&amp;token=tok-1"), html);
ok("description is HTML-escaped in the email", !html.includes("<script>") && html.includes("&lt;script&gt;"));
await call("a_b%@x.com"); ok("LIKE wildcards in the email are escaped before the query", lastIlike==="a\\_b\\%@x.com", lastIlike);
rows=[]; mails=[]; r=await call("nobody@x.com"); j=await r.json();
ok("no bookings: identical neutral reply, no email sent", r.status===200 && j.ok && mails.length===0 && j.message.startsWith("If there are bookings"));
rows=[{id:"b1",description:"d",amount:1,currency:"NGN",status:"paid_held",created_at:"2026-09-01T10:00:00Z",access_token:"tok-1"}]; mails=[];
for(let i=0;i<5;i++) await call("flood@x.com");
ok("rate limit: max 3 emails per address per hour, replies stay neutral", mails.length===3);
r=await call("not-an-email"); ok("invalid email -> 400", r.status===400);
r=await call("x",'GET'); ok("GET -> 405", r.status===405);
brevoOk=false; r=await call("fail@x.com"); ok("Brevo failure -> honest 502, not a fake success", r.status===502); brevoOk=true;
env={...env,BREVO_API_KEY:undefined}; r=await call("cfg@x.com"); ok("Brevo not configured -> honest 500", r.status===500);
env.SITE_URL="https://example.org/app/"; env.BREVO_API_KEY="k"; mails=[]; await call("site@x.com");
ok("SITE_URL secret overrides the base, trailing slash trimmed", mails[0]?.body.htmlContent.includes("https://example.org/app/booking-status.html?id=b1"));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
