# Purchase Order Requisition Form — Netlify edition

Same form as before, rebuilt to run natively on Netlify:

- **Frontend** — `public/index.html`, `public/styles.css`, `public/script.js`
  (unchanged from the standalone version; still plain HTML/CSS/JS).
- **Backend** — Netlify Functions in `netlify/functions/`, one per route.
- **Storage** — [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
  Netlify's built-in persistent object storage. It replaces both the SQLite
  file and the local `uploads/` folder from the original version — Netlify
  Functions don't have a writable disk that survives between requests, so
  neither of those would have worked here.

## Why the previous version broke on Netlify

Netlify only serves static files and short-lived serverless functions; it
doesn't run an always-on Node process. The old `server.js` never ran at all —
`fetch('/api/submit')` hit Netlify's page-not-found fallback (your site's
`index.html`), which is why the browser tried to parse `<!DOCTYPE html>` as
JSON.

## Routes

| Route | Function | Storage |
|---|---|---|
| `POST /api/submit` | `netlify/functions/submit.mjs` | writes a JSON record to the `requisitions` Blobs store |
| `GET /api/submissions` | `netlify/functions/submissions.mjs` | lists the 50 most recent requisitions |
| `POST /api/export` | `netlify/functions/export.mjs` | builds an `.xlsx` and writes it to the `uploads` Blobs store |
| `GET /api/download/:filename` | `netlify/functions/download.mjs` | streams a saved export back to the browser |

The Excel file itself is built by `netlify/functions/_shared/xlsx-writer.mjs`
— a small, dependency-free `.xlsx` writer (it assembles the OOXML zip using
only Node's built-in `zlib`), carried over unchanged from the standalone
version.

## Deploying

1. Push this folder to a Git repo and connect it in the Netlify UI (or run
   `netlify deploy --prod` from the Netlify CLI). Netlify reads
   `netlify.toml`, publishes `public/` as the site, and deploys everything
   in `netlify/functions/` automatically.
2. On the first deploy, Netlify installs `@netlify/blobs` from
   `package.json` — no other setup, environment variables, or database
   provisioning is needed. Blobs storage is provisioned automatically per
   site.

That's it — no database to create, no connection string to configure.

## Local development

```bash
npx netlify-cli dev
```

(or `npm run dev` if you have `netlify-cli` installed). This serves
`public/` and runs the functions locally, including a local emulation of
Netlify Blobs, so Submit and Export both work the same way they will in
production.

## Inspecting stored data

Blobs aren't a SQL database, so there's no `sqlite3` shell for them. Options:

- The Netlify UI: **Project → Storage → Blobs**, browse the `requisitions`
  and `uploads` stores directly.
- `GET /api/submissions` returns the most recent requisitions as JSON.
- `netlify blobs:list requisitions` / `netlify blobs:list uploads` via the
  Netlify CLI.

## If you outgrow Blobs

Blobs stores whole JSON records and files — great for this form, but not
built for SQL queries (filtering, joins, aggregates across requisitions). If
that need shows up later, Netlify also offers a managed Postgres database
(`@netlify/database`) that the functions here could be pointed at instead,
without changing the frontend.
