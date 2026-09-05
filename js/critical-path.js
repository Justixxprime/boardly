/* ==========================================================================
   BOARDLY - critical-path.js
   --------------------------------------------------------------------------
   Phase 2 of the master build spec: "Calculate the project's critical path
   using actual task dependencies and durations... Do not pretend to
   predict the future if the data is insufficient."

   Boardly's task model doesn't have real per-task durations (no start
   date + estimated length on every ticket the way a Gantt tool would) -
   just due dates and dependency links. Rather than fake a duration-based
   Critical Path Method calculation on data that doesn't exist, this
   computes the honest thing Boardly's actual data supports: the LONGEST
   CHAIN of tickets that must happen one after another before the last
   one can finish. That chain - not any single ticket - is what actually
   controls how soon the work can wrap up, which is the real point of a
   critical path regardless of how the underlying calculation works.

   Dependency data comes from two places, combined into one graph:
     - blocked_by_id (schema_v11) - the simple single-blocker field
     - task_links (schema_v52) - "blocks" and "precedes" specifically;
       "relates to", "duplicates", and "parent/child" aren't sequencing
       relationships, so they don't belong in a critical path at all
   ========================================================================== */

/**
 * Builds a dependsOn map: dependsOn[taskId] = [array of task ids that
 * must complete before taskId can]. Only includes ACTIVE (not done)
 * tasks on either side - a finished blocker doesn't lengthen anything
 * anymore, and a finished ticket isn't part of "what's left."
 */
function buildDependencyGraph(tasks, taskLinks) {
  const activeIds = new Set(tasks.filter((t) => t.status !== "done").map((t) => t.id));
  const dependsOn = {};
  activeIds.forEach((id) => { dependsOn[id] = []; });

  tasks.forEach((t) => {
    if (activeIds.has(t.id) && t.blocked_by_id && activeIds.has(t.blocked_by_id)) {
      dependsOn[t.id].push(t.blocked_by_id);
    }
  });
  (taskLinks || []).forEach((l) => {
    if (l.link_type !== "blocks" && l.link_type !== "precedes") return;
    if (activeIds.has(l.related_task_id) && activeIds.has(l.task_id)) {
      dependsOn[l.related_task_id].push(l.task_id);
    }
  });
  // De-duplicate (the same pair could be recorded via both blocked_by_id
  // AND a task_link, e.g. someone set both) so it's never counted twice
  // toward the chain length.
  Object.keys(dependsOn).forEach((id) => { dependsOn[id] = [...new Set(dependsOn[id])]; });
  return dependsOn;
}

/**
 * Longest chain in the dependency graph, in task-count terms (not
 * duration - see the file header). Cycles (someone accidentally set up
 * A depends on B depends on A) are detected and simply not traversed
 * further down that branch, rather than infinite-looping - flagged
 * separately so it's visible rather than silently wrong.
 */
function findLongestChain(dependsOn) {
  const memo = {};
  const visiting = new Set();
  const cyclesFound = new Set();

  function chainLength(id) {
    if (memo[id] !== undefined) return memo[id];
    if (visiting.has(id)) { cyclesFound.add(id); return 0; }
    visiting.add(id);
    const deps = dependsOn[id] || [];
    let best = 0;
    let bestDep = null;
    deps.forEach((depId) => {
      const len = chainLength(depId);
      if (len > best) { best = len; bestDep = depId; }
    });
    visiting.delete(id);
    memo[id] = best + 1;
    memo[`${id}__via`] = bestDep;
    return memo[id];
  }

  Object.keys(dependsOn).forEach((id) => chainLength(id));

  let longestId = null;
  let longestLen = 0;
  Object.keys(dependsOn).forEach((id) => {
    if (memo[id] > longestLen) { longestLen = memo[id]; longestId = id; }
  });

  const chain = [];
  let cursor = longestId;
  while (cursor) {
    chain.unshift(cursor);
    cursor = memo[`${cursor}__via`];
  }

  return { chain, hasCycle: cyclesFound.size > 0 };
}

/**
 * Downstream impact: for each active task, how many OTHER active tasks
 * depend on it, directly or transitively (through the whole chain of
 * things blocked behind it) - a real, checkable number, not a guess.
 */
function computeDownstreamImpact(dependsOn) {
  const impact = {};
  const dependents = {}; // reverse of dependsOn
  Object.keys(dependsOn).forEach((id) => { dependents[id] = []; });
  Object.entries(dependsOn).forEach(([id, deps]) => {
    deps.forEach((depId) => { (dependents[depId] ||= []).push(id); });
  });
  function countDownstream(id, seen = new Set()) {
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const direct = dependents[id] || [];
    let total = direct.length;
    direct.forEach((childId) => { total += countDownstream(childId, seen); });
    return total;
  }
  Object.keys(dependsOn).forEach((id) => { impact[id] = countDownstream(id); });
  return impact;
}

async function openCriticalPath() {
  document.getElementById("board-switcher-menu")?.classList.add("hidden");
  const modal = document.getElementById("critical-path-modal");
  const emptyEl = document.getElementById("critical-path-empty");
  const bodyEl = document.getElementById("critical-path-body");
  modal.classList.remove("hidden");

  const activeTasks = state.tasks.filter((t) => t.status !== "done" && t.board_id === state.currentBoardId);
  let taskLinks = [];
  if (state.taskLinksReady) {
    const { data } = await supabaseClient.from("task_links").select("task_id, related_task_id, link_type").eq("board_id", state.currentBoardId);
    taskLinks = data || [];
  }

  const dependsOn = buildDependencyGraph(state.tasks.filter((t) => t.board_id === state.currentBoardId), taskLinks);
  const hasAnyLinks = Object.values(dependsOn).some((deps) => deps.length > 0);

  if (!hasAnyLinks) {
    // Being honest about insufficient data rather than pretending every
    // ticket is equally "critical" - the master spec's own instruction.
    emptyEl.textContent = "No dependency data recorded on this board yet - set \"Blocked by\" or add a \"Blocks\"/\"Precedes\" link between tickets to see a real critical path here.";
    emptyEl.classList.remove("hidden");
    bodyEl.classList.add("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  bodyEl.classList.remove("hidden");

  const { chain, hasCycle } = findLongestChain(dependsOn);
  const impact = computeDownstreamImpact(dependsOn);

  const chainTasks = chain.map((id) => activeTasks.find((t) => t.id === id)).filter(Boolean);
  document.getElementById("critical-path-chain").innerHTML = chainTasks.length
    ? chainTasks.map((t, i) => `
      <div class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-ink-soft w-5 shrink-0">${i + 1}.</span>
        <span class="flex-1 truncate">${escapeHTML(t.title)}</span>
        ${t.due_date ? `<span class="text-xs text-ink-soft shrink-0">${new Date(t.due_date + "T00:00:00").toLocaleDateString()}</span>` : ""}
      </div>`).join("")
    : `<p class="text-sm text-ink-soft">Every dependency link found points at a ticket that's already Done, so nothing active is actually being held up right now.</p>`;

  // The one honest, checkable "scheduling conflict" this data can
  // actually support: a ticket due BEFORE something it depends on is
  // due - i.e., it's scheduled to be worked on before its own blocker
  // is even expected to be ready.
  const conflicts = [];
  for (let i = 1; i < chainTasks.length; i++) {
    const blocker = chainTasks[i - 1];
    const dependent = chainTasks[i];
    if (blocker.due_date && dependent.due_date && dependent.due_date < blocker.due_date) {
      conflicts.push({ blocker, dependent });
    }
  }
  const conflictsEl = document.getElementById("critical-path-conflicts");
  conflictsEl.innerHTML = conflicts.length
    ? conflicts.map((c) => `
      <div class="ticket p-2.5 text-xs border-[var(--critical)]/30">
        <i class="fa-solid fa-triangle-exclamation text-critical mr-1"></i>
        "${escapeHTML(c.dependent.title)}" is due before "${escapeHTML(c.blocker.title)}", which it depends on - one of these dates is probably wrong.
      </div>`).join("")
    : "";
  if (hasCycle) {
    conflictsEl.innerHTML += `<div class="ticket p-2.5 text-xs border-[var(--critical)]/30"><i class="fa-solid fa-rotate text-critical mr-1"></i>Found a circular dependency somewhere on this board (two or more tickets depending on each other) - it was skipped rather than counted, but worth untangling.</div>`;
  }

  const mostImpactfulId = Object.entries(impact).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostImpactfulCount = impact[mostImpactfulId] || 0;
  const mostImpactfulTask = activeTasks.find((t) => t.id === mostImpactfulId);
  document.getElementById("critical-path-impact").innerHTML = mostImpactfulTask && mostImpactfulCount > 0
    ? `<p class="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-2">Biggest downstream impact</p>
       <p class="text-sm">"${escapeHTML(mostImpactfulTask.title)}" is, directly or through other tickets, holding up <strong>${mostImpactfulCount}</strong> other active ticket${mostImpactfulCount === 1 ? "" : "s"} on this board.</p>`
    : "";
}

function closeCriticalPath() {
  document.getElementById("critical-path-modal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("critical-path-btn")?.addEventListener("click", openCriticalPath);
  document.getElementById("critical-path-modal")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-critical-path]")) closeCriticalPath();
  });
});
