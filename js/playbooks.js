/* ==========================================================================
   BOARDLY - playbooks.js  (Playbooks)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/playbooks.js" defer></script>

   Needs supabase/schema_v42_playbooks.sql run first. Until then,
   state.playbooksReady stays false and the list quietly explains what
   to do (same pattern every earlier add-on in this project uses).

   A playbook is just knowledge - written once, read as many times as
   needed. It never creates a ticket by itself (that's Task Templates)
   and it's not a not-yet-committed thought (that's Idea Vault).
   ========================================================================== */

state.playbooksReady = false;
state.playbooks = [];
let expandedPlaybookId = null;

async function checkPlaybooksReady() {
  const { error } = await supabaseClient.from("playbooks").select("id").limit(1);
  state.playbooksReady = !error;
  return state.playbooksReady;
}

async function loadPlaybooks() {
  if (!state.playbooksReady) { renderPlaybooksList(); return; }
  const { data, error } = await supabaseClient.from("playbooks").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("loadPlaybooks:", error.message); return; }
  state.playbooks = data || [];
  renderPlaybooksList();
}

function renderPlaybooksList() {
  const list = document.getElementById("playbooks-list");
  const empty = document.getElementById("playbooks-empty");
  const notReady = document.getElementById("playbooks-not-ready");
  if (!list) return;

  if (!state.playbooksReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.playbooks.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.playbooks.map((pb) => {
    const isOpen = pb.id === expandedPlaybookId;
    return `
    <div class="ticket p-3" data-id="${pb.id}">
      <button type="button" data-toggle-playbook="${pb.id}" class="w-full flex items-center justify-between gap-2 text-left">
        <span class="text-sm font-semibold truncate">${escapeHTML(pb.title)}</span>
        <i class="fa-solid fa-chevron-${isOpen ? "up" : "down"} text-xs text-ink-soft shrink-0"></i>
      </button>
      ${isOpen ? `
        <div class="mt-2 space-y-2">
          <textarea data-playbook-content="${pb.id}" rows="6" class="input text-sm resize-none">${escapeHTML(pb.content || "")}</textarea>
          <div class="flex items-center gap-2">
            <button type="button" data-save-playbook="${pb.id}" class="btn btn-secondary btn-pop text-xs flex-1">Save changes</button>
            <button type="button" data-remove-playbook="${pb.id}" title="Delete" class="text-ink-soft hover:text-critical shrink-0 px-2"><i class="fa-regular fa-trash-can text-xs"></i></button>
          </div>
        </div>
      ` : ""}
    </div>`;
  }).join("");
}

async function addPlaybook(title, content) {
  if (!state.playbooksReady) { toast("Run supabase/schema_v42_playbooks.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("playbooks")
    .insert({ user_id: state.userId, board_id: state.currentBoardId, title, content: content || "" })
    .select()
    .single();
  if (error) { toast("Couldn't save playbook: " + error.message, "error"); return; }
  state.playbooks.unshift(data);
  renderPlaybooksList();
}

async function savePlaybookContent(id, content) {
  const playbook = state.playbooks.find((p) => p.id === id);
  const previous = playbook?.content;
  if (playbook) playbook.content = content; // optimistic
  const { error } = await supabaseClient.from("playbooks").update({ content }).eq("id", id);
  if (error) {
    if (playbook) playbook.content = previous; // roll back
    toast("Couldn't save: " + error.message, "error");
    return;
  }
  toast("Playbook saved", "ok");
}

async function removePlaybook(id) {
  const item = state.playbooks.find((p) => p.id === id);
  state.playbooks = state.playbooks.filter((p) => p.id !== id); // optimistic
  if (expandedPlaybookId === id) expandedPlaybookId = null;
  renderPlaybooksList();
  const { error } = await supabaseClient.from("playbooks").delete().eq("id", id);
  if (error) {
    if (item) state.playbooks.unshift(item); // roll back
    renderPlaybooksList();
    toast("Couldn't delete: " + error.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkPlaybooksReady();

  const modal = document.getElementById("playbooks-modal");
  document.getElementById("playbooks-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadPlaybooks();
  });
  document.querySelectorAll("[data-close-playbooks]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("playbook-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("playbook-title-input");
    const contentInput = document.getElementById("playbook-content-input");
    const title = titleInput.value.trim();
    if (!title) return;
    await addPlaybook(title, contentInput.value.trim());
    titleInput.value = "";
    contentInput.value = "";
    titleInput.focus();
  });

  document.getElementById("playbooks-list")?.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-playbook]");
    if (toggleBtn) {
      const id = toggleBtn.dataset.togglePlaybook;
      expandedPlaybookId = expandedPlaybookId === id ? null : id;
      renderPlaybooksList();
      return;
    }
    const saveBtn = e.target.closest("[data-save-playbook]");
    if (saveBtn) {
      const id = saveBtn.dataset.savePlaybook;
      const textarea = document.querySelector(`[data-playbook-content="${id}"]`);
      if (textarea) savePlaybookContent(id, textarea.value);
      return;
    }
    const removeBtn = e.target.closest("[data-remove-playbook]");
    if (removeBtn) removePlaybook(removeBtn.dataset.removePlaybook);
  });
});
