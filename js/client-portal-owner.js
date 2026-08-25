/* ==========================================================================
   BOARDLY - client-portal-owner.js
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/client-portal-owner.js"></script>

   This is the OWNER-side half of the Client Portal (see
   schema_v27_client_portal.sql, client-portal.html, and the two Edge
   Functions get-shared-board / client-portal-action for the
   client-facing half). It needs schema_v27 to have been run - if it
   hasn't, the "Show this to the client" checkbox stays hidden (see
   openEditModal in dashboard.js) and this file simply never has
   anything to show, same "explain, don't break" rule as everywhere
   else.

   WHAT THIS ADDS: when a ticket has been marked client-visible, the
   edit modal now shows a "Client feedback" strip - the client's
   current status (awaiting review / approved / changes requested),
   their comment thread, and a reply box so the owner can respond
   right from their own dashboard instead of needing to go look at the
   portal link themselves. Replies write straight into the same
   client_comments table the client's own comments land in, using the
   INSERT policy schema_v27 adds specifically for the board owner.
   ========================================================================== */

const CP_OWNER_STATUS_LABEL = { pending: "Awaiting client review", approved: "Approved by client", changes_requested: "Client requested changes" };
const CP_OWNER_STATUS_CLASS = { pending: "text-ink-soft", approved: "text-teal", changes_requested: "text-orange" };

async function loadClientFeedback(taskId) {
  const { data, error } = await supabaseClient.from("client_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
  if (error) { console.warn("loadClientFeedback:", error.message); return []; }
  return data || [];
}

async function renderClientFeedbackStrip(task) {
  const strip = document.getElementById("client-feedback-strip");
  if (!strip) return;

  if (!state.clientPortalReady || !task.client_visible) {
    strip.classList.add("hidden");
    strip.innerHTML = "";
    return;
  }

  const comments = await loadClientFeedback(task.id);
  strip.innerHTML = `
    <div class="ticket p-3">
      <p class="text-xs font-medium ${CP_OWNER_STATUS_CLASS[task.client_status] || ""}"><i class="fa-solid fa-handshake mr-1"></i>${CP_OWNER_STATUS_LABEL[task.client_status] || "Awaiting client review"}</p>
      ${comments.length ? `
        <div class="flex flex-col gap-1.5 mt-2 max-h-32 overflow-y-auto">
          ${comments.map((c) => `
            <div class="text-xs">
              <span class="font-medium">${escapeHTML(c.author_name)}</span>
              <span class="text-ink-soft"> · ${new Date(c.created_at).toLocaleDateString()}</span>
              <p class="mt-0.5">${escapeHTML(c.body)}</p>
            </div>`).join("")}
        </div>` : `<p class="text-xs text-ink-soft mt-1.5">No comments from the client yet.</p>`}
      <div class="flex items-center gap-2 mt-2">
        <input type="text" id="client-reply-input" placeholder="Reply to the client…" class="input text-sm flex-1 !py-1.5" />
        <button type="button" id="client-reply-send" class="btn btn-icon" title="Send reply"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>`;
  strip.classList.remove("hidden");
}

/** Wraps the existing openEditModal so the Client feedback strip fills in
 *  right after everything else the modal already sets up - see file 2g
 *  pattern ("wrap the existing function") used across every earlier add-on. */
const _originalOpenEditModalForClientPortal = window.openEditModal;
if (typeof _originalOpenEditModalForClientPortal === "function") {
  window.openEditModal = function (id) {
    const result = _originalOpenEditModalForClientPortal.apply(this, arguments);
    const task = state.tasks.find((t) => t.id === id);
    if (task) renderClientFeedbackStrip(task);
    return result;
  };
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("copy-client-portal-btn")?.addEventListener("click", async () => {
    const board = state.boards.find((b) => b.id === state.currentBoardId);
    if (!board?.is_public || !board?.share_token) { toast("Turn on sharing for this board first", "error"); return; }
    const url = `${location.origin}${location.pathname.replace("dashboard.html", "")}client-portal.html?b=${board.share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast("Client portal link copied", "ok");
  });

  document.getElementById("client-feedback-strip")?.addEventListener("click", async (e) => {
    if (!e.target.closest("#client-reply-send")) return;
    const input = document.getElementById("client-reply-input");
    const body = input?.value.trim();
    if (!body || !state.editingId) return;
    const task = state.tasks.find((t) => t.id === state.editingId);
    if (!task) return;

    const { error } = await supabaseClient.from("client_comments").insert({
      task_id: task.id, board_id: task.board_id, author_name: "You", body,
    });
    if (error) { toast("Couldn't send reply: " + error.message, "error"); return; }
    input.value = "";
    toast("Reply sent", "ok");
    renderClientFeedbackStrip(task);
  });
});
