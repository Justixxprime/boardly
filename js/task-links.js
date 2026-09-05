/* ==========================================================================
   BOARDLY - task-links.js  (schema_v52_task_links.sql)
   --------------------------------------------------------------------------
   Phase 2 of the master build spec: "Support: blocks, blocked by, relates
   to, duplicates, follows, precedes, parent, child." The existing
   blocked_by_id column (schema_v11) already handles the single simplest
   case and is left completely untouched here - this adds everything it
   can't do: more than one link per ticket, and the relationship types
   that had no home in Boardly before now.

   Only 5 types are ever actually STORED (see the schema file's own
   comment) - "blocked by", "follows", and "child of" are the same rows
   as "blocks", "precedes", and "parent of" respectively, just read from
   the other task's point of view. LINK_LABEL_REVERSE below is where
   that reversal happens, once, at render time.

   Hooks into openEditModal the same way collaboration.js hooks into
   dashboard.js - wrapping the existing function rather than editing it.
   ========================================================================== */

state.taskLinksReady = false;
state.editingTaskLinks = [];

const LINK_LABEL_FORWARD = { blocks: "Blocks", relates_to: "Relates to", duplicates: "Duplicates", precedes: "Precedes", parent_of: "Parent of" };
const LINK_LABEL_REVERSE = { blocks: "Blocked by", relates_to: "Relates to", duplicates: "Duplicates", precedes: "Follows", parent_of: "Child of" };
const LINK_ICON = { blocks: "fa-hand", relates_to: "fa-link", duplicates: "fa-clone", precedes: "fa-arrow-right", parent_of: "fa-sitemap" };

async function checkTaskLinksReady() {
  const { error } = await supabaseClient.from("task_links").select("id").limit(1);
  state.taskLinksReady = !error;
  return state.taskLinksReady;
}

async function loadTaskLinks(taskId) {
  if (!state.taskLinksReady) { state.editingTaskLinks = []; return; }
  const { data, error } = await supabaseClient
    .from("task_links")
    .select("*")
    .or(`task_id.eq.${taskId},related_task_id.eq.${taskId}`)
    .order("created_at", { ascending: true });
  state.editingTaskLinks = error ? [] : data;
}

function populateTaskLinkTargetOptions(task) {
  const select = document.getElementById("task-link-target-select");
  if (!select) return;
  const others = state.tasks.filter((t) => t.id !== task.id);
  select.innerHTML = `<option value="">Pick a ticket…</option>` +
    others.map((t) => `<option value="${t.id}">${escapeHTML(t.title)}</option>`).join("");
}

function renderTaskLinksList(task) {
  const wrap = document.getElementById("task-links-list");
  if (!wrap) return;
  if (!state.editingTaskLinks.length) {
    wrap.innerHTML = `<p class="text-xs text-ink-soft">No linked tickets yet.</p>`;
    return;
  }
  wrap.innerHTML = state.editingTaskLinks
    .map((link) => {
      const forward = link.task_id === task.id;
      const otherId = forward ? link.related_task_id : link.task_id;
      const other = state.tasks.find((t) => t.id === otherId);
      const label = forward ? LINK_LABEL_FORWARD[link.link_type] : LINK_LABEL_REVERSE[link.link_type];
      const icon = LINK_ICON[link.link_type] || "fa-link";
      return `
      <div class="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5 text-xs">
        <i class="fa-solid ${icon} text-ink-soft w-3.5 text-center shrink-0"></i>
        <span class="font-medium shrink-0">${label}:</span>
        <span class="flex-1 truncate">${other ? escapeHTML(other.title) : "(deleted ticket)"}</span>
        <button type="button" data-remove-task-link="${link.id}" title="Remove link" class="text-ink-soft hover:text-orange shrink-0"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    })
    .join("");
}

async function addTaskLinkFromForm(task) {
  const linkType = document.getElementById("task-link-type-select").value;
  const targetId = document.getElementById("task-link-target-select").value;
  if (!targetId) { toast("Pick a ticket to link first", "error"); return; }
  const { error } = await supabaseClient.from("task_links").insert({
    board_id: task.board_id, task_id: task.id, related_task_id: targetId, link_type: linkType, created_by: state.userId,
  });
  if (error) {
    // The unique constraint (task_links_unique) is what actually
    // catches "this exact link already exists" - surfaced here as a
    // plain-language message instead of a raw Postgres constraint name.
    toast(error.code === "23505" ? "That link already exists" : "Couldn't add link: " + error.message, "error");
    return;
  }
  await loadTaskLinks(task.id);
  renderTaskLinksList(task);
  document.getElementById("task-link-target-select").value = "";
}

async function removeTaskLink(linkId, taskId) {
  const { error } = await supabaseClient.from("task_links").delete().eq("id", linkId);
  if (error) { toast("Couldn't remove link: " + error.message, "error"); return; }
  await loadTaskLinks(taskId);
  const task = state.tasks.find((t) => t.id === taskId);
  if (task) renderTaskLinksList(task);
}

function refreshTaskLinksUI(task) {
  const section = document.getElementById("task-links-section");
  const notReady = document.getElementById("task-links-not-ready");
  if (!section) return;
  section.classList.toggle("hidden", !state.taskLinksReady);
  notReady?.classList.toggle("hidden", state.taskLinksReady);
  if (!state.taskLinksReady) return;
  populateTaskLinkTargetOptions(task);
  renderTaskLinksList(task);
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkTaskLinksReady();

  document.getElementById("task-link-add-btn")?.addEventListener("click", () => {
    const task = state.tasks.find((t) => t.id === state.editingId);
    if (task) addTaskLinkFromForm(task);
  });

  document.getElementById("task-links-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-task-link]");
    if (btn && state.editingId) removeTaskLink(btn.dataset.removeTaskLink, state.editingId);
  });

  // Same wrapping approach as collaboration.js's own openEditModal hook
  // (loading that task's comments) - by the time anyone actually opens
  // a ticket, every deferred script (including this one) has already
  // run, so window.openEditModal here is always dashboard.js's real
  // function, whether or not collaboration.js has also already
  // wrapped it first.
  const _originalOpenEditModal = window.openEditModal;
  if (typeof _originalOpenEditModal === "function") {
    window.openEditModal = function (id) {
      const result = _originalOpenEditModal.call(this, id);
      const task = state.tasks.find((t) => t.id === id);
      if (task) loadTaskLinks(id).then(() => refreshTaskLinksUI(task));
      return result;
    };
  }
});
