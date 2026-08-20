/* ==========================================================================
   BOARDLY - board-templates-custom.js  ("Save this board as a template" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/board-templates-custom.js" defer></script>

   Needs supabase/schema_v18_custom_templates.sql run first. Until then,
   state.customTemplatesReady stays false and the Save button explains
   what to do, the same pattern every earlier add-on in this project uses.

   What this does NOT touch: the built-in BOARD_TEMPLATES array and its
   useTemplate() function in dashboard.js are untouched. This module
   adds a second, separate source of templates (the user's own,
   fetched from the new board_templates table) and shows them above
   the built-in ones in the same gallery modal, using its own
   #custom-templates-gallery mount point.
   ========================================================================== */

state.customTemplatesReady = false;
state.customTemplates = [];

// ---------------------------------------------------------------------------
// 0. READINESS CHECK - same probe pattern as checkCollabReady() etc.
// ---------------------------------------------------------------------------
async function checkCustomTemplatesReady() {
  const { error } = await supabaseClient.from("board_templates").select("id").limit(1);
  state.customTemplatesReady = !error;
  return state.customTemplatesReady;
}

// ---------------------------------------------------------------------------
// 1. SAVE THE CURRENT BOARD AS A TEMPLATE
// ---------------------------------------------------------------------------
async function saveCurrentBoardAsTemplate() {
  if (!state.customTemplatesReady) {
    typeof toast === "function" && toast("Run supabase/schema_v18_custom_templates.sql first", "error");
    return;
  }
  if (!state.tasks?.length) {
    typeof toast === "function" && toast("This board has no tasks yet - add some first", "error");
    return;
  }
  const currentBoard = state.boards.find((b) => b.id === state.currentBoardId);
  const suggestedName = currentBoard ? `${currentBoard.name} template` : "My template";
  const name = window.prompt("Name this template:", suggestedName);
  if (!name || !name.trim()) return; // cancelled

  // Same [title, category] shape the built-in BOARD_TEMPLATES already
  // use, so both sources can be rendered and used by the same code.
  const tasks = state.tasks.map((t) => [t.title, t.category || "general"]);

  const { error } = await supabaseClient.from("board_templates").insert({
    user_id: state.userId,
    name: name.trim(),
    icon: "fa-layer-group",
    tasks,
  });
  if (error) {
    typeof toast === "function" && toast("Couldn't save template: " + error.message, "error");
    return;
  }
  typeof toast === "function" && toast(`Saved "${name.trim()}" as a template`, "ok");
  await loadCustomTemplates();
}

// ---------------------------------------------------------------------------
// 2. LOAD + RENDER
// ---------------------------------------------------------------------------
async function loadCustomTemplates() {
  if (!state.customTemplatesReady) return;
  const { data, error } = await supabaseClient
    .from("board_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.warn("loadCustomTemplates:", error.message); return; }
  state.customTemplates = data || [];
  renderCustomTemplatesGallery();
}

function renderCustomTemplatesGallery() {
  const section = document.getElementById("custom-templates-section");
  const wrap = document.getElementById("custom-templates-gallery");
  if (!section || !wrap) return;
  if (!state.customTemplates.length) { section.classList.add("hidden"); wrap.innerHTML = ""; return; }
  section.classList.remove("hidden");
  wrap.innerHTML = state.customTemplates.map((t) => `
    <div class="ticket p-4">
      <div class="flex items-start justify-between mb-2">
        <div class="h-9 w-9 rounded-lg bg-orange/15 flex items-center justify-center"><i class="fa-solid ${escapeHTML(t.icon || "fa-layer-group")} text-orange"></i></div>
        <button type="button" data-delete-custom-template="${t.id}" title="Delete this template" class="text-ink-faint hover:text-critical text-xs"><i class="fa-regular fa-trash-can"></i></button>
      </div>
      <p class="font-display font-semibold mb-1">${escapeHTML(t.name)}</p>
      <p class="text-xs text-ink-soft mb-3">${(t.tasks || []).length} starter tickets · yours</p>
      <button type="button" data-use-custom-template="${t.id}" class="toolbar-btn w-full justify-center">Use this template</button>
    </div>`
  ).join("");
}

// ---------------------------------------------------------------------------
// 3. USE A CUSTOM TEMPLATE - mirrors useTemplate() in dashboard.js exactly,
//    just reading from state.customTemplates instead of BOARD_TEMPLATES.
// ---------------------------------------------------------------------------
async function useCustomTemplate(id) {
  const template = state.customTemplates.find((t) => t.id === id);
  if (!template) return;
  document.getElementById("templates-modal")?.classList.add("hidden");

  const { data, error } = await supabaseClient
    .from("boards")
    .insert({ name: template.name, user_id: state.userId })
    .select()
    .single();
  if (error) { typeof toast === "function" && toast("Couldn't create board: " + error.message, "error"); return; }

  state.boards.push(data);
  await switchBoard(data.id);
  for (const [title, category] of template.tasks || []) {
    await addTask(title, category, null);
  }
  typeof toast === "function" && toast(`"${template.name}" board created`, "ok");
}

async function deleteCustomTemplate(id) {
  if (!window.confirm("Delete this template? This does not affect any board already created from it.")) return;
  const { error } = await supabaseClient.from("board_templates").delete().eq("id", id);
  if (error) { typeof toast === "function" && toast("Couldn't delete: " + error.message, "error"); return; }
  await loadCustomTemplates();
}

// ---------------------------------------------------------------------------
// 4. BOOT
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await checkCustomTemplatesReady();
  await loadCustomTemplates();

  document.getElementById("board-save-template-btn")?.addEventListener("click", () => {
    document.getElementById("board-switcher-menu")?.classList.add("hidden");
    saveCurrentBoardAsTemplate();
  });

  document.getElementById("custom-templates-gallery")?.addEventListener("click", (e) => {
    const useBtn = e.target.closest("[data-use-custom-template]");
    if (useBtn) { useCustomTemplate(useBtn.dataset.useCustomTemplate); return; }
    const delBtn = e.target.closest("[data-delete-custom-template]");
    if (delBtn) { deleteCustomTemplate(delBtn.dataset.deleteCustomTemplate); return; }
  });
});
