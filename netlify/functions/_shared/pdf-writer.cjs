"use strict";

/**
 * A minimal, dependency-free PDF writer.
 *
 * Builds a valid PDF 1.4 file (objects, xref table, trailer) using nothing
 * but plain JS string/Buffer building — no runtime font-file loading, so
 * it can't hit the "AFM data file not found" failure that libraries like
 * pdfkit run into once bundled for a serverless function. Text is drawn
 * with the two standard, viewer-built-in fonts (Helvetica / Helvetica-
 * Bold), whose character widths are hardcoded below from the Adobe Core 14
 * font metrics — no font file needed at all.
 *
 * Supports Latin-1 (WinAnsiEncoding) text — plain ASCII plus accented
 * Western European characters and the £ sign. Anything outside that range
 * is substituted with "?" rather than corrupting the file.
 */

/* --------------------------------------------------------------------
   Font metrics (Adobe Core 14, units per 1000em), WinAnsiEncoding
   -------------------------------------------------------------------- */

var HELVETICA_WIDTHS = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556,
  118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260,
  125: 334, 126: 584, 163: 556
};

var HELVETICA_BOLD_WIDTHS = {
  32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
  64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
  96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333, 103: 611,
  104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611,
  111: 611, 112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611,
  118: 556, 119: 778, 120: 556, 121: 556, 122: 500, 123: 389, 124: 280,
  125: 389, 126: 584, 163: 556
};

var DEFAULT_WIDTH = { Helvetica: 556, "Helvetica-Bold": 611 };

var FONT_WIDTHS = { Helvetica: HELVETICA_WIDTHS, "Helvetica-Bold": HELVETICA_BOLD_WIDTHS };

function charWidth(code, fontName) {
  var table = FONT_WIDTHS[fontName];
  return (table && table[code]) || DEFAULT_WIDTH[fontName];
}

function textWidth(str, fontName, size) {
  var total = 0;
  for (var i = 0; i < str.length; i++) {
    total += charWidth(str.charCodeAt(i), fontName);
  }
  return (total / 1000) * size;
}

function normalizeText(str) {
  var text = (str === null || str === undefined) ? "" : String(str);
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ");
}

/**
 * Greedy word-wrap a string to fit maxWidth, breaking oversized single
 * words by character as a fallback so nothing silently overflows a cell.
 */
function wrapText(str, fontName, size, maxWidth) {
  var text = normalizeText(str);
  var words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  var lines = [];
  var current = "";

  words.forEach(function (word) {
    var candidate = current ? current + " " + word : word;
    if (textWidth(candidate, fontName, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    if (textWidth(word, fontName, size) <= maxWidth) {
      current = word;
      return;
    }
    // A single word longer than the column — hard-break it by character.
    var chunk = "";
    for (var i = 0; i < word.length; i++) {
      var next = chunk + word[i];
      if (textWidth(next, fontName, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = word[i];
      } else {
        chunk = next;
      }
    }
    current = chunk;
  });

  if (current) lines.push(current);
  return lines;
}

/* --------------------------------------------------------------------
   Low-level PDF byte assembly
   -------------------------------------------------------------------- */

function toWinAnsiBytes(str) {
  var text = normalizeText(str);
  var bytes = Buffer.alloc(text.length);
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f; // "?"
  }
  return bytes;
}

function escapePdfString(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); // \( \) \\
    out.push(b);
  }
  return Buffer.from(out);
}

function hexColor(hex) {
  var clean = hex.replace("#", "");
  var r = parseInt(clean.substring(0, 2), 16) / 255;
  var g = parseInt(clean.substring(2, 4), 16) / 255;
  var b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function num(n) {
  // Trim to a few decimal places to keep the content stream compact.
  return (Math.round(n * 1000) / 1000).toString();
}

/**
 * A single page's content stream, built with a top-left-origin coordinate
 * system (y grows downward) that gets flipped to PDF's bottom-left origin
 * at emit time — easier to lay out a document top-to-bottom this way.
 */
function createPageCanvas(pageWidth, pageHeight) {
  var ops = [];

  function toPdfY(yFromTop) {
    return pageHeight - yFromTop;
  }

  return {
    fillRect: function (x, yTop, w, h, colorHex) {
      var c = hexColor(colorHex);
      var pdfY = toPdfY(yTop) - h;
      ops.push(num(c[0]) + " " + num(c[1]) + " " + num(c[2]) + " rg");
      ops.push(num(x) + " " + num(pdfY) + " " + num(w) + " " + num(h) + " re f");
    },
    strokeRect: function (x, yTop, w, h, colorHex, lineWidth) {
      var c = hexColor(colorHex);
      var pdfY = toPdfY(yTop) - h;
      ops.push(num(c[0]) + " " + num(c[1]) + " " + num(c[2]) + " RG");
      ops.push(num(lineWidth || 0.75) + " w");
      ops.push(num(x) + " " + num(pdfY) + " " + num(w) + " " + num(h) + " re S");
    },
    line: function (x1, y1, x2, y2, colorHex, lineWidth) {
      var c = hexColor(colorHex);
      ops.push(num(c[0]) + " " + num(c[1]) + " " + num(c[2]) + " RG");
      ops.push(num(lineWidth || 0.75) + " w");
      ops.push(num(x1) + " " + num(toPdfY(y1)) + " m " + num(x2) + " " + num(toPdfY(y2)) + " l S");
    },
    // yTop is the top of the text's line box; baseline is derived from size.
    text: function (x, yTop, str, opts) {
      var options = opts || {};
      var fontName = options.font || "Helvetica";
      var fontKey = fontName === "Helvetica-Bold" ? "F2" : "F1";
      var size = options.size || 10;
      var color = hexColor(options.color || "#1E2433");
      var baselineY = toPdfY(yTop) - size * 0.83;

      var bytes = escapePdfString(toWinAnsiBytes(str));
      ops.push(num(color[0]) + " " + num(color[1]) + " " + num(color[2]) + " rg");
      ops.push("BT");
      ops.push("/" + fontKey + " " + num(size) + " Tf");
      ops.push(num(x) + " " + num(baselineY) + " Td");
      ops.push("(" + bytes.toString("latin1") + ") Tj");
      ops.push("ET");
    },
    getContent: function () {
      return Buffer.from(ops.join("\n") + "\n", "latin1");
    }
  };
}

/**
 * Assemble a set of page canvases into a complete PDF file buffer.
 * @param {Array<{width:number,height:number,canvas:object}>} pages
 * @returns {Buffer}
 */
function assemblePdf(pages) {
  var objects = []; // array of Buffer, index 0 unused (objects are 1-based)
  var offsets = [];

  function addObject(content) {
    objects.push(content);
    return objects.length; // new object's id
  }

  var fontRegularId = addObject(
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1"
    )
  );
  var fontBoldId = addObject(
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "latin1"
    )
  );

  var pageIds = [];

  pages.forEach(function (page) {
    var streamBytes = page.canvas.getContent();
    var streamDict =
      "<< /Length " + streamBytes.length + " >>\nstream\n";
    var streamObjBuf = Buffer.concat([
      Buffer.from(streamDict, "latin1"),
      streamBytes,
      Buffer.from("\nendstream", "latin1")
    ]);
    var contentId = addObject(streamObjBuf);

    var pageDict =
      "<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 " +
      num(page.width) +
      " " +
      num(page.height) +
      "] /Resources << /Font << /F1 " +
      fontRegularId +
      " 0 R /F2 " +
      fontBoldId +
      " 0 R >> >> /Contents " +
      contentId +
      " 0 R >>";
    var pageId = addObject(Buffer.from(pageDict, "latin1"));
    pageIds.push(pageId);
  });

  var pagesDict =
    "<< /Type /Pages /Kids [" +
    pageIds.map(function (id) { return id + " 0 R"; }).join(" ") +
    "] /Count " +
    pageIds.length +
    " >>";
  var pagesId = addObject(Buffer.from(pagesDict, "latin1"));

  // Patch the "PAGES_REF" placeholder now that we know the Pages object id.
  objects = objects.map(function (buf, idx) {
    var str = buf.toString("latin1");
    if (str.indexOf("PAGES_REF") !== -1) {
      return Buffer.from(str.replace("PAGES_REF", pagesId + " 0 R"), "latin1");
    }
    return buf;
  });

  var catalogDict = "<< /Type /Catalog /Pages " + pagesId + " 0 R >>";
  var catalogId = addObject(Buffer.from(catalogDict, "latin1"));

  // --- Serialize ---
  var chunks = [];
  var cursor = 0;

  function push(buf) {
    chunks.push(buf);
    cursor += buf.length;
  }

  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"));

  for (var i = 0; i < objects.length; i++) {
    offsets[i + 1] = cursor;
    push(Buffer.from((i + 1) + " 0 obj\n", "latin1"));
    push(objects[i]);
    push(Buffer.from("\nendobj\n", "latin1"));
  }

  var xrefOffset = cursor;
  var xrefLines = ["xref", "0 " + (objects.length + 1), "0000000000 65535 f "];
  for (var j = 1; j <= objects.length; j++) {
    xrefLines.push(String(offsets[j]).padStart(10, "0") + " 00000 n ");
  }
  push(Buffer.from(xrefLines.join("\n") + "\n", "latin1"));

  push(
    Buffer.from(
      "trailer\n<< /Size " +
        (objects.length + 1) +
        " /Root " +
        catalogId +
        " 0 R >>\nstartxref\n" +
        xrefOffset +
        "\n%%EOF",
      "latin1"
    )
  );

  return Buffer.concat(chunks);
}

module.exports = { createPageCanvas, assemblePdf, wrapText, textWidth };
