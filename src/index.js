const encoder = new TextEncoder();
const toHex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
async function digest(value) { return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
async function signature(message, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}
async function verifySession(request, env) {
  if (!env.REFERRAL_SESSION_SECRET) return false;
  const token = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith("referral_session="))?.split("=")[1];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || Number(parts[0]) < Date.now() || Number(parts[0]) > Date.now() + 9 * 3600000) return false;
  return parts[1] === await signature(parts[0], env.REFERRAL_SESSION_SECRET);
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
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
      if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
      if (!env.REFERRAL_USERNAME || !env.REFERRAL_PASSWORD || !env.REFERRAL_SESSION_SECRET) {
        return json({ error: "Partner login is not configured." }, 503);
      }
      if (!(request.headers.get("content-type") || "").startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
      const raw = await request.text();
      if (raw.length > 1024) return json({ error: "Request too large." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
      const username = typeof body?.username === "string" ? body.username : "";
      const password = typeof body?.password === "string" ? body.password : "";
      const matchUser = await digest(username) === await digest(env.REFERRAL_USERNAME);
      const matchPassword = await digest(password) === await digest(env.REFERRAL_PASSWORD);
      if (!matchUser || !matchPassword) return json({ error: "Incorrect username or password." }, 401);
      const expires = String(Date.now() + 8 * 3600000);
      const token = expires + "." + await signature(expires, env.REFERRAL_SESSION_SECRET);
      return json({ ok: true }, 200, { "set-cookie": "referral_session=" + token + "; Path=/api/referral; HttpOnly; Secure; SameSite=Strict; Max-Age=28800" });
    }
    if (url.pathname === "/api/referral/logout" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
      return json({ ok: true }, 200, { "set-cookie": "referral_session=; Path=/api/referral; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    }
    if (url.pathname === "/api/referral/session" && request.method === "GET") {
      return json({ authenticated: await verifySession(request, env) });
    }
    if (url.pathname === "/api/referral" && request.method === "POST") {
      if (!(await verifySession(request, env))) return json({ error: "Please log in to submit referrals." }, 401);
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
        notes: field("notes", 1500)
      };
      if (!payload.company || !payload.name || (!payload.email && !payload.whatsapp)) return json({ error: "Company, name, and a contact method are required." }, 400);
      try {
        const response = await fetch(env.CRM_INGEST_URL, {
          method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.CRM_INGEST_TOKEN },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
        });
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
