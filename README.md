# Article6 Websites

Static website-development landing page for `websites.article6.org`.

## Cloudflare Pages setup

- Git repository: `Fredilly/websites`
- Production branch: `main`
- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `public`
- Root directory: leave blank (repository root)
- Environment variables: none required

Use **Workers & Pages → Create application → Pages → Connect to Git**, select this repository, and enter the settings above. Cloudflare automatically deploys each subsequent push to `main`.

After the `*.pages.dev` site is live, select **Custom domains → Set up a domain** and enter `websites.article6.org`. Let Cloudflare handle DNS where possible. Do not manually point DNS before attaching the domain.

## Notes

- No Node.js, npm dependencies, or build framework are required.
- Enquiries currently use `mailto:contact@article6.org`; a CRM-backed form can be added once its endpoint is explicitly verified.
- Do not copy another Article6 project's Worker routes or Cloudflare build configurations into this project.
