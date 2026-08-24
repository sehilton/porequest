"use strict";

const { createPageCanvas, assemblePdf, wrapText, textWidth } = require("../pdf-writer.cjs");

var PAGE_W = 595.28;
var PAGE_H = 841.89;
var MARGIN = 40;
var CONTENT_W = PAGE_W - MARGIN * 2;

var NAVY = "#1D3557";
var NAVY_DEEP = "#142338";
var GOLD_SOFT = "#F1E6C8";
var INK = "#1E2433";
var INK_SOFT = "#4B5163";
var MUTED = "#7B8194";
var LINE = "#DFDBD0";
var LINE_STRONG = "#C7C2B4";
var PANEL_HEAD_BG = "#F6F4EF";

function currency(value) {
  var n = isFinite(value) ? Number(value) : 0;
  var fixed = n.toFixed(2);
  var parts = fixed.split(".");
  var intPart = parts[0].replace(/^-/, "");
  var withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  var sign = n < 0 ? "-" : "";
  return sign + "\u00a3" + withCommas + "." + parts[1];
}

/* --------------------------------------------------------------------
   Page/cursor management
   -------------------------------------------------------------------- */

function createDoc() {
  var pages = [];
  var current = null;
  var cursorY = MARGIN;

  function newPage() {
    var canvas = createPageCanvas(PAGE_W, PAGE_H);
    var page = { canvas: canvas, width: PAGE_W, height: PAGE_H };
    pages.push(page);
    current = page;
    cursorY = MARGIN;
    return page;
  }

  newPage();

  return {
    get canvas() { return current.canvas; },
    get cursorY() { return cursorY; },
    set cursorY(v) { cursorY = v; },
    get pages() { return pages; },
    newPage: newPage,
    ensureSpace: function (height) {
      var before = pages.length;
      if (cursorY + height > PAGE_H - MARGIN) {
        newPage();
      }
      return pages.length !== before;
    }
  };
}

/* --------------------------------------------------------------------
   Header banner
   -------------------------------------------------------------------- */

function drawHeaderBanner(doc, header) {
  var canvas = doc.canvas;
  canvas.fillRect(0, 0, PAGE_W, 92, NAVY);
  canvas.text(MARGIN, 22, "CHPK GROUP", { font: "Helvetica-Bold", size: 9, color: GOLD_SOFT });
  canvas.text(MARGIN, 36, "Purchase Order Requisition Form", { font: "Helvetica-Bold", size: 21, color: "#FFFFFF" });

  var poLabel = "PO No.  " + (header.poNumber || "\u2014");
  var vatLabel = "VAT registered  " + (header.vatRegistered === "no" ? "No" : "Yes");
  var poW = textWidth(poLabel, "Helvetica", 10);
  var vatW = textWidth(vatLabel, "Helvetica", 10);
  canvas.text(PAGE_W - MARGIN - poW, 26, poLabel, { size: 10, color: "#FFFFFF" });
  canvas.text(PAGE_W - MARGIN - vatW, 42, vatLabel, { size: 10, color: "#D8E0EA" });

  doc.cursorY = 112;
}

/* --------------------------------------------------------------------
   Key/value panels (vendor, order details, delivery details)
   -------------------------------------------------------------------- */

function layoutFieldRows(rows, width) {
  var y = 0;
  var laidOut = [];
  rows.forEach(function (row) {
    var label = row[0];
    var value = row[1] && String(row[1]).trim() ? String(row[1]) : "\u2014";
    var lines = wrapText(value, "Helvetica", 9.5, width);
    laidOut.push({ label: label, lines: lines, y: y });
    y += 11 + lines.length * 12 + 7;
  });
  return { rows: laidOut, height: y };
}

function drawFieldRows(canvas, x, yStart, layout) {
  layout.rows.forEach(function (row) {
    var y = yStart + row.y;
    canvas.text(x, y, row.label.toUpperCase(), { font: "Helvetica-Bold", size: 7.5, color: MUTED });
    row.lines.forEach(function (line, i) {
      canvas.text(x, y + 11 + i * 12, line, { size: 9.5, color: INK });
    });
  });
}

function drawPanel(doc, title, rows, x, width) {
  var padding = 12;
  var titleH = 22;
  var layout = layoutFieldRows(rows, width - padding * 2);
  var totalH = titleH + layout.height + padding * 0.6;

  doc.ensureSpace(totalH + 14);
  var y = doc.cursorY;
  var canvas = doc.canvas;

  canvas.fillRect(x, y, width, titleH, PANEL_HEAD_BG);
  canvas.strokeRect(x, y, width, totalH, LINE_STRONG, 1);
  canvas.line(x, y + titleH, x + width, y + titleH, LINE_STRONG, 1);
  canvas.text(x + padding, y + 5, title, { font: "Helvetica-Bold", size: 11, color: NAVY_DEEP });
  drawFieldRows(canvas, x + padding, y + titleH + 10, layout);

  doc.cursorY = y + totalH + 14;
  return totalH;
}

function drawTwoColumnPanels(doc, panels) {
  var gap = 16;
  var colWidth = (CONTENT_W - gap) / 2;
  var padding = 12;
  var titleH = 22;

  var layouts = panels.map(function (p) {
    return layoutFieldRows(p.rows, colWidth - padding * 2);
  });
  var contentH = Math.max(layouts[0].height, layouts[1].height);
  var totalH = titleH + contentH + padding * 0.6;

  doc.ensureSpace(totalH + 14);
  var y = doc.cursorY;
  var canvas = doc.canvas;

  panels.forEach(function (panel, i) {
    var x = MARGIN + i * (colWidth + gap);
    canvas.fillRect(x, y, colWidth, titleH, PANEL_HEAD_BG);
    canvas.strokeRect(x, y, colWidth, totalH, LINE_STRONG, 1);
    canvas.line(x, y + titleH, x + colWidth, y + titleH, LINE_STRONG, 1);
    canvas.text(x + padding, y + 5, panel.title, { font: "Helvetica-Bold", size: 11, color: NAVY_DEEP });
    drawFieldRows(canvas, x + padding, y + titleH + 10, layouts[i]);
  });

  doc.cursorY = y + totalH + 14;
}

/* --------------------------------------------------------------------
   Line items table
   -------------------------------------------------------------------- */

var COLUMNS = [
  { key: "description", label: "Description", width: 124 },
  { key: "costType", label: "Cost type", width: 60 },
  { key: "recovery", label: "Recovery", width: 45 },
  { key: "recoveryDetails", label: "Details of recovery", width: 60 },
  { key: "reason", label: "Reason for non-recovery", width: 60 },
  { key: "qty", label: "Qty", width: 25, align: "right" },
  { key: "unitPrice", label: "Unit price", width: 47, align: "right" },
  { key: "net", label: "Net", width: 47, align: "right" },
  { key: "vat", label: "VAT", width: 47, align: "right" }
];

function drawTableHeaderRow(doc) {
  var canvas = doc.canvas;
  var headerLines = COLUMNS.map(function (c) {
    return wrapText(c.label, "Helvetica-Bold", 7.5, c.width - 6);
  });
  var maxLines = Math.max.apply(null, headerLines.map(function (l) { return l.length; }));
  var rowH = maxLines * 9 + 8;

  doc.ensureSpace(rowH + 4);
  var y = doc.cursorY;
  canvas.fillRect(MARGIN, y, CONTENT_W, rowH, PANEL_HEAD_BG);

  var x = MARGIN;
  COLUMNS.forEach(function (c, i) {
    headerLines[i].forEach(function (line, li) {
      var lineX = x + 3;
      if (c.align === "right") {
        var w = textWidth(line, "Helvetica-Bold", 7.5);
        lineX = x + c.width - 3 - w;
      }
      canvas.text(lineX, y + 4 + li * 9, line, { font: "Helvetica-Bold", size: 7.5, color: MUTED });
    });
    x += c.width;
  });

  canvas.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH, LINE_STRONG, 1);
  doc.cursorY = y + rowH;
}

function drawItemsTable(doc, items) {
  drawTableHeaderRow(doc);

  if (items.length === 0) {
    doc.ensureSpace(20);
    doc.canvas.text(MARGIN + 4, doc.cursorY + 4, "No line items.", { size: 9, color: MUTED });
    doc.cursorY += 20;
    return;
  }

  items.forEach(function (item) {
    var cellText = {
      description: item.description || "",
      costType: item.costType || "",
      recovery: item.recovery || "\u2014",
      recoveryDetails: item.recoveryDetails || "",
      reason: item.reason || "",
      qty: String(item.qty || 0),
      unitPrice: currency(item.unitPrice),
      net: currency(item.net),
      vat: currency(item.vat)
    };

    var wrapped = COLUMNS.map(function (c) {
      return wrapText(cellText[c.key], "Helvetica", 8.5, c.width - 6);
    });
    var maxLines = Math.max.apply(null, wrapped.map(function (l) { return l.length; }));
    var rowH = maxLines * 10.5 + 8;

    var startedNewPage = doc.ensureSpace(rowH + 2);
    if (startedNewPage) {
      drawTableHeaderRow(doc);
    }

    var y = doc.cursorY;
    var x = MARGIN;
    COLUMNS.forEach(function (c, i) {
      wrapped[i].forEach(function (line, li) {
        var lineX = x + 3;
        if (c.align === "right") {
          var w = textWidth(line, "Helvetica", 8.5);
          lineX = x + c.width - 3 - w;
        }
        doc.canvas.text(lineX, y + 4 + li * 10.5, line, { size: 8.5, color: INK });
      });
      x += c.width;
    });

    doc.canvas.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH, LINE, 0.5);
    doc.cursorY = y + rowH;
  });

  doc.cursorY += 16;
}

/* --------------------------------------------------------------------
   Totals
   -------------------------------------------------------------------- */

function drawTotals(doc, totals, vatRegistered) {
  var boxW = 230;
  var x = MARGIN + CONTENT_W - boxW;
  var rowH = 17;
  var vatLabel = vatRegistered === "no" ? "VAT (not registered)" : "VAT (20%)";

  var rows = [
    ["Subtotal", currency(totals.subtotal)],
    ["Delivery cost", currency(totals.deliveryCost)],
    [vatLabel, currency(totals.vatTotal)]
  ];

  var blockH = rows.length * rowH + 34;
  doc.ensureSpace(blockH + 10);
  var y = doc.cursorY;

  rows.forEach(function (row, i) {
    var ry = y + i * rowH;
    doc.canvas.text(x, ry, row[0], { size: 9.5, color: INK_SOFT });
    var w = textWidth(row[1], "Helvetica", 9.5);
    doc.canvas.text(x + boxW - w, ry, row[1], { size: 9.5, color: INK });
  });

  var totalY = y + rows.length * rowH + 6;
  doc.canvas.line(x, totalY, x + boxW, totalY, LINE_STRONG, 1.2);

  var totalStr = currency(totals.total);
  var totalW = textWidth(totalStr, "Helvetica-Bold", 13);
  doc.canvas.text(x, totalY + 8, "Total", { font: "Helvetica-Bold", size: 12, color: NAVY_DEEP });
  doc.canvas.text(x + boxW - totalW, totalY + 6, totalStr, { font: "Helvetica-Bold", size: 13, color: NAVY });

  doc.cursorY = totalY + 34;
}

/* --------------------------------------------------------------------
   Entry point
   -------------------------------------------------------------------- */

function buildRequisitionPdf(data) {
  var header = (data && data.header) || {};
  var items = Array.isArray(data && data.items) ? data.items : [];
  var totals = (data && data.totals) || {};

  var doc = createDoc();

  drawHeaderBanner(doc, header);

  drawTwoColumnPanels(doc, [
    {
      title: "Vendor",
      rows: [
        ["Vendor name", header.vendorName],
        ["Vendor address", header.vendorAddress],
        ["Email", header.vendorEmail],
        ["Company reg.", header.vendorCompanyReg],
        ["VAT number", header.vendorVatNumber]
      ]
    },
    {
      title: "Order details",
      rows: [
        ["Business unit", header.businessUnit],
        ["Company no.", header.businessUnitCoNo],
        ["VAT no.", header.businessUnitVat],
        ["PO date", header.poDate],
        ["Delivery date", header.deliveryDate],
        ["Reference", header.reference]
      ]
    }
  ]);

  doc.ensureSpace(24);
  doc.canvas.text(MARGIN, doc.cursorY, "Line items", { font: "Helvetica-Bold", size: 13, color: NAVY_DEEP });
  doc.cursorY += 20;

  drawItemsTable(doc, items);
  drawTotals(doc, totals, header.vatRegistered);

  drawPanel(
    doc,
    "Delivery details",
    [
      ["Delivery address", header.deliveryAddress],
      ["For the attention of", header.deliveryAttention],
      ["Delivery email", header.deliveryEmail],
      ["Delivery instructions", header.deliveryInstructions]
    ],
    MARGIN,
    CONTENT_W
  );

  return assemblePdf(
    doc.pages.map(function (p) {
      return { width: p.width, height: p.height, canvas: p.canvas };
    })
  );
}

module.exports = { buildRequisitionPdf };
