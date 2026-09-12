/* ==========================================================================
   BOARDLY - js/booking-status.js
   --------------------------------------------------------------------------
   Powers booking-status.html - the page a client lands on after paying
   through Paystack's hosted checkout (the callback_url
   marketplace-create-booking sets), and can return to any time using
   the same link. Same standalone-page approach as marketplace-public.js:
   no dependency on dashboard.js, since a paying client has no Boardly
   account at all.

   Needs marketplace-booking-status (to check status) and
   marketplace-release-payment (the actual escrow release) - see those
   two Edge Functions' own header comments for the full trust model
   (the id + access_token pair in this page's own URL is the client's
   only proof this booking is theirs).
   ========================================================================== */

const bsParams = new URLSearchParams(location.search);
const BS_BOOKING_ID = bsParams.get("id") || "";
const BS_ACCESS_TOKEN = bsParams.get("token") || "";

let bsPollTimer = null;

function bsShow(id) {
  ["bs-loading", "bs-notfound", "bs-card"].forEach((x) => document.getElementById(x).classList.toggle("hidden", x !== id));
}

function bsShowStatusSection(id) {
  ["bs-status-pending", "bs-status-paid", "bs-dispute-form", "bs-status-disputed", "bs-status-dispute-resolved", "bs-status-released", "bs-status-other"].forEach((x) =>
    document.getElementById(x).classList.toggle("hidden", x !== id)
  );
}

async function bsFetchStatus() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-booking-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId: BS_BOOKING_ID, accessToken: BS_ACCESS_TOKEN }),
  });
  if (!res.ok) return null;
  return res.json();
}

function bsFormatTimelineEntry(label, iso) {
  if (!iso) return "";
  return `<p>${label}: ${new Date(iso).toLocaleString()}</p>`;
}

function bsRenderCard(booking) {
  document.getElementById("bs-provider-line").textContent = `Booking with ${booking.providerDisplayName}`;
  document.getElementById("bs-description").textContent = booking.description;
  document.getElementById("bs-amount").textContent = `₦${Number(booking.amount).toLocaleString()}`;

  if (booking.status === "pending_payment") {
    bsShowStatusSection("bs-status-pending");
    if (!bsPollTimer) bsPollTimer = setInterval(bsRefresh, 3000);
    return;
  }
  if (bsPollTimer) { clearInterval(bsPollTimer); bsPollTimer = null; }

  if (booking.status === "paid_held" && booking.disputeStatus === "opened") {
    document.getElementById("bs-dispute-reason-display").textContent = booking.disputeReason || "";
    document.getElementById("bs-dispute-timeline").innerHTML = [
      bsFormatTimelineEntry("Booked", booking.createdAt),
      bsFormatTimelineEntry("Paid", booking.paidAt),
      bsFormatTimelineEntry(booking.disputedBy === "provider" ? "Disputed by provider" : "Disputed by you", booking.disputedAt),
    ].join("");
    bsShowStatusSection("bs-status-disputed");
  } else if (booking.status === "paid_held" && booking.disputeStatus === "resolved") {
    document.getElementById("bs-dispute-resolution-display").textContent = booking.disputeResolution || "";
    bsShowStatusSection("bs-status-dispute-resolved");
  } else if (booking.status === "paid_held") {
    bsShowStatusSection("bs-status-paid");
  } else if (booking.status === "released") {
    bsShowStatusSection("bs-status-released");
  } else {
    const text = booking.status === "refunded" ? "This booking was refunded." : "This booking was cancelled.";
    document.getElementById("bs-status-other-text").textContent = text;
    bsShowStatusSection("bs-status-other");
  }
}

async function bsRefresh() {
  const booking = await bsFetchStatus();
  if (!booking || booking.error) { bsShow("bs-notfound"); return; }
  bsShow("bs-card");
  bsRenderCard(booking);
}

async function bsReleasePayment() {
  const btn = document.getElementById("bs-release-btn");
  const errorEl = document.getElementById("bs-release-error");
  errorEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Releasing payment…";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-release-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: BS_BOOKING_ID, accessToken: BS_ACCESS_TOKEN }),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) {
      errorEl.textContent = result.error || "Couldn't release payment - try again in a moment.";
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Confirm the work is done & release payment";
      return;
    }
    toast("Payment released", "ok");
    bsShowStatusSection("bs-status-released");
  } catch {
    errorEl.textContent = "Couldn't reach the release function - is it deployed?";
    errorEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Confirm the work is done & release payment";
  }
}

document.getElementById("bs-release-btn")?.addEventListener("click", bsReleasePayment);

document.getElementById("bs-open-dispute-link-btn")?.addEventListener("click", () => {
  document.getElementById("bs-dispute-reason").value = "";
  document.getElementById("bs-dispute-error").classList.add("hidden");
  bsShowStatusSection("bs-dispute-form");
});
document.getElementById("bs-dispute-cancel-btn")?.addEventListener("click", () => bsShowStatusSection("bs-status-paid"));
document.getElementById("bs-dispute-submit-btn")?.addEventListener("click", async () => {
  const reason = document.getElementById("bs-dispute-reason").value.trim();
  const errorEl = document.getElementById("bs-dispute-error");
  errorEl.classList.add("hidden");
  if (!reason) { errorEl.textContent = "Describe what's wrong first."; errorEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("bs-dispute-submit-btn");
  btn.disabled = true;
  btn.textContent = "Filing...";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-file-dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: BS_BOOKING_ID, accessToken: BS_ACCESS_TOKEN, reason }),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) {
      errorEl.textContent = result.error || "Couldn't file the dispute, try again.";
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "File dispute";
      return;
    }
    toast("Dispute filed", "ok");
    bsRefresh();
  } catch {
    errorEl.textContent = "Couldn't reach the dispute service, try again.";
    errorEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "File dispute";
  }
});

if (!BS_BOOKING_ID || !BS_ACCESS_TOKEN) {
  bsShow("bs-notfound");
} else {
  bsRefresh();
}
