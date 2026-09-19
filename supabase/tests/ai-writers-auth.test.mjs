// Checks generate-proposal-draft and generate-cv-draft: no token or a bad token
// is refused before any AI call, a real signed-in user still works, and the
// hourly limit applies. Runs the REAL functions under Node with stubs.
// Run:  npm i esbuild   then   node supabase/tests/ai-writers-auth.test.mjs
import { transformSync } from "esbuild"; import fs from "node:fs";
let pass=0,fail=0; const ok=(n,c,e="")=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n+(c?"":" "+e));};
for (const [name, body] of [["generate-proposal-draft",{brief:"A website for a club"}],["generate-cv-draft",{background:"I was a teacher for 5 years"}]]) {
  const src=fs.readFileSync(`${new URL(`../functions/${name}/index.ts`, import.meta.url).pathname}`,"utf8").replace(/^import \{ createClient \} from .*$/m,"const createClient = globalThis.__cc;");
  const js=transformSync(src,{loader:"ts",format:"esm"}).code; let handler;
  let user={id:"u1"};
  globalThis.__cc=()=>({auth:{getUser:async()=>user?({data:{user},error:null}):({data:{user:null},error:{message:"x"}})}});
  globalThis.Deno={serve:(h)=>{handler=h;},env:{get:(k)=>({GROQ_API_KEY:"g",SUPABASE_URL:"x",SUPABASE_ANON_KEY:"a"})[k]}};
  let fetched=0; globalThis.fetch=async()=>{fetched++;return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"title":"T"}'}}]})};};
  await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
  const call=(h={authorization:"Bearer t"})=>handler(new Request("http://f",{method:"POST",headers:{"content-type":"application/json",...h},body:JSON.stringify(body)}));
  let r=await call({}); ok(`${name}: no token -> 401 and AI not called`, r.status===401&&fetched===0);
  user=null; r=await call(); ok(`${name}: invalid token -> 401 and AI not called`, r.status===401&&fetched===0); user={id:"u1"};
  r=await call(); ok(`${name}: signed-in user still works`, r.status===200&&fetched===1, String(r.status));
  let got=false; for(let i=0;i<40;i++){ if((await call()).status===429){got=true;break;} } ok(`${name}: hourly limit applies`, got);
  r=await handler(new Request("http://f",{method:"OPTIONS"})); ok(`${name}: CORS preflight unaffected`, r.status===200);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
