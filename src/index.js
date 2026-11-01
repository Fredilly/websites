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
