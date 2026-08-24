import { buildRequisitionPdf } from "./_shared/requisition-pdf.cjs";
import { sendPdfEmail } from "./_shared/send-email.cjs";
import { safeFilenamePart, jsonResponse } from "./_shared/form-data.mjs";

export const config = { path: "/api/submit" };

var FINANCE_EMAIL = "finance@chpk.co.uk";

function buildEmailHtml(data) {
  var header = data.header || {};
  var totals = data.totals || {};
  var itemCount = Array.isArray(data.items) ? data.items.length : 0;

  function esc(value) {
    return String(value || "").replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  }

  function money(n) {
    var value = isFinite(n) ? Number(n) : 0;
    return "\u00a3" + value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    "<div style=\"font-family: Arial, sans-serif; font-size: 14px; color: #1E2433;\">" +
    "<h2 style=\"margin: 0 0 12px;\">New purchase order requisition</h2>" +
    "<p style=\"margin: 0 0 16px; color: #4B5163;\">The full form is attached as a PDF. Summary:</p>" +
    "<table style=\"border-collapse: collapse; font-size: 14px;\">" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">PO number</td><td>" + esc(header.poNumber || "\u2014") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Vendor</td><td>" + esc(header.vendorName || "\u2014") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Business unit</td><td>" + esc(header.businessUnit || "\u2014") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Reference</td><td>" + esc(header.reference || "\u2014") + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Line items</td><td>" + itemCount + "</td></tr>" +
    "<tr><td style=\"padding: 4px 12px 4px 0; color: #7B8194;\">Total</td><td><strong>" + money(totals.total) + "</strong></td></tr>" +
    "</table>" +
    "</div>"
  );
}

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

  var pdfBuffer;
  try {
    pdfBuffer = buildRequisitionPdf(data);
  } catch (err) {
    return jsonResponse(500, { ok: false, error: "Could not build the PDF: " + err.message });
  }

  var poPart = safeFilenamePart(header.poNumber, "PO");
  var filename = "requisition-" + poPart + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".pdf";
  var subject =
    "Purchase order requisition" +
    (header.vendorName ? " \u2014 " + header.vendorName : "") +
    (header.poNumber ? " (" + header.poNumber + ")" : "");

  try {
    await sendPdfEmail({
      to: FINANCE_EMAIL,
      subject: subject,
      html: buildEmailHtml(data),
      pdfBuffer: pdfBuffer,
      filename: filename
    });
  } catch (err) {
    return jsonResponse(502, { ok: false, error: err.message });
  }

  return jsonResponse(200, { ok: true, sentTo: FINANCE_EMAIL, filename: filename });
};
