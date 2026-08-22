/* ==========================================================================
   BOARDLY - commitments.js  ("Commitments" add-on, the Commitment Guardian)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/commitments.js" defer></script>

   Needs supabase/schema_v24_commitment_guardian.sql run first. Until
   then, state.commitmentsReady stays false and the button quietly
   explains what to do, same pattern every earlier add-on uses.

   The safety states below (SAFE / AT RISK / MISSED) are computed live
   from the due date every time the list renders - nothing about the
   state itself is stored, only the raw due date and whether it's been
   marked kept. That means the label is always accurate even if nobody
   opens Boardly for a few days - it isn't relying on some background
   job to have run and updated a stored status in the meantime.
   ========================================================================== */

state.commitmentsReady = false;
state.commitments = [];

async function checkCommitmentsReady() {
  const { error } = await supabaseClient.from("commitments").select("id").limit(1);
  state.commitmentsReady = !error;
  return state.commitmentsReady;
}

async function loadCommitments() {
  if (!state.commitmentsReady) { renderCommitmentsList(); return; }
  const { data, error } = await supabaseClient
    .from("commitments")
    .select("*")
    .is("completed_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) { console.warn("loadCommitments:", error.message); return; }
  state.commitments = data || [];
  renderCommitmentsList();
}

/** Returns one of "safe" | "at-risk" | "missed" | "no-date", computed live from today's date. */
function commitmentStatus(dueDate) {
  if (!dueDate) return "no-date";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const daysUntil = Math.round((due - today) / 86400000);
  if (daysUntil < 0) return "missed";
  if (daysUntil <= 1) return "at-risk"; // due today or tomorrow
  return "safe";
}

const COMMITMENT_STATUS_LABEL = { safe: "Safe", "at-risk": "At risk", missed: "Missed", "no-date": "No date" };
const COMMITMENT_STATUS_CLASS = {
  safe: "bg-[var(--paper-2)] text-ink-soft",
  "at-risk": "bg-orange/15 text-orange",
  missed: "bg-critical/15 text-critical",
  "no-date": "bg-[var(--paper-2)] text-ink-soft",
};

function renderCommitmentsList() {
  const list = document.getElementById("commitments-list");
  const empty = document.getElementById("commitments-empty");
  if (!list) return;

  if (!state.commitmentsReady) {
    list.innerHTML = "";
    empty.textContent = "Run supabase/schema_v24_commitment_guardian.sql first - see COMMITMENT_GUARDIAN_SETUP.md";
    empty.classList.remove("hidden");
    return;
  }
  if (!state.commitments.length) {
    list.innerHTML = "";
    empty.textContent = "No open commitments right now.";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.commitments.map((c) => {
    const status = commitmentStatus(c.due_date);
    const dueLabel = c.due_date ? new Date(c.due_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
    return `
      <div class="ticket p-3 flex items-start justify-between gap-3" data-id="${c.id}">
        <div class="min-w-0">
          <p class="text-sm font-semibold truncate">${escapeHTML(c.what)}</p>
          <p class="text-xs text-ink-soft">${c.to_whom ? `To ${escapeHTML(c.to_whom)}${dueLabel ? " · " : ""}` : ""}${dueLabel || ""}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${COMMITMENT_STATUS_CLASS[status]}">${COMMITMENT_STATUS_LABEL[status]}</span>
          <button type="button" data-complete-commitment="${c.id}" title="Mark kept" class="btn btn-icon"><i class="fa-solid fa-check"></i></button>
        </div>
      </div>`;
  }).join("");
}

async function addCommitment(what, toWhom, dueDate) {
  if (!state.commitmentsReady) { toast("Run supabase/schema_v24_commitment_guardian.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("commitments")
    .insert({ user_id: state.userId, board_id: state.currentBoardId, what, to_whom: toWhom || null, due_date: dueDate || null })
    .select()
    .single();
  if (error) { toast("Couldn't add: " + error.message, "error"); return; }
  state.commitments.push(data);
  state.commitments.sort((a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1);
  renderCommitmentsList();
}

async function completeCommitment(id) {
  const item = state.commitments.find((c) => c.id === id);
  state.commitments = state.commitments.filter((c) => c.id !== id); // optimistic
  renderCommitmentsList();
  const { error } = await supabaseClient.from("commitments").update({ completed_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (item) state.commitments.push(item); // roll back
    renderCommitmentsList();
    toast("Couldn't mark kept: " + error.message, "error");
  } else {
    toast("Marked kept", "ok");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkCommitmentsReady();

  const modal = document.getElementById("commitments-modal");
  document.getElementById("commitments-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadCommitments();
  });
  document.querySelectorAll("[data-close-commitments]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("commitment-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const whatInput = document.getElementById("commitment-what-input");
    const whoInput = document.getElementById("commitment-who-input");
    const dateInput = document.getElementById("commitment-date-input");
    const what = whatInput.value.trim();
    if (!what) return;
    await addCommitment(what, whoInput.value.trim(), dateInput.value);
    whatInput.value = "";
    whoInput.value = "";
    dateInput.value = "";
    whatInput.focus();
  });

  document.getElementById("commitments-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-complete-commitment]");
    if (btn) completeCommitment(btn.dataset.completeCommitment);
  });

  // ---- Emergency Mode ----
  // Reuses the existing AI panel and board-assistant Edge Function
  // entirely - the only new things are this entry point and the
  // "Emergency mode:" instructions added to the AI's own system
  // prompt, which is what actually makes it sort tasks into MUST DO /
  // CAN DEFER / CAN DELEGATE / CAN AUTOMATE instead of replying like a
  // normal message.
  document.getElementById("emergency-mode-btn")?.addEventListener("click", async () => {
    const time = await showPromptModal("How much time do you actually have right now?", "2 hours");
    if (!time) return;
    document.getElementById("ai-panel")?.classList.remove("hidden");
    sendAIMessage(`Emergency mode: I have ${time}. Give me a realistic plan for right now.`);
  });

  // ---- Capture (Second Brain Inbox) ----
  // Same idea as Emergency Mode above - reuses the AI panel and
  // board-assistant Edge Function entirely, the new part is this
  // dedicated dump-box and the "Capture mode:" instructions in the
  // AI's own system prompt that tell it to sort the text into tasks,
  // commitments, and waiting-on items instead of just replying to it.
  const captureModal = document.getElementById("capture-modal");
  document.getElementById("capture-btn")?.addEventListener("click", () => {
    captureModal?.classList.remove("hidden");
    document.getElementById("capture-textarea")?.focus();
  });
  document.querySelectorAll("[data-close-capture]").forEach((el) =>
    el.addEventListener("click", () => captureModal?.classList.add("hidden"))
  );
  document.getElementById("capture-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = document.getElementById("capture-textarea");
    const text = textarea.value.trim();
    if (!text) return;
    captureModal?.classList.add("hidden");
    textarea.value = "";
    document.getElementById("ai-panel")?.classList.remove("hidden");
    sendAIMessage(`Capture mode: ${text}`);
  });
});
