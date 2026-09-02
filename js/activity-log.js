/* ==========================================================================
   BOARDLY - activity-log.js  (Activity)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/activity-log.js" defer></script>

   Needs supabase/schema_v48_activity_log.sql run first. The events
   themselves are written from various points in dashboard.js (see
   logActivity in supabase-client.js) - this file only reads and
   displays them.
   ========================================================================== */

const ACTIVITY_LABELS = {
  TASK_CREATED: (p) => `Created "${p.title}"`,
  TASK_COMPLETED: (p) => `Completed "${p.title}"`,
  TASK_REOPENED: (p) => `Reopened "${p.title}"`,
  TASK_ASSIGNED: (p) => `Assigned "${p.title}"`,
  TASK_UNASSIGNED: (p) => `Unassigned "${p.title}"`,
  TASK_MOVED: (p) => `Moved "${p.title}" from ${p.from} to ${p.to}`,
  TASK_DELETED: (p) => `Deleted "${p.title}"`,
  TASK_EDITED: (p) => `Edited ${(p.fields || []).join(", ") || "a field"} on "${p.title}"`,
  MILESTONE_COMPLETED: (p) => `Milestone reached: "${p.name}"`,
  AUTOMATION_RAN: (p) => `Autopilot: ${p.summary || p.rule}`,
  CLIENT_COMMENT_ADDED: (p) => `${p.authorName || "A client"} commented`,
  CLIENT_DECISION: (p) => `${p.authorName || "A client"} ${p.decision === "approved" ? "approved a ticket" : "requested changes"}`,
};
const ACTIVITY_ICONS = {
  TASK_CREATED: "fa-plus",
  TASK_COMPLETED: "fa-check",
  TASK_REOPENED: "fa-rotate-left",
  TASK_ASSIGNED: "fa-user-check",
  TASK_UNASSIGNED: "fa-user-xmark",
  TASK_MOVED: "fa-arrow-right-arrow-left",
  TASK_DELETED: "fa-trash",
  TASK_EDITED: "fa-pen",
  MILESTONE_COMPLETED: "fa-flag-checkered",
  AUTOMATION_RAN: "fa-bolt",
  CLIENT_COMMENT_ADDED: "fa-comment",
  CLIENT_DECISION: "fa-user-check",
};

state.activityLogReady = false;

async function checkActivityLogReady() {
  const { error } = await supabaseClient.from("activity_events").select("id").limit(1);
  state.activityLogReady = !error;
  return state.activityLogReady;
}

function formatActivityAge(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function loadActivityLog() {
  const list = document.getElementById("activity-log-list");
  const empty = document.getElementById("activity-log-empty");
  const notReady = document.getElementById("activity-log-not-ready");
  if (!list) return;

  if (!state.activityLogReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  const { data, error } = await supabaseClient
    .from("activity_events")
    .select("event_type, payload, created_at")
    .eq("board_id", state.currentBoardId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) { console.warn("loadActivityLog:", error.message); return; }
  if (!data || !data.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = data.map((ev) => `
    <div class="flex items-start gap-2.5 py-1.5 border-b border-line last:border-0">
      <i class="fa-solid ${ACTIVITY_ICONS[ev.event_type] || "fa-circle"} text-ink-soft text-xs mt-1 w-4 text-center shrink-0"></i>
      <span class="flex-1 text-sm min-w-0 truncate">${escapeHTML((ACTIVITY_LABELS[ev.event_type] || (() => ev.event_type))(ev.payload || {}))}</span>
      <span class="text-xs text-ink-soft shrink-0">${formatActivityAge(ev.created_at)}</span>
    </div>`).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkActivityLogReady();
  const modal = document.getElementById("activity-log-modal");
  document.getElementById("activity-log-btn")?.addEventListener("click", async () => {
    modal?.classList.remove("hidden");
    await loadActivityLog();
  });
  document.querySelectorAll("[data-close-activity-log]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );
});
