/* ==========================================================================
   BOARDLY - memory-vault.js  ("Memory Vault" v2 - real semantic search)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/memory-vault.js"></script>

   v1 → v2: v1 was honest keyword (ILIKE) search because true semantic
   search needs a real embeddings provider - that decision has now
   been made (Google's Gemini API, see MEMORY_VAULT_EMBEDDINGS_SETUP.md
   for exactly why and how). v2 tries REAL meaning-based search first -
   type "the driver who kept being late" and it can find a task that
   never used those exact words - and falls back to the same reliable
   keyword search from v1 the moment anything about the smart path
   isn't available: the migration hasn't been run, the Edge Function
   isn't deployed, the Gemini key is missing, a request fails, even a
   temporary network hiccup. Nobody ever sees a broken search box -
   worst case, it quietly behaves exactly like v1 always did.

   HOW THE SMART PATH WORKS: schema_v29_memory_vault_embeddings.sql
   added a 768-number "embedding" column to five tables and one
   Postgres function, search_memory_vault, that ranks rows by how
   close their embedding is to a query's embedding (cosine
   similarity - a standard, well-understood way to compare meaning
   vectors). Two things need an embedding to exist: your stored notes
   (handled by "Build search index" - a button, not automatic, so nobody's
   quietly burning API calls in the background) and whatever you just
   typed into the search box (handled automatically, every search).
   ========================================================================== */

const VAULT_SEARCH_DEBOUNCE_MS = 300;
let vaultSearchTimer = null;
let vaultSearchToken = 0; // guards against an older, slower query overwriting a newer one's results
let vaultLastSearchWasSemantic = false;

function vaultLikePattern(query) {
  return `%${query.replace(/[%_]/g, (c) => "\\" + c)}%`;
}

/** Calls the generate-embedding Edge Function. Returns null (never throws)
 *  on any failure - every caller treats null as "fall back to keyword
 *  search," never as something to show the person an error about. */
async function generateVaultEmbedding(text, taskType) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-embedding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token || ""}`,
      },
      body: JSON.stringify({ text, taskType }),
    });
    const body = await res.json();
    return Array.isArray(body.embedding) ? body.embedding : null;
  } catch {
    return null;
  }
}

async function searchMemoryVaultKeyword(query) {
  const pattern = vaultLikePattern(query);

  const [tasksRes, decisionsRes, commentsRes, commitmentsRes, waitingRes, ideasRes, playbooksRes] = await Promise.all([
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
    state.ideasReady
      ? supabaseClient.from("ideas").select("*").or(`title.ilike.${pattern},description.ilike.${pattern}`).limit(15)
      : Promise.resolve({ data: [] }),
    state.playbooksReady
      ? supabaseClient.from("playbooks").select("*").or(`title.ilike.${pattern},content.ilike.${pattern}`).limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    tasks: tasksRes.data || [],
    decisions: decisionsRes.data || [],
    comments: commentsRes.data || [],
    commitments: commitmentsRes.data || [],
    waiting: waitingRes.data || [],
    ideas: ideasRes.data || [],
    playbooks: playbooksRes.data || [],
  };
}

/** Returns null (never throws) if anything about the smart path fails, so
 *  runVaultSearch can cleanly fall back to keyword search. */
async function searchMemoryVaultSemantic(query) {
  if (!state.vaultEmbeddingsReady) return null;
  const queryEmbedding = await generateVaultEmbedding(query, "RETRIEVAL_QUERY");
  if (!queryEmbedding) return null;

  const { data, error } = await supabaseClient.rpc("search_memory_vault", {
    query_embedding: queryEmbedding,
    match_count: 20,
  });
  if (error) { console.warn("searchMemoryVaultSemantic:", error.message); return null; }
  return data || [];
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

const VAULT_SECTION_META = {
  task: { label: "Tasks", icon: "fa-square-check", color: "text-orange" },
  decision: { label: "Decisions", icon: "fa-scale-balanced", color: "text-violet" },
  comment: { label: "Client feedback", icon: "fa-handshake", color: "text-teal" },
  commitment: { label: "Commitments", icon: "fa-hand-holding-heart", color: "text-orange" },
  waiting: { label: "Waiting on", icon: "fa-hourglass-half", color: "text-ink-soft" },
  idea: { label: "Ideas", icon: "fa-lightbulb", color: "text-violet" },
  playbook: { label: "Playbooks", icon: "fa-book", color: "text-orange" },
};

/** Turns a flat, ranked list of rows (from search_memory_vault) into the
 *  same grouped-by-type sections the keyword path renders - one renderer,
 *  two possible sources of rows. */
function renderSemanticVaultResults(rows) {
  const wrap = document.getElementById("memory-vault-results");
  const noResults = document.getElementById("memory-vault-no-results");
  if (!rows.length) {
    wrap.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  const byType = new Map();
  rows.forEach((r) => {
    if (!byType.has(r.source_type)) byType.set(r.source_type, []);
    byType.get(r.source_type).push(r);
  });

  const sections = Object.keys(VAULT_SECTION_META)
    .filter((type) => byType.has(type))
    .map((type) => {
      const meta = VAULT_SECTION_META[type];
      const items = byType.get(type).map((r) => {
        const dataAttrs = type === "task" ? `data-vault-task="${r.id}" data-vault-board="${r.board_id || ""}"`
          : type === "comment" ? `data-vault-comment-task="${r.task_id}" data-vault-board="${r.board_id || ""}"`
          : type === "decision" ? `data-vault-decision="${r.id}"`
          : type === "commitment" ? `data-vault-open-commitments="1"`
          : type === "idea" ? `data-vault-open-ideas="1"`
          : type === "playbook" ? `data-vault-open-playbooks="1"`
          : `data-vault-open-waiting="1"`;
        return vaultResultRow(meta.icon, meta.color, r.title || "Untitled", r.snippet, dataAttrs);
      }).join("");
      return `<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">${meta.label}</p><div class="space-y-1.5">${items}</div></div>`;
    });

  wrap.innerHTML = sections.join("");
}

function renderKeywordVaultResults(query, results) {
  const wrap = document.getElementById("memory-vault-results");
  const noResults = document.getElementById("memory-vault-no-results");

  const total = results.tasks.length + results.decisions.length + results.comments.length + results.commitments.length + results.waiting.length + results.ideas.length + results.playbooks.length;
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
  if (results.ideas.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Ideas</p><div class="space-y-1.5">
      ${results.ideas.map((i) => vaultResultRow("fa-lightbulb", "text-violet", i.title, vaultSnippet(i.description || "", query), `data-vault-open-ideas="1"`)).join("")}
    </div></div>`);
  }
  if (results.playbooks.length) {
    sections.push(`<div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Playbooks</p><div class="space-y-1.5">
      ${results.playbooks.map((p) => vaultResultRow("fa-book", "text-orange", p.title, vaultSnippet(p.content || "", query), `data-vault-open-playbooks="1"`)).join("")}
    </div></div>`);
  }

  wrap.innerHTML = sections.join("");
}

function updateVaultModeBadge() {
  const badge = document.getElementById("memory-vault-mode-badge");
  if (!badge) return;
  badge.innerHTML = state.vaultEmbeddingsReady
    ? `<i class="fa-solid fa-wand-magic-sparkles text-violet"></i> Smart search is on: searches by meaning, not just exact words`
    : `<i class="fa-solid fa-magnifying-glass"></i> Keyword search. See MEMORY_VAULT_EMBEDDINGS_SETUP.md to turn on smart search`;
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
  empty.classList.add("hidden");

  const myToken = ++vaultSearchToken;
  const semanticRows = await searchMemoryVaultSemantic(query.trim());
  if (myToken !== vaultSearchToken) return; // a newer search started while this one was in flight

  if (semanticRows) {
    vaultLastSearchWasSemantic = true;
    renderSemanticVaultResults(semanticRows);
    return;
  }

  vaultLastSearchWasSemantic = false;
  const keywordResults = await searchMemoryVaultKeyword(query.trim());
  if (myToken !== vaultSearchToken) return;
  renderKeywordVaultResults(query.trim(), keywordResults);
}

async function openVaultTaskResult(taskId, boardId) {
  document.getElementById("memory-vault-modal")?.classList.add("hidden");
  if (boardId && boardId !== state.currentBoardId) await switchBoard(boardId);
  openEditModal(taskId);
}

/* ---- Build search index ----
   Finds every row across the five tables that doesn't have an
   embedding yet, generates one, and saves it. Safe to run as many
   times as you like - it only ever processes rows where embedding is
   still null, so re-running after adding new notes is fast (only the
   new stuff gets indexed) and interrupting it part-way through loses
   nothing - just run it again later. */
async function vaultTablesToIndex() {
  const jobs = [];
  const { data: tasks } = await supabaseClient.from("tasks").select("id, title, notes").is("embedding", null).limit(200);
  (tasks || []).forEach((t) => jobs.push({ table: "tasks", id: t.id, text: [t.title, t.notes].filter(Boolean).join("\n\n") }));

  if (state.decisionsReady) {
    const { data: decisions } = await supabaseClient.from("decisions").select("id, decision, reason, alternatives").is("embedding", null).limit(200);
    (decisions || []).forEach((d) => jobs.push({ table: "decisions", id: d.id, text: [d.decision, d.reason, d.alternatives].filter(Boolean).join("\n\n") }));
  }
  if (state.clientPortalReady) {
    const { data: comments } = await supabaseClient.from("client_comments").select("id, body").is("embedding", null).limit(200);
    (comments || []).forEach((c) => jobs.push({ table: "client_comments", id: c.id, text: c.body }));
  }
  if (state.commitmentsReady) {
    const { data: commitments } = await supabaseClient.from("commitments").select("id, what, to_whom").is("embedding", null).limit(200);
    (commitments || []).forEach((c) => jobs.push({ table: "commitments", id: c.id, text: [c.what, c.to_whom].filter(Boolean).join(" - ") }));
  }
  if (state.waitingRoomReady) {
    const { data: waiting } = await supabaseClient.from("waiting_items").select("id, what, who").is("embedding", null).limit(200);
    (waiting || []).forEach((w) => jobs.push({ table: "waiting_items", id: w.id, text: [w.what, w.who].filter(Boolean).join(" - ") }));
  }
  if (state.ideasReady) {
    const { data: ideas } = await supabaseClient.from("ideas").select("id, title, description").is("embedding", null).limit(200);
    (ideas || []).forEach((i) => jobs.push({ table: "ideas", id: i.id, text: [i.title, i.description].filter(Boolean).join("\n\n") }));
  }
  if (state.playbooksReady) {
    const { data: playbooks } = await supabaseClient.from("playbooks").select("id, title, content").is("embedding", null).limit(200);
    (playbooks || []).forEach((p) => jobs.push({ table: "playbooks", id: p.id, text: [p.title, p.content].filter(Boolean).join("\n\n") }));
  }
  return jobs.filter((j) => j.text && j.text.trim());
}

async function buildVaultIndex() {
  const statusEl = document.getElementById("memory-vault-index-status");
  const btn = document.getElementById("memory-vault-build-index-btn");
  btn.disabled = true;

  statusEl.textContent = "Checking what needs indexing…";
  const jobs = await vaultTablesToIndex();
  if (!jobs.length) {
    statusEl.textContent = "Everything's already indexed.";
    btn.disabled = false;
    return;
  }

  let done = 0, failed = 0;
  for (const job of jobs) {
    statusEl.textContent = `Indexing… ${done + 1} of ${jobs.length}`;
    const embedding = await generateVaultEmbedding(job.text, "RETRIEVAL_DOCUMENT");
    if (embedding) {
      const { error } = await supabaseClient.from(job.table).update({ embedding }).eq("id", job.id);
      if (error) failed++;
    } else {
      failed++;
    }
    done++;
  }

  statusEl.textContent = failed
    ? `Indexed ${done - failed} of ${jobs.length} - ${failed} failed (check GEMINI_API_KEY, or you may have hit today's free-tier limit - just run this again later).`
    : `Indexed ${done} item${done === 1 ? "" : "s"}.`;
  btn.disabled = false;
  toast(failed ? "Indexing finished with some errors" : "Search index up to date", failed ? "error" : "ok");
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
    document.getElementById("memory-vault-index-row")?.classList.toggle("hidden", !state.vaultEmbeddingsReady);
    document.getElementById("memory-vault-index-status").textContent = "Smart search needs your notes indexed once.";
    updateVaultModeBadge();
  });
  document.querySelectorAll("[data-close-memory-vault]").forEach((el) =>
    el.addEventListener("click", () => modal?.classList.add("hidden"))
  );

  document.getElementById("memory-vault-search")?.addEventListener("input", (e) => {
    clearTimeout(vaultSearchTimer);
    const query = e.target.value;
    vaultSearchTimer = setTimeout(() => runVaultSearch(query), VAULT_SEARCH_DEBOUNCE_MS);
  });

  document.getElementById("memory-vault-build-index-btn")?.addEventListener("click", buildVaultIndex);

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
    if (e.target.closest("[data-vault-open-ideas]")) {
      modal?.classList.add("hidden");
      document.getElementById("idea-vault-btn")?.click();
      return;
    }
    if (e.target.closest("[data-vault-open-playbooks]")) {
      modal?.classList.add("hidden");
      document.getElementById("playbooks-btn")?.click();
      return;
    }
    if (e.target.closest("[data-vault-open-waiting]")) {
      modal?.classList.add("hidden");
      document.getElementById("waiting-room-btn")?.click();
    }
  });
});
