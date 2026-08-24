import { buildRequisitionPdf } from "./_shared/requisition-pdf.cjs";
import { sendPdfEmail } from "./_shared/send-email.cjs";
import { safeFilenamePart, jsonResponse } from "./_shared/form-data.mjs";
import { createRequisition } from "./_shared/requisition-store.mjs";

export const config = { path: "/api/submit" };

function esc(value) {
  return String(value || "").replace(/[&<>]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
  });
}

function money(n) {
  var value = isFinite(n) ? Number(n) : 0;
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildApproverEmailHtml(data, approveUrl, denyUrl) {
  var header = data.header || {};
  var totals = data.totals || {};
  var itemCount = Array.isArray(data.items) ? data.items.length : 0;

  return (
    "<div style=\"font-family: Arial, sans-serif; font-size: 14px; color: #1E2433;\">" +
    "<h2 style=\"margin: 0 0 12px;\">Approval needed: purchase order requisition</h2>" +
    "<p style=\"margin: 0 0 16px; color: #4B5163;\">" +
    esc(header.requesterName || "A colleague") +
    (header.requesterEmail ? " (" + esc(header.requesterEmail) + ")" : "") +
    " has submitted a purchase order requisition for your approval. The full form is attached as a PDF.</p>" +
    "<table style=\"border-collapse: collapse; font-size: 14px;\">" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Requested by</td><td>" + esc(header.requesterName || "—") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">PO number</td><td>" + esc(header.poNumber || "—") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Vendor</td><td>" + esc(header.vendorName || "—") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Business unit</td><td>" + esc(header.businessUnit || "—") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Reference</td><td>" + esc(header.reference || "—") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Line items</td><td>" + itemCount + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Total</td><td><strong>" + money(totals.total) + "</strong></td></tr>" +
    "</table>" +
    "<div style=\"margin-top: 24px;\">" +
    "<a href=\"" + approveUrl + "\" style=\"display:inline-block;background:#1D3557;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:4px;margin-right:12px;\">Approve</a>" +
    "<a href=\"" + denyUrl + "\" style=\"display:inline-block;background:#9A3B32;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:4px;\">Deny</a>" +
    "</div>" +
    "</div>"
  );
}

async function handleSubmit(req) {
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

  if (!header.requesterName || !header.requesterEmail || !header.approverEmail) {
    return jsonResponse(400, {
      ok: false,
      error: "Your name, your email, and your line manager's email are all required."
    });
  }

  var record;
  try {
    record = await createRequisition(data);
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not save the requisition: " + err.message });
  }

  var pdfBuffer;
  try {
    pdfBuffer = buildRequisitionPdf(data);
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not build the PDF: " + err.message });
  }

  var poPart = safeFilenamePart(header.poNumber, "PO");
  var filename = "requisition-" + poPart + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".pdf";
  var subject =
    "Approval needed: purchase order requisition" +
    (header.vendorName ? " — " + header.vendorName : "") +
    (header.poNumber ? " (" + header.poNumber + ")" : "");

  var origin = new URL(req.url).origin;
  var approveUrl =
    origin + "/api/decision?id=" + encodeURIComponent(record.id) +
    "&token=" + encodeURIComponent(record.token) + "&action=approve";
  var denyUrl =
    origin + "/api/decision?id=" + encodeURIComponent(record.id) +
    "&token=" + encodeURIComponent(record.token) + "&action=deny";

  var fromHeader = (header.requesterName || "Requisition") + " <" + header.requesterEmail + ">";

  try {
    await sendPdfEmail({
      to: header.approverEmail,
      from: fromHeader,
      replyTo: header.requesterEmail,
      subject: subject,
      html: buildApproverEmailHtml(data, approveUrl, denyUrl),
      pdfBuffer: pdfBuffer,
      filename: filename
    });
  } catch (err) {
    return jsonResponse(502, { ok: false, error: err.message });
  }

  return jsonResponse(200, { ok: true, sentTo: header.approverEmail, filename: filename });
}

export default async (req) => {
  try {
    return await handleSubmit(req);
  } catch (err) {
    // Belt-and-braces: any error that slips past the specific try/catches
    // above (e.g. an unexpected exception while building the response)
    // still comes back as JSON, never an empty body the browser can't parse.
    return jsonResponse(500, { ok: false, error: "Unexpected server error: " + (err && err.message ? err.message : String(err)) });
  }
};
