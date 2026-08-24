"use strict";

export function safeFilenamePart(value, fallback) {
  var text = (value || fallback || "").toString().trim();
  if (!text) return fallback;
  return text.replace(/[^a-z0-9\-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || fallback;
}

export function formDataToRows(data) {
  var header = data.header || {};
  var items = Array.isArray(data.items) ? data.items : [];
  var totals = data.totals || {};

  var rows = [];
  rows.push(["PURCHASE ORDER REQUISITION FORM"]);
  rows.push([]);
  rows.push(["PO number", header.poNumber || "", "", "VAT registered?", header.vatRegistered || ""]);
  rows.push([]);
  rows.push(["Vendor name", header.vendorName || ""]);
  rows.push(["Vendor address", header.vendorAddress || ""]);
  rows.push(["Vendor email", header.vendorEmail || ""]);
  rows.push(["Vendor company reg.", header.vendorCompanyReg || "", "Vendor VAT no.", header.vendorVatNumber || ""]);
  rows.push([]);
  rows.push(["Business unit", header.businessUnit || ""]);
  rows.push(["Company no.", header.businessUnitCoNo || "", "VAT no.", header.businessUnitVat || ""]);
  rows.push(["PO date", header.poDate || "", "Delivery date", header.deliveryDate || ""]);
  rows.push(["Reference", header.reference || ""]);
  rows.push([]);
  rows.push([
    "Description", "Cost type", "Recovery from client", "Details of recovery",
    "Reason for non recovery", "Quantity", "Unit price", "Net", "VAT"
  ]);

  items.forEach(function (item) {
    rows.push([
      item.description || "",
      item.costType || "",
      item.recovery || "",
      item.recoveryDetails || "",
      item.reason || "",
      item.qty || 0,
      item.unitPrice || 0,
      item.net || 0,
      item.vat || 0
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Subtotal", totals.subtotal || 0]);
  rows.push(["", "", "", "", "", "", "Delivery cost", totals.deliveryCost || 0]);
  rows.push(["", "", "", "", "", "", "VAT", totals.vatTotal || 0]);
  rows.push(["", "", "", "", "", "", "Total", totals.total || 0]);
  rows.push([]);

  rows.push(["Delivery address", header.deliveryAddress || ""]);
  rows.push(["For the attention of", header.deliveryAttention || ""]);
  rows.push(["Delivery email", header.deliveryEmail || ""]);
  rows.push(["Delivery instructions", header.deliveryInstructions || ""]);

  return rows;
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
