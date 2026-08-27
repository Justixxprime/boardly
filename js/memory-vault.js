/* ==========================================================================
   BOARDLY - memory-vault.js  ("Memory Vault" v1)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/memory-vault.js"></script>

   Needs NOTHING new in Supabase - it searches tables that already
   exist (tasks, decisions, client_comments, commitments,
   waiting_items), each already protected by its own RLS policy, so
   this can only ever return rows the signed-in user actually owns.

   BE HONEST ABOUT WHAT THIS IS: the master plan's original "Memory
   Vault" idea was semantic/vector search - type a vague description
   and find the right note even if it doesn't share exact words with
   your query. That needs pgvector plus a real embeddings API (OpenAI,
   Cohere, etc.) - a genuine new-provider decision that hasn't been
   made yet, not something to fake. This v1 is real, honest keyword
   search (case-insensitive substring matching, via Postgres ILIKE)
   across everything you've written in Boardly, in one place, across
   EVERY board rather than just the one you're currently on - which is
   most of what people actually reach for a search tool to do anyway.
   If a real embeddings provider gets set up later, this is the file
   that would upgrade to use it - the UI and result-grouping shape
   here wouldn't need to change, only how the matching itself works.

   Cross-board reach is why this searches via fresh Supabase queries
   rather than filtering state.tasks (which only holds the CURRENT
   board's tasks) - same reason People and Commitments search across
   every board rather than just one.
   ========================================================================== */

const VAULT_SEARCH_DEBOUNCE_MS = 300;
let vaultSearchTimer = null;
let vaultSearchToken = 0; // guards against an older, slower query overwriting a newer one's results

function vaultLikePattern(query) {
  return `%${query.replace(/[%_]/g, (c) => "\\" + c)}%`;
}

async function searchMemoryVault(query) {
  const pattern = vaultLikePattern(query);

  const [tasksRes, decisionsRes, commentsRes, commitmentsRes, waitingRes] = await Promise.all([
    supabaseClient.from("tasks").select("id, board_id, title, notes, status")
      .or(`title.ilike.${pattern},notes.ilike.${pattern}`).limit(15),
    state.decisionsReady
      ? supabaseClient.from("decisions").select("*")
          .or(`decision.ilike.${pattern},reason.ilike.${pattern},alternatives.ilike.${pattern},expected_outcome.ilike.${pattern},actual_outcome.ilike.${pattern}`).limit(15)
      : Promise.resolve({ data: [] }),
    state.clientPortalReady
      ? supabaseClient.from("client_comments").select("*").ilike("body", pattern).limit(15)
      : Promise.resolve({ data: [] }),
    state.commitmentsReady
      ? supabaseClient.from("commitments").select("*").ilike("what", pattern).limit(15)
      : Promise.resolve({ data: [] }),
    state.waitingRoomReady
      ? supabaseClient.from("waiting_items").select("*").ilike("what", pattern).limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    tasks: tasksRes.data || [],
    decisions: decisionsRes.data || [],
    comments: commentsRes.data || [],
    commitments: commitmentsRes.data || [],
    waiting: waitingRes.data || [],
  };
}

function vaultSnippet(text, query, radius = 60) {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function vaultResultRow(icon, color, title, snippet, dataAttrs) {
  return `
    <button type="button" ${dataAttrs} class="w-full text-left ticket p-2.5 flex items-start gap-2.5 hover:border-orange transition-colors">
      <i class="fa-solid ${icon} ${color} mt-0.5 w-4 text-center shrink-0"></i>
      <div class="min-w-0">
        <p class="text-sm font-medium truncate">${escapeHTML(title)}</p>
        ${snippet ? `<p class="text-xs text-ink-soft mt-0.5">${escapeHTML(snippet)}</p>` : ""}
      </div>
    </button>`;
}

function renderVaultResults(query, results) {
  const wrap = document.getElementById("memory-vault-results");
  const empty = document.getElementById("memory-vault-empty");
  const noResults = document.getElementById("memory-vault-no-results");
  if (!wrap) return;

  const total = results.tasks.length + results.decisions.length + results.comments.length + results.commitments.length + results.waiting.length;
  empty.classList.add("hidden");
  if (!total) {
    wrap.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  const sections = [];

  if (results.tasks.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Tasks</p><div class="space-y-1.5">
      ${results.tasks.map((t) => vaultResultRow("fa-square-check", "text-orange", t.title, vaultSnippet(t.notes, query), `data-vault-task="${t.id}" data-vault-board="${t.board_id}"`)).join("")}
    </div></div>`);
  }
  if (results.decisions.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Decisions</p><div class="space-y-1.5">
      ${results.decisions.map((d) => vaultResultRow("fa-scale-balanced", "text-violet", d.decision, vaultSnippet(d.reason || d.alternatives || "", query), `data-vault-decision="${d.id}"`)).join("")}
    </div></div>`);
  }
  if (results.comments.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Client feedback</p><div class="space-y-1.5">
      ${results.comments.map((c) => vaultResultRow("fa-handshake", "text-teal", c.author_name, vaultSnippet(c.body, query), `data-vault-comment-task="${c.task_id}" data-vault-board="${c.board_id}"`)).join("")}
    </div></div>`);
  }
  if (results.commitments.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Commitments</p><div class="space-y-1.5">
      ${results.commitments.map((c) => vaultResultRow("fa-hand-holding-heart", "text-orange", c.what, c.to_whom ? `To ${c.to_whom}` : "", `data-vault-open-commitments="1"`)).join("")}
    </div></div>`);
  }
  if (results.waiting.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Waiting on</p><div class="space-y-1.5">
      ${results.waiting.map((w) => vaultResultRow("fa-hourglass-half", "text-ink-soft", w.what, w.who ? `From ${w.who}` : "", `data-vault-open-waiting="1"`)).join("")}
    </div></div>`);
  }

  wrap.innerHTML = sections.join("");
}

async function runVaultSearch(query) {
  const wrap = document.getElementById("memory-vault-results");
  const empty = document.getElementById("memory-vault-empty");
  const noResults = document.getElementById("memory-vault-no-results");

  if (query.trim().length < 2) {
    wrap.innerHTML = "";
    noResults.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  const myToken = ++vaultSearchToken;
  const results = await searchMemoryVault(query.trim());
  if (myToken !== vaultSearchToken) return; // a newer search started while this one was in flight
  renderVaultResults(query.trim(), results);
}

async function openVaultTaskResult(taskId, boardId) {
  document.getElementById("memory-vault-modal")?.classList.add("hidden");
  if (boardId && boardId !== state.currentBoardId) await switchBoard(boardId);
  openEditModal(taskId);
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("memory-vault-modal");

  document.getElementById("memory-vault-btn")?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    const input = document.getElementById("memory-vault-search");
    if (input) { input.value = ""; input.focus(); }
    document.getElementById("memory-vault-results").innerHTML = "";
    document.getElementById("memory-vault-no-results").classList.add("hidden");
    document.getElementById("memory-vault-empty").classList.remove("hidden");
  });
  document.querySelectorAll("[data-close-memory-vault]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("memory-vault-search")?.addEventListener("input", (e) => {
    clearTimeout(vaultSearchTimer);
    const query = e.target.value;
    vaultSearchTimer = setTimeout(() => runVaultSearch(query), VAULT_SEARCH_DEBOUNCE_MS);
  });

  document.getElementById("memory-vault-results")?.addEventListener("click", (e) => {
    const taskBtn = e.target.closest("[data-vault-task]");
    if (taskBtn) { openVaultTaskResult(taskBtn.dataset.vaultTask, taskBtn.dataset.vaultBoard); return; }

    const commentBtn = e.target.closest("[data-vault-comment-task]");
    if (commentBtn) { openVaultTaskResult(commentBtn.dataset.vaultCommentTask, commentBtn.dataset.vaultBoard); return; }

    const decisionBtn = e.target.closest("[data-vault-decision]");
    if (decisionBtn) {
      modal?.classList.add("hidden");
      document.getElementById("decisions-btn")?.click();
      return;
    }
    if (e.target.closest("[data-vault-open-commitments]")) {
      modal?.classList.add("hidden");
      document.getElementById("commitments-btn")?.click();
      return;
    }
    if (e.target.closest("[data-vault-open-waiting]")) {
      modal?.classList.add("hidden");
      document.getElementById("waiting-room-btn")?.click();
    }
  });
});
