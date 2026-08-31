/* ==========================================================================
   BOARDLY - js/roadmap.js
   --------------------------------------------------------------------------
   Powers roadmap.html. Standalone page, no dependency on dashboard.js -
   a visitor voting on a public roadmap has no Boardly account at all,
   same approach as booking-status.js and marketplace-public.js.
   ========================================================================== */

const rmParams = new URLSearchParams(location.search);
const RM_TOKEN = rmParams.get("token") || "";

// A random id this browser remembers, so the server can tell "this
// browser already voted on this idea" apart from a fresh visitor -
// generated once, reused forever after (see roadmap-vote/index.ts for
// why this is "good enough, not perfect" and that's an intentional,
// reasonable tradeoff for anonymous public voting).
function rmVoterId() {
  let id = localStorage.getItem("boardly-roadmap-voter-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("boardly-roadmap-voter-id", id);
  }
  return id;
}

function rmVotedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("boardly-roadmap-voted") || "[]"));
  } catch {
    return new Set();
  }
}

function rmRememberVoted(ideaId) {
  const voted = rmVotedSet();
  voted.add(ideaId);
  localStorage.setItem("boardly-roadmap-voted", JSON.stringify([...voted]));
}

function rmShow(id) {
  ["rm-loading", "rm-notfound", "rm-content"].forEach((x) => document.getElementById(x).classList.toggle("hidden", x !== id));
}

function rmRenderColumn(elId, ideas) {
  const wrap = document.getElementById(elId);
  const template = document.getElementById("rm-idea-template");
  const voted = rmVotedSet();

  if (!ideas.length) {
    wrap.innerHTML = `<p class="text-xs text-ink-soft">Nothing here yet.</p>`;
    return;
  }

  wrap.innerHTML = "";
  ideas.forEach((idea) => {
    const node = template.content.cloneNode(true);
    node.querySelector("[data-rm-title]").textContent = idea.title;
    const descEl = node.querySelector("[data-rm-description]");
    if (idea.description) { descEl.textContent = idea.description; } else { descEl.remove(); }
    node.querySelector("[data-rm-votes]").textContent = idea.votes;
    const voteBtn = node.querySelector("[data-rm-vote-btn]");
    voteBtn.dataset.ideaId = idea.id;
    if (voted.has(idea.id)) {
      voteBtn.disabled = true;
      voteBtn.classList.add("opacity-50", "cursor-default");
    }
    wrap.appendChild(node);
  });
}

async function rmVote(ideaId, button) {
  button.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/roadmap-vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: RM_TOKEN, ideaId, voterId: rmVoterId() }),
    });
    const result = await res.json();
    if (!res.ok) {
      // "already voted" (409) still counts as a real outcome worth
      // remembering locally, not just an error to show and forget.
      if (res.status === 409) rmRememberVoted(ideaId);
      button.disabled = res.status === 409;
      if (res.status !== 409) toast(result.error || "Couldn't record your vote", "error");
      return;
    }
    rmRememberVoted(ideaId);
    button.querySelector("[data-rm-votes]").textContent = result.votes;
    button.classList.add("opacity-50", "cursor-default");
  } catch {
    button.disabled = false;
    toast("Couldn't reach Boardly - check your connection and try again", "error");
  }
}

async function rmLoad() {
  if (!RM_TOKEN) { rmShow("rm-notfound"); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-public-roadmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: RM_TOKEN }),
    });
    const data = await res.json();
    if (!res.ok) { rmShow("rm-notfound"); return; }

    document.getElementById("rm-board-name").textContent = data.boardName;
    rmRenderColumn("rm-col-now", data.columns.now);
    rmRenderColumn("rm-col-next", data.columns.next);
    rmRenderColumn("rm-col-later", data.columns.later);
    rmRenderColumn("rm-col-done", data.columns.done);
    rmShow("rm-content");
  } catch {
    rmShow("rm-notfound");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  rmLoad();
  document.getElementById("rm-content")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rm-vote-btn]");
    if (btn && !btn.disabled) rmVote(btn.dataset.ideaId, btn);
  });
});
