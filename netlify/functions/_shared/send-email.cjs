"use strict";

var RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Send an email (optionally with a PDF attachment) via Resend
 * (https://resend.com).
 *
 * Requires the RESEND_API_KEY environment variable to be set in the
 * Netlify site's environment variables. The "from" address must be on a
 * domain verified in the Resend account (or Resend's own sandbox domain,
 * which only delivers to the account owner's own address — fine for
 * testing, not for sending to finance@chpk.co.uk in production). Callers
 * that pass a requester's own address as `from` (so it shows as the
 * sender) need that requester's domain verified in Resend too — for CHPK
 * staff this is the same chpk.co.uk domain finance@chpk.co.uk already
 * lives on.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to
 * @param {string} [opts.from] Defaults to REQUISITION_FROM_EMAIL / Resend's sandbox address.
 * @param {string} [opts.replyTo]
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {Buffer} [opts.pdfBuffer]
 * @param {string} [opts.filename]
 * @returns {Promise<object>} the Resend API response body
 */
async function sendPdfEmail(opts) {
  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it under Site configuration → " +
      "Environment variables in the Netlify UI, then redeploy."
    );
  }

  var fromAddress = opts.from || process.env.REQUISITION_FROM_EMAIL || "onboarding@resend.dev";
  var toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  var payload = {
    from: fromAddress,
    to: toList,
    subject: opts.subject,
    html: opts.html
  };

  if (opts.replyTo) {
    payload.reply_to = opts.replyTo;
  }

  if (opts.pdfBuffer) {
    payload.attachments = [
      {
        filename: opts.filename,
        content: opts.pdfBuffer.toString("base64")
      }
    ];
  }

  var response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error("Resend API error (" + response.status + "): " + errorText);
  }

  return response.json();
}

module.exports = { sendPdfEmail: sendPdfEmail };
