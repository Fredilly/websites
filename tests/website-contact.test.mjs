import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {readFileSync} from "node:fs";

const origin="https://websites.article6.org";
const env={
 CRM_INGEST_URL:"https://www.article6.org/api/partner/web-referral",
 CRM_INGEST_TOKEN:"test-server-secret",
 ASSETS:{fetch:()=>new Response("static")}
};
const payload={name:"Alex",email:"alex@example.test",company:"Example Co",website:"https://example.test/",service:"NEW_WEBSITE",message:"We need a new website."};
const req=(body,headers={})=>new Request(origin+"/api/contact",{method:"POST",headers:{origin,"content-type":"application/json",...headers},body:JSON.stringify(body)});
test("form is secure same-origin POST and never invokes mailto",()=>{
 const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
 assert.match(html,/id="intake" action="\/api\/contact" method="post"/);
 assert.doesNotMatch(html,/action="mailto:/i);
 assert.match(html,/fetch\('\/api\/contact'/);
});
test("reject invalid public submissions and cross-origin requests",async()=>{
 const mismatch=await worker.fetch(req(payload,{origin:"https://other.example"}),env);
 assert.equal(mismatch.status,403);
 const missing=await worker.fetch(req({...payload,email:"bad"}),env);
 assert.equal(missing.status,400);
 const bot=await worker.fetch(req({...payload,companyWebsite:"I am a bot"}),env);
 assert.equal(bot.status,400);
});
test("public enquiry is sent only to dedicated authenticated CRM endpoint",async()=>{
 const previous=globalThis.fetch;
 let called;
 globalThis.fetch=async(url,options)=>{
  called={url:String(url),headers:options.headers,data:JSON.parse(options.body)};
  return new Response(JSON.stringify({ok:true}),{status:201,headers:{"content-type":"application/json"}});
 };
 try{
  const response=await worker.fetch(req(payload),env);
  assert.equal(response.status,201);
  assert.equal(called.url,"https://www.article6.org/api/partner/website-contact");
  assert.equal(called.headers.authorization,"Bearer test-server-secret");
  assert.equal(called.data.company,"Example Co");
  assert.equal("agentSession" in called.data,false);
 }finally{globalThis.fetch=previous;}
});
test("CRM failure must not acknowledge a saved enquiry",async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:"failed"}),{status:500});
 try{const response=await worker.fetch(req(payload),env);assert.equal(response.status,502)}
 finally{globalThis.fetch=previous}
});
