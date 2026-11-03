import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
const base="https://websites.article6.org";
const env={CRM_INGEST_URL:"https://www.article6.org/api/partner/web-referral",CRM_INGEST_TOKEN:"test-secret",ASSETS:{fetch:()=>new Response("asset")}};
const request=(path,options={})=>new Request(base+path,options);
test("partner history requires a session",async()=>{
 const r=await worker.fetch(request("/api/referral/mine"),env);
 assert.equal(r.status,401);
});
test("partner history proxies signed session only",async()=>{
 const previous=globalThis.fetch;let payload;
 globalThis.fetch=async(_url,options)=>{
  payload=JSON.parse(options.body);
  return new Response(JSON.stringify({ok:true,referrals:[{company:"Test Co",status:"ENGAGED",service:"WEBSITE_DESIGN",createdAt:"2026-11-03T00:00:00Z"}]}),{status:200,headers:{"content-type":"application/json"}});
 };
 try{
  const r=await worker.fetch(request("/api/referral/mine?page=2&pageSize=8&search=Test&status=ENGAGED",{headers:{cookie:"referral_session=opaque.signed"}}),env);
  assert.equal(r.status,200);assert.deepEqual(payload,{action:"my_referrals_page",session:"opaque.signed",page:2,pageSize:8,search:"Test",status:"ENGAGED"});
  assert.equal((await r.json()).referrals.length,1);
 }finally{globalThis.fetch=previous;}
});
test("disabled agent cannot read history",async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:"Session disabled"}),{status:401,headers:{"content-type":"application/json"}});
 try{
  const r=await worker.fetch(request("/api/referral/mine",{headers:{cookie:"referral_session=disabled.session"}}),env);
  assert.equal(r.status,401);
  assert.ok(!JSON.stringify(await r.json()).includes("Test Co"));
 }finally{globalThis.fetch=previous;}
});

test("reject invalid pagination inputs",async()=>{
 const r=await worker.fetch(request("/api/referral/mine?page=-1",{headers:{cookie:"referral_session=opaque.signed"}}),env);
 assert.equal(r.status,400);
});
