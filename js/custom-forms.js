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
    if (copyBtn) copyFormLink(copyBtn.dataset.copyFormLink);
  });
});
