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
      ${profile.bio ? `<p class="text-sm whitespace-pre-wrap mb-3">${escapeMktHTML(profile.bio)}</p>` : ""}
      <div class="flex flex-wrap gap-1.5 mb-3">${mktSkillChips(profile.skills)}</div>
      <div class="flex flex-wrap gap-3 text-xs text-ink-soft">
        ${profile.rate_range ? `<span><i class="fa-solid fa-sack-dollar mr-1"></i>${escapeMktHTML(profile.rate_range)}</span>` : ""}
        ${profile.location ? `<span><i class="fa-solid fa-location-dot mr-1"></i>${escapeMktHTML(profile.location)}</span>` : ""}
        ${profile.portfolio_url ? `<a href="${escapeMktHTML(profile.portfolio_url)}" target="_blank" rel="noopener" class="text-orange hover:underline"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>Portfolio</a>` : ""}
      </div>
    </div>`;
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
  document.getElementById("mkt-directory-view").classList.add("hidden");
  document.getElementById("mkt-notfound").classList.add("hidden");
  document.getElementById("mkt-detail-view").classList.remove("hidden");
  document.getElementById("mkt-contact-sent").classList.add("hidden");
  document.getElementById("mkt-contact-form").classList.remove("hidden");
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

window.addEventListener("popstate", mktLoad);
mktLoad();
