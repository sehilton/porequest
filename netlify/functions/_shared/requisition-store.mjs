import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

/**
 * Persists requisitions that are waiting on (or have received) a line
 * manager's approve/deny decision, so the /api/decision links clicked from
 * the approval email can look the submission back up. Backed by the same
 * Netlify Blobs "requisitions" store that /api/submissions already reads
 * (previously unused — nothing wrote to it until now).
 */

function store() {
  return getStore("requisitions");
}

function newId() {
  return Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function metadataFor(record) {
  var header = (record.data && record.data.header) || {};
  var totals = (record.data && record.data.totals) || {};
  return {
    createdAt: record.createdAt,
    status: record.status,
    poNumber: header.poNumber || "",
    requesterName: header.requesterName || "",
    requesterEmail: header.requesterEmail || "",
    approverEmail: header.approverEmail || "",
    vendorName: header.vendorName || "",
    businessUnit: header.businessUnit || "",
    reference: header.reference || "",
    total: totals.total || 0
  };
}

export async function createRequisition(data) {
  var record = {
    id: newId(),
    token: newToken(),
    status: "pending",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    denyReason: "",
    data: data
  };

  await store().setJSON(record.id, record, { metadata: metadataFor(record) });
  return record;
}

export async function getRequisition(id) {
  return store().get(id, { type: "json" });
}

export async function setRequisitionStatus(id, status, extra) {
  var record = await getRequisition(id);
  if (!record) return null;

  var updated = Object.assign({}, record, extra || {}, {
    status: status,
    decidedAt: new Date().toISOString()
  });

  await store().setJSON(id, updated, { metadata: metadataFor(updated) });
  return updated;
}
