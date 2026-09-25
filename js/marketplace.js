/* ==========================================================================
   BOARDLY - marketplace.js  ("Marketplace" v2 - in-app half)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/marketplace.js"></script>

   Needs schema_v30_marketplace.sql for the Profile/Inquiries tabs (v1 -
   still true, still no Edge Function needed for either of those, see
   that migration's own comment for why). v2 adds Payouts and Bookings,
   which DO need schema_v33_marketplace_payments.sql plus three Edge
   Functions (marketplace-setup-payout, marketplace-create-booking,
   marketplace-payment-webhook, marketplace-release-payment,
   marketplace-booking-status - see MARKETPLACE_PAYMENTS_SETUP.md). The
   Payouts tab is the only one that needs an Edge Function from THIS
   file's side - it's the one place PAYSTACK_SECRET_KEY gets used to
   verify a bank account and set up payouts; the Bookings tab below just
   reads the same table every other read in this project reads,
   straight through RLS.

   The public half - the directory itself, the contact form, and now
   the actual booking + payment request - lives in marketplace.html +
   js/marketplace-public.js, a separate standalone page (same pattern as
   share.html and client-portal.html), since a paying client has no
   Boardly account at all.
   ========================================================================== */

state.marketplaceProfile = null;
state.marketplaceBanks = null; // cached after first load, so re-opening the Payouts tab doesn't re-fetch every time
state.marketplacePayout = null;
state.marketplaceBookings = [];

async function loadMarketplaceProfile() {
  const { data, error } = await supabaseClient.from("marketplace_profiles").select("*").eq("user_id", state.userId).maybeSingle();
  if (error) { console.warn("loadMarketplaceProfile:", error.message); return null; }
  return data;
}

function fillMarketplaceForm(profile) {
  document.getElementById("mp-display-name").value = profile?.display_name || "";
  document.getElementById("mp-headline").value = profile?.headline || "";
  document.getElementById("mp-bio").value = profile?.bio || "";
  document.getElementById("mp-skills").value = profile?.skills || "";
  document.getElementById("mp-rate-range").value = profile?.rate_range || "";
  document.getElementById("mp-location").value = profile?.location || "";
  document.getElementById("mp-portfolio-url").value = profile?.portfolio_url || "";
  document.getElementById("mp-availability").value = profile?.availability || "available";
  document.getElementById("mp-is-public").checked = !!profile?.is_public;
  updateMarketplacePublicLinkRow(profile);
  document.getElementById("mp-payout-nudge")?.classList.toggle("hidden", !!profile?.accepts_bookings);
}

function updateMarketplacePublicLinkRow(profile) {
  const row = document.getElementById("mp-public-link-row");
  row.classList.toggle("hidden", !profile?.is_public);
  if (profile?.is_public) {
    document.getElementById("mp-public-link-text").textContent = marketplacePublicUrl();
  }
}

function marketplacePublicUrl() {
  return `${location.origin}${location.pathname.replace("dashboard.html", "")}marketplace.html?u=${state.userId}`;
}

async function saveMarketplaceProfile() {
  const btn = document.getElementById("mp-save-btn");
  btn.disabled = true;
  const displayName = document.getElementById("mp-display-name").value.trim();
  if (!displayName) { toast("Display name is required", "error"); btn.disabled = false; return; }

  const payload = {
    user_id: state.userId,
    display_name: displayName,
    headline: document.getElementById("mp-headline").value.trim() || null,
    bio: document.getElementById("mp-bio").value.trim() || null,
    skills: document.getElementById("mp-skills").value.trim() || null,
    rate_range: document.getElementById("mp-rate-range").value.trim() || null,
    location: document.getElementById("mp-location").value.trim() || null,
    portfolio_url: document.getElementById("mp-portfolio-url").value.trim() || null,
    availability: document.getElementById("mp-availability").value,
    is_public: document.getElementById("mp-is-public").checked,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseClient.from("marketplace_profiles").upsert(payload, { onConflict: "user_id" }).select().maybeSingle();
  btn.disabled = false;
  if (error) { toast("Couldn't save profile: " + error.message, "error"); return; }

  state.marketplaceProfile = data;
  updateMarketplacePublicLinkRow(data);
  toast(data.is_public ? "Profile saved and published" : "Profile saved", "ok");
}

async function loadMarketplaceInquiries() {
  const { data, error } = await supabaseClient.from("marketplace_inquiries").select("*").eq("profile_user_id", state.userId).order("created_at", { ascending: false });
  if (error) { console.warn("loadMarketplaceInquiries:", error.message); return []; }
  return data || [];
}

function marketplaceInquiryRowHTML(inq) {
  return `
    <div class="ticket p-2.5">
      <p class="text-sm font-medium">${escapeHTML(inq.from_name)} <span class="text-ink-soft font-normal">· ${escapeHTML(inq.from_email)}</span></p>
      <p class="text-xs text-ink-soft mt-0.5">${new Date(inq.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
      <p class="text-sm mt-1.5 whitespace-pre-wrap">${escapeHTML(inq.message)}</p>
      <a href="mailto:${escapeHTML(inq.from_email)}" class="btn btn-ghost text-xs !py-1 !px-2.5 mt-2 inline-flex"><i class="fa-solid fa-reply mr-1"></i>Reply by email</a>
    </div>`;
}

async function renderMarketplaceInquiries() {
  const list = document.getElementById("marketplace-inquiries-list");
  const empty = document.getElementById("marketplace-inquiries-empty");
  const countBadge = document.getElementById("marketplace-inquiry-count");
  list.innerHTML = `<p class="text-xs text-ink-soft text-center py-6">Loading…</p>`;

  const inquiries = await loadMarketplaceInquiries();
  countBadge.textContent = inquiries.length;
  countBadge.classList.toggle("hidden", inquiries.length === 0);

  if (!inquiries.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = inquiries.map(marketplaceInquiryRowHTML).join("");
}

function switchMarketplaceTab(tab) {
  const tabs = ["profile", "inquiries", "payouts", "bookings"];
  tabs.forEach((t) => {
    const isActive = t === tab;
    document.getElementById(`marketplace-${t}-tab`)?.classList.toggle("hidden", !isActive);
    const btn = document.getElementById(`marketplace-tab-${t}`);
    btn?.classList.toggle("border-orange", isActive);
    btn?.classList.toggle("text-ink", isActive);
    btn?.classList.toggle("border-transparent", !isActive);
    btn?.classList.toggle("text-ink-soft", !isActive);
  });
  if (tab === "inquiries") renderMarketplaceInquiries();
  if (tab === "payouts") openPayoutsTab();
  if (tab === "bookings") renderMarketplaceBookings();
}

// ---------------------------------------------------------------------
// PAYOUTS TAB - verify a bank account with Squad (through
// marketplace-setup-payout, the only Edge Function this half of
// Marketplace needs) and save it, which also flags the profile as
// accepts_bookings so the public page can offer a "Book & Pay" form.
//
// A payout row saved before 22 Sep 2026 was verified with Paystack,
// Boardly's old payout provider (schema_v92). That old row's bank_code
// and account_number were only ever checked against Paystack's own
// sandbox, so marketplace-release-payment correctly still calls
// Paystack for it, and Paystack is not approved to send money out on
// this account. renderPayoutStatus() below shows a warning on any row
// still marked provider = "paystack" so the person can re-save it
// through Squad's own account lookup and get a fresh, valid row.
// ---------------------------------------------------------------------
async function callMarketplacePayoutFn(payload) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { toast("Please sign in again.", "error"); return null; }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-setup-payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error || "Something went wrong", "error"); return null; }
    return result;
  } catch {
    toast("Couldn't reach the payments function - is it deployed?", "error");
    return null;
  }
}

async function loadMarketplacePayout() {
  const { data, error } = await supabaseClient.from("marketplace_provider_payouts").select("*").eq("user_id", state.userId).maybeSingle();
  if (error) { console.warn("loadMarketplacePayout:", error.message); return null; }
  return data;
}

function renderPayoutStatus(payout) {
  const box = document.getElementById("mp-payout-saved");
  const warning = document.getElementById("mp-payout-legacy-warning");
  if (!payout) { box.classList.add("hidden"); warning?.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  document.getElementById("mp-payout-account-name").textContent = payout.account_name;
  const bankLabel = (state.marketplaceBanks || []).find((b) => b.code === payout.bank_code)?.name || payout.bank_code;
  document.getElementById("mp-payout-account-detail").textContent = `${bankLabel} · ${payout.account_number}`;
  // provider = "paystack" means this row predates the Squad switch (see
  // the comment above openPayoutsTab). It still works for reading, it
  // just can't actually be paid out until re-saved through Squad.
  warning?.classList.toggle("hidden", payout.provider !== "paystack");
}

async function openPayoutsTab() {
  const select = document.getElementById("mp-payout-bank");
  state.marketplacePayout = await loadMarketplacePayout();
  renderPayoutStatus(state.marketplacePayout);

  if (!state.marketplaceBanks) {
    const result = await callMarketplacePayoutFn({ action: "list_banks" });
    if (result?.banks) {
      state.marketplaceBanks = result.banks;
      select.innerHTML = `<option value="">Select your bank…</option>` + result.banks.map((b) => `<option value="${escapeHTML(b.code)}">${escapeHTML(b.name)}</option>`).join("");
      renderPayoutStatus(state.marketplacePayout); // now that bank names are loaded, fill in the label above
    } else {
      select.innerHTML = `<option value="">Couldn't load banks. Is SQUAD_SECRET_KEY set?</option>`;
    }
  }
  if (state.marketplacePayout) select.value = state.marketplacePayout.bank_code;
}

async function saveMarketplacePayout() {
  const btn = document.getElementById("mp-payout-save-btn");
  const bankCode = document.getElementById("mp-payout-bank").value;
  const accountNumber = document.getElementById("mp-payout-account-number").value.trim();
  if (!bankCode || !accountNumber) { toast("Pick a bank and enter your account number", "error"); return; }

  btn.disabled = true;
  btn.textContent = "Verifying with Squad…";
  const result = await callMarketplacePayoutFn({ action: "save_payout", bankCode, accountNumber });
  btn.disabled = false;
  btn.textContent = "Verify & save payout account";
  if (!result) return;

  toast(`Verified: ${result.accountName}`, "ok");
  state.marketplacePayout = await loadMarketplacePayout();
  renderPayoutStatus(state.marketplacePayout);
  if (state.marketplaceProfile) state.marketplaceProfile.accepts_bookings = true;
  document.getElementById("mp-payout-nudge")?.classList.add("hidden");
}

// ---------------------------------------------------------------------
// BOOKINGS TAB - straight RLS read, same as everything else this
// project reads directly: "Providers can read their own bookings" in
// schema_v33 already scopes this to profile_user_id = auth.uid().
// ---------------------------------------------------------------------
const MP_BOOKING_STATUS_LABEL = {
  pending_payment: "Awaiting payment", paid_held: "Paid, held in escrow",
  releasing: "Releasing…", released: "Released to you", refunded: "Refunded", cancelled: "Cancelled",
};
const MP_BOOKING_STATUS_COLOR = {
  pending_payment: "text-ink-soft", paid_held: "text-orange", releasing: "text-orange",
  released: "text-teal", refunded: "text-ink-soft", cancelled: "text-ink-soft",
};

async function loadMarketplaceBookings() {
  const { data, error } = await supabaseClient
    .from("marketplace_bookings")
      // Explicit columns on purpose, never "*". access_token is the client's
      // key to release payment, and schema_v77 stops providers reading it.
      .select("id, client_name, client_email, description, amount, currency, status, created_at, paid_at, released_at, dispute_status, dispute_reason, disputed_by, disputed_at, dispute_resolution, resolved_at")
      .eq("profile_user_id", state.userId).order("created_at", { ascending: false });
  if (error) { console.warn("loadMarketplaceBookings:", error.message); return []; }
  const bookings = data || [];
  if (!bookings.length) return bookings;

  // schema_v98: attach each booking's own deliverable history (newest
  // first), one query for all of them rather than one per row.
  const { data: deliverables, error: dErr } = await supabaseClient
    .from("marketplace_deliverables")
    .select("booking_id, note, link_url, submitted_at")
    .in("booking_id", bookings.map((b) => b.id))
    .order("submitted_at", { ascending: false });
  if (dErr) console.warn("loadMarketplaceBookings (deliverables):", dErr.message);

  bookings.forEach((b) => {
    b.deliverables = (deliverables || []).filter((d) => d.booking_id === b.id);
  });
  return bookings;
}

// A provider can submit a deliverable on any booking that's actually
// theirs and has real money attached to it (paid_held or releasing - not
// pending_payment, not already released/refunded/cancelled). Nothing
// about release itself depends on this existing, it's proof for the
// client to look at, not a gate.
function marketplaceCanSubmitDeliverable(status) {
  return status === "paid_held" || status === "releasing";
}

async function marketplaceSubmitDeliverable(bookingId) {
  const wrap = document.querySelector(`[data-booking-id="${bookingId}"]`);
  const noteEl = wrap?.querySelector("[data-deliverable-note]");
  const linkEl = wrap?.querySelector("[data-deliverable-link]");
  const errorEl = wrap?.querySelector("[data-deliverable-error]");
  const note = noteEl?.value.trim() || "";
  if (errorEl) errorEl.classList.add("hidden");
  if (!note) {
    if (errorEl) { errorEl.textContent = "Describe what you're handing over first."; errorEl.classList.remove("hidden"); }
    return;
  }
  const submitBtn = wrap?.querySelector("[data-deliverable-submit]");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting…"; }

  const { error } = await supabaseClient.from("marketplace_deliverables").insert({
    booking_id: bookingId,
    note,
    link_url: linkEl?.value.trim() || null,
  });

  if (error) {
    toast("Couldn't submit that: " + error.message, "error");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit deliverable"; }
    return;
  }
  toast("Deliverable submitted, the client can see it now", "ok");
  renderMarketplaceBookings();
}

function marketplaceBookingRowHTML(b) {
  const disputeBadge = b.dispute_status === "opened"
    ? `<span class="meta-chip shrink-0 text-critical">Disputed</span>`
    : b.dispute_status === "resolved"
    ? `<span class="meta-chip shrink-0 text-ink-soft">Dispute resolved</span>`
    : "";
  const disputeAction = b.status === "paid_held" && b.dispute_status === "none"
    ? `<button type="button" class="text-xs text-ink-soft hover:text-critical underline mt-1.5" data-file-dispute="${b.id}">Something wrong? File a dispute</button>`
    : b.dispute_status === "opened"
    ? `<div class="ticket p-2 bg-paper-2 mt-1.5">
        <p class="text-xs mb-1">${escapeHTML(b.dispute_reason || "")}</p>
        <button type="button" class="text-xs text-ink-soft hover:text-ink underline" data-resolve-dispute="${b.id}">Mark resolved</button>
      </div>`
    : b.dispute_status === "resolved"
    ? `<p class="text-xs text-ink-soft mt-1.5">Resolution: ${escapeHTML(b.dispute_resolution || "")}</p>`
    : "";
  const canDelete = b.status === "pending_payment" || b.status === "cancelled";

  const deliverableHistory = (b.deliverables || []).length
    ? `<div class="mt-2 space-y-1.5">
        ${b.deliverables.map((d) => `
          <div class="ticket p-2 bg-paper-2">
            <p class="text-xs whitespace-pre-wrap">${escapeHTML(d.note)}</p>
            ${d.link_url ? `<a href="${safeUrl(d.link_url)}" target="_blank" rel="noopener" class="text-xs text-teal underline break-all">${escapeHTML(d.link_url)}</a>` : ""}
            <p class="text-[10px] text-ink-soft mt-1">Submitted ${new Date(d.submitted_at).toLocaleString()}</p>
          </div>`).join("")}
      </div>`
    : "";

  const deliverableAction = marketplaceCanSubmitDeliverable(b.status)
    ? `<button type="button" class="text-xs text-ink-soft hover:text-ink underline mt-1.5" data-toggle-deliverable="${b.id}">${b.deliverables?.length ? "Submit another deliverable" : "Submit deliverable"}</button>
       <div class="hidden ticket p-2.5 mt-1.5 space-y-2" data-deliverable-form>
         <label class="form-label">What are you handing over?</label>
         <textarea rows="2" class="input text-sm" placeholder="What's done, what's included" data-deliverable-note></textarea>
         <label class="form-label">Link (optional)</label>
         <input type="url" class="input text-sm" placeholder="Drive, GitHub, a live URL" data-deliverable-link>
         <p class="hidden text-xs text-critical" data-deliverable-error></p>
         <button type="button" class="btn btn-primary btn-pop text-sm w-full" data-deliverable-submit>Submit deliverable</button>
       </div>`
    : "";

  return `
    <div class="ticket p-2.5" data-booking-id="${b.id}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(b.client_name)} <span class="text-ink-soft font-normal">· ${escapeHTML(b.client_email)}</span></p>
          <p class="text-xs mt-0.5 whitespace-pre-wrap">${escapeHTML(b.description)}</p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span class="meta-chip ${MP_BOOKING_STATUS_COLOR[b.status] || "text-ink-soft"}">${MP_BOOKING_STATUS_LABEL[b.status] || b.status}</span>
          ${disputeBadge}
        </div>
      </div>
      <p class="text-[11px] text-ink-soft mt-1.5">₦${Number(b.amount).toLocaleString()} · ${new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
      ${disputeAction}
      ${deliverableHistory}
      ${deliverableAction}
      ${canDelete ? `<button type="button" class="text-xs text-ink-soft hover:text-critical underline mt-1.5" data-delete-booking="${b.id}">Delete this booking</button>` : ""}
    </div>`;
}

async function renderMarketplaceBookings() {
  const list = document.getElementById("marketplace-bookings-list");
  const empty = document.getElementById("marketplace-bookings-empty");
  const countBadge = document.getElementById("marketplace-booking-count");
  list.innerHTML = `<p class="text-xs text-ink-soft text-center py-6">Loading…</p>`;

  const bookings = await loadMarketplaceBookings();
  state.marketplaceBookings = bookings;
  countBadge.textContent = bookings.length;
  countBadge.classList.toggle("hidden", bookings.length === 0);

  if (!bookings.length) { list.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  list.innerHTML = bookings.map(marketplaceBookingRowHTML).join("");
}

/** Provider-side dispute actions. Uses the signed-in session's own
 *  access token (not the client's booking access_token) so
 *  marketplace-file-dispute/marketplace-resolve-dispute can verify this
 *  is really the booking's provider, see those functions' own comments. */
async function marketplaceFileDisputeAsProvider(bookingId) {
  const reason = prompt("What's wrong with this booking? This is shared with the client.");
  if (!reason || !reason.trim()) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-file-dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ bookingId, reason: reason.trim() }),
  });
  const result = await res.json();
  if (!res.ok || !result.ok) { toast(result.error || "Couldn't file the dispute", "error"); return; }
  toast("Dispute filed", "ok");
  renderMarketplaceBookings();
}

async function marketplaceResolveDispute(bookingId) {
  const resolution = prompt("How was this resolved? This is shared with the client.");
  if (!resolution || !resolution.trim()) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-resolve-dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ bookingId, resolution: resolution.trim() }),
  });
  const result = await res.json();
  if (!res.ok || !result.ok) { toast(result.error || "Couldn't resolve the dispute", "error"); return; }
  toast("Dispute marked resolved", "ok");
  renderMarketplaceBookings();
}

async function marketplaceDeleteBooking(bookingId) {
  if (!confirm("Delete this booking? This can't be undone. Only bookings that were never paid can be deleted, this button only shows for those.")) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-delete-booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ bookingId }),
  });
  const result = await res.json();
  if (!res.ok || !result.ok) { toast(result.error || "Couldn't delete this booking", "error"); return; }
  toast("Booking deleted", "ok");
  renderMarketplaceBookings();
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("marketplace-modal");

  document.getElementById("marketplace-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    switchMarketplaceTab("profile");
    const profile = await loadMarketplaceProfile();
    state.marketplaceProfile = profile;
    fillMarketplaceForm(profile);
  });
  document.querySelectorAll("[data-close-marketplace]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("marketplace-tab-profile")?.addEventListener("click", () => switchMarketplaceTab("profile"));
  document.getElementById("marketplace-tab-inquiries")?.addEventListener("click", () => switchMarketplaceTab("inquiries"));
  document.getElementById("marketplace-tab-payouts")?.addEventListener("click", () => switchMarketplaceTab("payouts"));
  document.getElementById("marketplace-tab-bookings")?.addEventListener("click", () => switchMarketplaceTab("bookings"));
  document.getElementById("mp-payout-nudge-btn")?.addEventListener("click", () => switchMarketplaceTab("payouts"));
  document.getElementById("mp-payout-save-btn")?.addEventListener("click", saveMarketplacePayout);

  document.getElementById("marketplace-bookings-list")?.addEventListener("click", (e) => {
    const fileBtn = e.target.closest("[data-file-dispute]");
    if (fileBtn) { marketplaceFileDisputeAsProvider(fileBtn.dataset.fileDispute); return; }
    const resolveBtn = e.target.closest("[data-resolve-dispute]");
    if (resolveBtn) { marketplaceResolveDispute(resolveBtn.dataset.resolveDispute); return; }
    const deleteBtn = e.target.closest("[data-delete-booking]");
    if (deleteBtn) { marketplaceDeleteBooking(deleteBtn.dataset.deleteBooking); return; }
    const toggleBtn = e.target.closest("[data-toggle-deliverable]");
    if (toggleBtn) { toggleBtn.parentElement.querySelector("[data-deliverable-form]")?.classList.toggle("hidden"); return; }
    const submitBtn = e.target.closest("[data-deliverable-submit]");
    if (submitBtn) marketplaceSubmitDeliverable(submitBtn.closest("[data-booking-id]").dataset.bookingId);
  });

  document.getElementById("mp-save-btn")?.addEventListener("click", saveMarketplaceProfile);
  document.getElementById("mp-is-public")?.addEventListener("change", (e) => {
    document.getElementById("mp-public-link-row")?.classList.toggle("hidden", !e.target.checked);
  });
  document.getElementById("mp-copy-link-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(marketplacePublicUrl()).then(
      () => toast("Link copied", "ok"),
      () => toast("Couldn't copy - try selecting the text manually", "error")
    );
  });
});
