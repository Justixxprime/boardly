/* ==========================================================================
   BOARDLY - waiting-room.js  ("Waiting on" add-on)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/waiting-room.js" defer></script>

   Needs supabase/schema_v23_waiting_room.sql run first. Until then,
   state.waitingRoomReady stays false and the button quietly explains
   what to do, same pattern every earlier add-on in this project uses.

   WHAT THIS IS: things blocking you that depend on someone else - a
   client's approval, a teacher's feedback, a delivery you're waiting
   on. Deliberately separate from Boardly's tasks (see the migration's
   own comment for why) - there is nothing to check off here, only
   something to mark resolved once the other person actually responds.
   ========================================================================== */

state.waitingRoomReady = false;
state.waitingItems = [];

async function checkWaitingRoomReady() {
  const { error } = await supabaseClient.from("waiting_items").select("id").limit(1);
  state.waitingRoomReady = !error;
  return state.waitingRoomReady;
}

async function loadWaitingItems() {
  if (!state.waitingRoomReady) { renderWaitingList(); return; }
  const { data, error } = await supabaseClient
    .from("waiting_items")
    .select("*")
    .is("resolved_at", null)
    .order("importance", { ascending: false }) // important ones float to the top
    .order("created_at", { ascending: true });  // oldest-waiting first within each importance level
  if (error) { console.warn("loadWaitingItems:", error.message); return; }
  state.waitingItems = data || [];
  renderWaitingList();
}

function daysWaiting(createdAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 86400000));
}

function renderWaitingList() {
  const list = document.getElementById("waiting-list");
  const empty = document.getElementById("waiting-empty");
  if (!list) return;

  if (!state.waitingRoomReady) {
    list.innerHTML = "";
    empty.textContent = "Run supabase/schema_v23_waiting_room.sql first - see WAITING_ROOM_SETUP.md";
    empty.classList.remove("hidden");
    return;
  }
  if (!state.waitingItems.length) {
    list.innerHTML = "";
    empty.textContent = "Nothing you're waiting on right now.";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.waitingItems.map((item) => {
    const days = daysWaiting(item.created_at);
    // A gentle color cue for how long something's been sitting - not an
    // alarm, just a glance-able signal, same restraint the rest of
    // Boardly's design uses for urgency.
    const ageClass = days >= 7 ? "text-critical" : days >= 3 ? "text-orange" : "text-ink-soft";
    return `
      <div class="ticket p-3 flex items-start justify-between gap-3" data-id="${item.id}">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(item.what)}${item.importance === "important" ? ' <i class="fa-solid fa-star text-orange text-xs" title="Important"></i>' : ""}</p>
          <p class="text-xs ${ageClass}">${item.who ? `Waiting on ${escapeHTML(item.who)} · ` : ""}${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}</p>
        </div>
        <button type="button" data-resolve-waiting="${item.id}" title="Mark resolved" class="btn btn-icon shrink-0"><i class="fa-solid fa-check"></i></button>
      </div>`;
  }).join("");
}

async function addWaitingItem(what, who, importance) {
  if (!state.waitingRoomReady) { toast("Run supabase/schema_v23_waiting_room.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("waiting_items")
    .insert({ user_id: state.userId, board_id: state.currentBoardId, what, who: who || null, importance })
    .select()
    .single();
  if (error) { toast("Couldn't add: " + error.message, "error"); return; }
  state.waitingItems.unshift(data);
  renderWaitingList();
}

async function resolveWaitingItem(id) {
  const item = state.waitingItems.find((w) => w.id === id);
  state.waitingItems = state.waitingItems.filter((w) => w.id !== id); // optimistic
  renderWaitingList();
  const { error } = await supabaseClient.from("waiting_items").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (item) state.waitingItems.push(item); // roll back
    renderWaitingList();
    toast("Couldn't resolve: " + error.message, "error");
  } else {
    toast("Marked resolved", "ok");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkWaitingRoomReady();

  const modal = document.getElementById("waiting-room-modal");
  document.getElementById("waiting-room-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadWaitingItems();
  });
  document.querySelectorAll("[data-close-waiting-room]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("waiting-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const whatInput = document.getElementById("waiting-what-input");
    const whoInput = document.getElementById("waiting-who-input");
    const importanceInput = document.getElementById("waiting-importance-input");
    const what = whatInput.value.trim();
    if (!what) return;
    await addWaitingItem(what, whoInput.value.trim(), importanceInput.value);
    whatInput.value = "";
    whoInput.value = "";
    importanceInput.value = "normal";
    whatInput.focus();
  });

  document.getElementById("waiting-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-resolve-waiting]");
    if (btn) resolveWaitingItem(btn.dataset.resolveWaiting);
  });
});
