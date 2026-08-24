import { getStore } from "@netlify/blobs";
import { jsonResponse } from "./_shared/form-data.mjs";

export const config = { path: "/api/submissions" };

export default async (req) => {
  if (req.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  try {
    var store = getStore("requisitions");
    var listing = await store.list();
    var blobs = listing.blobs || [];

    // Ids start with a base36 timestamp, so a plain string sort puts the
    // most recent submissions first.
    var sorted = blobs.slice().sort(function (a, b) {
      return a.key < b.key ? 1 : -1;
    });
    var top = sorted.slice(0, 50);

    var summaries = await Promise.all(
      top.map(async function (blob) {
        var withMeta = await store.getMetadata(blob.key);
        var meta = (withMeta && withMeta.metadata) || {};
        return {
          id: blob.key,
          createdAt: meta.createdAt || null,
          poNumber: meta.poNumber || "",
          vendorName: meta.vendorName || "",
          businessUnit: meta.businessUnit || "",
          reference: meta.reference || "",
          total: meta.total || 0
        };
      })
    );

    return jsonResponse(200, { ok: true, requisitions: summaries });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not list requisitions: " + err.message });
  }
};
