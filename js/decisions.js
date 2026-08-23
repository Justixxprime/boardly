/* ==========================================================================
   BOARDLY - decisions.js  (Decision Ledger)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/decisions.js" defer></script>

   Needs supabase/schema_v25_decision_ledger.sql run first. Until then,
   state.decisionsReady stays false and the list quietly explains what
   to do, same pattern every earlier add-on in this project uses.
   ========================================================================== */

state.decisionsReady = false;
state.decisions = [];

async function checkDecisionsReady() {
  const { error } = await supabaseClient.from("decisions").select("id").limit(1);
  state.decisionsReady = !error;
  return state.decisionsReady;
}

async function loadDecisions() {
  if (!state.decisionsReady) { renderDecisionsList(); return; }
  const { data, error } = await supabaseClient.from("decisions").select("*").order("decided_at", { ascending: false });
  if (error) { console.warn("loadDecisions:", error.message); return; }
  state.decisions = data || [];
  renderDecisionsList();
}

function renderDecisionsList() {
  const list = document.getElementById("decisions-list");
  const empty = document.getElementById("decisions-empty");
  if (!list) return;

  if (!state.decisionsReady) {
    list.innerHTML = "";
    empty.textContent = "Run supabase/schema_v25_decision_ledger.sql first - see DECISION_LEDGER_SETUP.md";
    empty.classList.remove("hidden");
    return;
  }
  if (!state.decisions.length) {
    list.innerHTML = "";
    empty.textContent = "No decisions recorded yet.";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const today = new Date().toISOString().slice(0, 10);
  list.innerHTML = state.decisions.map((d) => {
    const dueForReview = d.review_date && d.review_date <= today;
    return `
    <div class="ticket p-3" data-id="${d.id}">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-semibold">${escapeHTML(d.decision)}</p>
        <button type="button" data-remove-decision="${d.id}" title="Delete" class="text-ink-soft hover:text-critical shrink-0"><i class="fa-regular fa-trash-can text-xs"></i></button>
      </div>
      ${d.reason ? `<p class="text-xs text-ink-soft mt-1"><span class="font-semibold">Why:</span> ${escapeHTML(d.reason)}</p>` : ""}
      ${d.alternatives ? `<p class="text-xs text-ink-soft mt-1"><span class="font-semibold">Considered instead:</span> ${escapeHTML(d.alternatives)}</p>` : ""}
      <p class="text-xs text-ink-soft mt-1">${new Date(d.decided_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${d.review_date ? ` · <span class="${dueForReview ? "text-orange font-semibold" : ""}">${dueForReview ? "Due for review" : `Review by ${new Date(d.review_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</span>` : ""}</p>
    </div>`;
  }).join("");
}

async function addDecision(decision, reason, alternatives, reviewDate) {
  if (!state.decisionsReady) { toast("Run supabase/schema_v25_decision_ledger.sql first", "error"); return; }
  const { data, error } = await supabaseClient
    .from("decisions")
    .insert({
      user_id: state.userId,
      board_id: state.currentBoardId,
      decision,
      reason: reason || null,
      alternatives: alternatives || null,
      review_date: reviewDate || null,
    })
    .select()
    .single();
  if (error) { toast("Couldn't save: " + error.message, "error"); return; }
  state.decisions.unshift(data);
  renderDecisionsList();
}

async function removeDecision(id) {
  const item = state.decisions.find((d) => d.id === id);
  state.decisions = state.decisions.filter((d) => d.id !== id); // optimistic
  renderDecisionsList();
  const { error } = await supabaseClient.from("decisions").delete().eq("id", id);
  if (error) {
    if (item) state.decisions.unshift(item); // roll back
    renderDecisionsList();
    toast("Couldn't delete: " + error.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkDecisionsReady();

  const modal = document.getElementById("decisions-modal");
  document.getElementById("decisions-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadDecisions();
  });
  document.querySelectorAll("[data-close-decisions]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("decision-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const whatInput = document.getElementById("decision-what-input");
    const reasonInput = document.getElementById("decision-reason-input");
    const altInput = document.getElementById("decision-alternatives-input");
    const reviewInput = document.getElementById("decision-review-date-input");
    const decision = whatInput.value.trim();
    if (!decision) return;
    await addDecision(decision, reasonInput.value.trim(), altInput.value.trim(), reviewInput.value);
    whatInput.value = "";
    reasonInput.value = "";
    altInput.value = "";
    reviewInput.value = "";
    whatInput.focus();
  });

  document.getElementById("decisions-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-decision]");
    if (btn) removeDecision(btn.dataset.removeDecision);
  });
});
