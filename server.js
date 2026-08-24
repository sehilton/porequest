"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { buildXlsx } = require("./xlsx-writer");
const store = require("./db");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

var STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/script.js": "script.js"
};

var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

/* --------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------- */

function sendJson(res, statusCode, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    var MAX_BYTES = 5 * 1024 * 1024; // 5MB is plenty for a form payload

    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function serveStaticFile(req, res, pathname) {
  var relativeName = STATIC_FILES[pathname];
  if (!relativeName) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  var filePath = path.join(ROOT_DIR, relativeName);
  fs.readFile(filePath, function (err, data) {
    if (err) {
      sendJson(res, 500, { error: "Could not read file" });
      return;
    }
    var ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function safeFilenamePart(value, fallback) {
  var text = (value || fallback || "").toString().trim();
  if (!text) return fallback;
  return text.replace(/[^a-z0-9\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || fallback;
}

function formDataToRows(data) {
  var header = data.header || {};
  var items = Array.isArray(data.items) ? data.items : [];
  var totals = data.totals || {};

  var rows = [];
  rows.push(["PURCHASE ORDER REQUISITION FORM"]);
  rows.push([]);
  rows.push(["PO number", header.poNumber || "", "", "VAT registered?", header.vatRegistered || ""]);
  rows.push([]);
  rows.push(["Vendor name", header.vendorName || ""]);
  rows.push(["Vendor address", header.vendorAddress || ""]);
  rows.push(["Vendor email", header.vendorEmail || ""]);
  rows.push(["Vendor company reg.", header.vendorCompanyReg || "", "Vendor VAT no.", header.vendorVatNumber || ""]);
  rows.push([]);
  rows.push(["Business unit", header.businessUnit || ""]);
  rows.push(["Company no.", header.businessUnitCoNo || "", "VAT no.", header.businessUnitVat || ""]);
  rows.push(["PO date", header.poDate || "", "Delivery date", header.deliveryDate || ""]);
  rows.push(["Reference", header.reference || ""]);
  rows.push([]);
  rows.push([
    "Description", "Cost type", "Recovery from client", "Details of recovery",
    "Reason for non recovery", "Quantity", "Unit price", "Net", "VAT"
  ]);

  items.forEach(function (item) {
    rows.push([
      item.description || "",
      item.costType || "",
      item.recovery || "",
      item.recoveryDetails || "",
      item.reason || "",
      item.qty || 0,
      item.unitPrice || 0,
      item.net || 0,
      item.vat || 0
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Subtotal", totals.subtotal || 0]);
  rows.push(["", "", "", "", "", "", "Delivery cost", totals.deliveryCost || 0]);
  rows.push(["", "", "", "", "", "", "VAT", totals.vatTotal || 0]);
  rows.push(["", "", "", "", "", "", "Total", totals.total || 0]);
  rows.push([]);

  rows.push(["Delivery address", header.deliveryAddress || ""]);
  rows.push(["For the attention of", header.deliveryAttention || ""]);
  rows.push(["Delivery email", header.deliveryEmail || ""]);
  rows.push(["Delivery instructions", header.deliveryInstructions || ""]);

  return rows;
}

/* --------------------------------------------------------------------
   Route handlers
   -------------------------------------------------------------------- */

async function handleSubmit(req, res) {
  try {
    var data = await readBody(req);
    var id = store.saveRequisition(data);
    sendJson(res, 200, { ok: true, id: id });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
}

async function handleExport(req, res) {
  try {
    var data = await readBody(req);
    var rows = formDataToRows(data);
    var buffer = buildXlsx({ sheetName: "Requisition", rows: rows });

    var header = data.header || {};
    var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    var poPart = safeFilenamePart(header.poNumber, "PO");
    var filename = "requisition-" + poPart + "-" + timestamp + ".xlsx";
    var filePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    sendJson(res, 200, {
      ok: true,
      filename: filename,
      path: "uploads/" + filename,
      downloadUrl: "/uploads/" + filename
    });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
}

async function handleListSubmissions(req, res) {
  try {
    var rows = store.listRequisitions();
    sendJson(res, 200, { ok: true, requisitions: rows });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

function handleDownload(req, res, pathname) {
  var filename = decodeURIComponent(pathname.replace("/uploads/", ""));
  // Prevent path traversal — only allow flat filenames inside the uploads dir.
  if (filename.includes("/") || filename.includes("..")) {
    sendJson(res, 400, { error: "Invalid filename" });
    return;
  }
  var filePath = path.join(UPLOADS_DIR, filename);
  fs.readFile(filePath, function (err, data) {
    if (err) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[".xlsx"],
      "Content-Disposition": 'attachment; filename="' + filename + '"'
    });
    res.end(data);
  });
}

/* --------------------------------------------------------------------
   Server
   -------------------------------------------------------------------- */

var server = http.createServer(function (req, res) {
  var url = new URL(req.url, "http://" + req.headers.host);
  var pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/submit") {
    handleSubmit(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/export") {
    handleExport(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/submissions") {
    handleListSubmissions(req, res);
    return;
  }

  if (req.method === "GET" && pathname.indexOf("/uploads/") === 0) {
    handleDownload(req, res, pathname);
    return;
  }

  if (req.method === "GET" && STATIC_FILES[pathname]) {
    serveStaticFile(req, res, pathname);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, function () {
  console.log("Purchase order requisition form running at http://localhost:" + PORT);
  console.log("SQLite database: " + path.join(__dirname, "po_requisitions.db"));
  console.log("Excel exports saved to: " + UPLOADS_DIR);
});
