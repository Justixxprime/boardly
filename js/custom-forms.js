/* ==========================================================================
   BOARDLY - custom-forms.js  (Custom Form Builder)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/custom-forms.js" defer></script>

   Needs supabase/schema_v58_custom_forms.sql run first.

   Phase 5 (Forms + Automation): the Request Portal already covers "one
   fixed public form per board." This is the general-purpose version -
   you define the fields yourself, and a board can have several of these
   side by side, each with its own link. Two modals: #custom-forms-modal
   lists the board's forms and handles publish/copy-link/delete;
   #custom-form-builder-modal is the actual field editor, opened either
   for a brand new form or an existing one.
   ========================================================================== */

state.customFormsReady = false;
state.customForms = [];
state.customFormBuilderFields = [];   // fields being assembled in the open builder session
state.customFormEditingId = null;     // null while creating a new form; the form's id while editing one
state.formSubmissions = [];           // responses for whichever form's submissions list is open
state.formSubmissionsFormId = null;

async function checkCustomFormsReady() {
  const { error } = await supabaseClient.from("custom_forms").select("id").limit(1);
  state.customFormsReady = !error;
  return state.customFormsReady;
}

async function loadCustomForms() {
  if (!state.customFormsReady || !state.currentBoardId) { state.customForms = []; renderCustomFormsList(); return; }
  const { data, error } = await supabaseClient
    .from("custom_forms")
    .select("*")
    .eq("board_id", state.currentBoardId)
    .order("created_at", { ascending: false });
  if (error) { console.warn("loadCustomForms:", error.message); return; }
  state.customForms = data || [];
  renderCustomFormsList();
}

function renderCustomFormsList() {
  const list = document.getElementById("custom-forms-list");
  const empty = document.getElementById("custom-forms-empty");
  const notReady = document.getElementById("custom-forms-not-ready");
  if (!list) return;

  if (!state.customFormsReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.customForms.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.customForms.map((f) => `
    <div class="ticket p-3" data-id="${f.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(f.name)}</p>
          <p class="text-xs text-ink-soft mt-0.5">${(f.fields || []).length} field${(f.fields || []).length === 1 ? "" : "s"} - ${f.published ? '<span style="color:var(--teal)">Published</span>' : "Not published"}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${f.published ? `<button type="button" data-copy-form-link="${f.id}" title="Copy public link" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-link"></i></button>` : ""}
          <button type="button" data-download-form-pdf="${f.id}" title="Download a blank, printable copy as a PDF" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-file-pdf"></i></button>
          ${f.published ? `<button type="button" data-view-form-submissions="${f.id}" title="View responses" class="text-ink-soft hover:text-teal"><i class="fa-solid fa-inbox"></i></button>` : ""}
          <button type="button" data-toggle-form-published="${f.id}" title="${f.published ? "Unpublish" : "Publish"}" class="text-ink-soft hover:text-teal"><i class="fa-solid ${f.published ? "fa-toggle-on text-teal" : "fa-toggle-off"}"></i></button>
          <button type="button" data-edit-form="${f.id}" title="Edit" class="text-ink-soft hover:text-orange"><i class="fa-solid fa-pen text-xs"></i></button>
        </div>
      </div>
    </div>`).join("");
}

function refreshFieldOptionsVisibility() {
  const type = document.getElementById("custom-form-field-type")?.value;
  document.getElementById("custom-form-field-options")?.classList.toggle("hidden", type !== "select");
}

function renderBuilderFieldsList() {
  const list = document.getElementById("custom-form-fields-list");
  const empty = document.getElementById("custom-form-fields-empty");
  if (!list) return;
  if (!state.customFormBuilderFields.length) {
    list.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  list.innerHTML = state.customFormBuilderFields.map((field) => `
    <div class="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5">
      <label class="flex items-center gap-1.5 text-[11px] text-ink-soft shrink-0" title="Use this field's answer as the ticket title">
        <input type="radio" name="custom-form-title-field" data-set-title-field="${field.id}" ${field.useAsTitle ? "checked" : ""} ${field.type === "checkbox" ? "disabled" : ""}>
        Title
      </label>
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHTML(field.label)}${field.required ? " *" : ""}</p>
        <p class="text-[11px] text-ink-soft">${field.type}${field.type === "select" ? ` - ${(field.options || []).join(", ")}` : ""}</p>
      </div>
      <button type="button" data-remove-builder-field="${field.id}" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join("");
}

function addBuilderField() {
  const labelInput = document.getElementById("custom-form-field-label");
  const label = labelInput.value.trim();
  if (!label) { toast("Give the field a label first", "error"); return; }
  const type = document.getElementById("custom-form-field-type").value;
  const required = document.getElementById("custom-form-field-required").checked;
  const options = type === "select"
    ? document.getElementById("custom-form-field-options").value.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  if (type === "select" && !options.length) { toast("Add at least one dropdown option", "error"); return; }

  const field = { id: crypto.randomUUID(), label, type, required, ...(options ? { options } : {}) };
  // The very first field added to a fresh form defaults to being the
  // ticket title, since most forms have an obvious "what is this about"
  // field first - anyone can move that radio to a different field
  // afterward, so this is a convenience default, not a fixed rule.
  if (!state.customFormBuilderFields.some((f) => f.useAsTitle) && type !== "checkbox") field.useAsTitle = true;
  state.customFormBuilderFields.push(field);
  renderBuilderFieldsList();

  labelInput.value = "";
  document.getElementById("custom-form-field-required").checked = false;
  document.getElementById("custom-form-field-options").value = "";
}

function removeBuilderField(id) {
  const wasTitle = state.customFormBuilderFields.find((f) => f.id === id)?.useAsTitle;
  state.customFormBuilderFields = state.customFormBuilderFields.filter((f) => f.id !== id);
  // If the field carrying the title got removed, hand the title role to
  // whatever's now first rather than leaving the form with no title
  // field at all (submit-custom-form already falls back gracefully
  // either way, but this keeps the builder's own state sensible).
  if (wasTitle && state.customFormBuilderFields.length) {
    const next = state.customFormBuilderFields.find((f) => f.type !== "checkbox");
    if (next) next.useAsTitle = true;
  }
  renderBuilderFieldsList();
}

function setBuilderTitleField(id) {
  state.customFormBuilderFields.forEach((f) => { f.useAsTitle = f.id === id; });
}

function openFormBuilder(formId) {
  state.customFormEditingId = formId || null;
  const form = formId ? state.customForms.find((f) => f.id === formId) : null;

  document.getElementById("custom-form-builder-title").textContent = form ? "Edit form" : "New form";
  document.getElementById("custom-form-name").value = form?.name || "";
  document.getElementById("custom-form-description").value = form?.description || "";
  document.getElementById("custom-form-target-status").value = form?.target_status || "todo";
  document.getElementById("custom-form-delete-btn").classList.toggle("hidden", !form);
  state.customFormBuilderFields = form ? JSON.parse(JSON.stringify(form.fields || [])) : [];
  renderBuilderFieldsList();

  document.getElementById("custom-forms-modal")?.classList.add("hidden");
  document.getElementById("custom-form-builder-modal")?.classList.remove("hidden");
}

function closeFormBuilder(reopenList = true) {
  document.getElementById("custom-form-builder-modal")?.classList.add("hidden");
  state.customFormEditingId = null;
  state.customFormBuilderFields = [];
  if (reopenList) document.getElementById("custom-forms-modal")?.classList.remove("hidden");
}

async function saveCustomForm() {
  if (!state.customFormsReady) { toast("Run supabase/schema_v58_custom_forms.sql first", "error"); return; }
  const name = document.getElementById("custom-form-name").value.trim();
  if (!name) { toast("Give the form a name first", "error"); return; }
  if (!state.customFormBuilderFields.length) { toast("Add at least one field first", "error"); return; }

  const payload = {
    name,
    description: document.getElementById("custom-form-description").value.trim(),
    target_status: document.getElementById("custom-form-target-status").value,
    fields: state.customFormBuilderFields,
  };

  if (state.customFormEditingId) {
    const { data, error } = await supabaseClient.from("custom_forms").update(payload).eq("id", state.customFormEditingId).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    state.customForms = state.customForms.map((f) => (f.id === data.id ? data : f));
  } else {
    const { data, error } = await supabaseClient.from("custom_forms").insert({
      user_id: state.userId, board_id: state.currentBoardId, ...payload,
    }).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    state.customForms.unshift(data);
  }
  renderCustomFormsList();
  closeFormBuilder();
  toast("Form saved", "ok");
}

async function deleteCustomForm() {
  const id = state.customFormEditingId;
  if (!id) return;
  if (!confirm("Delete this form? Existing tickets it already created stay put, but the link will stop working and past responses are removed.")) return;
  const { error } = await supabaseClient.from("custom_forms").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message, "error"); return; }
  state.customForms = state.customForms.filter((f) => f.id !== id);
  renderCustomFormsList();
  closeFormBuilder();
  toast("Form deleted", "ok");
}

async function toggleFormPublished(id) {
  const form = state.customForms.find((f) => f.id === id);
  if (!form) return;
  const newValue = !form.published;
  form.published = newValue; // optimistic
  renderCustomFormsList();
  const { error } = await supabaseClient.from("custom_forms").update({ published: newValue }).eq("id", id);
  if (error) { form.published = !newValue; renderCustomFormsList(); toast("Couldn't update: " + error.message, "error"); return; }
  toast(newValue ? "Form published" : "Form unpublished", "ok");
}

async function copyFormLink(id) {
  const form = state.customForms.find((f) => f.id === id);
  if (!form) return;
  const url = new URL("form.html", window.location.href);
  url.searchParams.set("f", form.public_token);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Form link copied", "ok");
  } catch {
    window.prompt("Copy this public form link:", url.toString());
  }
}

// A blank, printable version of the form - each field rendered as a
// label with an actual ruled line (or checkbox pair, for a checkbox
// field) to write an answer on by hand, the way a paper intake form
// would look. This is deliberately NOT a re-export of any past
// submission - it's the blank form itself, for anyone who wants a
// physical copy to hand someone, or a record of exactly what the form
// asked at a point in time.
async function downloadFormPDF(id) {
  const form = state.customForms.find((f) => f.id === id);
  if (!form) return;
  const fieldsHTML = (form.fields || []).map((field) => {
    if (field.type === "checkbox") {
      return `<p style="margin:14px 0"><span style="display:inline-block; width:14px; height:14px; border:1px solid #333; margin-right:8px; vertical-align:middle"></span>${escapeHTML(field.label)}</p>`;
    }
    const lineHeight = field.type === "textarea" ? "60px" : "28px";
    return `<div style="margin:14px 0">
      <p style="margin:0 0 4px; font-size:13px; color:#333">${escapeHTML(field.label)}${field.required ? " *" : ""}${field.type === "select" ? ` (${(field.options || []).map(escapeHTML).join(" / ")})` : ""}</p>
      <div style="height:${lineHeight}; border-bottom:1px solid #999"></div>
    </div>`;
  }).join("");

  const html = buildDocumentShell({
    eyebrow: "Blank form",
    title: form.name,
    subtitle: form.description || "",
    accent: "orange",
    bodyHTML: fieldsHTML,
  });
  await exportHTMLToPDF(html, `${form.name}.pdf`);
}

async function loadFormSubmissions(formId) {
  const { data, error } = await supabaseClient
    .from("custom_form_submissions")
    .select("*")
    .eq("form_id", formId)
    .order("created_at", { ascending: false });
  if (error) { toast("Couldn't load responses: " + error.message, "error"); return; }
  state.formSubmissions = data || [];
  renderFormSubmissionsList();
}

function renderFormSubmissionsList() {
  const list = document.getElementById("form-submissions-list");
  const empty = document.getElementById("form-submissions-empty");
  if (!list) return;
  if (!state.formSubmissions.length) {
    list.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  list.innerHTML = state.formSubmissions.map((s) => `
    <div class="flex items-center justify-between gap-3 border border-line rounded-lg px-3 py-2">
      <span class="text-xs text-ink-soft">${new Date(s.created_at).toLocaleString()}</span>
      <button type="button" data-download-submission-pdf="${s.id}" class="btn btn-secondary text-xs !py-1 !px-2.5"><i class="fa-solid fa-file-pdf mr-1"></i>Download</button>
    </div>`).join("");
}

function openFormSubmissions(formId) {
  const form = state.customForms.find((f) => f.id === formId);
  if (!form) return;
  state.formSubmissionsFormId = formId;
  document.getElementById("form-submissions-title").textContent = `Responses - ${form.name}`;
  document.getElementById("custom-forms-modal")?.classList.add("hidden");
  document.getElementById("form-submissions-modal")?.classList.remove("hidden");
  loadFormSubmissions(formId);
}

function closeFormSubmissions() {
  document.getElementById("form-submissions-modal")?.classList.add("hidden");
  document.getElementById("custom-forms-modal")?.classList.remove("hidden");
}

// A nicely designed, single-response document - each answer shown as
// a real label/value pair rather than the raw jsonb, so a submission
// reads like something you'd actually hand someone, not a database
// dump. Field labels are looked up from the form's OWN current field
// definitions, so an old response still reads correctly - only the
// field ids need to still line up, which they always do since fields
// keep the same id for their whole life once added in the builder.
async function downloadSubmissionPDF(submissionId) {
  const submission = state.formSubmissions.find((s) => s.id === submissionId);
  const form = state.customForms.find((f) => f.id === state.formSubmissionsFormId);
  if (!submission || !form) return;

  const rowsHTML = (form.fields || []).map((field) => {
    const raw = submission.answers?.[field.id];
    const value = field.type === "checkbox" ? (raw ? "Yes" : "No") : (raw || "-");
    return `<div style="margin:12px 0">
      <p style="margin:0 0 2px; font-size:11.5px; color:#888">${escapeHTML(field.label)}</p>
      <p style="margin:0; font-size:14px;">${escapeHTML(String(value))}</p>
    </div>`;
  }).join("");

  const html = buildDocumentShell({
    eyebrow: "Form response",
    title: form.name,
    subtitle: new Date(submission.created_at).toLocaleString(),
    accent: "teal",
    bodyHTML: rowsHTML,
  });
  await exportHTMLToPDF(html, `${form.name} response ${new Date(submission.created_at).toISOString().slice(0, 10)}.pdf`);
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkCustomFormsReady();

  const listModal = document.getElementById("custom-forms-modal");
  document.getElementById("custom-forms-btn")?.addEventListener("click", async () => {
    listModal?.classList.remove("hidden");
    await loadCustomForms();
  });
  document.querySelectorAll("[data-close-custom-forms]").forEach((el) => el.addEventListener("click", () => listModal?.classList.add("hidden")));
  document.querySelectorAll("[data-close-form-builder]").forEach((el) => el.addEventListener("click", () => closeFormBuilder()));

  document.getElementById("custom-form-new-btn")?.addEventListener("click", () => openFormBuilder(null));
  document.getElementById("custom-form-field-type")?.addEventListener("change", refreshFieldOptionsVisibility);
  document.getElementById("custom-form-add-field-btn")?.addEventListener("click", addBuilderField);
  document.getElementById("custom-form-save-btn")?.addEventListener("click", saveCustomForm);
  document.getElementById("custom-form-delete-btn")?.addEventListener("click", deleteCustomForm);

  document.getElementById("custom-form-fields-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-builder-field]");
    if (removeBtn) removeBuilderField(removeBtn.dataset.removeBuilderField);
  });
  document.getElementById("custom-form-fields-list")?.addEventListener("change", (e) => {
    const radio = e.target.closest("[data-set-title-field]");
    if (radio) { setBuilderTitleField(radio.dataset.setTitleField); renderBuilderFieldsList(); }
  });

  document.getElementById("custom-forms-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-form]");
    if (editBtn) { openFormBuilder(editBtn.dataset.editForm); return; }
    const toggleBtn = e.target.closest("[data-toggle-form-published]");
    if (toggleBtn) { toggleFormPublished(toggleBtn.dataset.toggleFormPublished); return; }
    const copyBtn = e.target.closest("[data-copy-form-link]");
    if (copyBtn) { copyFormLink(copyBtn.dataset.copyFormLink); return; }
    const downloadBtn = e.target.closest("[data-download-form-pdf]");
    if (downloadBtn) { downloadFormPDF(downloadBtn.dataset.downloadFormPdf); return; }
    const viewSubmissionsBtn = e.target.closest("[data-view-form-submissions]");
    if (viewSubmissionsBtn) openFormSubmissions(viewSubmissionsBtn.dataset.viewFormSubmissions);
  });

  document.querySelectorAll("[data-close-form-submissions]").forEach((el) => el.addEventListener("click", closeFormSubmissions));
  document.getElementById("form-submissions-list")?.addEventListener("click", (e) => {
    const downloadBtn = e.target.closest("[data-download-submission-pdf]");
    if (downloadBtn) downloadSubmissionPDF(downloadBtn.dataset.downloadSubmissionPdf);
  });
});
