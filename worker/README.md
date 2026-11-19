# CaseGraph API (Cloudflare Workers + D1)

The API is deliberately separate from GitHub Pages. Public endpoints expose **approved configs only**. Submissions remain pending until an administrator approves them.

## 1. Create the D1 database

From this directory, with Wrangler installed and authenticated:

```sh
npx wrangler d1 create casegraph
```

Copy the returned `database_id` into `wrangler.toml`, replacing `REPLACE_WITH_DATABASE_ID`.

## 2. Apply the schema

```sh
npx wrangler d1 migrations apply casegraph --remote
```

## 3. Set the moderation secret

Generate a long random token and store it as a Worker secret. Do not put it in the website or commit it:

```sh
npx wrangler secret put ADMIN_TOKEN
```

Enter the secret when prompted. Keep it private.

## 4. Deploy

```sh
npx wrangler deploy
```

The API URL will look like `https://casegraph-api.<your-subdomain>.workers.dev`.

Check it with `GET /api/health`.

## 5. Connect the website

In `catalog.html`, set `API_BASE` to the deployed Worker URL (without a trailing slash). Until this is set, the catalogue stays in offline mode and does not claim that submissions or statistics are shared.

## API

- `GET /api/configs` — approved configs with global like/dislike/download counts.
- `POST /api/submissions` — submit a config for review; it is always created as `pending`.
- `GET /api/me/submissions?client_id=...` — submissions belonging to this browser ID.
- `POST /api/votes` — one current vote per browser ID and config.
- `POST /api/downloads` — increment a public download counter.
- `GET /api/admin/submissions` — pending queue; requires `Authorization: Bearer <ADMIN_TOKEN>`.
- `POST /api/admin/moderate` — approve/reject a submission; requires the same secret.

Moderation request body:

```json
{"id":"submission-id","action":"approve","note":"Reviewed"}
```

## Identity and abuse limitations

The browser ID is a random local identifier, not a verified account. Clearing site data loses access to that browser's submission history; users can also reset or spoof the ID. Votes are one-per-ID, not one-per-human. For stronger identity and abuse prevention, add a real authentication provider and server-validated Turnstile challenge before opening submissions publicly.

CORS is restricted to the GitHub Pages origin by default. Update `ALLOWED_ORIGIN` only if the site origin changes.
