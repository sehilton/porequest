# Purchase Order Requisition Form — Netlify edition

A purchase order requisition form: fill it out in the browser, **send it to
your line manager for approval** (who approves or denies it by email), or
**export it to Excel**. Runs natively on Netlify — static frontend +
Netlify Functions, no server to manage.

## Approval flow

1. The requester fills in their name, email, and their line manager's
   email, then clicks **Send for approval**. This emails the approver a PDF
   of the requisition plus **Approve** and **Deny** buttons, and saves the
   submission to the `requisitions` Blobs store (status `pending`) so
   those links have something to act on.
2. **Approve** → status becomes `approved`, and the **requester** (not the
   approver) is emailed the PDF and asked to forward it to
   finance@chpk.co.uk themselves — finance is never emailed automatically
   by this app, at their request.
3. **Deny** → the link opens a small page asking for a reason. Submitting
   it emails the requester with the reason; status becomes `denied`.
4. Every email is sent with the requester's own name and email address in
   the **From** field (see the Resend domain note below — this only works
   if the requester's email domain is verified in Resend).
5. Approve/deny links are single-use: once a decision has been recorded,
   re-clicking either link shows an "already approved/denied" page instead
   of sending duplicate emails.

## Structure

- **Frontend** — `public/index.html`, `public/styles.css`, `public/script.js`.
- **Backend** — Netlify Functions in `netlify/functions/`.
- **Storage** — [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/):
  the `requisitions` store holds pending/approved/denied submissions (so
  the approve/deny links have something to look up), and the `uploads`
  store holds Excel exports.

## Routes

| Route | Function | What it does |
|---|---|---|
| `POST /api/submit` | `submit.mjs` | Builds a PDF, saves the requisition as `pending`, and emails the approver a PDF + Approve/Deny links via [Resend](https://resend.com) |
| `GET/POST /api/decision` | `decision.mjs` | Handles an Approve/Deny link click: on approve, emails the requester the PDF and asks them to forward it to finance; on deny, shows a reason form and then emails the requester with the reason |
| `GET /api/submissions` | `submissions.mjs` | Lists the 50 most recent requisitions (id, status, requester, vendor, total, …) from the `requisitions` store |
| `POST /api/export` | `export.mjs` | Builds an `.xlsx` and saves it to the `uploads` Blobs store |
| `GET /api/download/:filename` | `download.mjs` | Streams a saved export back to the browser |

`netlify/functions/_shared/` holds the building blocks, all dependency-free
(no npm packages beyond `@netlify/blobs`, used by `requisition-store.mjs`,
`export.mjs`, and `download.mjs`):

- `requisition-store.mjs` — reads/writes the `requisitions` Blobs store:
  creates a `pending` record with a random id + bearer token when a
  requisition is submitted, and flips it to `approved`/`denied` once a
  decision is made.

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
   the DNS records they give you). This step matters more than usual here:
   every email this app sends — to the approver, to the requester on
   denial — is sent with **the requester's own address as the From
   header** (see Approval flow above), not a single fixed sender. For that
   to deliver, the *requester's* email domain has to be verified in Resend
   — for CHPK staff that's `chpk.co.uk`. Resend's sandbox sender
   (`onboarding@resend.dev`) can't be substituted here since the From
   address is a real per-submission requester address, not a fixed
   sandbox one.
3. In the Netlify UI: **Site configuration → Environment variables**, add:
   - `RESEND_API_KEY` — the key from step 1.
   - `REQUISITION_FROM_EMAIL` — a fallback from-address on your verified
     domain, only used if a submission somehow arrives without a requester
     email (shouldn't happen — the field is required client-side).
4. Redeploy (environment variable changes need a new deploy to take
   effect).

Without `RESEND_API_KEY` set, clicking **Send for approval** returns a
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

Every submission is saved as a JSON record in the `requisitions` Blobs
store (`requisition-store.mjs`), with a `status` of `pending`, `approved`,
or `denied`. `GET /api/submissions` lists the 50 most recent. The email
inbox at the approver's address (plus Resend's own dashboard, which logs
sent emails and their attachments) is the other record — the PDF isn't
stored on its own, it's rebuilt from the saved JSON whenever a denial
email needs to be sent. Finance never receives an automated email in this
flow; once approved, forwarding the PDF to finance is a manual step (see
Approval flow above).
