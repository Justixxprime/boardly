/* ==========================================================================
   BOARDLY - cv-builder.js
   --------------------------------------------------------------------------
   Powers cv-builder.html. Standalone page - a CV is personal to the
   account, not board content, so this doesn't load or depend on
   dashboard.js at all; it keeps its own small state object instead of
   sharing the dashboard's global `state`.

   Needs supabase/schema_v61_cv_builder.sql run first, and js/pdf-export.js
   loaded before it for the Download PDF button.
   ========================================================================== */

const ACCENT_HEX = { orange: "#E8622C", teal: "#0F9A78", violet: "#6355C7", pink: "#DB4C8C" };

const SECTION_FIELDS = {
  experience: [
    { key: "role", placeholder: "Role" },
    { key: "company", placeholder: "Company" },
    { key: "location", placeholder: "Location" },
    { key: "startDate", placeholder: "Start (e.g. 2022)" },
    { key: "endDate", placeholder: "End (or Present)" },
    { key: "bullets", placeholder: "One achievement per line", type: "textarea" },
  ],
  education: [
    { key: "school", placeholder: "School" },
    { key: "degree", placeholder: "Degree" },
    { key: "field", placeholder: "Field of study" },
    { key: "startDate", placeholder: "Start" },
    { key: "endDate", placeholder: "End" },
  ],
  projects: [
    { key: "name", placeholder: "Project name" },
    { key: "description", placeholder: "What it is or your role", type: "textarea" },
    { key: "link", placeholder: "Link (optional)" },
  ],
  certifications: [
    { key: "name", placeholder: "Certification name" },
    { key: "issuer", placeholder: "Issuer" },
    { key: "date", placeholder: "Date" },
  ],
  languages: [
    { key: "name", placeholder: "Language" },
    { key: "level", placeholder: "Level, e.g. Fluent" },
  ],
};

function blankResumeData() {
  return { personal: {}, summary: "", experience: [], education: [], skills: [], projects: [], certifications: [], languages: [] };
}

const cvbState = {
  ready: false,
  userId: null,
  editingId: null,
  template: "ledger",
  accent: "orange",
  data: blankResumeData(),
  saved: [],
};

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* ---- Rendering the resume itself ------------------------------------- */

function contactRowHTML(p) {
  const parts = [];
  if (p.email) parts.push(`<span><i class="fa-solid fa-envelope"></i>${esc(p.email)}</span>`);
  if (p.phone) parts.push(`<span><i class="fa-solid fa-phone"></i>${esc(p.phone)}</span>`);
  if (p.location) parts.push(`<span><i class="fa-solid fa-location-dot"></i>${esc(p.location)}</span>`);
  if (p.website) parts.push(`<span><i class="fa-solid fa-globe"></i>${esc(p.website)}</span>`);
  return parts.join("");
}

function dateRangeHTML(item) {
  if (!item.startDate && !item.endDate) return "";
  return `<span class="rp-dates">${esc(item.startDate)}${item.startDate && item.endDate ? " - " : ""}${esc(item.endDate)}</span>`;
}

function entriesHTML(list, kind) {
  if (!list || !list.length) return "";
  return list.map((item) => {
    if (kind === "experience") {
      const bullets = String(item.bullets || "").split("\n").map((l) => l.trim()).filter(Boolean);
      return `<div class="rp-entry">
        <div class="rp-entry-head">
          <div><span class="rp-role">${esc(item.role)}</span>${item.company ? ` <span class="rp-org">at ${esc(item.company)}</span>` : ""}</div>
          ${dateRangeHTML(item)}
        </div>
        ${item.location ? `<p class="rp-org">${esc(item.location)}</p>` : ""}
        ${bullets.length ? `<ul class="rp-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>`;
    }
    if (kind === "education") {
      return `<div class="rp-entry">
        <div class="rp-entry-head">
          <span class="rp-role">${esc(item.degree)}${item.field ? `, ${esc(item.field)}` : ""}</span>
          ${dateRangeHTML(item)}
        </div>
        ${item.school ? `<p class="rp-org">${esc(item.school)}</p>` : ""}
      </div>`;
    }
    if (kind === "projects") {
      return `<div class="rp-entry">
        <span class="rp-role">${esc(item.name)}</span>
        ${item.description ? `<p class="rp-org">${esc(item.description)}</p>` : ""}
        ${item.link ? `<p class="rp-org">${esc(item.link)}</p>` : ""}
      </div>`;
    }
    if (kind === "certifications") {
      return `<div class="rp-entry">
        <div class="rp-entry-head">
          <span class="rp-role">${esc(item.name)}</span>
          <span class="rp-dates">${esc(item.date)}</span>
        </div>
        ${item.issuer ? `<p class="rp-org">${esc(item.issuer)}</p>` : ""}
      </div>`;
    }
    if (kind === "languages") {
      return `<div class="rp-entry rp-entry-head"><span class="rp-role">${esc(item.name)}</span><span class="rp-org">${esc(item.level)}</span></div>`;
    }
    return "";
  }).join("");
}

function sectionHTML(label, inner) {
  if (!inner) return "";
  return `<div class="rp-section"><p class="rp-label">${esc(label)}</p>${inner}</div>`;
}

function renderResumeHTML(data, template, accent) {
  const p = data.personal || {};
  const accentHex = ACCENT_HEX[accent] || ACCENT_HEX.orange;
  const nameHTML = p.fullName ? esc(p.fullName) : `<span class="rp-empty-hint">Your name</span>`;
  const skillsHTML = (data.skills || []).length ? `<div>${data.skills.map((s) => `<span class="rp-tag">${esc(s)}</span>`).join("")}</div>` : "";
  const summaryHTML = data.summary ? `<p>${esc(data.summary)}</p>` : "";

  if (template === "studio") {
    return `<div class="resume-page rt-studio" style="--rp-accent:${accentHex}">
      <div class="rp-sidebar">
        <p class="rp-name">${nameHTML}</p>
        ${p.title ? `<p class="rp-title">${esc(p.title)}</p>` : ""}
        <div class="rp-contact">${contactRowHTML(p)}</div>
        ${sectionHTML("Skills", skillsHTML)}
        ${sectionHTML("Languages", entriesHTML(data.languages, "languages"))}
        ${sectionHTML("Certifications", entriesHTML(data.certifications, "certifications"))}
      </div>
      <div class="rp-main">
        ${sectionHTML("Summary", summaryHTML)}
        ${sectionHTML("Experience", entriesHTML(data.experience, "experience"))}
        ${sectionHTML("Education", entriesHTML(data.education, "education"))}
        ${sectionHTML("Projects", entriesHTML(data.projects, "projects"))}
      </div>
    </div>`;
  }

  const header = `<div class="rp-header">
    <p class="rp-name">${nameHTML}</p>
    ${p.title ? `<p class="rp-title">${esc(p.title)}</p>` : ""}
    <div class="rp-contact" style="margin-top:10px">${contactRowHTML(p)}</div>
  </div>`;

  const sections = `
    ${sectionHTML("Summary", summaryHTML)}
    ${sectionHTML("Experience", entriesHTML(data.experience, "experience"))}
    ${sectionHTML("Education", entriesHTML(data.education, "education"))}
    ${sectionHTML("Skills", skillsHTML)}
    ${sectionHTML("Projects", entriesHTML(data.projects, "projects"))}
    ${sectionHTML("Certifications", entriesHTML(data.certifications, "certifications"))}
    ${sectionHTML("Languages", entriesHTML(data.languages, "languages"))}`;

  return `<div class="resume-page rt-${template}" style="--rp-accent:${accentHex}"><div class="rp-body">${header}${sections}</div></div>`;
}

function renderPreview() {
  const wrap = document.getElementById("cvb-preview");
  if (!wrap) return;
  wrap.innerHTML = renderResumeHTML(cvbState.data, cvbState.template, cvbState.accent);
  wrap.classList.remove("cvb-preview-fade");
  void wrap.offsetWidth;
  wrap.classList.add("cvb-preview-fade");
}

/* ---- The form side: entry lists, skills tags, personal fields --------- */

function renderEntryList(section) {
  const container = document.getElementById(`cvb-list-${section}`);
  if (!container) return;
  const fields = SECTION_FIELDS[section];
  const items = cvbState.data[section] || [];
  container.innerHTML = items.map((item, i) => `
    <div class="cvb-entry-card" data-index="${i}">
      <div class="grid ${fields.length > 3 ? "sm:grid-cols-2" : ""} gap-1.5">
        ${fields.map((f) => f.type === "textarea"
          ? `<textarea data-field="${f.key}" rows="2" placeholder="${esc(f.placeholder)}" class="input text-xs resize-none sm:col-span-2">${esc(item[f.key] || "")}</textarea>`
          : `<input data-field="${f.key}" type="text" value="${esc(item[f.key] || "")}" placeholder="${esc(f.placeholder)}" class="input text-xs">`
        ).join("")}
      </div>
      <button type="button" data-remove-entry class="text-critical text-xs mt-1.5"><i class="fa-solid fa-trash-can mr-1"></i>Remove</button>
    </div>`).join("");
}

function renderSkills() {
  const wrap = document.getElementById("cvb-list-skills");
  if (!wrap) return;
  wrap.innerHTML = (cvbState.data.skills || []).map((s, i) => `
    <span class="rp-tag" style="background:var(--card); border:1px solid var(--line)">${esc(s)} <button type="button" data-remove-skill="${i}" class="ml-1 text-ink-soft hover:text-critical"><i class="fa-solid fa-xmark"></i></button></span>`).join("");
}

function fillFormFromState() {
  const p = cvbState.data.personal || {};
  ["fullName", "title", "email", "phone", "location", "website"].forEach((k) => {
    const el = document.getElementById(`cvb-p-${k}`);
    if (el) el.value = p[k] || "";
  });
  const summaryEl = document.getElementById("cvb-summary");
  if (summaryEl) summaryEl.value = cvbState.data.summary || "";
  ["experience", "education", "projects", "certifications", "languages"].forEach(renderEntryList);
  renderSkills();
}

function updatePickerActiveStates() {
  document.querySelectorAll("[data-template]").forEach((b) => { b.dataset.active = String(b.dataset.template === cvbState.template); });
  document.querySelectorAll("[data-accent]").forEach((b) => { b.dataset.active = String(b.dataset.accent === cvbState.accent); });
}

/* ---- Save / load / new / export ---------------------------------------- */

async function checkReady() {
  const { error } = await supabaseClient.from("resumes").select("id").limit(1);
  cvbState.ready = !error;
  document.getElementById("cvb-not-ready")?.classList.toggle("hidden", cvbState.ready);
  return cvbState.ready;
}

async function loadMyCVs() {
  const { data, error } = await supabaseClient.from("resumes").select("id, title").order("updated_at", { ascending: false });
  if (error) return;
  cvbState.saved = data || [];
  const select = document.getElementById("cvb-my-cvs");
  if (select) select.innerHTML = `<option value="">My CVs...</option>` + cvbState.saved.map((r) => `<option value="${r.id}">${esc(r.title)}</option>`).join("");
}

async function loadCV(id) {
  const { data, error } = await supabaseClient.from("resumes").select("*").eq("id", id).single();
  if (error) { toast("Couldn't open that CV: " + error.message, "error"); return; }
  cvbState.editingId = data.id;
  cvbState.template = data.template;
  cvbState.accent = data.accent_color;
  cvbState.data = Object.assign(blankResumeData(), data.data);
  const titleEl = document.getElementById("cvb-title");
  if (titleEl) titleEl.value = data.title;
  fillFormFromState();
  updatePickerActiveStates();
  renderPreview();
}

async function saveCV() {
  if (!cvbState.ready) { toast("Run supabase/schema_v61_cv_builder.sql first", "error"); return; }
  const title = document.getElementById("cvb-title").value.trim() || "Untitled CV";
  const payload = { title, template: cvbState.template, accent_color: cvbState.accent, data: cvbState.data };

  if (cvbState.editingId) {
    const { error } = await supabaseClient.from("resumes").update(payload).eq("id", cvbState.editingId);
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
  } else {
    const { data, error } = await supabaseClient.from("resumes").insert({ user_id: cvbState.userId, ...payload }).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    cvbState.editingId = data.id;
  }
  await loadMyCVs();
  const select = document.getElementById("cvb-my-cvs");
  if (select) select.value = cvbState.editingId;
  toast("CV saved", "ok");
}

function newCV() {
  cvbState.editingId = null;
  cvbState.template = "ledger";
  cvbState.accent = "orange";
  cvbState.data = blankResumeData();
  const titleEl = document.getElementById("cvb-title");
  if (titleEl) titleEl.value = "";
  const select = document.getElementById("cvb-my-cvs");
  if (select) select.value = "";
  fillFormFromState();
  updatePickerActiveStates();
  renderPreview();
}

async function downloadCVPDF() {
  const el = document.querySelector("#cvb-preview .resume-page");
  if (!el) return;
  const title = document.getElementById("cvb-title").value.trim() || cvbState.data.personal.fullName || "CV";
  const status = document.getElementById("cvb-status");
  try {
    await exportElementToPDF(el, `${title}.pdf`, (msg) => { if (status) status.textContent = msg; });
    if (status) status.textContent = "Downloaded.";
  } catch (err) {
    if (status) status.textContent = "";
    toast("Couldn't create the PDF: " + (err.message || "unknown error"), "error");
  }
}

// A portable backup of everything typed in, independent of Boardly's
// own database - the same reasoning Custom Forms' own JSON-ish
// thinking follows: something a person can keep, move, or hand to a
// future version of this tool (or a different tool entirely) without
// depending on this account still existing.
function downloadCVJSON() {
  const title = document.getElementById("cvb-title").value.trim() || "cv";
  const payload = { title, template: cvbState.template, accent: cvbState.accent, data: cvbState.data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---- Wiring -------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    console.error("CV Builder: couldn't confirm your session.", err);
    toast("Couldn't confirm your session - try reloading the page.", "error");
    return;
  }
  if (!session) return;
  cvbState.userId = session.user.id;

  // Everything below this line - the live preview, the accordion, every
  // input, the template and accent pickers - works entirely from data
  // already sitting in cvbState and needs no network call at all. It's
  // wired up unconditionally, before any Supabase call, so a slow or
  // failed request further down (checking the resumes table, loading
  // saved CVs) can never leave the builder itself looking broken or
  // unresponsive - only Save/Load ever actually need the database.
  fillFormFromState();
  updatePickerActiveStates();
  renderPreview();

  document.getElementById("cvb-new-btn")?.addEventListener("click", newCV);
  document.getElementById("cvb-save-btn")?.addEventListener("click", saveCV);
  document.getElementById("cvb-download-pdf-btn")?.addEventListener("click", downloadCVPDF);
  document.getElementById("cvb-download-json-btn")?.addEventListener("click", downloadCVJSON);
  document.getElementById("cvb-my-cvs")?.addEventListener("change", (e) => { if (e.target.value) loadCV(e.target.value); });

  document.querySelectorAll(".cvb-acc-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acc = btn.closest(".cvb-acc");
      acc.dataset.open = acc.dataset.open === "true" ? "false" : "true";
    });
  });

  document.querySelectorAll("[data-template]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cvbState.template = btn.dataset.template;
      updatePickerActiveStates();
      renderPreview();
    });
  });
  document.querySelectorAll("[data-accent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cvbState.accent = btn.dataset.accent;
      updatePickerActiveStates();
      renderPreview();
    });
  });

  ["fullName", "title", "email", "phone", "location", "website"].forEach((k) => {
    document.getElementById(`cvb-p-${k}`)?.addEventListener("input", (e) => {
      cvbState.data.personal[k] = e.target.value;
      renderPreview();
    });
  });
  document.getElementById("cvb-summary")?.addEventListener("input", (e) => {
    cvbState.data.summary = e.target.value;
    renderPreview();
  });

  ["experience", "education", "projects", "certifications", "languages"].forEach((section) => {
    const container = document.getElementById(`cvb-list-${section}`);
    container?.addEventListener("input", (e) => {
      const card = e.target.closest("[data-index]");
      const field = e.target.dataset.field;
      if (!card || !field) return;
      cvbState.data[section][Number(card.dataset.index)][field] = e.target.value;
      renderPreview();
    });
    container?.addEventListener("click", (e) => {
      if (!e.target.closest("[data-remove-entry]")) return;
      const card = e.target.closest("[data-index]");
      cvbState.data[section].splice(Number(card.dataset.index), 1);
      renderEntryList(section);
      renderPreview();
    });
  });

  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.add;
      const blank = {};
      SECTION_FIELDS[section].forEach((f) => { blank[f.key] = ""; });
      cvbState.data[section].push(blank);
      renderEntryList(section);
      renderPreview();
    });
  });

  document.getElementById("cvb-skills-input")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = e.target.value.trim();
    if (!value) return;
    cvbState.data.skills.push(value);
    e.target.value = "";
    renderSkills();
    renderPreview();
  });
  document.getElementById("cvb-list-skills")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-skill]");
    if (!btn) return;
    cvbState.data.skills.splice(Number(btn.dataset.removeSkill), 1);
    renderSkills();
    renderPreview();
  });

  // Everything from here on talks to Supabase - wrapped in its own
  // try/catch so a network hiccup or an un-run migration shows up as
  // the intended "run schema_v61" notice or a toast, never as a
  // blank, silently broken page. The builder above is already fully
  // usable even if every line below this point fails outright.
  try {
    await checkReady();
    if (cvbState.ready) await loadMyCVs();

    // Lets a search result (the command palette's cross-entity search)
    // deep-link straight to a specific saved CV, e.g.
    // cv-builder.html?open=<id>, instead of only ever landing on a
    // blank new one.
    const openId = new URLSearchParams(location.search).get("open");
    if (openId && cvbState.ready) await loadCV(openId);
  } catch (err) {
    console.error("CV Builder: couldn't reach the database.", err);
    toast("Couldn't load your saved CVs - check your connection and reload.", "error");
  }
});
