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

/* ---- Find work (schema_v75): job postings + applications, added
   alongside the directory above, not replacing it. Posting and
   applying both need a real Boardly account (an opportunity/
   application row needs a real user_id), reads (browsing open jobs)
   stay just as public as the directory above. -------------------- */

let mktCurrentUser = null; // cached once at load, null if the visitor isn't signed in

async function mktGetCurrentUser() {
  if (mktCurrentUser !== null) return mktCurrentUser;
  const { data: { user } } = await supabaseClient.auth.getUser();
  mktCurrentUser = user || false; // false, not null, once we've actually checked and there's nobody
  return mktCurrentUser;
}

function mktJobCardHTML(job, mine = false) {
  const budget = job.budget_min || job.budget_max
    ? `${job.currency} ${Number(job.budget_min || 0).toLocaleString()}${job.budget_max ? ` to ${Number(job.budget_max).toLocaleString()}` : "+"}`
    : "Budget not specified";
  return `
    <button type="button" data-open-job="${job.id}" class="ticket ticket-hover p-4 text-left w-full">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-display font-semibold truncate">${escapeMktHTML(job.title)}</p>
          <p class="text-xs text-ink-soft mt-1 truncate">${escapeMktHTML(job.description)}</p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          ${job.category ? `<span class="meta-chip text-ink-soft">${escapeMktHTML(job.category)}</span>` : ""}
          ${mine ? `<span class="meta-chip ${job.status === "open" ? "text-teal" : "text-ink-soft"}">${job.status === "open" ? "Open" : "Closed"}</span>` : ""}
        </div>
      </div>
      <p class="text-xs text-orange font-medium mt-2">${escapeMktHTML(budget)}</p>
    </button>`;
}

async function mktRenderJobs(query, mine = false) {
  const loading = document.getElementById("mkt-jobs-loading");
  const list = document.getElementById("mkt-jobs-list");
  const empty = document.getElementById("mkt-jobs-empty");
  loading?.classList.remove("hidden");
  list.innerHTML = "";
  empty?.classList.add("hidden");

  let req = supabaseClient.from("marketplace_opportunities").select("*").order("created_at", { ascending: false });
  if (mine) {
    const user = await mktGetCurrentUser();
    if (!user) { loading?.classList.add("hidden"); empty.textContent = "Log in to see your postings."; empty?.classList.remove("hidden"); return; }
    req = req.eq("user_id", user.id);
  } else {
    req = req.eq("status", "open");
  }
  if (query) req = req.or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`);
  const { data, error } = await req;
  loading?.classList.add("hidden");

  const jobs = error ? [] : (data || []);
  if (!jobs.length) {
    empty.textContent = mine ? "You haven't posted any jobs yet." : "No open jobs right now, check back soon or post one yourself.";
    empty?.classList.remove("hidden");
    return;
  }
  list.innerHTML = jobs.map((j) => mktJobCardHTML(j, mine)).join("");
}

function mktSwitchMode(mode) {
  document.getElementById("mkt-mode-directory-btn")?.setAttribute("data-active", String(mode === "directory"));
  document.getElementById("mkt-mode-jobs-btn")?.setAttribute("data-active", String(mode === "jobs"));
  document.getElementById("mkt-directory-view")?.classList.toggle("hidden", mode !== "directory");
  document.getElementById("mkt-detail-view")?.classList.add("hidden");
  document.getElementById("mkt-jobs-view")?.classList.toggle("hidden", mode !== "jobs");
  document.getElementById("mkt-job-detail-view")?.classList.add("hidden");
  if (mode === "jobs") {
    const myJobsBtn = document.getElementById("mkt-my-jobs-btn");
    if (myJobsBtn) { myJobsBtn.dataset.mine = "false"; myJobsBtn.textContent = "View your postings"; }
    mktRenderJobs("");
  }
}

let mktCurrentJob = null; // the job currently open in the detail view
const mktAppCache = new Map(); // application id -> application row (with applicantName), for the poster's buttons

/** Turns a raw database error into something a person can act on. */
function mktFriendlyError(error, fallback) {
  const msg = String((error && error.message) || "");
  if (/row-level security|permission denied/i.test(msg)) {
    return fallback || "You can't make this change. If your application was already answered, it is locked.";
  }
  if (/duplicate key|23505/i.test(msg) || (error && error.code === "23505")) {
    return "You already applied to this job. Reload the page to see your application.";
  }
  return msg || fallback || "Something went wrong. Please try again.";
}

async function mktOpenJob(jobId) {
  document.getElementById("mkt-jobs-view")?.classList.add("hidden");
  document.getElementById("mkt-job-detail-view")?.classList.remove("hidden");
  document.getElementById("mkt-job-notfound")?.classList.add("hidden");
  document.getElementById("mkt-apply-card")?.classList.add("hidden");
  document.getElementById("mkt-apply-login-prompt")?.classList.add("hidden");
  document.getElementById("mkt-applications-card")?.classList.add("hidden");
  document.getElementById("mkt-my-application-status")?.classList.add("hidden");
  document.getElementById("mkt-job-owner-actions")?.classList.add("hidden");
  document.getElementById("mkt-apply-sent")?.classList.add("hidden");
  document.getElementById("mkt-apply-form")?.classList.remove("hidden");

  const { data: job, error } = await supabaseClient.from("marketplace_opportunities").select("*").eq("id", jobId).maybeSingle();
  if (error || !job) {
    mktCurrentJob = null;
    document.getElementById("mkt-job-detail-card").innerHTML = "";
    document.getElementById("mkt-job-notfound")?.classList.remove("hidden");
    return;
  }
  mktCurrentJob = job;
  history.replaceState(null, "", `?job=${encodeURIComponent(jobId)}`);

  const budget = job.budget_min || job.budget_max
    ? `${job.currency} ${Number(job.budget_min || 0).toLocaleString()}${job.budget_max ? ` to ${Number(job.budget_max).toLocaleString()}` : "+"}`
    : "Budget not specified";
  document.getElementById("mkt-job-detail-card").innerHTML = `
    <div class="ticket p-5">
      <div class="flex items-start justify-between gap-3">
        <h1 class="font-display font-bold text-xl">${escapeMktHTML(job.title)}</h1>
        ${job.category ? `<span class="meta-chip text-ink-soft shrink-0">${escapeMktHTML(job.category)}</span>` : ""}
      </div>
      <p class="text-sm mt-3 whitespace-pre-line">${escapeMktHTML(job.description)}</p>
      <p class="text-sm text-orange font-semibold mt-3">${escapeMktHTML(budget)}</p>
      <p class="text-xs text-ink-soft mt-1">Posted ${new Date(job.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${job.status === "closed" ? " · Closed" : ""}</p>
    </div>`;
  document.getElementById("mkt-apply-currency-symbol").textContent = job.currency === "NGN" ? "₦" : job.currency;
  document.getElementById("mkt-apply-form").dataset.jobId = jobId;

  const user = await mktGetCurrentUser();
  if (!user) {
    document.getElementById("mkt-apply-login-prompt")?.classList.remove("hidden");
    return;
  }
  if (user.id === job.user_id) {
    // The viewer posted this job: show applications and the owner controls instead of an apply form
    mktShowOwnerActions(job);
    document.getElementById("mkt-applications-card")?.classList.remove("hidden");
    mktRenderApplications(jobId);
    return;
  }
  document.getElementById("mkt-apply-card")?.classList.remove("hidden");
  await mktShowMyApplication(jobId, user.id);
}

/** Applicant side: show where their application stands, and lock the form once it has been answered. */
async function mktShowMyApplication(jobId, userId) {
  const form = document.getElementById("mkt-apply-form");
  const statusEl = document.getElementById("mkt-my-application-status");
  const submitBtn = document.getElementById("mkt-apply-submit");
  form.dataset.existingId = "";
  form.reset();
  if (submitBtn) submitBtn.textContent = "Send application";

  const { data: existing } = await supabaseClient
    .from("marketplace_applications")
    .select("id, message, proposed_price, status, booking_id")
    .eq("opportunity_id", jobId)
    .eq("applicant_user_id", userId)
    .maybeSingle();
  if (!existing) return;

  form.dataset.existingId = existing.id;
  document.getElementById("mkt-apply-message").value = existing.message || "";
  document.getElementById("mkt-apply-price").value = existing.proposed_price || "";

  const sym = mktCurrentJob && mktCurrentJob.currency === "NGN" ? "₦" : "";
  const price = existing.proposed_price ? `${sym}${Number(existing.proposed_price).toLocaleString()}` : "";

  if (existing.status === "submitted") {
    if (submitBtn) submitBtn.textContent = "Update application";
    statusEl.innerHTML = `<i class="fa-solid fa-hourglass-half mr-1 text-ink-soft"></i>You applied to this job. Waiting for the job poster to reply. You can still edit your application below.`;
    statusEl.classList.remove("hidden");
    return;
  }

  // Answered: the application is locked, so hide the form and explain where things stand.
  document.getElementById("mkt-apply-card")?.classList.add("hidden");
  statusEl.classList.remove("hidden");
  if (existing.status === "declined") {
    statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1 text-critical"></i>This application was not chosen. The job poster either declined it or hired someone else. There are plenty of other open jobs on the board.`;
    return;
  }

  // Accepted: say what the payment situation is, honestly.
  let line = `The job poster accepted your application${price ? ` at ${escapeMktHTML(price)}` : ""}. They can now pay through Boardly, and the money is held safely until they approve your work.`;
  if (existing.booking_id) {
    const { data: booking } = await supabaseClient.from("marketplace_bookings").select("status").eq("id", existing.booking_id).maybeSingle();
    const bookingLine = {
      pending_payment: "The client has started paying. Check back here once the payment is confirmed.",
      paid_held: "The client has paid and Boardly is holding the money. You can start the work.",
      released: "The client released the payment to you.",
      refunded: "This payment was refunded to the client.",
      cancelled: "The earlier payment attempt was cancelled. The client can start a new one.",
    }[booking && booking.status];
    if (bookingLine) line = bookingLine;
  } else {
    const { data: myProfile } = await supabaseClient.from("marketplace_profiles").select("accepts_bookings").eq("user_id", userId).maybeSingle();
    if (!myProfile || !myProfile.accepts_bookings) {
      line += " To be paid through Boardly you need to finish payout setup in the Marketplace section of your dashboard first.";
    }
  }
  statusEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-teal"></i>${line}`;
}

/** Poster side: close/reopen and delete this job. */
function mktShowOwnerActions(job) {
  const wrap = document.getElementById("mkt-job-owner-actions");
  const toggle = document.getElementById("mkt-job-toggle-btn");
  if (!wrap || !toggle) return;
  toggle.textContent = job.status === "open" ? "Close job" : "Reopen job";
  toggle.dataset.next = job.status === "open" ? "closed" : "open";
  wrap.classList.remove("hidden");
}

/** Once someone is hired the job stays closed, so the Reopen button is replaced by a short explanation. */
function mktApplyHiredState(apps) {
  const toggle = document.getElementById("mkt-job-toggle-btn");
  const note = document.getElementById("mkt-job-hired-note");
  if (!toggle || !note) return;
  const hired = (apps || []).some((a) => a.status === "accepted");
  toggle.classList.toggle("hidden", hired);
  note.classList.toggle("hidden", !hired);
}

async function mktToggleJobStatus() {
  const toggle = document.getElementById("mkt-job-toggle-btn");
  if (!mktCurrentJob || !toggle) return;
  const next = toggle.dataset.next;
  if (next === "closed" && !confirm("Close this job? It disappears from the public board and stops taking applications. You can reopen it any time.")) return;
  toggle.disabled = true;
  const { data, error } = await supabaseClient.from("marketplace_opportunities").update({ status: next, updated_at: new Date().toISOString() }).eq("id", mktCurrentJob.id).select("id");
  toggle.disabled = false;
  if (error || !data || !data.length) { alert("Couldn't update this job: " + mktFriendlyError(error, "You can only change jobs you posted.")); return; }
  mktOpenJob(mktCurrentJob.id);
}

async function mktDeleteJob() {
  if (!mktCurrentJob) return;
  if (!confirm(`Delete "${mktCurrentJob.title}" for good? Every application on it is deleted too, and this can't be undone. (To just hide it, use Close job instead.)`)) return;
  const btn = document.getElementById("mkt-job-delete-btn");
  if (btn) btn.disabled = true;
  const { data, error } = await supabaseClient.from("marketplace_opportunities").delete().eq("id", mktCurrentJob.id).select("id");
  if (btn) btn.disabled = false;
  if (error) { alert("Couldn't delete this job: " + mktFriendlyError(error)); return; }
  if (!data || !data.length) { alert("Couldn't delete this job. You can only delete jobs you posted."); return; }
  mktCurrentJob = null;
  mktBackToJobs();
  const mineBtn = document.getElementById("mkt-my-jobs-btn");
  mktRenderJobs("", mineBtn?.dataset.mine === "true");
}

function mktBackToJobs() {
  document.getElementById("mkt-job-detail-view")?.classList.add("hidden");
  document.getElementById("mkt-jobs-view")?.classList.remove("hidden");
  history.replaceState(null, "", "marketplace.html");
}

const MKT_APP_STATUS_LABEL = { submitted: "Submitted", accepted: "Accepted", declined: "Declined" };
const MKT_APP_STATUS_COLOR = { submitted: "text-ink-soft", accepted: "text-teal", declined: "text-critical" };

function mktApplicationRowHTML(app) {
  const job = mktCurrentJob;
  const price = app.proposed_price ? Number(app.proposed_price) : null;
  const sym = job && job.currency === "NGN" ? "₦" : "";
  const priceText = price ? `${sym}${price.toLocaleString()}` : "";
  const canRespond = app.status === "submitted";

  let respond = "";
  if (canRespond) {
    respond = `
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn btn-secondary text-xs !py-1" data-respond-application="${app.id}" data-status="declined">Decline</button>
        ${price
          ? `<button type="button" class="btn btn-primary text-xs !py-1" data-respond-application="${app.id}" data-status="accepted">Accept</button>`
          : `<span class="text-xs text-ink-soft">No price set, so this can't be accepted yet.</span>`}
      </div>`;
  }

  let pay = "";
  if (app.status === "accepted") {
    if (!job || job.currency !== "NGN") {
      pay = `<p class="text-xs text-ink-soft mt-2">Payments through Boardly are in Naira only for now.</p>`;
    } else if (!app.booking_id) {
      pay = `
        <div class="mt-2">
          <button type="button" class="btn btn-primary text-xs !py-1" data-pay-application="${app.id}"><i class="fa-solid fa-lock mr-1"></i>Pay ${escapeMktHTML(priceText)} securely</button>
          <p class="text-xs text-ink-soft mt-1">Boardly holds the money until you approve the work.</p>
        </div>`;
    } else {
      pay = `
        <div class="flex items-center gap-2 mt-2">
          <button type="button" class="btn btn-primary text-xs !py-1" data-pay-application="${app.id}">Open payment page</button>
          <button type="button" class="btn btn-secondary text-xs !py-1" data-payment-status="${app.id}">Payment status</button>
        </div>`;
    }
  }

  return `
    <div class="ticket p-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-medium">${escapeMktHTML(app.applicantName || "Applicant")}</p>
        <span class="meta-chip ${MKT_APP_STATUS_COLOR[app.status] || "text-ink-soft"}">${MKT_APP_STATUS_LABEL[app.status] || app.status}</span>
      </div>
      <p class="text-xs mt-1 whitespace-pre-line">${escapeMktHTML(app.message)}</p>
      ${priceText ? `<p class="text-xs text-orange font-medium mt-1">Proposed: ${escapeMktHTML(priceText)}</p>` : ""}
      ${respond}
      ${pay}
    </div>`;
}

async function mktRenderApplications(jobId) {
  const list = document.getElementById("mkt-applications-list");
  const empty = document.getElementById("mkt-applications-empty");
  const { data, error } = await supabaseClient.from("marketplace_applications").select("id, opportunity_id, applicant_user_id, message, proposed_price, status, created_at, booking_id").eq("opportunity_id", jobId).order("created_at", { ascending: false });
  const apps = error ? [] : (data || []);
  mktAppCache.clear();
  mktApplyHiredState(apps);
  if (!apps.length) { list.innerHTML = ""; empty?.classList.remove("hidden"); return; }
  empty?.classList.add("hidden");

  // Applications carry only a user id. Public Marketplace profiles are readable by
  // anyone, so look up display names there; an applicant without a public profile
  // simply shows as "Applicant".
  const names = new Map();
  const ids = [...new Set(apps.map((a) => a.applicant_user_id))];
  const { data: profiles } = await supabaseClient.from("marketplace_profiles").select("user_id, display_name").in("user_id", ids);
  (profiles || []).forEach((p) => { if (p.display_name) names.set(p.user_id, p.display_name); });

  apps.forEach((a) => { a.applicantName = names.get(a.applicant_user_id) || ""; mktAppCache.set(a.id, a); });
  list.innerHTML = apps.map(mktApplicationRowHTML).join("");
}

async function mktRespondToApplication(appId, status) {
  const app = mktAppCache.get(appId);
  const who = (app && app.applicantName) || "this applicant";
  const sym = mktCurrentJob && mktCurrentJob.currency === "NGN" ? "₦" : "";
  if (status === "accepted") {
    const price = app && app.proposed_price ? `${sym}${Number(app.proposed_price).toLocaleString()}` : "";
    const others = [...mktAppCache.values()].filter((a) => a.id !== appId && a.status === "submitted").length;
    const closes = `This hires one person, closes the job${others ? ` and declines the ${others} other waiting application${others === 1 ? "" : "s"}` : ""}.`;
    if (!confirm(`Accept ${who}${price ? ` at ${price}` : ""}? ${closes} You'll be able to pay right after, and you can't undo the answer.`)) return;
  } else if (!confirm(`Decline ${who}? You can't undo this.`)) {
    return;
  }
  const { data, error } = await supabaseClient.from("marketplace_applications").update({ status }).eq("id", appId).select("id");
  if (error) { alert("Couldn't update this application: " + mktFriendlyError(error)); return; }
  if (!data || !data.length) { alert("Couldn't update this application. It may have already been answered. Reload the page."); }
  const jobId = document.getElementById("mkt-apply-form")?.dataset.jobId;
  // Accepting closes the job on the server, so reload the whole job page, not just the list.
  if (jobId) mktOpenJob(jobId);
}

/** Poster clicks "Pay". The amount is never sent from here: the server reads the accepted price itself. */
async function mktPayApplication(appId, btn) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { alert("Please log in again to pay."); return; }
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Opening secure payment…";
  let redirecting = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketplace-pay-application`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ applicationId: appId }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.authorizationUrl) {
      redirecting = true;
      location.href = result.authorizationUrl; // Paystack's own hosted checkout page
      return;
    }
    if (result.bookingId && result.accessToken) {
      alert(result.error || "This payment already exists.");
      redirecting = true;
      location.href = `booking-status.html?id=${encodeURIComponent(result.bookingId)}&token=${encodeURIComponent(result.accessToken)}`;
      return;
    }
    alert(result.error || "Couldn't start the payment. Please try again.");
  } catch {
    alert("Couldn't reach Boardly's payment service. Check your connection and try again.");
  } finally {
    if (!redirecting) { btn.disabled = false; btn.innerHTML = original; }
  }
}

/** Opens the payment status page. Only the poster can fetch this link (the database checks it). */
async function mktOpenPaymentStatus(appId) {
  const { data, error } = await supabaseClient.rpc("get_application_booking_link", { p_application_id: appId });
  const link = Array.isArray(data) ? data[0] : data;
  if (error || !link || !link.booking_id || !link.booking_access_token) {
    alert("No payment has been started for this application yet.");
    return;
  }
  location.href = `booking-status.html?id=${encodeURIComponent(link.booking_id)}&token=${encodeURIComponent(link.booking_access_token)}`;
}

async function mktOpenPostJobModal() {
  const modal = document.getElementById("mkt-post-job-modal");
  const loginPrompt = document.getElementById("mkt-post-job-login-prompt");
  const form = document.getElementById("mkt-post-job-form");
  const user = await mktGetCurrentUser();
  loginPrompt?.classList.toggle("hidden", !!user);
  form?.classList.toggle("hidden", !user);
  modal?.classList.remove("hidden");
}

function mktClosePostJobModal() {
  document.getElementById("mkt-post-job-modal")?.classList.add("hidden");
}

async function mktSubmitPostJob(e) {
  e.preventDefault();
  const user = await mktGetCurrentUser();
  if (!user) return;
  const payload = {
    user_id: user.id,
    title: document.getElementById("mkt-job-title").value.trim(),
    description: document.getElementById("mkt-job-description").value.trim(),
    category: document.getElementById("mkt-job-category").value.trim() || null,
    budget_min: document.getElementById("mkt-job-budget-min").value ? Number(document.getElementById("mkt-job-budget-min").value) : null,
    budget_max: document.getElementById("mkt-job-budget-max").value ? Number(document.getElementById("mkt-job-budget-max").value) : null,
    currency: document.getElementById("mkt-job-currency").value,
  };
  const { error } = await supabaseClient.from("marketplace_opportunities").insert(payload);
  if (error) { alert("Couldn't post this job: " + error.message); return; }
  mktClosePostJobModal();
  document.getElementById("mkt-post-job-form").reset();
  mktRenderJobs("");
}

async function mktSubmitApplication(e) {
  e.preventDefault();
  const user = await mktGetCurrentUser();
  if (!user) return;
  const form = e.target;
  const jobId = form.dataset.jobId;
  const existingId = form.dataset.existingId;
  const submitBtn = document.getElementById("mkt-apply-submit");
  const message = document.getElementById("mkt-apply-message").value.trim();
  const priceValue = document.getElementById("mkt-apply-price").value;
  const proposedPrice = priceValue ? Number(priceValue) : null;
  if (!message) { alert("Write a short message with your application."); return; }
  if (proposedPrice !== null && !(proposedPrice > 0)) { alert("Your proposed price must be more than zero, or leave it empty."); return; }

  if (submitBtn) submitBtn.disabled = true;
  let error = null;
  if (existingId) {
    // Editing an application that is still waiting for a reply. The database refuses this once it has been answered.
    const res = await supabaseClient.from("marketplace_applications").update({ message, proposed_price: proposedPrice }).eq("id", existingId).select("id");
    error = res.error;
    if (!error && (!res.data || !res.data.length)) error = { message: "This application has already been answered, so it can no longer be edited." };
  } else {
    const res = await supabaseClient.from("marketplace_applications").insert({ opportunity_id: jobId, applicant_user_id: user.id, message, proposed_price: proposedPrice });
    error = res.error;
  }
  if (submitBtn) submitBtn.disabled = false;
  if (error) { alert("Couldn't send your application: " + mktFriendlyError(error)); return; }
  mktOpenJob(jobId).then(() => {
    const sent = document.getElementById("mkt-apply-sent");
    if (sent) { sent.innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i>${existingId ? "Application updated." : "Application sent."}`; sent.classList.remove("hidden"); }
  });
}

async function mktLoad() {
  const params = new URLSearchParams(location.search);
  const userId = params.get("u");
  const jobId = params.get("job");
  if (jobId) {
    mktSwitchMode("jobs");
    document.getElementById("mkt-jobs-view")?.classList.add("hidden");
    await mktOpenJob(jobId);
  } else if (userId) {
    await mktOpenProfile(userId);
  } else {
    await mktRenderDirectory("");
  }
}

document.getElementById("mkt-search")?.addEventListener("input", (e) => {
  clearTimeout(window._mktSearchTimer);
  window._mktSearchTimer = setTimeout(() => mktRenderDirectory(e.target.value), 250);
});

document.getElementById("mkt-mode-directory-btn")?.addEventListener("click", () => mktSwitchMode("directory"));
document.getElementById("mkt-mode-jobs-btn")?.addEventListener("click", () => mktSwitchMode("jobs"));

document.getElementById("mkt-jobs-search")?.addEventListener("input", (e) => {
  clearTimeout(window._mktJobsSearchTimer);
  window._mktJobsSearchTimer = setTimeout(() => mktRenderJobs(e.target.value), 250);
});

document.getElementById("mkt-jobs-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-job]");
  if (btn) mktOpenJob(btn.dataset.openJob);
});

document.getElementById("mkt-job-back-btn")?.addEventListener("click", mktBackToJobs);
document.getElementById("mkt-my-jobs-btn")?.addEventListener("click", async (e) => {
  const showingMine = e.target.dataset.mine === "true";
  e.target.dataset.mine = String(!showingMine);
  e.target.textContent = showingMine ? "View your postings" : "Back to all open jobs";
  document.getElementById("mkt-jobs-search").value = "";
  mktRenderJobs("", !showingMine);
});
document.getElementById("mkt-post-job-btn")?.addEventListener("click", mktOpenPostJobModal);
document.querySelectorAll("[data-close-post-job]").forEach((el) => el.addEventListener("click", mktClosePostJobModal));
document.getElementById("mkt-post-job-form")?.addEventListener("submit", mktSubmitPostJob);
document.getElementById("mkt-apply-form")?.addEventListener("submit", mktSubmitApplication);

document.getElementById("mkt-applications-list")?.addEventListener("click", (e) => {
  const respondBtn = e.target.closest("[data-respond-application]");
  if (respondBtn) { mktRespondToApplication(respondBtn.dataset.respondApplication, respondBtn.dataset.status); return; }
  const payBtn = e.target.closest("[data-pay-application]");
  if (payBtn) { mktPayApplication(payBtn.dataset.payApplication, payBtn); return; }
  const statusBtn = e.target.closest("[data-payment-status]");
  if (statusBtn) mktOpenPaymentStatus(statusBtn.dataset.paymentStatus);
});
document.getElementById("mkt-job-toggle-btn")?.addEventListener("click", mktToggleJobStatus);
document.getElementById("mkt-job-delete-btn")?.addEventListener("click", mktDeleteJob);

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
