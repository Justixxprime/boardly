/* ==========================================================================
   BOARDLY - task-templates.js  (Task Templates)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/task-templates.js" defer></script>

   Needs supabase/schema_v38_task_templates.sql run first. Until then,
   state.taskTemplatesReady stays false and both the "Save" button and
   the Templates modal quietly explain what to do (same pattern every
   earlier add-on in this project uses - see idea-vault.js).
   ========================================================================== */

state.taskTemplatesReady = false;
state.taskTemplates = [];

async function checkTaskTemplatesReady() {
  const { error } = await supabaseClient.from("task_templates").select("id").limit(1);
  state.taskTemplatesReady = !error;
  return state.taskTemplatesReady;
}

async function loadTaskTemplates() {
  if (!state.taskTemplatesReady) { renderTaskTemplatesList(); return; }
  const { data, error } = await supabaseClient.from("task_templates").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("loadTaskTemplates:", error.message); return; }
  state.taskTemplates = data || [];
  renderTaskTemplatesList();
}

function renderTaskTemplatesList() {
  const list = document.getElementById("task-templates-list");
  const empty = document.getElementById("task-templates-empty");
  const notReady = document.getElementById("task-templates-not-ready");
  if (!list) return;

  if (!state.taskTemplatesReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.taskTemplates.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.taskTemplates.map((tpl) => `
    <div class="ticket p-3" data-id="${tpl.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(tpl.name)}</p>
          <p class="text-xs text-ink-soft truncate mt-0.5">${escapeHTML(tpl.title)}</p>
        </div>
        <button type="button" data-remove-template="${tpl.id}" title="Delete" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-regular fa-trash-can text-xs"></i></button>
      </div>
      ${Array.isArray(tpl.subtasks) && tpl.subtasks.length ? `<p class="text-[11px] text-ink-soft mt-1.5"><i class="fa-solid fa-list-check mr-1"></i>${tpl.subtasks.length} checklist item${tpl.subtasks.length === 1 ? "" : "s"}</p>` : ""}
      <button type="button" data-use-template="${tpl.id}" class="btn btn-secondary btn-pop text-xs w-full mt-2"><i class="fa-solid fa-plus mr-1.5"></i>Create ticket from this</button>
    </div>`).join("");
}

async function saveCurrentTaskAsTemplate() {
  if (!state.taskTemplatesReady) { toast("Run supabase/schema_v38_task_templates.sql first", "error"); return; }
  const task = state.tasks.find((t) => t.id === state.editingId);
  if (!task) return;
  const name = window.prompt("Name this template (e.g. \"Weekly content batch ticket\"):", task.title);
  if (!name || !name.trim()) return;

  const { data, error } = await supabaseClient
    .from("task_templates")
    .insert({
      user_id: state.userId,
      board_id: state.currentBoardId,
      name: name.trim(),
      title: task.title,
      notes: task.notes || null,
      category: task.category || "general",
      platform: task.platform || null,
      task_type: task.task_type || null,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    })
    .select()
    .single();
  if (error) { toast("Couldn't save template: " + error.message, "error"); return; }
  state.taskTemplates.unshift(data);
  toast(`Saved "${data.name}" as a template`, "ok");
}

async function removeTaskTemplate(id) {
  const item = state.taskTemplates.find((t) => t.id === id);
  state.taskTemplates = state.taskTemplates.filter((t) => t.id !== id); // optimistic
  renderTaskTemplatesList();
  const { error } = await supabaseClient.from("task_templates").delete().eq("id", id);
  if (error) {
    if (item) state.taskTemplates.unshift(item); // roll back
    renderTaskTemplatesList();
    toast("Couldn't delete: " + error.message, "error");
  }
}

// Always creates a brand new, independent ticket. The template itself
// never changes, and neither does any earlier ticket made from it.
async function useTaskTemplate(id) {
  const tpl = state.taskTemplates.find((t) => t.id === id);
  if (!tpl) return;
  const newTask = await addTask(tpl.title, tpl.category || "general", null, tpl.platform || null);

  if (newTask?.id) {
    const followUp = {};
    if (tpl.notes) followUp.notes = tpl.notes;
    if (Array.isArray(tpl.subtasks) && tpl.subtasks.length && state.v2Ready) followUp.subtasks = tpl.subtasks;
    if (tpl.task_type && state.taskTypeReady) followUp.task_type = tpl.task_type;
    if (Object.keys(followUp).length) {
      Object.assign(newTask, followUp);
      const idx = state.tasks.findIndex((t) => t.id === newTask.id);
      if (idx !== -1) state.tasks[idx] = newTask;
      await supabaseClient.from("tasks").update(followUp).eq("id", newTask.id);
      renderBoard();
    }
  }
  toast(`New ticket created from "${tpl.name}"`, "ok");
  document.getElementById("task-templates-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkTaskTemplatesReady();

  const modal = document.getElementById("task-templates-modal");
  document.getElementById("task-templates-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadTaskTemplates();
  });
  document.querySelectorAll("[data-close-task-templates]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("edit-save-as-template-btn")?.addEventListener("click", saveCurrentTaskAsTemplate);

  document.getElementById("task-templates-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-template]");
    if (removeBtn) { removeTaskTemplate(removeBtn.dataset.removeTemplate); return; }
    const useBtn = e.target.closest("[data-use-template]");
    if (useBtn) useTaskTemplate(useBtn.dataset.useTemplate);
  });
});
