const sessionCookie = req => (req.headers.get("cookie") || "").split(";").map(s=>s.trim()).find(s=>s.startsWith("referral_session="))?.slice(17) || "";
const sameOrigin = req => req.headers.get("origin") === new URL(req.url).origin;
const cleared = "referral_session=; Path=/api/referral; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
async function referralAuth(env, body) {
  if(!env.CRM_INGEST_URL || !env.CRM_INGEST_TOKEN) throw Error("Not configured");
  const target=new URL(env.CRM_INGEST_URL);
  if(target.protocol!=="https:" || target.pathname!=="/api/partner/web-referral") throw Error("Invalid CRM URL");
  target.pathname="/api/partner/referral-auth";
  const r=await fetch(target.toString(),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+env.CRM_INGEST_TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
  return {status:r.status,body:await r.json()};
}
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", ...extra }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "article6-websites", runtime: "cloudflare-workers" });
    }
    if (url.pathname === "/api/referral/login" && request.method === "POST") {
      if (!sameOrigin(request)) return json({error:"Forbidden"},403);
      if (!(request.headers.get("content-type")||"").startsWith("application/json")) return json({error:"Expected JSON"},415);
      const raw=await request.text(); if(raw.length>1024)return json({error:"Too large"},413);
      let body;try{body=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
      if(typeof body.username!=="string"||typeof body.password!=="string"||body.username.length>40||body.password.length>128)return json({error:"Invalid input"},400);
      try {
        const result=await referralAuth(env,{action:"login",username:body.username,password:body.password});
        if(result.status!==200)return json({error:"Incorrect credentials or account unavailable"},result.status===401?401:503);
        const token=result.body.session;
        if(typeof token!=="string"||token.length>1024)return json({error:"Invalid upstream session"},502);
        return json({ok:true,agent:result.body.agent},200,{"set-cookie":"referral_session="+token+"; Path=/api/referral; HttpOnly; Secure; SameSite=Strict; Max-Age=28800"});
      }catch{return json({error:"Authentication unavailable"},503)}
    }
    if(url.pathname==="/api/referral/logout"&&request.method==="POST"){
      if(!sameOrigin(request))return json({error:"Forbidden"},403);
      return json({ok:true},200,{"set-cookie":cleared});
    }
    if(url.pathname==="/api/referral/session"&&request.method==="GET"){
      const token=sessionCookie(request);
      if(!token)return json({authenticated:false});
      try{
        const r=await referralAuth(env,{action:"session",session:token});
        return json({authenticated:r.status===200,agent:r.status===200?r.body.agent:undefined},200,r.status===200?{}:{"set-cookie":cleared});
      }catch{return json({authenticated:false,error:"Authentication service unavailable"},503)}
    }
    if(url.pathname==="/api/referral/change-password"&&request.method==="POST"){
      if(!sameOrigin(request))return json({error:"Forbidden"},403);
      const token=sessionCookie(request);if(!token)return json({error:"Please log in again"},401);
      const raw=await request.text();if(raw.length>600)return json({error:"Too large"},413);
      let b;try{b=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
      if(typeof b.currentPassword!=="string"||typeof b.newPassword!=="string")return json({error:"Invalid password"},400);
      try{
        const r=await referralAuth(env,{action:"change_password",session:token,currentPassword:b.currentPassword,newPassword:b.newPassword});
        if(r.status!==200)return json({error:r.body.error||"Unable to change password"},r.status===401?401:400);
        return json({ok:true},200,{"set-cookie":cleared});
      }catch{return json({error:"Authentication service unavailable"},503)}
    }
    if (url.pathname === "/api/referral" && request.method === "POST") {
      const agentSession=sessionCookie(request);
      if (!agentSession) return json({error:"Please log in to submit referrals."},401);
      if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
      if (!env.CRM_INGEST_URL || !env.CRM_INGEST_TOKEN) return json({ error: "Referral submissions are temporarily unavailable." }, 503);
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "Forbidden." }, 403);
      if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
      const raw = await request.text();
      if (raw.length > 6000) return json({ error: "Submission too large." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid submission." }, 400);
      const field = (key, max) => typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
      const payload = {
        company: field("company", 120), name: field("name", 120),
        email: field("email", 254), whatsapp: field("whatsapp", 40),
        website: field("website", 400), service: field("service", 80),
        interest: field("interest", 80), budget: field("budget", 120),
        notes: field("notes", 1500), agentSession
      };
      if (!payload.company || !payload.name || (!payload.email && !payload.whatsapp)) return json({ error: "Company, name, and a contact method are required." }, 400);
      try {
        const response = await fetch(env.CRM_INGEST_URL, {
          method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.CRM_INGEST_TOKEN },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
        });
        if (response.status === 401) return json({error:"Please log in to submit referrals."},401,{"set-cookie":cleared});
        if (response.status === 409) return json({ error: "This lead may already exist. Please contact Article6 before resubmitting." }, 409);
        if (!response.ok) return json({ error: "We could not save this lead. Please retry later." }, 502);
        return json({ ok: true }, 201);
      } catch {
        return json({ error: "We could not verify that this lead was saved. Please check with Article6 before retrying." }, 502);
      }
    }
    if (url.pathname === "/api/contact" && request.method === "POST") {
      // Deliberately fails closed until the existing CRM integration is configured.
      // Never acknowledge a lead without persisting or delivering it.
      if (!env.CRM_INGEST_URL || !env.CRM_INGEST_TOKEN) {
        return json({ error: "Online enquiries are not yet available. Please email contact@article6.org." }, 503);
      }
      const type = request.headers.get("content-type") || "";
      if (!type.toLowerCase().startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
      const raw = await request.text();
      if (raw.length > 8192) return json({ error: "Request too large." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
      const { name, email, website, message, source } = body ?? {};
      if (typeof name !== "string" || !name.trim() || name.length > 120 ||
          typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
          typeof message !== "string" || !message.trim() || message.length > 4000) {
        return json({ error: "Please enter your name, valid email and project details." }, 400);
      }
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "Forbidden." }, 403);
      const payload = {
        name: name.trim(), email: email.trim(), website: typeof website === "string" ? website.slice(0, 400) : "",
        message: message.trim(), source: typeof source === "string" ? source.slice(0, 80) : "websites",
        receivedAt: new Date().toISOString()
      };
      try {
        const result = await fetch(env.CRM_INGEST_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + env.CRM_INGEST_TOKEN },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000)
        });
        if (!result.ok) return json({ error: "Unable to submit your enquiry. Please email contact@article6.org." }, 502);
        return json({ ok: true }, 201);
      } catch {
        return json({ error: "Unable to submit your enquiry. Please email contact@article6.org." }, 502);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  }
};
