/* ==========================================================================
   BOARDLY - marketplace.js  ("Marketplace" v1 - in-app half)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/marketplace.js"></script>

   Needs schema_v30_marketplace.sql. This file is the half of
   Marketplace YOU see, signed in: editing your own profile and
   reading inquiries people have sent you. The public half - the
   directory itself, and the contact form strangers use to reach you -
   lives in marketplace.html + js/marketplace-public.js, a separate
   standalone page (same pattern as share.html and
   client-portal.html), since it needs to work for someone with no
   Boardly account at all.

   No Edge Function needed for either half - see the long comment at
   the top of schema_v30_marketplace.sql for why plain RLS policies
   are both simpler and the more honest fit here.
   ========================================================================== */

state.marketplaceProfile = null;

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
  const isProfile = tab === "profile";
  document.getElementById("marketplace-profile-tab")?.classList.toggle("hidden", !isProfile);
  document.getElementById("marketplace-inquiries-tab")?.classList.toggle("hidden", isProfile);
  document.getElementById("marketplace-tab-profile")?.classList.toggle("border-orange", isProfile);
  document.getElementById("marketplace-tab-profile")?.classList.toggle("text-ink", isProfile);
  document.getElementById("marketplace-tab-profile")?.classList.toggle("border-transparent", !isProfile);
  document.getElementById("marketplace-tab-profile")?.classList.toggle("text-ink-soft", !isProfile);
  document.getElementById("marketplace-tab-inquiries")?.classList.toggle("border-orange", !isProfile);
  document.getElementById("marketplace-tab-inquiries")?.classList.toggle("text-ink", !isProfile);
  document.getElementById("marketplace-tab-inquiries")?.classList.toggle("border-transparent", isProfile);
  document.getElementById("marketplace-tab-inquiries")?.classList.toggle("text-ink-soft", isProfile);
  if (!isProfile) renderMarketplaceInquiries();
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
