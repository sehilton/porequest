(function () {
  "use strict";

  var VAT_RATE = 0.20;

  /* ---------------------------------------------------------------
     Reference data, carried over from the source spreadsheet
     --------------------------------------------------------------- */

  var BUSINESS_UNITS = [
    { name: "CHPK LIMITED", coNo: "04861621", vat: "832725431" },
    { name: "CHPK FIRE ENGINEERING LIMITED", coNo: "12636033", vat: "361126820" },
    { name: "ACT BUILDING CONTROL LIMITED", coNo: "05639166", vat: "901449249" },
    { name: "CHPK SERVICE ENGINEERING LIMITED", coNo: "14541034", vat: "433099005" },
    { name: "CHPK FA\u00c7ADE DESIGN LTD", coNo: "15758369", vat: "471139204" }
  ];

  var COST_TYPES = [
    "Client Advisor BR", "Closing work in progress", "Consultancy", "Consulting",
    "Contract Administration", "Corporation Tax (Current year)", "Cost Consultancy",
    "Cost of Goods Sold", "Deferred tax - timing differences", "Depreciation Expense",
    "Dilapidations", "Direct Bonuses Issued", "Direct costs - Dilapidations",
    "Direct Expenses", "Direct Wages", "Direct wages - Ers NIC",
    "Direct wages - Ers Pension", "Directors' Remuneration", "Dividend",
    "Due Diligence", "Employers Pension Contribution",
    "Entertainment - Staff Entertainment", "Entertainment-100% business",
    "Expert Witness", "Feasibilty Services", "Fire Strategy", "General expenses",
    "Government COVID funding", "Health and Safety", "HRB Registration",
    "Insurance", "Interest Income",
    "Interest on overdue taxation - not financial liabilities", "Interest Paid",
    "IT Software and Consumables", "Legal and professional fees",
    "Light, Power, Heating", "Management charges received",
    "Motor Vehicle Expenses", "Neighborourly Matters", "Office Equipment Rental",
    "Opening work in Progress", "Operating Lease Payments",
    "Other payments to staff", "Other Revenue", "Party Wall - Adjoining Owner",
    "Party Wall - Builder Owner", "Party Wall", "Pensions Costs",
    "Postage, Freight & Courier", "PPM", "PQS", "Principal Designer Advisor BR",
    "Principal Designer BR", "Printing & Stationery", "Professional Services",
    "Professional subscriptions", "Project Management", "Project Monitoring",
    "Rates", "Realised Currency Gains", "Reinstatement Cost Assessment", "Rent",
    "Repairs & Maintenance", "Rights of Light", "Sales - Miscellaneous Expenses",
    "Sales - Subcontractor", "Sales - Travel Expenses", "Schedule of Condition",
    "SMP", "Social security costs", "Space Planning", "Sponsorship",
    "Staff Benefits", "Staff recruitment costs", "Staff Training",
    "Statuary Sick Pay", "Subcontractors", "Subsistence", "Sundry expenses",
    "Telephone & Internet", "Temporary staff", "Travel - Hotels",
    "Travel - International", "Travel - National", "Unrealised Currency Gains",
    "Wages and salaries", "Cost type not listed"
  ];

  /* ---------------------------------------------------------------
     State
     --------------------------------------------------------------- */

  var itemsTableBody = document.getElementById("itemsTableBody");
  var addItemBtn = document.getElementById("addItemBtn");
  var deliveryCostInput = document.getElementById("deliveryCost");
  var submitBtn = document.getElementById("submitBtn");
  var exportBtn = document.getElementById("exportBtn");
  var statusMessage = document.getElementById("statusMessage");

  var rowCounter = 0;

  // Kept in sync by recalculate() so submit/export can reuse the exact
  // numbers already shown on screen, rather than re-deriving them.
  var lastTotals = { subtotal: 0, deliveryCost: 0, vatTotal: 0, total: 0 };

  /* ---------------------------------------------------------------
     Helpers
     --------------------------------------------------------------- */

  function currency(value) {
    var n = isFinite(value) ? value : 0;
    return "\u00a3" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toNumber(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function buildOptions(selectEl, options, placeholder) {
    var html = placeholder ? '<option value="">' + placeholder + "</option>" : "";
    for (var i = 0; i < options.length; i++) {
      html += '<option value="' + options[i].replace(/"/g, "&quot;") + '">' + options[i] + "</option>";
    }
    selectEl.innerHTML = html;
  }

  /* ---------------------------------------------------------------
     Business unit select
     --------------------------------------------------------------- */

  function initBusinessUnitSelect() {
    var select = document.getElementById("businessUnit");
    var names = BUSINESS_UNITS.map(function (u) { return u.name; });
    buildOptions(select, names, "Select business unit\u2026");

    select.addEventListener("change", function () {
      var match = BUSINESS_UNITS.filter(function (u) { return u.name === select.value; })[0];
      document.getElementById("businessUnitCoNo").value = match ? match.coNo : "";
      document.getElementById("businessUnitVat").value = match ? match.vat : "";
    });
  }

  /* ---------------------------------------------------------------
     Line item rows
     --------------------------------------------------------------- */

  function createRow() {
    rowCounter += 1;
    var rowId = "item-" + rowCounter;

    var tr = document.createElement("tr");
    tr.dataset.rowId = rowId;

    tr.innerHTML =
      '<td class="col-desc"><input type="text" class="js-description" placeholder="Item description"></td>' +

      '<td class="col-cost-type"><select class="js-cost-type"></select></td>' +

      '<td class="col-recovery">' +
        '<select class="js-recovery">' +
          '<option value="">\u2013</option>' +
          '<option value="Yes">Yes</option>' +
          '<option value="No" selected>No</option>' +
        "</select>" +
      "</td>" +

      '<td class="col-recovery-details"><input type="text" class="js-recovery-details" placeholder="Optional"></td>' +

      '<td class="col-reason"><input type="text" class="js-reason" placeholder="Optional"></td>' +

      '<td class="col-qty"><input type="number" class="js-qty num-input" min="0" step="1" value="1"></td>' +

      '<td class="col-price"><input type="number" class="js-unit-price num-input" min="0" step="0.01" value="0.00"></td>' +

      '<td class="col-net"><span class="readout js-net">\u00a30.00</span></td>' +

      '<td class="col-vat"><span class="readout js-vat">\u00a30.00</span></td>' +

      '<td class="col-remove"><button type="button" class="remove-row-btn js-remove" title="Remove item">&times;</button></td>';

    itemsTableBody.appendChild(tr);

    var costTypeSelect = tr.querySelector(".js-cost-type");
    buildOptions(costTypeSelect, COST_TYPES, "Select cost type\u2026");

    tr.querySelectorAll(".js-qty, .js-unit-price").forEach(function (input) {
      input.addEventListener("input", recalculate);
    });

    tr.querySelector(".js-remove").addEventListener("click", function () {
      tr.parentNode.removeChild(tr);
      enforceMinimumRow();
      recalculate();
    });

    recalculate();
    return tr;
  }

  function enforceMinimumRow() {
    var removeButtons = itemsTableBody.querySelectorAll(".js-remove");
    var onlyOneLeft = removeButtons.length <= 1;
    removeButtons.forEach(function (btn) {
      btn.disabled = onlyOneLeft;
    });
  }

  /* ---------------------------------------------------------------
     Calculations
     --------------------------------------------------------------- */

  function recalculate() {
    var subtotal = 0;
    var vatTotal = 0;

    var rows = itemsTableBody.querySelectorAll("tr");
    rows.forEach(function (row) {
      var qty = toNumber(row.querySelector(".js-qty").value);
      var unitPrice = toNumber(row.querySelector(".js-unit-price").value);
      var net = qty * unitPrice;
      var vat = net * VAT_RATE;

      row.querySelector(".js-net").textContent = currency(net);
      row.querySelector(".js-vat").textContent = currency(vat);

      subtotal += net;
      vatTotal += vat;
    });

    var deliveryCost = toNumber(deliveryCostInput.value);
    vatTotal += deliveryCost * VAT_RATE;

    var total = subtotal + deliveryCost + vatTotal;

    document.getElementById("totalSubtotal").textContent = currency(subtotal);
    document.getElementById("totalVat").textContent = currency(vatTotal);
    document.getElementById("totalGrand").textContent = currency(total);

    lastTotals = { subtotal: subtotal, deliveryCost: deliveryCost, vatTotal: vatTotal, total: total };

    enforceMinimumRow();
  }

  /* ---------------------------------------------------------------
     Collecting form data (shared by submit + export)
     --------------------------------------------------------------- */

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function collectItems() {
    var items = [];
    itemsTableBody.querySelectorAll("tr").forEach(function (row) {
      var qty = toNumber(row.querySelector(".js-qty").value);
      var unitPrice = toNumber(row.querySelector(".js-unit-price").value);
      items.push({
        description: row.querySelector(".js-description").value.trim(),
        costType: row.querySelector(".js-cost-type").value,
        recovery: row.querySelector(".js-recovery").value,
        recoveryDetails: row.querySelector(".js-recovery-details").value.trim(),
        reason: row.querySelector(".js-reason").value.trim(),
        qty: qty,
        unitPrice: unitPrice,
        net: qty * unitPrice,
        vat: qty * unitPrice * VAT_RATE
      });
    });
    return items;
  }

  function getFormData() {
    return {
      header: {
        poNumber: fieldValue("poNumber"),
        vatRegistered: fieldValue("vatRegistered"),
        vendorName: fieldValue("vendorName"),
        vendorAddress: fieldValue("vendorAddress"),
        vendorEmail: fieldValue("vendorEmail"),
        vendorCompanyReg: fieldValue("vendorCompanyReg"),
        vendorVatNumber: fieldValue("vendorVatNumber"),
        businessUnit: fieldValue("businessUnit"),
        businessUnitCoNo: fieldValue("businessUnitCoNo"),
        businessUnitVat: fieldValue("businessUnitVat"),
        poDate: fieldValue("poDate"),
        deliveryDate: fieldValue("deliveryDate"),
        reference: fieldValue("reference"),
        deliveryAddress: fieldValue("deliveryAddress"),
        deliveryAttention: fieldValue("deliveryAttention"),
        deliveryEmail: fieldValue("deliveryEmail"),
        deliveryInstructions: fieldValue("deliveryInstructions")
      },
      items: collectItems(),
      totals: lastTotals
    };
  }

  /* ---------------------------------------------------------------
     Status banner
     --------------------------------------------------------------- */

  function showStatus(kind, message) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = "status-message status-message--" + kind + " is-visible";
  }

  function showStatusHtml(kind, html) {
    if (!statusMessage) return;
    statusMessage.innerHTML = html;
    statusMessage.className = "status-message status-message--" + kind + " is-visible";
  }

  function setBusy(button, busy, busyLabel, idleLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  /* ---------------------------------------------------------------
     Submit (save to SQLite via the backend)
     --------------------------------------------------------------- */

  function submitForm() {
    var payload = getFormData();
    setBusy(submitBtn, true, "Saving\u2026", "Submit requisition");

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body.ok) {
            throw new Error(body.error || "Could not save the requisition.");
          }
          return body;
        });
      })
      .then(function (body) {
        showStatus("success", "Saved to the database as requisition #" + body.id + ".");
      })
      .catch(function (err) {
        showStatus("error", err.message || "Something went wrong saving the form.");
      })
      .finally(function () {
        setBusy(submitBtn, false, "Saving\u2026", "Submit requisition");
      });
  }

  /* ---------------------------------------------------------------
     Export (write an .xlsx into the server's /uploads folder)
     --------------------------------------------------------------- */

  function exportForm() {
    var payload = getFormData();
    setBusy(exportBtn, true, "Exporting\u2026", "Export to Excel");

    fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body.ok) {
            throw new Error(body.error || "Could not export the spreadsheet.");
          }
          return body;
        });
      })
      .then(function (body) {
        var safeName = body.filename.replace(/</g, "&lt;");
        var link = body.downloadUrl
          ? ' <a href="' + body.downloadUrl + '" target="_blank" rel="noopener">Download it here.</a>'
          : "";
        showStatusHtml("success", "Saved " + safeName + " to storage." + link);
      })
      .catch(function (err) {
        showStatus("error", err.message || "Something went wrong exporting the form.");
      })
      .finally(function () {
        setBusy(exportBtn, false, "Exporting\u2026", "Export to Excel");
      });
  }

  /* ---------------------------------------------------------------
     Init
     --------------------------------------------------------------- */

  function init() {
    initBusinessUnitSelect();
    createRow();

    addItemBtn.addEventListener("click", createRow);
    deliveryCostInput.addEventListener("input", recalculate);

    if (submitBtn) submitBtn.addEventListener("click", submitForm);
    if (exportBtn) exportBtn.addEventListener("click", exportForm);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
