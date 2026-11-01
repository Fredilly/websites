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
