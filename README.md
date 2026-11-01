# Article6 Websites

Cloudflare **Worker** with a dynamic API and bundled website assets.

## Cloudflare Workers Builds

Connect `Fredilly/websites` to Workers Builds, branch `main`. On the **Set up your application** screen:

- Project name: `websites`
- Build command: leave **blank**
- Deploy command (if shown later): `npx wrangler deploy`
- Root directory: repository root

The repo has `wrangler.jsonc` with a Worker entrypoint at `src/index.js` and the website in `public/`. The Cloudflare Git integration automatically deploys pushes to `main`.

After the first deployment, add the custom domain `websites.article6.org` to the Worker in Settings > Domains & Routes.

## API

- `GET /api/health` returns the dynamic Worker health status.
- `POST /api/contact` validates incoming enquiry data and is **disabled until the existing CRM endpoint is verified**. Set runtime secrets `CRM_INGEST_URL` and `CRM_INGEST_TOKEN` only after confirming the actual integration contract. No fake success responses.
- The public homepage currently uses `mailto:contact@article6.org` so enquiries have a working fallback.

## Local

`npm install && npm run dev`

Do not override existing Article6 DNS, CRM routes or Cloudflare Workers.


## Private partner referral intake

The mobile-friendly intake page is `/refer/`. It is deliberately not linked from the public homepage and carries `noindex`.

To activate it, configure these **Cloudflare Worker secrets** (Settings > Variables and Secrets):

- `REFERRAL_USERNAME`: Claudia's dedicated username (Worker secret).
- `REFERRAL_PASSWORD`: a strong unique password (Worker secret).
- `REFERRAL_SESSION_SECRET`: a long independently generated signing key (Worker secret).
- `CRM_INGEST_URL`: `https://www.article6.org/api/partner/web-referral` (confirm that this is routed to the Article6 Next.js API in production).
- `CRM_INGEST_TOKEN`: a separate long random secret that matches `WEB_REFERRAL_INGEST_TOKEN` on the Article6 backend.

The Article6 backend must be deployed with `WEB_REFERRAL_INGEST_TOKEN` set before accepting referrals.

Share `https://websites.article6.org/refer/` with Claudia and provide her credentials privately. Her 8-hour signed, HttpOnly, Secure, SameSite=Strict session permits only referral submission. No partner read, update, or delete CRM APIs exist. Rotate the signing secret to revoke active sessions. Configure Cloudflare WAF rate-limiting for POST /api/referral/login before granting access.

**Verification**: Submit a unique test referral, confirm it appears under Web Services at `/internal/sales`, verify contact and referral notes, then verify that submissions without a session and incorrect login credentials fail. Do not tell Claudia the form is live until this has passed.

**Limitations**: CRM writes use existing store helpers and can require manual reconciliation after partial downstream failures or duplicate contacts. The referral page is partner-only; the public homepage contact remains unchanged.
