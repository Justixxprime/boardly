/* ==========================================================================
   BOARDLY 2.0: js/operations.js
   --------------------------------------------------------------------------
   Powers operations.html, Phase 7 of the brief. Standalone page, own
   small state, same pattern as home.js/money.js/clients.js.

   This is deliberately NOT a persona/module-toggling system (Section 63's
   fuller vision: enabled_modules, default_workflows, default_dashboard).
   It is the one real, honest piece of that vision that already had real
   data behind it: every board already has a work_type (schema_v12), and
   signup already asks what kind of work someone does (js/auth.js's
   SIGNUP_WORK_TYPES step), that answer just never survived past
   tagging the first board. schema_v69 persists it, this page uses it.

   Kept in sync by hand with TERMINOLOGY in js/dashboard.js and
   SIGNUP_WORK_TYPES in js/auth.js, same "small presentation-only
   duplicate" reasoning those two already use rather than pulling in
   dashboard.js's whole file for a handful of labels and icons.
   ========================================================================== */

const OPS_VERTICALS = [
  { key: "logistics", label: "Logistics", icon: "fa-truck-fast", color: "orange" },
  { key: "teaching", label: "Teaching", icon: "fa-chalkboard-user", color: "violet" },
  { key: "freelance", label: "Freelance", icon: "fa-briefcase", color: "teal" },
  { key: "field_service", label: "Field service", icon: "fa-screwdriver-wrench", color: "pink" },
  { key: "healthcare", label: "Healthcare / care", icon: "fa-briefcase-medical", color: "critical" },
];

const opsState = { userId: null, ready: false, boards: [], workspaceType: null };

function escOps(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function opsVertical(key) {
  return OPS_VERTICALS.find((v) => v.key === key);
}

async function opsCheckReady() {
  const { error } = await supabaseClient.from("user_settings").select("workspace_type").limit(1);
  opsState.ready = !error;
  document.getElementById("ops-not-ready")?.classList.toggle("hidden", opsState.ready);
  return opsState.ready;
}

async function opsLoad() {
  const [boardsRes, settingsRes] = await Promise.all([
    supabaseClient.from("boards").select("id, name, work_type").eq("user_id", opsState.userId),
    opsState.ready
      ? supabaseClient.from("user_settings").select("workspace_type").eq("user_id", opsState.userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  opsState.boards = boardsRes.data || [];
  opsState.workspaceType = settingsRes.data?.workspace_type || null;
}

function opsRenderPersonaPicker() {
  const picker = document.getElementById("ops-persona-picker");
  const hasVerticalBoards = opsState.boards.some((b) => opsVertical(b.work_type));
  if (opsState.workspaceType || hasVerticalBoards) { picker.classList.add("hidden"); return; }
  picker.classList.remove("hidden");
  document.getElementById("ops-persona-choices").innerHTML = OPS_VERTICALS.map((v) => `
    <button type="button" data-set-persona="${v.key}" class="ticket p-3.5 text-left flex flex-col items-start gap-2 hover:border-${v.color}">
      <span class="icon-badge icon-badge-${v.color}"><i class="fa-solid ${v.icon}"></i></span>
      <span class="text-sm font-semibold">${v.label}</span>
    </button>`).join("");
}

function opsRenderGroups() {
  const wrap = document.getElementById("ops-groups");
  const empty = document.getElementById("ops-empty");
  const groups = OPS_VERTICALS.map((v) => ({ vertical: v, boards: opsState.boards.filter((b) => b.work_type === v.key) }))
    .filter((g) => g.boards.length > 0);

  if (!groups.length) { wrap.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  wrap.innerHTML = groups.map(({ vertical, boards }) => `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm font-semibold flex items-center gap-2"><i class="fa-solid ${vertical.icon} text-${vertical.color}"></i>${vertical.label}</p>
        <button type="button" class="btn text-xs" data-new-board="${vertical.key}"><i class="fa-solid fa-plus mr-1"></i>New ${vertical.label} board</button>
      </div>
      <div class="grid sm:grid-cols-2 gap-2">
        ${boards.map((b) => `<button type="button" class="ticket p-3 text-left text-sm hover:border-${vertical.color}" data-open-board="${b.id}">${escOps(b.name)}</button>`).join("")}
      </div>
    </div>`).join("");
}

async function opsSetPersona(workspaceType) {
  const { error } = await supabaseClient.from("user_settings").upsert({ user_id: opsState.userId, workspace_type: workspaceType }, { onConflict: "user_id" });
  if (error) { toast("Couldn't save that: " + error.message, "error"); return; }
  opsState.workspaceType = workspaceType;
  opsRenderPersonaPicker();
  toast("Saved");
}

async function opsCreateBoard(workType) {
  const vertical = opsVertical(workType);
  const { data, error } = await supabaseClient
    .from("boards")
    .insert({ name: `My ${vertical.label} board`, user_id: opsState.userId, work_type: workType })
    .select()
    .single();
  if (error || !data) { toast("Couldn't create the board: " + (error?.message || "unknown error"), "error"); return; }
  localStorage.setItem("boardly-current-board", data.id);
  location.href = "dashboard.html";
}

function opsOpenBoard(boardId) {
  localStorage.setItem("boardly-current-board", boardId);
  location.href = "dashboard.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    console.error("Operations: couldn't confirm your session.", err);
    toast("Couldn't confirm your session, try reloading the page.", "error");
    return;
  }
  if (!session) return;
  opsState.userId = session.user.id;

  document.getElementById("ops-persona-choices")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-set-persona]");
    if (btn) opsSetPersona(btn.dataset.setPersona);
  });
  document.getElementById("ops-groups")?.addEventListener("click", (e) => {
    const newBtn = e.target.closest("[data-new-board]");
    if (newBtn) { opsCreateBoard(newBtn.dataset.newBoard); return; }
    const openBtn = e.target.closest("[data-open-board]");
    if (openBtn) opsOpenBoard(openBtn.dataset.openBoard);
  });

  try {
    await opsCheckReady();
    await opsLoad();
    opsRenderPersonaPicker();
    opsRenderGroups();
  } catch (err) {
    console.error("Operations: couldn't load your data.", err);
    toast("Couldn't load Operations, try reloading the page.", "error");
  }
});
