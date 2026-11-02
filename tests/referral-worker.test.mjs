import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const base="https://websites.article6.org";
const env={CRM_INGEST_URL:"https://article6.org/api/partner/web-referral",CRM_INGEST_TOKEN:"private-token",ASSETS:{fetch:()=>new Response("asset")}};
const request=(path,init={})=>new Request(base+path,init);

test("no session cannot submit or change password", async()=>{
  const response=await worker.fetch(request("/api/referral",{method:"POST",headers:{origin:base,"content-type":"application/json"},body:"{}"}),env);
  assert.equal(response.status,401);
  const change=await worker.fetch(request("/api/referral/change-password",{method:"POST",headers:{origin:base,"content-type":"application/json"},body:"{}"}),env);
  assert.equal(change.status,401);
});
test("login cannot be attempted cross-origin",async()=>{
  const result=await worker.fetch(request("/api/referral/login",{method:"POST",headers:{origin:"https://example.com","content-type":"application/json"},body:JSON.stringify({username:"claudia",password:"pass"})}),env);
  assert.equal(result.status,403);
});
test("login creates HttpOnly session only after CRM validates credentials",async()=>{
  const original=globalThis.fetch;
  const sent=[];
  globalThis.fetch=async (url,options)=>{
    sent.push({url:String(url),body:JSON.parse(options.body)});
    return new Response(JSON.stringify({session:"opaque.signed",agent:{id:"agent1",username:"claudia"}}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await worker.fetch(request("/api/referral/login",{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify({username:"claudia",password:"pass"})}),env);
    assert.equal(result.status,200);
    const cookie=result.headers.get("set-cookie")||"";
    assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
    assert.equal(sent[0].body.action,"login");
    assert.equal(sent[0].url,"https://article6.org/api/partner/referral-auth");
    assert.ok(!(await result.text()).includes("opaque.signed"));
  }finally{globalThis.fetch=original;}
});
test("submission sends signed session to CRM; no partner name supplied by browser",async()=>{
  const original=globalThis.fetch;
  let sent;
  globalThis.fetch=async (url,options)=>{
    sent=JSON.parse(options.body);
    return new Response(JSON.stringify({ok:true}),{status:201,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await worker.fetch(request("/api/referral",{method:"POST",headers:{origin:base,cookie:"referral_session=opaque.signed","content-type":"application/json"},body:JSON.stringify({name:"Buyer",company:"Business",whatsapp:"+971123",service:"WEBSITE_DESIGN",interest:"INTERESTED",agentId:"spoofed"})}),env);
    assert.equal(result.status,201);
    assert.equal(sent.agentSession,"opaque.signed");
    assert.equal("agentId" in sent,false);
    assert.equal(sent.company,"Business");
  }finally{globalThis.fetch=original;}
});
test("CRM rejects disabled agent even if cookie exists",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:"Session expired"}),{status:401,headers:{"content-type":"application/json"}});
  try{
    const result=await worker.fetch(request("/api/referral",{method:"POST",headers:{origin:base,cookie:"referral_session=stale","content-type":"application/json"},body:JSON.stringify({company:"Business",name:"Buyer",whatsapp:"123"})}),env);
    assert.equal(result.status,401);
    assert.match(result.headers.get("set-cookie")||"",/Max-Age=0/);
  }finally{globalThis.fetch=original;}
});
