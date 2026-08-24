# Purchase Order Requisition Form — Netlify edition

A purchase order requisition form: fill it out in the browser, **email a PDF
of it to finance**, or **export it to Excel**. Runs natively on Netlify —
static frontend + Netlify Functions, no server to manage.

## Structure

- **Frontend** — `public/index.html`, `public/styles.css`, `public/script.js`.
- **Backend** — Netlify Functions in `netlify/functions/`.
- **Storage** — [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
  for Excel exports only (see below). Nothing is stored in a database —
  submitting the form emails a PDF instead.

## Routes

| Route | Function | What it does |
|---|---|---|
| `POST /api/submit` | `submit.mjs` | Builds a PDF of the form and emails it to `finance@chpk.co.uk` via [Resend](https://resend.com) |
| `POST /api/export` | `export.mjs` | Builds an `.xlsx` and saves it to the `uploads` Blobs store |
| `GET /api/download/:filename` | `download.mjs` | Streams a saved export back to the browser |

`netlify/functions/_shared/` holds the building blocks, all dependency-free
(no npm packages beyond `@netlify/blobs`, used only by `export.mjs` and
`download.mjs`):

- `pdf-writer.cjs` — low-level PDF assembly (objects, xref table, text
  layout with the standard Helvetica metrics hardcoded in). Deliberately
  hand-rolled instead of using a library like `pdfkit`: that library loads
  its font-metric files from disk at runtime, which is a well-documented
  way to break once bundled for a serverless function (confirmed on
  Netlify's own support forum). This writer has no runtime file reads at
  all, so it can't hit that failure mode.
- `requisition-pdf.cjs` — the actual page layout (header banner, vendor/
  order panels, paginating line-items table, totals, delivery details),
  built on top of `pdf-writer.cjs`.
- `send-email.cjs` — calls the Resend REST API directly with `fetch` (no
  SDK needed) to send the PDF as an attachment.
- `xlsx-writer.mjs` / `form-data.mjs` — unchanged from the Excel-export
  path described in earlier versions of this project.

## Required setup: Resend API key

Emailing the PDF needs an email-sending provider — Netlify doesn't include
one. This project calls [Resend](https://resend.com)'s API directly.

1. Create a free Resend account and an API key.
2. **Verify a domain in Resend** (Resend → Domains → Add Domain, then add
   the DNS records they give you). This step matters: Resend's own sandbox
   sender (`onboarding@resend.dev`) only delivers to the *email address on
   your Resend account* — it will silently fail to reach
   `finance@chpk.co.uk` unless that happens to be the account's own email.
   A verified domain is what lets you send to arbitrary recipients.
3. In the Netlify UI: **Site configuration → Environment variables**, add:
   - `RESEND_API_KEY` — the key from step 1.
   - `REQUISITION_FROM_EMAIL` — a from-address on your verified domain,
     e.g. `requisitions@yourdomain.com`. If you skip this, it defaults to
     Resend's sandbox address, which — per the point above — won't
     actually reach finance in production.
4. Redeploy (environment variable changes need a new deploy to take
   effect).

Without `RESEND_API_KEY` set, clicking **Email requisition** returns a
clear error explaining what's missing, rather than failing silently.

## Business rules built into the form

- **VAT registered = No** → every line's VAT and the VAT total are forced
  to £0.00 and excluded from the calculation entirely (not just hidden).
  Switching back to Yes recalculates normally.
- **Recovery from client**, per line item:
  - **Yes** → *Details of recovery* and *Reason for non-recovery* become
    required — the browser blocks Submit/Export with a validation message
    until they're filled in.
  - **No** (or unset) → those two fields are disabled and cleared, since
    they don't apply.

## Deploying

1. Push this folder to a Git repo and connect it in the Netlify UI (or run
   `netlify deploy --prod`). Netlify reads `netlify.toml`, publishes
   `public/`, and deploys everything in `netlify/functions/` automatically.
2. Set the two environment variables above.
3. That's it — no build command, no database to provision.

## Local development

```bash
npx netlify-cli dev
```

Set `RESEND_API_KEY` (and optionally `REQUISITION_FROM_EMAIL`) in a local
`.env` file so `netlify dev` picks them up — otherwise Submit will return
the "not configured" error locally, which is expected without a key.

## If you need a record of what was submitted

Since submissions are emailed rather than stored, the email inbox at
`finance@chpk.co.uk` (and Resend's own dashboard, which logs sent emails
and their attachments) is the record. If you later want a searchable
history inside the app as well, the Blobs-based approach from the previous
version of this project (a `requisitions` store, one JSON record per
submission) can be added back alongside the email — ask and it can be
layered in without touching the PDF/email logic.
