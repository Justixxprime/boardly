/* ==========================================================================
   BOARDLY - js/proposal-page.js
   --------------------------------------------------------------------------
   Powers proposal.html. Standalone, no dependency on dashboard.js - a
   prospective client opening this link has no Boardly account, same
   approach as form.js and request.js.
   ========================================================================== */

const PROPOSAL_PARAMS = new URLSearchParams(location.search);
const PROPOSAL_TOKEN = PROPOSAL_PARAMS.get("p") || "";

function proposalShow(id) {
  ["proposal-loading", "proposal-notfound", "proposal-wrap"].forEach((x) =>
    document.getElementById(x).classList.toggle("hidden", x !== id)
  );
}

function escapeProposalHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN" }).format(amount || 0);
  } catch {
    // An unrecognized currency code falls back to a plain number rather
    // than throwing and blanking the whole page over a formatting quirk.
    return `${currency || ""} ${(amount || 0).toFixed(2)}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!PROPOSAL_TOKEN) { proposalShow("proposal-notfound"); return; }

  fetch(`${SUPABASE_URL}/functions/v1/get-proposal-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: PROPOSAL_TOKEN }),
  })
    .then((res) => res.json().then((result) => ({ ok: res.ok, result })))
    .then(({ ok, result }) => {
      if (!ok || !result) { proposalShow("proposal-notfound"); return; }
      renderProposal(result);
      proposalShow("proposal-wrap");
    })
    .catch(() => proposalShow("proposal-notfound"));
});

function renderProposal(p) {
  document.getElementById("proposal-title").textContent = p.title || "Proposal";
  if (p.fromName) document.getElementById("proposal-from").textContent = `From ${p.fromName}`;
  if (p.clientName) {
    const el = document.getElementById("proposal-client");
    el.textContent = `Prepared for ${p.clientName}`;
    el.classList.remove("hidden");
  }
  if (p.introText) {
    const el = document.getElementById("proposal-intro");
    el.textContent = p.introText;
    el.classList.remove("hidden");
  }

  const items = Array.isArray(p.lineItems) ? p.lineItems : [];
  let grandTotal = 0;
  document.getElementById("proposal-items").innerHTML = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const lineTotal = qty * price;
    grandTotal += lineTotal;
    return `<tr class="border-b border-line last:border-0">
      <td class="py-2">${escapeProposalHTML(item.description)}</td>
      <td class="py-2 text-right">${qty}</td>
      <td class="py-2 text-right">${formatMoney(price, p.currency)}</td>
      <td class="py-2 text-right font-medium">${formatMoney(lineTotal, p.currency)}</td>
    </tr>`;
  }).join("");
  document.getElementById("proposal-grand-total").textContent = formatMoney(grandTotal, p.currency);

  const actions = document.getElementById("proposal-actions");
  const note = document.getElementById("proposal-responded-note");
  if (p.status === "accepted" || p.status === "declined") {
    actions.classList.add("hidden");
    note.textContent = p.status === "accepted"
      ? "You accepted this proposal" + (p.respondedAt ? ` on ${new Date(p.respondedAt).toLocaleDateString()}.` : ".")
      : "You declined this proposal" + (p.respondedAt ? ` on ${new Date(p.respondedAt).toLocaleDateString()}.` : ".");
    note.classList.remove("hidden");
    return;
  }

  document.getElementById("proposal-accept-btn").addEventListener("click", () => respondToProposal("accepted"));
  document.getElementById("proposal-decline-btn").addEventListener("click", () => respondToProposal("declined"));
}

async function respondToProposal(decision) {
  const acceptBtn = document.getElementById("proposal-accept-btn");
  const declineBtn = document.getElementById("proposal-decline-btn");
  if (decision === "declined" && !confirm("Decline this proposal? This can't be undone from this page.")) return;

  acceptBtn.disabled = true;
  declineBtn.disabled = true;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/respond-to-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: PROPOSAL_TOKEN, decision }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast(result.error || "Couldn't send your response - please try again", "error");
      acceptBtn.disabled = false;
      declineBtn.disabled = false;
      return;
    }
    document.getElementById("proposal-actions").classList.add("hidden");
    const note = document.getElementById("proposal-responded-note");
    note.textContent = decision === "accepted" ? "You accepted this proposal." : "You declined this proposal.";
    note.classList.remove("hidden");
  } catch {
    toast("Couldn't reach Boardly - check your connection and try again", "error");
    acceptBtn.disabled = false;
    declineBtn.disabled = false;
  }
}
