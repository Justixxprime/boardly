/* ==========================================================================
   BOARDLY - team-chat.js  (schema_v79_leader_role_and_chat.sql)
   --------------------------------------------------------------------------
   Part of Team Features (open item 1): a plain per-board chat thread so
   a team doesn't have to leave Boardly to talk to each other. Member-
   only, both by RLS (the real boundary) and by simply not showing the
   panel's contents to anyone who isn't on the board.

   Deliberately simple, matching this project's "don't build fake depth"
   rule: no threads, no reactions, no typing indicators, no read
   receipts. A message list and a box to send one.

   Loaded AFTER js/collaboration.js on dashboard.html, following the
   same drop-in module pattern collaboration.js itself uses (see its
   own header comment) - wraps window.switchBoard and
   window.extendRealtimeChannel rather than editing dashboard.js or
   collaboration.js directly.
   ========================================================================== */

state.chatReady = false;   // whether schema_v79_leader_role_and_chat.sql has been run
state.boardMessages = [];  // messages for the currently open board

// ---------------------------------------------------------------------------
// 0. READINESS CHECK
//    Same probe pattern as checkCollabReady() - a harmless select that
//    only succeeds once the table exists.
// ---------------------------------------------------------------------------
async function checkChatReady() {
  const { error } = await supabaseClient.from("board_messages").select("id").limit(1);
  state.chatReady = !error;
  return state.chatReady;
}

// ---------------------------------------------------------------------------
// 1. LOAD + RENDER
// ---------------------------------------------------------------------------
async function loadBoardMessages() {
  if (!state.chatReady || !state.currentBoardId) { state.boardMessages = []; renderBoardChat(); return; }
  const { data, error } = await supabaseClient
    .from("board_messages")
    .select("*")
    .eq("board_id", state.currentBoardId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { console.warn("loadBoardMessages:", error.message); return; }
  state.boardMessages = data || [];
  renderBoardChat();
}

function renderBoardChat() {
  const list = document.getElementById("board-chat-messages");
  const notReady = document.getElementById("board-chat-not-ready");
  const form = document.getElementById("board-chat-form");
  if (!list) return; // dashboard.html hasn't added the mount point yet
  notReady?.classList.toggle("hidden", state.chatReady);
  form?.classList.toggle("hidden", !state.chatReady);
  if (!state.chatReady) { list.innerHTML = ""; return; }
  if (!state.boardMessages.length) {
    list.innerHTML = `<p class="text-xs text-ink-soft">No messages yet. Say hello to the team.</p>`;
    return;
  }
  // No name/email cache lives in this file, so a message shows the
  // sender's email when it's a board member we already know about
  // (from collaboration.js's state.boardMembers), otherwise a plain
  // "Board owner" / "Someone" fallback rather than an empty name.
  const emailFor = (userId) => {
    if (userId === state.userId) return "You";
    const board = state.boards.find((b) => b.id === state.currentBoardId);
    if (board?.user_id === userId) return "Board owner";
    const member = state.boardMembers.find((m) => m.user_id === userId);
    return member?.invited_email || "Team member";
  };
  list.innerHTML = state.boardMessages
    .map((m) => {
      const mine = m.user_id === state.userId;
      const when = new Date(m.created_at).toLocaleString();
      return `
        <div class="board-chat-row${mine ? " board-chat-row-mine" : ""}" data-id="${m.id}">
          <p class="text-[11px] text-ink-soft mb-0.5">${escapeHTML(emailFor(m.user_id))} - ${when}</p>
          <div class="ticket p-2.5 text-sm">${escapeHTML(m.body)}</div>
        </div>`;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

// ---------------------------------------------------------------------------
// 2. POST
// ---------------------------------------------------------------------------
async function postBoardMessage(body) {
  if (!state.chatReady || !state.currentBoardId) return;
  const trimmed = body.trim();
  if (!trimmed) return;
  const { error } = await supabaseClient.from("board_messages").insert({
    board_id: state.currentBoardId,
    user_id: state.userId,
    body: trimmed,
  });
  if (error) { toast("Couldn't send that message: " + error.message, "error"); return; }
  // No optimistic push - the realtime subscription below (or the
  // reload on next open) picks it up, same reasoning as postComment
  // in collaboration.js.
}

// ---------------------------------------------------------------------------
// 3. PANEL OPEN/CLOSE + FORM
// ---------------------------------------------------------------------------
function openBoardChatPanel() {
  document.getElementById("board-chat-panel")?.classList.remove("hidden");
  loadBoardMessages();
}

function closeBoardChatPanel() {
  document.getElementById("board-chat-panel")?.classList.add("hidden");
}

function initBoardChat() {
  document.getElementById("board-chat-btn")?.addEventListener("click", openBoardChatPanel);
  document.querySelectorAll("[data-close-board-chat]").forEach((el) =>
    el.addEventListener("click", closeBoardChatPanel)
  );
  const form = document.getElementById("board-chat-form");
  const input = document.getElementById("board-chat-input");
  if (!form || !input) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value;
    input.value = "";
    await postBoardMessage(body);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
}

// ---------------------------------------------------------------------------
// 4. BOOT
//    Same hook-in approach collaboration.js uses: wrap switchBoard and
//    extendRealtimeChannel rather than editing either file directly.
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await checkChatReady();
  document.getElementById("board-chat-btn")?.classList.toggle("hidden", !state.chatReady);
  initBoardChat();
  await loadBoardMessages();
});

const _originalSwitchBoardForChat = window.switchBoard;
if (typeof _originalSwitchBoardForChat === "function") {
  window.switchBoard = async function (...args) {
    const result = await _originalSwitchBoardForChat.apply(this, args);
    await loadBoardMessages();
    return result;
  };
}

const _originalExtendRealtimeChannelForChat = window.extendRealtimeChannel;
window.extendRealtimeChannel = function (channel) {
  channel = typeof _originalExtendRealtimeChannelForChat === "function"
    ? _originalExtendRealtimeChannelForChat(channel) || channel
    : channel;
  if (!state.chatReady) return channel;
  return channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "board_messages", filter: `board_id=eq.${state.currentBoardId}` },
    (payload) => {
      if (payload.eventType === "INSERT") {
        if (!state.boardMessages.some((m) => m.id === payload.new.id)) {
          state.boardMessages.push(payload.new);
          renderBoardChat();
        }
      } else if (payload.eventType === "DELETE") {
        state.boardMessages = state.boardMessages.filter((m) => m.id !== payload.old.id);
        renderBoardChat();
      }
    }
  );
};
