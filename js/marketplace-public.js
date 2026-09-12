/* ==========================================================================
   BOARDLY - js/marketplace-public.js
   --------------------------------------------------------------------------
   Powers marketplace.html - a separate, self-contained page (same
   approach as share.html and client-portal.html: no dependency on
   dashboard.js or its global `state`, since anyone can land here with
   no Boardly account at all).

   Two ways this page can open:
   - No "u" in the URL: the full directory - every published profile,
     searchable by skill/headline/bio.
   - "?u=<user_id>" in the URL: jumps straight to one profile's detail
     view (this is the link "Copy link" in the in-app Marketplace tab
     generates).

   Both reads (the directory list, one profile) go straight through
   Supabase's own RLS - the "Anyone can view published marketplace
   profiles" policy in schema_v30_marketplace.sql - no Edge Function
   needed, unlike Client Portal. Sending an inquiry is the same: a
   direct insert, allowed by RLS only when the target profile is
   actually published (schema_v30's insert policy checks that
   condition at the database level on every single insert).
   ========================================================================== */

const MKT_SKILL_COLORS = ["text-orange", "text-teal", "text-violet"];

function escapeMktHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function mktSkillChips(skillsText) {
  if (!skillsText) return "";
  return skillsText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6).map((skill, i) =>
    `<span class="meta-chip ${MKT_SKILL_COLORS[i % MKT_SKILL_COLORS.length]}">${escapeMktHTML(skill)}</span>`
  ).join("");
}

const MKT_AVAILABILITY_LABEL = { available: "Available for work", busy: "Busy, but open to inquiries", unavailable: "Not available right now" };
const MKT_AVAILABILITY_COLOR = { available: "text-teal", busy: "text-orange", unavailable: "text-ink-soft" };

function mktCardHTML(profile) {
  return `
    <button type="button" data-mkt-open="${profile.user_id}" class="ticket p-3.5 text-left hover:border-orange transition-colors">
      <div class="flex items-center gap-2.5 mb-1.5">
        <div class="member-avatar shrink-0">${escapeMktHTML((profile.display_name || "?")[0].toUpperCase())}</div>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">${escapeMktHTML(profile.display_name)}</p>
          ${profile.headline ? `<p class="text-xs text-ink-soft truncate">${escapeMktHTML(profile.headline)}</p>` : ""}
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">${mktSkillChips(profile.skills)}</div>
      <p class="text-[11px] mt-2 ${MKT_AVAILABILITY_COLOR[profile.availability] || "text-ink-soft"}"><i class="fa-solid fa-circle text-[6px] mr-1"></i>${MKT_AVAILABILITY_LABEL[profile.availability] || ""}</p>
    </button>`;
}

function mktDetailHTML(profile) {
  return `
    <div class="ticket p-5">
      <div class="flex items-center gap-3 mb-3">
        <div class="member-avatar shrink-0" style="width:48px;height:48px;font-size:1.1rem">${escapeMktHTML((profile.display_name || "?")[0].toUpperCase())}</div>
        <div class="min-w-0">
          <p class="font-display font-semibold text-lg truncate">${escapeMktHTML(profile.display_name)}</p>
          ${profile.headline ? `<p class="text-sm text-ink-soft truncate">${escapeMktHTML(profile.headline)}</p>` : ""}
        </div>
      </div>
      <p class="text-xs mb-3 ${MKT_AVAILABILITY_COLOR[profile.availability] || "text-ink-soft"}"><i class="fa-solid fa-circle text-[6px] mr-1"></i>${MKT_AVAILABILITY_LABEL[profile.availability] || ""}</p>
      <div id="mkt-trust-badges" class="flex flex-wrap gap-2 mb-3"></div>
      ${profile.bio ? `<p class="text-sm whitespace-pre-wrap mb-3">${escapeMktHTML(profile.bio)}</p>` : ""}
      <div class="flex flex-wrap gap-1.5 mb-3">${mktSkillChips(profile.skills)}</div>
      <div class="flex flex-wrap gap-3 text-xs text-ink-soft">
        ${profile.rate_range ? `<span><i class="fa-solid fa-sack-dollar mr-1"></i>${escapeMktHTML(profile.rate_range)}</span>` : ""}
        ${profile.location ? `<span><i class="fa-solid fa-location-dot mr-1"></i>${escapeMktHTML(profile.location)}</span>` : ""}
        ${profile.portfolio_url ? `<a href="${escapeMktHTML(profile.portfolio_url)}" target="_blank" rel="noopener" class="text-orange hover:underline"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>Portfolio</a>` : ""}
      </div>
    </div>
    <div id="mkt-reviews" class="mt-3"></div>`;
}

function mktStarsHTML(rating) {
  return Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-star ${i < rating ? "text-orange" : "text-ink-faint"}" style="font-size:.7rem"></i>`).join("");
}

/** Section 17: reviews are only ever left after a client actually
 *  confirmed a booking as done (see marketplace-submit-review and
 *  schema_v68's own comment), so every review shown here describes a
 *  real, completed piece of work, never a fabricated rating. Reviews
 *  are public data by design (RLS "for select using (true)"), so this
 *  reads them directly, no Edge Function needed for this part. */
async function mktLoadReviews(userId) {
  const wrap = document.getElementById("mkt-reviews");
  if (!wrap) return;
  const { data: reviews, error } = await supabaseClient
    .from("marketplace_reviews")
    .select("rating, comment, client_name, created_at")
    .eq("profile_user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !reviews || !reviews.length) { wrap.innerHTML = ""; return; }

  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  wrap.innerHTML = `
    <div class="ticket p-4">
      <p class="text-sm font-medium mb-3">${mktStarsHTML(Math.round(average))} <span class="text-ink-soft font-normal">${average.toFixed(1)} from ${reviews.length} review${reviews.length === 1 ? "" : "s"}</span></p>
      <div class="flex flex-col gap-3">
        ${reviews.slice(0, 10).map((r) => `
          <div class="border-t border-line pt-3 first:border-0 first:pt-0">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium">${escapeMktHTML(r.client_name || "A client")}</p>
              <span>${mktStarsHTML(r.rating)}</span>
            </div>
            ${r.comment ? `<p class="text-sm mt-1">${escapeMktHTML(r.comment)}</p>` : ""}
          </div>`).join("")}
      </div>
    </div>`;
}

/** Section 18: real, checkable trust badges, never an opaque score.
 *  Fetched separately from the profile itself since these come from
 *  marketplace-get-trust-badges (auth.users and other tables the public
 *  directory's own RLS policy can't safely expose directly). Loads
 *  after the profile card renders so the page never blocks on it. */
async function mktLoadTrustBadges(userId) {
  const wrap = document.getElementById("mkt-trust-badges");
  if (!wrap) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-get-trust-badges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUserId: userId }),
    });
    const badges = await res.json();
    if (!res.ok) { wrap.innerHTML = ""; return; }

    const chips = [];
    if (badges.emailVerified) chips.push(`<span class="meta-chip text-teal" title="This person's email address has been confirmed"><i class="fa-solid fa-circle-check mr-1"></i>Email verified</span>`);
    if (badges.payoutVerified) chips.push(`<span class="meta-chip text-teal" title="A real bank account has been verified for payouts through Paystack"><i class="fa-solid fa-circle-check mr-1"></i>Payout verified</span>`);
    if (badges.completedBookings > 0) chips.push(`<span class="meta-chip text-orange" title="Bookings paid through Boardly Marketplace that the client confirmed as done"><i class="fa-solid fa-briefcase mr-1"></i>${badges.completedBookings} completed on Boardly</span>`);
    if (badges.memberSince) chips.push(`<span class="meta-chip text-ink-soft" title="When this profile was created"><i class="fa-solid fa-calendar mr-1"></i>Member since ${new Date(badges.memberSince).toLocaleDateString(undefined, { year: "numeric", month: "short" })}</span>`);
    wrap.innerHTML = chips.join("");
  } catch {
    wrap.innerHTML = "";
  }
}

let mktCurrentProfileUserId = null;

async function mktSearchDirectory(query) {
  let req = supabaseClient.from("marketplace_profiles").select("*").eq("is_public", true).order("updated_at", { ascending: false }).limit(60);
  if (query.trim()) {
    const pattern = `%${query.trim().replace(/[%_]/g, (c) => "\\" + c)}%`;
    req = req.or(`display_name.ilike.${pattern},headline.ilike.${pattern},bio.ilike.${pattern},skills.ilike.${pattern}`);
  }
  const { data, error } = await req;
  if (error) { console.error("mktSearchDirectory:", error.message); return []; }
  return data || [];
}

async function mktRenderDirectory(query) {
  const loading = document.getElementById("mkt-loading");
  const grid = document.getElementById("mkt-grid");
  const empty = document.getElementById("mkt-empty");
  loading.classList.remove("hidden");
  grid.innerHTML = "";
  empty.classList.add("hidden");

  const profiles = await mktSearchDirectory(query);
  loading.classList.add("hidden");
  if (!profiles.length) { empty.classList.remove("hidden"); return; }
  grid.innerHTML = profiles.map(mktCardHTML).join("");
}

async function mktOpenProfile(userId) {
  const { data, error } = await supabaseClient.from("marketplace_profiles").select("*").eq("user_id", userId).eq("is_public", true).maybeSingle();
  if (error || !data) {
    document.getElementById("mkt-directory-view").classList.add("hidden");
    document.getElementById("mkt-detail-view").classList.add("hidden");
    document.getElementById("mkt-notfound").classList.remove("hidden");
    return;
  }
  mktCurrentProfileUserId = userId;
  document.getElementById("mkt-detail-card").innerHTML = mktDetailHTML(data);
  mktLoadTrustBadges(userId);
  mktLoadReviews(userId);
  document.getElementById("mkt-directory-view").classList.add("hidden");
  document.getElementById("mkt-notfound").classList.add("hidden");
  document.getElementById("mkt-detail-view").classList.remove("hidden");
  document.getElementById("mkt-contact-sent").classList.add("hidden");
  document.getElementById("mkt-contact-form").classList.remove("hidden");
  document.getElementById("mkt-booking-card").classList.toggle("hidden", !data.accepts_bookings);
  document.getElementById("mkt-booking-error").classList.add("hidden");
  history.pushState({}, "", `?u=${userId}`);
}

function mktBackToDirectory() {
  mktCurrentProfileUserId = null;
  document.getElementById("mkt-detail-view").classList.add("hidden");
  document.getElementById("mkt-notfound").classList.add("hidden");
  document.getElementById("mkt-directory-view").classList.remove("hidden");
  history.pushState({}, "", location.pathname);
}

async function mktLoad() {
  const userId = new URLSearchParams(location.search).get("u");
  if (userId) {
    await mktOpenProfile(userId);
  } else {
    await mktRenderDirectory("");
  }
}

document.getElementById("mkt-search")?.addEventListener("input", (e) => {
  clearTimeout(window._mktSearchTimer);
  window._mktSearchTimer = setTimeout(() => mktRenderDirectory(e.target.value), 250);
});

document.getElementById("mkt-grid")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mkt-open]");
  if (btn) mktOpenProfile(btn.dataset.mktOpen);
});

document.getElementById("mkt-back-btn")?.addEventListener("click", mktBackToDirectory);

document.getElementById("mkt-contact-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!mktCurrentProfileUserId) return;
  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  const payload = {
    profile_user_id: mktCurrentProfileUserId,
    from_name: document.getElementById("mkt-contact-name").value.trim(),
    from_email: document.getElementById("mkt-contact-email").value.trim(),
    message: document.getElementById("mkt-contact-message").value.trim(),
  };

  const { error } = await supabaseClient.from("marketplace_inquiries").insert(payload);
  submitBtn.disabled = false;
  if (error) { toast("Couldn't send: " + error.message, "error"); return; }

  document.getElementById("mkt-contact-form").reset();
  document.getElementById("mkt-contact-form").classList.add("hidden");
  document.getElementById("mkt-contact-sent").classList.remove("hidden");
  toast("Inquiry sent", "ok");
});

// ---------------------------------------------------------------------
// BOOK & PAY - calls marketplace-create-booking (the only Edge Function
// this public page needs), then redirects the whole page to Paystack's
// own hosted checkout. Nobody's card details ever pass through
// Boardly - see that function's own header comment for the full flow,
// including what happens after payment (booking-status.html).
// ---------------------------------------------------------------------
document.getElementById("mkt-booking-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!mktCurrentProfileUserId) return;
  const submitBtn = e.target.querySelector("button[type=submit]");
  const errorEl = document.getElementById("mkt-booking-error");
  errorEl.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Starting secure checkout…";

  const payload = {
    profileUserId: mktCurrentProfileUserId,
    clientName: document.getElementById("mkt-booking-name").value.trim(),
    clientEmail: document.getElementById("mkt-booking-email").value.trim(),
    description: document.getElementById("mkt-booking-description").value.trim(),
    amount: Number(document.getElementById("mkt-booking-amount").value),
    origin: location.origin + location.pathname.replace(/marketplace\.html$/, "").replace(/\/$/, ""),
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-create-booking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.authorizationUrl) {
      errorEl.textContent = result.error || "Couldn't start checkout - try again in a moment.";
      errorEl.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Pay & book securely";
      return;
    }
    location.href = result.authorizationUrl; // hand off to Paystack's own hosted checkout page
  } catch {
    errorEl.textContent = "Couldn't reach the booking function - is it deployed?";
    errorEl.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Pay & book securely";
  }
});

window.addEventListener("popstate", mktLoad);
mktLoad();
