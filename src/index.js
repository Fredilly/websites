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
    if (url.pathname === "/api/referral" && request.method === "POST") {
      const expected = env.REFERRAL_ACCESS_KEY;
      const supplied = request.headers.get("x-referral-key") || "";
      if (!expected || !supplied || supplied !== expected) return json({ error: "Invalid referral access. Check your private link." }, 401);
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
