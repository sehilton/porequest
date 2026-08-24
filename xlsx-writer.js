"use strict";

/**
 * A minimal, dependency-free .xlsx writer.
 *
 * Builds a valid Office Open XML workbook (a ZIP archive of XML parts)
 * using nothing but Node's built-in `zlib` module for compression and
 * CRC32 checksums. No npm packages required.
 *
 * Usage:
 *   const { buildXlsx } = require("./xlsx-writer");
 *   const buffer = buildXlsx({
 *     sheetName: "Requisition",
 *     rows: [ ["Header A", "Header B"], ["value 1", 42] ]
 *   });
 *   fs.writeFileSync("out.xlsx", buffer);
 */

const zlib = require("node:zlib");

/* --------------------------------------------------------------------
   ZIP container (store both compressed + uncompressed entries; here we
   always deflate, which every spreadsheet application accepts).
   -------------------------------------------------------------------- */

function crc32(buffer) {
  return zlib.crc32(buffer) >>> 0;
}

function dosDateTime(date) {
  var d = date || new Date();
  var dosTime =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  var dosDate =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { dosTime: dosTime & 0xffff, dosDate: dosDate & 0xffff };
}

function buildZip(files) {
  // files: [{ name: "path/in/zip.xml", data: Buffer }]
  var localParts = [];
  var centralParts = [];
  var offset = 0;
  var when = dosDateTime(new Date());

  files.forEach(function (file) {
    var nameBuf = Buffer.from(file.name, "utf8");
    var dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    var compressed = zlib.deflateRawSync(dataBuf, { level: 9 });
    var crc = crc32(dataBuf);

    var localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // method = deflate
    localHeader.writeUInt16LE(when.dosTime, 10);
    localHeader.writeUInt16LE(when.dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    var localEntry = Buffer.concat([localHeader, nameBuf, compressed]);
    localParts.push(localEntry);

    var centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // method = deflate
    centralHeader.writeUInt16LE(when.dosTime, 12);
    centralHeader.writeUInt16LE(when.dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // offset of local header

    centralParts.push(Buffer.concat([centralHeader, nameBuf]));

    offset += localEntry.length;
  });

  var centralDir = Buffer.concat(centralParts);
  var localSection = Buffer.concat(localParts);

  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(files.length, 8); // entries on this disk
  end.writeUInt16LE(files.length, 10); // total entries
  end.writeUInt32LE(centralDir.length, 12); // size of central dir
  end.writeUInt32LE(localSection.length, 16); // offset of central dir
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralDir, end]);
}

/* --------------------------------------------------------------------
   Minimal OOXML spreadsheet parts
   -------------------------------------------------------------------- */

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetter(index) {
  // 0-based column index -> "A", "B", ... "AA", ...
  var letters = "";
  var n = index + 1;
  while (n > 0) {
    var rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellXml(rowIndex, colIndex, value) {
  var ref = columnLetter(colIndex) + rowIndex;
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number" && isFinite(value)) {
    return '<c r="' + ref + '"><v>' + value + "</v></c>";
  }
  // inline string — avoids needing a shared-strings table
  return (
    '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlEscape(value) +
    "</t></is></c>"
  );
}

function sheetXml(rows) {
  var rowsXml = rows
    .map(function (row, r) {
      var cells = row
        .map(function (val, c) {
          return cellXml(r + 1, c, val);
        })
        .join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    "<sheetData>" +
    rowsXml +
    "</sheetData>" +
    "</worksheet>"
  );
}

var CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

var ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

var WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

var STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

function workbookXml(sheetName) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" +
    '<sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/>' +
    "</sheets>" +
    "</workbook>"
  );
}

/**
 * Build a single-sheet .xlsx workbook from a 2D array of rows.
 * @param {{sheetName?: string, rows: Array<Array<string|number>>}} options
 * @returns {Buffer}
 */
function buildXlsx(options) {
  var sheetName = (options && options.sheetName) || "Sheet1";
  var rows = (options && options.rows) || [];

  var files = [
    { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
    { name: "_rels/.rels", data: ROOT_RELS_XML },
    { name: "xl/workbook.xml", data: workbookXml(sheetName) },
    { name: "xl/_rels/workbook.xml.rels", data: WORKBOOK_RELS_XML },
    { name: "xl/styles.xml", data: STYLES_XML },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows) }
  ];

  return buildZip(files);
}

module.exports = { buildXlsx };
