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
// PAYOUTS TAB - verify a bank account with Paystack (through
// marketplace-setup-payout, the only Edge Function this half of
// Marketplace needs) and save it, which also flags the profile as
// accepts_bookings so the public page can offer a "Book & Pay" form.
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
  if (!payout) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  document.getElementById("mp-payout-account-name").textContent = payout.account_name;
  const bankLabel = (state.marketplaceBanks || []).find((b) => b.code === payout.bank_code)?.name || payout.bank_code;
  document.getElementById("mp-payout-account-detail").textContent = `${bankLabel} · ${payout.account_number}`;
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
      select.innerHTML = `<option value="">Couldn't load banks — is PAYSTACK_SECRET_KEY set?</option>`;
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
  btn.textContent = "Verifying with Paystack…";
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
  pending_payment: "Awaiting payment", paid_held: "Paid — held in escrow",
  released: "Released to you", refunded: "Refunded", cancelled: "Cancelled",
};
const MP_BOOKING_STATUS_COLOR = {
  pending_payment: "text-ink-soft", paid_held: "text-orange",
  released: "text-teal", refunded: "text-ink-soft", cancelled: "text-ink-soft",
};

async function loadMarketplaceBookings() {
  const { data, error } = await supabaseClient
    .from("marketplace_bookings").select("*").eq("profile_user_id", state.userId).order("created_at", { ascending: false });
  if (error) { console.warn("loadMarketplaceBookings:", error.message); return []; }
  return data || [];
}

function marketplaceBookingRowHTML(b) {
  return `
    <div class="ticket p-2.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeHTML(b.client_name)} <span class="text-ink-soft font-normal">· ${escapeHTML(b.client_email)}</span></p>
          <p class="text-xs mt-0.5 whitespace-pre-wrap">${escapeHTML(b.description)}</p>
        </div>
        <span class="meta-chip shrink-0 ${MP_BOOKING_STATUS_COLOR[b.status] || "text-ink-soft"}">${MP_BOOKING_STATUS_LABEL[b.status] || b.status}</span>
      </div>
      <p class="text-[11px] text-ink-soft mt-1.5">₦${Number(b.amount).toLocaleString()} · ${new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
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
