import { getStore } from "@netlify/blobs";
import { buildXlsx } from "./_shared/xlsx-writer.mjs";
import { formDataToRows, safeFilenamePart, jsonResponse } from "./_shared/form-data.mjs";

export const config = { path: "/api/export" };

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let data;
  try {
    data = await req.json();
  } catch (err) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  var rows = formDataToRows(data);
  var buffer = buildXlsx({ sheetName: "Requisition", rows: rows });

  var header = data.header || {};
  var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  var poPart = safeFilenamePart(header.poNumber, "PO");
  var filename = "requisition-" + poPart + "-" + timestamp + ".xlsx";

  try {
    // The "uploads" store is Netlify Blobs' persistent, site-scoped object
    // storage — it survives between requests and deploys, unlike a local
    // folder on a serverless function's filesystem.
    var store = getStore("uploads");
    await store.set(filename, buffer, {
      metadata: {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not save the spreadsheet: " + err.message });
  }

  return jsonResponse(200, {
    ok: true,
    filename: filename,
    downloadUrl: "/api/download/" + encodeURIComponent(filename)
  });
};
