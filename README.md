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

## Selected work images

`public/work/` holds the homepage portfolio images: real captures of scoop.article6.org, carbon.article6.org and store.article6.org, cropped and encoded as WebP at two widths each (`-1200`/`-2000` for desktop shots, `-400`/`-720` for phone shots). `og.jpg` is the social share image. Recapture at 2x and keep the same names to refresh them. Hope Fusion must not appear here (portfolio restriction).

## Local

`npm install && npm run dev`

Do not override existing Article6 DNS, CRM routes or Cloudflare Workers.


## Referral partner accounts (multiple agents)

The private form is at `https://websites.article6.org/refer/`, using independent agent accounts managed by the Article6 CRM.

In Cloudflare Worker `websites` → Settings → Variables and Secrets, set only:

- `CRM_INGEST_URL`: `https://www.article6.org/api/partner/web-referral` (verify production routing to Next.js; the Worker requires HTTPS and this path).
- `CRM_INGEST_TOKEN`: a strong random secret, equal to the Article6 backend `WEB_REFERRAL_INGEST_TOKEN`.

Do **not** set `REFERRAL_USERNAME`, `REFERRAL_PASSWORD`, or `REFERRAL_SESSION_SECRET`. Those legacy single-agent secrets are no longer read after this change; remove them once the new login has been tested.

On the Article6 backend, apply `migrations/021_sales_referral_agents.sql` and configure `WEB_REFERRAL_INGEST_TOKEN` as a secret. Then visit `/internal/sales/referral-partners` using your existing administrator login.

- Create `claudia` and any future partners; the page shows a random temporary password **only once**.
- Partners may change their own passwords from `/refer/`.
- Disabling a partner or resetting their password invalidates active sessions.
- Every submitted lead is attributed to its authenticated partner in the existing Web Services CRM; partners cannot list/edit/delete CRM data.
- Add a Cloudflare WAF rule rate-limiting `POST /api/referral/login` before launch.
- Do not provide credentials until verified end to end with a real test referral and negative tests.

The existing public homepage's mailto contact fallback is unchanged.
