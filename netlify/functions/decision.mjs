import { buildRequisitionPdf } from "./_shared/requisition-pdf.cjs";
import { sendPdfEmail } from "./_shared/send-email.cjs";
import { safeFilenamePart } from "./_shared/form-data.mjs";
import { getRequisition, setRequisitionStatus } from "./_shared/requisition-store.mjs";

export const config = { path: "/api/decision" };

var FINANCE_EMAIL = "finance@chpk.co.uk";

function esc(value) {
  return String(value || "").replace(/[&<>]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
  });
}

function money(n) {
  var value = isFinite(n) ? Number(n) : 0;
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function page(status, title, bodyHtml) {
  var html =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(title) + "</title>" +
    "<style>" +
    "body{font-family:Arial,Helvetica,sans-serif;background:#F6F4EF;color:#1E2433;" +
    "display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;}" +
    ".card{background:#fff;border:1px solid #DFDBD0;border-radius:8px;padding:32px;max-width:480px;width:100%;box-shadow:0 6px 20px rgba(30,36,51,0.08);}" +
    "h1{font-size:19px;margin:0 0 12px;color:#142338;}" +
    "p{color:#4B5163;line-height:1.5;margin:0 0 8px;}" +
    "table{border-collapse:collapse;font-size:13.5px;margin-top:12px;}" +
    "td{padding:3px 12px 3px 0;}" +
    "td:first-child{color:#7B8194;}" +
    "textarea{width:100%;min-height:100px;padding:10px;border:1px solid #C7C2B4;border-radius:4px;" +
    "font-family:inherit;font-size:14px;box-sizing:border-box;margin-top:8px;}" +
    "label{display:block;font-size:13px;font-weight:600;color:#4B5163;margin-top:16px;}" +
    "button{background:#9A3B32;color:#fff;border:none;padding:10px 20px;border-radius:4px;" +
    "font-size:14px;font-weight:600;cursor:pointer;margin-top:14px;}" +
    "</style></head><body><div class=\"card\">" + bodyHtml + "</div></body></html>";
  return new Response(html, { status: status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function summaryTable(header, totals) {
  return (
    "<table>" +
    "<tr><td>PO number</td><td>" + esc(header.poNumber || "—") + "</td></tr>" +
    "<tr><td>Vendor</td><td>" + esc(header.vendorName || "—") + "</td></tr>" +
    "<tr><td>Total</td><td><strong>" + money(totals.total) + "</strong></td></tr>" +
    "</table>"
  );
}

function pdfFilename(header) {
  var poPart = safeFilenamePart(header.poNumber, "PO");
  return "requisition-" + poPart + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".pdf";
}

async function sendFinanceApprovalEmail(record) {
  var header = record.data.header || {};
  var pdfBuffer = buildRequisitionPdf(record.data);
  var fromHeader = (header.requesterName || "Requisition") + " <" + header.requesterEmail + ">";

  await sendPdfEmail({
    to: FINANCE_EMAIL,
    from: fromHeader,
    replyTo: header.requesterEmail,
    subject:
      "Approved purchase order requisition" +
      (header.vendorName ? " — " + header.vendorName : "") +
      (header.poNumber ? " (" + header.poNumber + ")" : ""),
    html:
      "<div style=\"font-family: Arial, sans-serif; font-size: 14px; color: #1E2433;\">" +
      "<h2 style=\"margin: 0 0 12px;\">Approved purchase order requisition</h2>" +
      "<p style=\"margin: 0 0 16px; color: #4B5163;\">" +
      esc(header.approverEmail || "The line manager") +
      " approved this requisition. The full form is attached as a PDF.</p>" +
      summaryTable(header, record.data.totals || {}) +
      "</div>",
    pdfBuffer: pdfBuffer,
    filename: pdfFilename(header)
  });
}

async function sendDenyEmails(record, reason) {
  var header = record.data.header || {};
  var pdfBuffer = buildRequisitionPdf(record.data);
  var fromHeader = (header.requesterName || "Requisition") + " <" + header.requesterEmail + ">";

  await sendPdfEmail({
    to: header.requesterEmail,
    from: fromHeader,
    replyTo: header.requesterEmail,
    subject:
      "Denied: purchase order requisition" +
      (header.vendorName ? " — " + header.vendorName : "") +
      (header.poNumber ? " (" + header.poNumber + ")" : ""),
    html:
      "<div style=\"font-family: Arial, sans-serif; font-size: 14px; color: #1E2433;\">" +
      "<h2 style=\"margin: 0 0 12px; color: #9A3B32;\">Purchase order requisition denied</h2>" +
      "<p style=\"margin: 0 0 12px; color: #4B5163;\">" +
      esc(header.approverEmail || "The line manager") +
      " denied this requisition.</p>" +
      "<p style=\"margin: 0 0 16px;\"><strong>Reason:</strong> " + esc(reason || "—") + "</p>" +
      summaryTable(header, record.data.totals || {}) +
      "</div>",
    pdfBuffer: pdfBuffer,
    filename: pdfFilename(header)
  });
}

async function handleDecision(req) {
  var url = new URL(req.url);
  var id = url.searchParams.get("id") || "";
  var token = url.searchParams.get("token") || "";
  var action = url.searchParams.get("action") || "";
  var reason = "";

  if (req.method === "POST") {
    var form = await req.formData();
    id = (form.get("id") || id).toString();
    token = (form.get("token") || token).toString();
    reason = (form.get("reason") || "").toString().trim();
    action = "deny-submit";
  } else if (req.method !== "GET") {
    return page(405, "Requisition", "<h1>Method not allowed</h1>");
  }

  if (!id || !token) {
    return page(400, "Requisition", "<h1>Missing information</h1><p>This link is missing required information.</p>");
  }

  var record;
  try {
    record = await getRequisition(id);
  } catch (err) {
    return page(500, "Requisition", "<h1>Something went wrong</h1><p>Could not look up this requisition.</p>");
  }

  if (!record || record.token !== token) {
    return page(404, "Requisition", "<h1>Not found</h1><p>This approval link is invalid or has expired.</p>");
  }

  var header = record.data.header || {};

  if (record.status !== "pending") {
    return page(
      200,
      "Requisition",
      "<h1>Already " + esc(record.status) + "</h1>" +
      "<p>This requisition was already " + esc(record.status) +
      (record.decidedAt ? " on " + esc(new Date(record.decidedAt).toLocaleString("en-GB")) : "") +
      ". No further action is needed.</p>"
    );
  }

  if (action === "approve") {
    try {
      await sendFinanceApprovalEmail(record);
    } catch (err) {
      return page(502, "Requisition", "<h1>Could not notify finance</h1><p>" + esc(err.message) + "</p>");
    }
    await setRequisitionStatus(id, "approved");
    return page(
      200,
      "Requisition approved",
      "<h1>Requisition approved</h1><p>Thanks — this requisition has been forwarded to " + esc(FINANCE_EMAIL) + ".</p>"
    );
  }

  if (action === "deny") {
    var bodyHtml =
      "<h1>Deny requisition</h1>" +
      "<p>From " + esc(header.requesterName || "—") +
      (header.requesterEmail ? " (" + esc(header.requesterEmail) + ")" : "") +
      " for " + esc(header.vendorName || "—") + ".</p>" +
      summaryTable(header, record.data.totals || {}) +
      "<form method=\"POST\" action=\"/api/decision\">" +
      "<input type=\"hidden\" name=\"id\" value=\"" + esc(id) + "\">" +
      "<input type=\"hidden\" name=\"token\" value=\"" + esc(token) + "\">" +
      "<label for=\"reason\">Reason for denial</label>" +
      "<textarea id=\"reason\" name=\"reason\" placeholder=\"Let the requester know why…\" required></textarea>" +
      "<button type=\"submit\">Confirm deny</button>" +
      "</form>";
    return page(200, "Deny requisition", bodyHtml);
  }

  if (action === "deny-submit") {
    try {
      await sendDenyEmails(record, reason);
    } catch (err) {
      return page(502, "Requisition", "<h1>Could not send the denial email</h1><p>" + esc(err.message) + "</p>");
    }
    await setRequisitionStatus(id, "denied", { denyReason: reason });
    return page(
      200,
      "Requisition denied",
      "<h1>Requisition denied</h1><p>The requester has been notified.</p>"
    );
  }

  return page(400, "Requisition", "<h1>Unknown action</h1><p>This link isn't recognized.</p>");
}

export default async (req) => {
  try {
    return await handleDecision(req);
  } catch (err) {
    return page(500, "Requisition", "<h1>Unexpected error</h1><p>" + esc(err && err.message ? err.message : String(err)) + "</p>");
  }
};
