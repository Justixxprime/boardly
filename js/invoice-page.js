/* ==========================================================================
   BOARDLY 2.0: js/invoice-page.js
   --------------------------------------------------------------------------
   Powers invoice.html. Standalone, no dependency on dashboard.js. A
   client opening this link has no Boardly account, same approach as
   proposal-page.js/form.js/request.js.

   "Pay now" calls create-invoice-payment, which asks Paystack for a
   real hosted checkout and redirects there. Nothing here marks the
   invoice paid itself, that only happens inside invoice-payment-webhook
   once Paystack's own signed webhook confirms the charge. See
   schema_v63_invoice_payments.sql for the pending/confirmed state
   machine behind this.
   ========================================================================== */

const INVOICE_PARAMS = new URLSearchParams(location.search);
const INVOICE_TOKEN = INVOICE_PARAMS.get("i") || "";

const INVOICE_STATUS_LABEL = {
  sent: "Sent", viewed: "Viewed", partially_paid: "Partially paid",
  paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", refunded: "Refunded",
};
const INVOICE_STATUS_COLOR = {
  sent: "var(--info)", viewed: "var(--violet)", partially_paid: "var(--warning)",
  paid: "var(--secondary)", overdue: "var(--critical)", cancelled: "var(--ink-faint)", refunded: "var(--ink-soft)",
};

function invoiceShow(id) {
  ["invoice-loading", "invoice-notfound", "invoice-wrap"].forEach((x) =>
    document.getElementById(x).classList.toggle("hidden", x !== id)
  );
}

function escapeInvoiceHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatInvoiceMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!INVOICE_TOKEN) { invoiceShow("invoice-notfound"); return; }

  fetch(`${SUPABASE_URL}/functions/v1/get-invoice-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: INVOICE_TOKEN }),
  })
    .then((res) => res.json().then((result) => ({ ok: res.ok, result })))
    .then(({ ok, result }) => {
      if (!ok || !result) { invoiceShow("invoice-notfound"); return; }
      renderInvoice(result);
      invoiceShow("invoice-wrap");
    })
    .catch(() => invoiceShow("invoice-notfound"));

  document.getElementById("invoice-pay-btn")?.addEventListener("click", startInvoicePayment);
});

async function startInvoicePayment() {
  const email = document.getElementById("invoice-payer-email").value.trim();
  const errorEl = document.getElementById("invoice-pay-error");
  errorEl.classList.add("hidden");
  if (!email || !email.includes("@")) {
    errorEl.textContent = "Enter a valid email to continue.";
    errorEl.classList.remove("hidden");
    return;
  }
  const btn = document.getElementById("invoice-pay-btn");
  btn.disabled = true;
  btn.textContent = "Starting checkout...";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: INVOICE_TOKEN, payerEmail: email, origin: location.origin }),
    });
    const result = await res.json();
    if (!res.ok || !result.authorizationUrl) {
      errorEl.textContent = result.error || "Couldn't start this payment. Please try again.";
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Pay now";
      return;
    }
    location.href = result.authorizationUrl;
  } catch {
    errorEl.textContent = "Couldn't reach the payment service. Please try again.";
    errorEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Pay now";
  }
}

function renderInvoice(inv) {
  document.getElementById("invoice-title").textContent = inv.title || "Invoice";
  if (inv.fromName) document.getElementById("invoice-from").textContent = `From ${inv.fromName}`;

  const badge = document.getElementById("invoice-status-badge");
  badge.textContent = INVOICE_STATUS_LABEL[inv.status] || inv.status;
  badge.style.color = INVOICE_STATUS_COLOR[inv.status] || "var(--ink-soft)";
  badge.style.background = "color-mix(in srgb, " + (INVOICE_STATUS_COLOR[inv.status] || "var(--ink-soft)") + " 14%, transparent)";

  if (inv.clientName) {
    const el = document.getElementById("invoice-client");
    el.textContent = `Billed to ${inv.clientName}`;
    el.classList.remove("hidden");
  }
  if (inv.issueDate || inv.dueDate) {
    document.getElementById("invoice-dates").classList.remove("hidden");
    if (inv.issueDate) document.getElementById("invoice-issue-date").textContent = `Issued ${new Date(inv.issueDate).toLocaleDateString()}`;
    if (inv.dueDate) document.getElementById("invoice-due-date").textContent = `Due ${new Date(inv.dueDate).toLocaleDateString()}`;
  }
  if (inv.notes) {
    const el = document.getElementById("invoice-notes");
    el.textContent = inv.notes;
    el.classList.remove("hidden");
  }

  const items = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  let grandTotal = 0;
  document.getElementById("invoice-items").innerHTML = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const lineTotal = qty * price;
    grandTotal += lineTotal;
    return `<tr class="border-b border-line last:border-0">
      <td class="py-2">${escapeInvoiceHTML(item.description)}</td>
      <td class="py-2 text-right">${qty}</td>
      <td class="py-2 text-right">${formatInvoiceMoney(price, inv.currency)}</td>
      <td class="py-2 text-right font-medium">${formatInvoiceMoney(lineTotal, inv.currency)}</td>
    </tr>`;
  }).join("");
  document.getElementById("invoice-grand-total").textContent = formatInvoiceMoney(grandTotal, inv.currency);

  const amountPaid = Number(inv.amountPaid) || 0;
  if (amountPaid > 0) {
    document.getElementById("invoice-paid-row").classList.remove("hidden");
    document.getElementById("invoice-amount-paid").textContent = formatInvoiceMoney(amountPaid, inv.currency);
    document.getElementById("invoice-balance-row").classList.remove("hidden");
    document.getElementById("invoice-balance-due").textContent = formatInvoiceMoney(Math.max(grandTotal - amountPaid, 0), inv.currency);
  }

  if (inv.payable) {
    document.getElementById("invoice-pay-box").classList.remove("hidden");
  }
}
