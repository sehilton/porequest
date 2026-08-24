import { getStore } from "@netlify/blobs";
import { jsonResponse } from "./_shared/form-data.mjs";

export const config = { path: "/api/submit" };

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

  var header = data.header || {};
  var items = Array.isArray(data.items) ? data.items : [];
  var totals = data.totals || {};
  var createdAt = new Date().toISOString();

  // Base36 timestamp keeps ids roughly sortable (newest last) without
  // needing a separate auto-increment counter.
  var id = "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  var record = { id: id, createdAt: createdAt, header: header, items: items, totals: totals };

  try {
    var store = getStore("requisitions");
    await store.setJSON(id, record, {
      metadata: {
        createdAt: createdAt,
        poNumber: header.poNumber || "",
        vendorName: header.vendorName || "",
        businessUnit: header.businessUnit || "",
        reference: header.reference || "",
        total: totals.total || 0
      }
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not save the requisition: " + err.message });
  }

  return jsonResponse(200, { ok: true, id: id });
};
