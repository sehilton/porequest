# Purchase Order Requisition Form

A self-contained requisition form: fill it out in the browser, submit it to a
local SQLite database, or export it to an Excel file. No npm packages
required — everything runs on Node's built-in modules.

## Requirements

- **Node.js 22.5 or later** (uses the built-in `node:sqlite` module, which
  ships behind no flag from Node 22.5 onward). Check your version with
  `node --version`. If you're on an older Node 22 build and see an error
  about `node:sqlite`, run the server with
  `node --experimental-sqlite server.js` instead.

No `npm install` step is needed — the server, database layer, and Excel
writer are built entirely from Node's standard library.

## Running it

```bash
node server.js
```

Then open **http://localhost:3000** in your browser. (Opening `index.html`
directly as a file won't work anymore — the Submit and Export buttons need
the server running to save data.)

## What each button does

- **Submit requisition** — sends the form to `POST /api/submit`, which
  writes the header fields into a `requisitions` table and every line item
  into a `line_items` table inside `po_requisitions.db` (created
  automatically in this folder on first run).
- **Export to Excel** — sends the form to `POST /api/export`, which builds a
  real `.xlsx` workbook and saves it into the `uploads/` folder (also
  created automatically) as `requisition-<PO number>-<timestamp>.xlsx`. The
  response also includes a `/uploads/<filename>` link if you want to
  download the file straight from the browser.

## Files

| File | Purpose |
|---|---|
| `index.html` / `styles.css` / `script.js` | The form itself |
| `server.js` | HTTP server, static file hosting, and the `/api/*` routes |
| `db.js` | SQLite schema + save/read helpers (`node:sqlite`) |
| `xlsx-writer.js` | Dependency-free `.xlsx` builder (zips the OOXML parts with `node:zlib`) |
| `po_requisitions.db` | The SQLite database (created on first submit) |
| `uploads/` | Where exported spreadsheets land (created on first export) |

## Inspecting the database

Any SQLite browser works, or the command line:

```bash
sqlite3 po_requisitions.db "SELECT * FROM requisitions;"
sqlite3 po_requisitions.db "SELECT * FROM line_items;"
```
