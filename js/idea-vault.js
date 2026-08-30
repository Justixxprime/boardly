/* ==========================================================================
   BOARDLY - idea-vault.js  (Idea Vault)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/idea-vault.js" defer></script>

   Needs supabase/schema_v37_idea_vault.sql run first. Until then,
   state.ideasReady stays false and the list quietly explains what to do,
   same pattern every earlier add-on in this project uses (see
   decisions.js for the closest sibling).
   ========================================================================== */

const IDEA_STAGES = ["idea", "considering", "validated", "planned", "building", "released", "archived"];
const IDEA_STAGE_LABELS = {
  idea: "Idea", considering: "Considering", validated: "Validated",
  planned: "Planned", building: "Building", released: "Released", archived: "Archived",
};

state.ideasReady = false;
state.ideas = [];

async function checkIdeasReady() {
  const { error } = await supabaseClient.from("ideas").select("id").limit(1);
  state.ideasReady = !error;
  return state.ideasReady;
}

async function loadIdeas() {
  if (!state.ideasReady) { renderIdeaVaultList(); return; }
  const { data, error } = await supabaseClient.from("ideas").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("loadIdeas:", error.message); return; }
  state.ideas = data || [];
  renderIdeaVaultList();
}

function renderIdeaVaultList() {
  const list = document.getElementById("idea-vault-list");
  const empty = document.getElementById("idea-vault-empty");
  const notReady = document.getElementById("idea-vault-not-ready");
  if (!list) return;

  if (!state.ideasReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.ideas.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const stageOptions = (current) => IDEA_STAGES.map((s) =>
    `<option value="${s}" ${s === current ? "selected" : ""}>${IDEA_STAGE_LABELS[s]}</option>`).join("");

  list.innerHTML = state.ideas.map((idea) => `
    <div class="ticket p-3 ${idea.stage === "archived" ? "opacity-60" : ""}" data-id="${idea.id}">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-semibold">${escapeHTML(idea.title)}</p>
        <button type="button" data-remove-idea="${idea.id}" title="Delete" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-regular fa-trash-can text-xs"></i></button>
      </div>
      ${idea.description ? `<p class="text-xs text-ink-soft mt-1">${escapeHTML(idea.description)}</p>` : ""}
      <div class="flex items-center gap-2 mt-2">
        <select data-idea-stage="${idea.id}" class="input text-xs py-1 w-auto">${stageOptions(idea.stage)}</select>
        <button type="button" data-idea-to-task="${idea.id}" class="text-xs text-violet hover:underline shrink-0 ml-auto"><i class="fa-solid fa-arrow-right mr-1"></i>Turn into task</button>
      </div>
    </div>`).join("");
}

async function addIdea(title, description) {
  if (!state.ideasReady) { toast("Run supabase/schema_v37_idea_vault.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("ideas")
    .insert({
      user_id: state.userId,
      board_id: state.currentBoardId,
      title,
      description: description || null,
    })
    .select()
    .single();
  if (error) { toast("Couldn't save: " + error.message, "error"); return; }
  state.ideas.unshift(data);
  renderIdeaVaultList();
}

async function removeIdea(id) {
  const item = state.ideas.find((i) => i.id === id);
  state.ideas = state.ideas.filter((i) => i.id !== id); // optimistic
  renderIdeaVaultList();
  const { error } = await supabaseClient.from("ideas").delete().eq("id", id);
  if (error) {
    if (item) state.ideas.unshift(item); // roll back
    renderIdeaVaultList();
    toast("Couldn't delete: " + error.message, "error");
  }
}

async function setIdeaStage(id, stage) {
  const idea = state.ideas.find((i) => i.id === id);
  const previousStage = idea?.stage;
  if (idea) idea.stage = stage; // optimistic
  const { error } = await supabaseClient.from("ideas").update({ stage }).eq("id", id);
  if (error) {
    if (idea) idea.stage = previousStage; // roll back
    renderIdeaVaultList();
    toast("Couldn't update stage: " + error.message, "error");
  }
}

// This never happens silently or automatically - only when someone
// clicks "Turn into task" on a specific idea. Moves the idea to
// "building" rather than deleting it, so the vault still shows where
// every idea actually ended up.
async function turnIdeaIntoTask(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  await addTask(idea.title, "general", null, null);
  await setIdeaStage(id, "building");
  toast(`"${idea.title}" added to your board`, "ok");
  document.getElementById("idea-vault-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkIdeasReady();

  const modal = document.getElementById("idea-vault-modal");
  document.getElementById("idea-vault-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadIdeas();
  });
  document.querySelectorAll("[data-close-idea-vault]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("idea-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("idea-title-input");
    const descInput = document.getElementById("idea-description-input");
    const title = titleInput.value.trim();
    if (!title) return;
    await addIdea(title, descInput.value.trim());
    titleInput.value = "";
    descInput.value = "";
    titleInput.focus();
  });

  document.getElementById("idea-vault-list")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-idea]");
    if (removeBtn) { removeIdea(removeBtn.dataset.removeIdea); return; }
    const toTaskBtn = e.target.closest("[data-idea-to-task]");
    if (toTaskBtn) turnIdeaIntoTask(toTaskBtn.dataset.ideaToTask);
  });

  document.getElementById("idea-vault-list")?.addEventListener("change", (e) => {
    const select = e.target.closest("[data-idea-stage]");
    if (select) setIdeaStage(select.dataset.ideaStage, select.value);
  });
});
