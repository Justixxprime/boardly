/* ==========================================================================
   BOARDLY - collaboration.js  ("v17: collaboration" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/collaboration.js" defer></script>

   Needs supabase/schema_v17_collaboration.sql run first, and the
   invite-member Edge Function deployed. Until that migration has run,
   every function here checks state.collabReady and quietly no-ops or
   shows the same "run this migration" pattern used by v2Ready,
   remindersReady, etc. in dashboard.js - see FEATURES_V2_SETUP.md for
   the established pattern this follows.

   What this adds:
     1. BOARD MEMBERS  - invite someone by email, see who's on a board
     2. TASK COMMENTS  - a thread on each task, with @mentions
     3. REALTIME HOOK  - extends the channel initRealtimeSync already
                          opened, so comments and membership changes
                          show up live without a page reload
   ========================================================================== */

state.collabReady = false;   // whether schema_v17_collaboration.sql has been run
state.boardMembers = [];     // members of the currently open board
state.editingComments = [];  // comments for the task currently open in the edit modal

// ---------------------------------------------------------------------------
// 0. READINESS CHECK
//    Same probe pattern as checkV2Ready() elsewhere in dashboard.js:
//    a harmless select that only succeeds once the table exists.
// ---------------------------------------------------------------------------
async function checkCollabReady() {
  const { error } = await supabaseClient.from("board_members").select("id").limit(1);
  state.collabReady = !error;
  return state.collabReady;
}

// ---------------------------------------------------------------------------
// 1. BOARD MEMBERS
// ---------------------------------------------------------------------------
async function loadBoardMembers() {
  if (!state.collabReady || !state.currentBoardId) { state.boardMembers = []; renderMemberAvatars(); return; }
  const { data, error } = await supabaseClient
    .from("board_members")
    .select("*")
    .eq("board_id", state.currentBoardId);
  if (error) { console.warn("loadBoardMembers:", error.message); return; }
  state.boardMembers = data || [];
  renderMemberAvatars();
}

function renderMemberAvatars() {
  const row = document.getElementById("member-avatars");
  if (!row) return; // dashboard.html hasn't added the mount point yet
  if (!state.boardMembers.length) { row.innerHTML = ""; return; }
  row.innerHTML = state.boardMembers
    .map((m) => {
      const initial = m.invited_email.charAt(0).toUpperCase();
      const pending = !m.accepted_at;
      return `<div class="member-avatar${pending ? " pending" : ""}" title="${escapeHTML(m.invited_email)}${pending ? " (invite pending)" : ""}">${initial}</div>`;
    })
    .join("");
}

async function inviteMember(email, role) {
  if (!state.collabReady) { toast("Run supabase/schema_v17_collaboration.sql first", "error"); return; }
  if (!state.currentBoardId) return;
  // Client-side check purely for a fast, friendly response - the real
  // security boundary is inside invite-member itself (server-side,
  // can't be bypassed from the browser console), same "never trust the
  // frontend alone" discipline as everything else gated in this app.
  if (!can("collaboration")) { showUpgradePrompt("Inviting people onto a board"); return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ boardId: state.currentBoardId, email, role }),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error || "Couldn't send invite", "error"); return; }
    toast(result.note, "ok");
    logSecurityEvent("member_invited", `Invited ${email} (${role}) to a board`, state.currentBoardId);
    await loadBoardMembers();
  } catch (e) {
    toast("Couldn't reach the invite function - is it deployed?", "error");
  }
}

function initInviteMenuToggle() {
  const btn = document.getElementById("invite-member-btn");
  const menu = document.getElementById("invite-member-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
    // On phones under 480px wide, CSS pins this menu to the viewport
    // (see the #invite-member-menu rule in style.css) and this call
    // does nothing extra. On tablets and desktop, that CSS pin doesn't
    // apply, so this nudges the menu back on-screen if the invite
    // button happens to sit near the right edge - the exact same
    // safety net board-switcher-menu, more-menu, and export-menu
    // already use (see clampDropdownToViewport in dashboard.js).
    if (!menu.classList.contains("hidden") && typeof clampDropdownToViewport === "function") {
      clampDropdownToViewport(menu);
    }
  });
  // Previously used menu.addEventListener("click", stopPropagation) to
  // keep clicks inside the menu from ever reaching the document-level
  // closer below. That relies on every click inside the menu bubbling
  // up in exactly the expected order and nothing else along the way
  // interfering - fragile, and hard to prove correct on every browser.
  // Checking event.target directly here instead means it doesn't
  // matter how the click got here or what else might be listening:
  // a click that is genuinely inside the menu (typing in the email
  // field, opening the role dropdown, pressing Send) can never close
  // it, full stop.
  document.addEventListener("click", (e) => {
    if (menu.classList.contains("hidden")) return;
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    menu.classList.add("hidden");
  });
}

function initMemberInviteForm() {
  initInviteMenuToggle();
  const form = document.getElementById("invite-member-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("invite-email-input")?.value.trim();
    const role = document.getElementById("invite-role-select")?.value || "editor";
    if (!email) return;
    await inviteMember(email, role);
    form.reset();
  });
}

// ---------------------------------------------------------------------------
// 2. TASK COMMENTS
// ---------------------------------------------------------------------------
async function loadTaskComments(taskId) {
  if (!state.collabReady) { state.editingComments = []; renderComments(); return; }
  const { data, error } = await supabaseClient
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) { console.warn("loadTaskComments:", error.message); return; }
  state.editingComments = data || [];
  renderComments();
}

function renderComments() {
  const list = document.getElementById("comment-list");
  if (!list) return; // dashboard.html hasn't added the mount point yet
  if (!state.collabReady) {
    list.innerHTML = `<p class="text-xs text-ink-soft">Comments need a one-time database update: run <code>supabase/schema_v17_collaboration.sql</code>.</p>`;
    return;
  }
  if (!state.editingComments.length) {
    list.innerHTML = `<p class="text-xs text-ink-soft">No comments yet.</p>`;
    return;
  }
  list.innerHTML = state.editingComments
    .map((c) => {
      const mine = c.user_id === state.userId;
      const when = new Date(c.created_at).toLocaleString();
      const bodyHTML = escapeHTML(c.body).replace(/@([\w.+-]+@[\w.-]+)/g, '<span class="mention">@$1</span>');
      return `
        <div class="comment-row" data-id="${c.id}">
          <div class="comment-body">${bodyHTML}</div>
          <div class="comment-meta text-[11px] text-ink-soft">${when}${mine ? ' <button type="button" class="comment-delete-btn" data-id="' + c.id + '">delete</button>' : ""}</div>
        </div>`;
    })
    .join("");
  list.querySelectorAll(".comment-delete-btn").forEach((btn) =>
    btn.addEventListener("click", () => deleteComment(btn.dataset.id))
  );
  list.scrollTop = list.scrollHeight;
}

// board_members entries + email domain match, so typing "@" and a
// prefix can be autocompleted from initMentionAutocomplete() below.
function extractMentions(body) {
  const emails = state.boardMembers.map((m) => m.invited_email.toLowerCase());
  const found = (body.match(/@([\w.+-]+@[\w.-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
  return found.filter((email) => emails.includes(email));
}

async function postComment(taskId, body) {
  if (!state.collabReady) { toast("Run supabase/schema_v17_collaboration.sql first", "error"); return; }
  if (!body.trim()) return;
  const mentions = extractMentions(body);
  const task = state.tasks.find((t) => t.id === taskId);
  const { error } = await supabaseClient.from("task_comments").insert({
    task_id: taskId,
    board_id: state.currentBoardId,
    user_id: state.userId,
    body: body.trim(),
    mentions,
  });
  if (error) { toast("Couldn't post comment: " + error.message, "error"); return; }
  // No optimistic push here - the realtime subscription below (or the
  // reload on next open) picks it up, keeping a single source of truth
  // the same way postgres_changes already does for tasks.

  // If anyone was @mentioned, ask notify-mention to send them a real
  // push notification. This is fire-and-forget on purpose - if it
  // fails (function not deployed yet, no push subscriptions, etc.) the
  // comment itself has already been saved and shown, so we don't want
  // a failed notification to look like a failed comment.
  if (mentions.length) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    fetch(`${SUPABASE_URL}/functions/v1/notify-mention`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        taskId,
        taskTitle: task?.title || "a task",
        commentBody: body.trim(),
        boardId: state.currentBoardId,
        mentions,
      }),
    }).catch(() => {}); // silent - see comment above
  }
}

async function deleteComment(id) {
  const { error } = await supabaseClient.from("task_comments").delete().eq("id", id);
  if (error) toast("Couldn't delete comment: " + error.message, "error");
}

function initCommentForm() {
  const input = document.getElementById("comment-input");
  const sendBtn = document.getElementById("comment-send-btn");
  if (!input || !sendBtn) return;
  const submit = async () => {
    if (!state.editingId) return;
    await postComment(state.editingId, input.value);
    input.value = "";
  };
  sendBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
}

// ---------------------------------------------------------------------------
// 3. REALTIME HOOK
//    initRealtimeSync() in dashboard.js already opens one channel per
//    board for `tasks` postgres_changes + cursor broadcast. This adds a
//    second subscription on the SAME channel object for task_comments
//    and board_members, so it rides along on the connection that
//    already exists instead of opening a competing socket.
// ---------------------------------------------------------------------------
// Called from INSIDE dashboard.js's initRealtimeSync(), before that
// channel's single .subscribe() call - see the extension-point comment
// there. Returning the channel with more .on(...) handlers chained on
// is the only way these actually receive live events; calling .on(...)
// separately, afterward, on a channel that's already subscribed (what
// this used to do) doesn't reliably work, since the Realtime client
// only registers postgres_changes filters that were attached before
// the join. This one function now replaces the old attachCollabRealtime
// entirely - there's no separate "attach" step needed anymore, since
// this runs automatically every time initRealtimeSync() runs (both the
// initial page load and every board switch already call it).
function extendRealtimeChannel(channel) {
  // state.collabReady only becomes true once checkCollabReady()'s own
  // query resolves (see the DOMContentLoaded handler below), which runs
  // independently of dashboard.js's own init sequence - in the
  // unlikely case this specific call happens to run before that query
  // settles, this board's channel simply won't carry comment/member
  // updates until the NEXT board switch (switchBoard calls
  // initRealtimeSync again, and by then collabReady has always long
  // since resolved) - a full page reload always shows the current data
  // regardless, so nothing is ever actually lost, just not instant.
  if (!state.collabReady) return channel;
  return channel
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_comments", filter: `board_id=eq.${state.currentBoardId}` },
      (payload) => {
        if (payload.eventType === "INSERT" && payload.new.task_id === state.editingId) {
          if (!state.editingComments.some((c) => c.id === payload.new.id)) {
            state.editingComments.push(payload.new);
            renderComments();
            if (payload.new.mentions?.includes(state.userEmail)) {
              toast(`You were mentioned in a comment`, "ok");
            }
          }
        } else if (payload.eventType === "DELETE" && payload.old.task_id === state.editingId) {
          state.editingComments = state.editingComments.filter((c) => c.id !== payload.old.id);
          renderComments();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "board_members", filter: `board_id=eq.${state.currentBoardId}` },
      () => loadBoardMembers()
    );
}

// ---------------------------------------------------------------------------
// 4. BOOT
//    Hooks into the same places dashboard.js already calls its own init
//    functions, without editing dashboard.js itself (except for the one
//    small, additive extension point extendRealtimeChannel plugs into).
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await checkCollabReady();
  initMemberInviteForm();
  initCommentForm();
  await loadBoardMembers();
});

// dashboard.js's switchBoard() changes state.currentBoardId and rebuilds
// initRealtimeSync (which now calls extendRealtimeChannel itself) for
// the new board; re-run loadBoardMembers right after so the member list
// follows the board switch too.
const _originalSwitchBoard = window.switchBoard;
if (typeof _originalSwitchBoard === "function") {
  window.switchBoard = async function (...args) {
    const result = await _originalSwitchBoard.apply(this, args);
    await loadBoardMembers();
    return result;
  };
}

// openEditModal() in dashboard.js sets state.editingId; load that
// task's comments right after, same wrapping approach as switchBoard.
const _originalOpenEditModal = window.openEditModal;
if (typeof _originalOpenEditModal === "function") {
  window.openEditModal = function (id) {
    const result = _originalOpenEditModal.call(this, id);
    loadTaskComments(id);
    return result;
  };
}
