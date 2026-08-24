"use strict";

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "po_requisitions.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    po_number TEXT,
    vat_registered TEXT,
    vendor_name TEXT,
    vendor_address TEXT,
    vendor_email TEXT,
    vendor_company_reg TEXT,
    vendor_vat_number TEXT,
    business_unit TEXT,
    business_unit_co_no TEXT,
    business_unit_vat TEXT,
    po_date TEXT,
    delivery_date TEXT,
    reference TEXT,
    delivery_address TEXT,
    delivery_attention TEXT,
    delivery_email TEXT,
    delivery_instructions TEXT,
    delivery_cost REAL,
    subtotal REAL,
    vat_total REAL,
    total REAL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id INTEGER NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
    description TEXT,
    cost_type TEXT,
    recovery TEXT,
    recovery_details TEXT,
    reason TEXT,
    qty REAL,
    unit_price REAL,
    net REAL,
    vat REAL
  )
`);

const insertRequisitionStmt = db.prepare(`
  INSERT INTO requisitions (
    created_at, po_number, vat_registered,
    vendor_name, vendor_address, vendor_email, vendor_company_reg, vendor_vat_number,
    business_unit, business_unit_co_no, business_unit_vat,
    po_date, delivery_date, reference,
    delivery_address, delivery_attention, delivery_email, delivery_instructions,
    delivery_cost, subtotal, vat_total, total
  ) VALUES (
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  )
`);

const insertLineItemStmt = db.prepare(`
  INSERT INTO line_items (
    requisition_id, description, cost_type, recovery, recovery_details, reason,
    qty, unit_price, net, vat
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listRequisitionsStmt = db.prepare(`
  SELECT id, created_at, po_number, vendor_name, business_unit, reference, total
  FROM requisitions
  ORDER BY id DESC
`);

const getRequisitionStmt = db.prepare(`SELECT * FROM requisitions WHERE id = ?`);
const getLineItemsStmt = db.prepare(`SELECT * FROM line_items WHERE requisition_id = ? ORDER BY id ASC`);

/**
 * Persist a full requisition (header fields + line items) in one transaction.
 * @param {object} data - shape produced by the frontend's getFormData()
 * @returns {number} the new requisition id
 */
function saveRequisition(data) {
  var header = data.header || {};
  var items = Array.isArray(data.items) ? data.items : [];
  var totals = data.totals || {};

  db.exec("BEGIN");
  try {
    var info = insertRequisitionStmt.run(
      new Date().toISOString(),
      header.poNumber || null,
      header.vatRegistered || null,
      header.vendorName || null,
      header.vendorAddress || null,
      header.vendorEmail || null,
      header.vendorCompanyReg || null,
      header.vendorVatNumber || null,
      header.businessUnit || null,
      header.businessUnitCoNo || null,
      header.businessUnitVat || null,
      header.poDate || null,
      header.deliveryDate || null,
      header.reference || null,
      header.deliveryAddress || null,
      header.deliveryAttention || null,
      header.deliveryEmail || null,
      header.deliveryInstructions || null,
      totals.deliveryCost || 0,
      totals.subtotal || 0,
      totals.vatTotal || 0,
      totals.total || 0
    );

    var requisitionId = Number(info.lastInsertRowid);

    items.forEach(function (item) {
      insertLineItemStmt.run(
        requisitionId,
        item.description || null,
        item.costType || null,
        item.recovery || null,
        item.recoveryDetails || null,
        item.reason || null,
        item.qty || 0,
        item.unitPrice || 0,
        item.net || 0,
        item.vat || 0
      );
    });

    db.exec("COMMIT");
    return requisitionId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function listRequisitions() {
  return listRequisitionsStmt.all();
}

function getRequisitionWithItems(id) {
  var requisition = getRequisitionStmt.get(id);
  if (!requisition) return null;
  var items = getLineItemsStmt.all(id);
  return { requisition: requisition, items: items };
}

module.exports = {
  saveRequisition: saveRequisition,
  listRequisitions: listRequisitions,
  getRequisitionWithItems: getRequisitionWithItems
};
