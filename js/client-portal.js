/* ==========================================================================
   BOARDLY - js/client-portal.js
   --------------------------------------------------------------------------
   Powers client-portal.html - a separate, self-contained page (same
   approach as share.html: no dependency on dashboard.js or its global
   `state`, since this page is meant to be opened by someone with no
   Boardly account at all).

   Everything here talks to the get-shared-board Edge Function (in
   "portal" mode) to read data, and the client-portal-action Edge
   Function to write anything (comment / approve / request changes).
   Both do their own token + password + expiry check on the server -
   see the long comments in those two files for why that has to happen
   server-side rather than here in the browser.

   The client's name is asked for once per portal link and remembered
   in sessionStorage (not localStorage) so it clears itself once they
   close the tab - there's no account here to remember it for longer
   than that, and a shared/public computer shouldn't keep it around.
   ========================================================================== */

const CP_GROUPS = [
  { key: "pending", label: "Awaiting your review", empty: "Nothing waiting on you right now." },
  { key: "changes_requested", label: "You requested changes", empty: "" },
  { key: "approved", label: "Approved by you", empty: "" },
];
const CP_CATEGORY_LABEL = { general: "General", work: "Work", personal: "Personal", urgent: "Urgent" };
const CP_CATEGORY_RAIL = { general: "rail-ink", work: "rail-orange", personal: "rail-violet", urgent: "rail-teal" };

let cpToken = "";
let cpPassword = "";
let cpPendingAction = null; // holds {taskId, action, body} while the name modal is open

function escapeCpHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function cpClientName() {
  return cpToken ? sessionStorage.getItem(`boardly-client-name-${cpToken}`) || "" : "";
}
function cpSetClientName(name) {
  if (cpToken) sessionStorage.setItem(`boardly-client-name-${cpToken}`, name);
}

/** Never throws - a network failure, a non-JSON response, or a gateway-level
 *  rejection (like the 401 you get if an Edge Function wasn't deployed with
 *  --no-verify-jwt) all come back as a normal { body: { error } } shape
 *  instead of an unhandled exception. Without this, any of those situations
 *  left the page stuck on "Loading…" forever with no visible explanation -
 *  exactly the bug this fixes. */
async function cpFetchPortal(token, password) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/get-shared-board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: password || "", portal: true }),
    });
  } catch {
    return { status: 0, body: { error: "Couldn't reach Boardly right now. Check your connection and try again." } };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { status: res.status, body: { error: `Boardly sent back something unexpected (status ${res.status}). If you're the board owner, check that both Edge Functions were deployed with --no-verify-jwt.` } };
  }

  if (!res.ok && !body.error && !body.needsPassword) {
    body.error = body.message || `This portal couldn't load (status ${res.status}). If you're the board owner, check that both Edge Functions were deployed with --no-verify-jwt.`;
  }
  return { status: res.status, body };
}

async function cpSendAction(action, taskId, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/client-portal-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cpToken, password: cpPassword, action, taskId, authorName: cpClientName(), body: body || "" }),
    });
  } catch {
    return { error: "Couldn't reach Boardly right now. Check your connection and try again." };
  }
  try {
    return await res.json();
  } catch {
    return { error: `Something went wrong (status ${res.status}).` };
  }
}

function cpCommentsForTask(comments, taskId) {
  return comments.filter((c) => c.task_id === taskId);
}

function cpTaskCardHTML(task, comments) {
  const rail = CP_CATEGORY_RAIL[task.category] || "rail-ink";
  const thread = cpCommentsForTask(comments, task.id);
  const showActions = task.client_status === "pending" || task.client_status === "changes_requested";

  return `
    <div class="ticket ${rail} p-4" data-cp-task="${task.id}">
      <div class="flex items-start justify-between gap-2">
        <p class="task-title text-sm font-medium leading-snug">${escapeCpHTML(task.title)}</p>
      </div>
      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <span class="stamp">${CP_CATEGORY_LABEL[task.category] || "General"}</span>
        ${task.due_date ? `<span class="font-mono text-[10px] text-ink-soft flex items-center gap-1"><i class="fa-regular fa-clock"></i>${escapeCpHTML(task.due_date)}</span>` : ""}
      </div>
      ${task.notes ? `<p class="text-xs text-ink-soft mt-2 whitespace-pre-wrap">${escapeCpHTML(task.notes)}</p>` : ""}

      ${thread.length ? `
        <div class="flex flex-col gap-1.5 mt-3">
          ${thread.map((c) => `
            <div class="cp-comment">
              <p class="text-xs"><span class="font-medium">${escapeCpHTML(c.author_name)}</span> <span class="text-ink-soft">· ${new Date(c.created_at).toLocaleDateString()}</span></p>
              <p class="text-sm mt-0.5 whitespace-pre-wrap">${escapeCpHTML(c.body)}</p>
            </div>`).join("")}
        </div>` : ""}

      <div class="flex items-center gap-2 mt-3">
        <input type="text" placeholder="Leave a note…" class="input text-sm flex-1 !py-1.5" data-cp-comment-input="${task.id}" />
        <button type="button" class="btn btn-icon" data-cp-comment-send="${task.id}" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
      </div>

      ${showActions ? `
        <div class="flex items-center gap-2 mt-3 pt-3 border-t border-line">
          <button type="button" class="btn btn-primary text-xs !py-1.5 !px-3 flex-1" data-cp-approve="${task.id}"><i class="fa-solid fa-check mr-1"></i>Approve</button>
          <button type="button" class="btn btn-ghost text-xs !py-1.5 !px-3 flex-1" data-cp-request-changes="${task.id}"><i class="fa-solid fa-pen mr-1"></i>Request changes</button>
        </div>
        <div class="hidden mt-2" data-cp-changes-box="${task.id}">
          <textarea rows="2" placeholder="What needs to change?" class="input text-sm w-full" data-cp-changes-input="${task.id}"></textarea>
          <button type="button" class="btn btn-secondary text-xs !py-1.5 !px-3 mt-1.5" data-cp-changes-send="${task.id}">Send</button>
        </div>` : `
        <p class="cp-status-approved text-xs font-medium mt-3 pt-3 border-t border-line"><i class="fa-solid fa-circle-check mr-1"></i>You approved this</p>`}
    </div>`;
}

function cpRenderPortal(board, tasks, comments) {
  document.getElementById("cp-board-name").textContent = board.name;
  const groupsEl = document.getElementById("cp-groups");
  const nonEmptyGroups = CP_GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => t.client_status === g.key) }))
    .filter((g) => g.tasks.length);

  if (!tasks.length) {
    groupsEl.innerHTML = "";
    document.getElementById("cp-empty").classList.remove("hidden");
  } else {
    document.getElementById("cp-empty").classList.add("hidden");
    groupsEl.innerHTML = nonEmptyGroups.map((g) => `
      <section>
        <p class="cp-section-title mb-2.5">${g.label} · ${g.tasks.length}</p>
        <div class="flex flex-col gap-3">${g.tasks.map((t) => cpTaskCardHTML(t, comments)).join("")}</div>
      </section>`).join("");
  }

  document.getElementById("cp-loading").classList.add("hidden");
  document.getElementById("cp-password-gate").classList.add("hidden");
  document.getElementById("cp-content").classList.remove("hidden");
}

async function cpReload() {
  const { body } = await cpFetchPortal(cpToken, cpPassword);
  if (body.error) { cpShowNotFound(body.error); return; }
  cpRenderPortal(body.board, body.tasks || [], body.comments || []);
}

function cpShowNotFound(detail) {
  document.getElementById("cp-loading").classList.add("hidden");
  document.getElementById("cp-password-gate").classList.add("hidden");
  if (detail) document.getElementById("cp-notfound-detail").textContent = detail;
  document.getElementById("cp-notfound").classList.remove("hidden");
}

async function cpLoad() {
  cpToken = new URLSearchParams(location.search).get("b") || "";
  if (!cpToken) { cpShowNotFound("This link is missing its portal code."); return; }

  try {
    const { status, body } = await cpFetchPortal(cpToken, "");
    if (body.needsPassword) {
      document.getElementById("cp-loading").classList.add("hidden");
      document.getElementById("cp-password-gate").classList.remove("hidden");
      return;
    }
    if (body.error) { cpShowNotFound(status === 410 ? "This link has expired." : body.error); return; }
    if (!body.board) { cpShowNotFound("Boardly sent back an unexpected response. Please try refreshing."); return; }
    cpRenderPortal(body.board, body.tasks || [], body.comments || []);
  } catch (err) {
    cpShowNotFound("Something went wrong loading this portal: " + (err?.message || "unknown error"));
  }
}

/** Runs `fn` immediately if we already have the client's name, otherwise
 *  opens the name prompt first and runs `fn` right after they submit it. */
function cpWithName(fn) {
  if (cpClientName()) { fn(); return; }
  cpPendingAction = fn;
  document.getElementById("cp-name-modal").classList.remove("hidden");
  document.getElementById("cp-name-input").focus();
}

document.getElementById("cp-password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("cp-password-input").value;
  const submitBtn = e.target.querySelector("button[type=submit]");
  if (submitBtn) submitBtn.disabled = true;
  try {
    const { body } = await cpFetchPortal(cpToken, password);
    if (body.error) { document.getElementById("cp-password-error").classList.remove("hidden"); return; }
    if (!body.board) { document.getElementById("cp-password-error").classList.remove("hidden"); return; }
    cpPassword = password;
    document.getElementById("cp-password-error").classList.add("hidden");
    cpRenderPortal(body.board, body.tasks || [], body.comments || []);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.getElementById("cp-name-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("cp-name-input").value.trim();
  if (!name) return;
  cpSetClientName(name);
  document.getElementById("cp-name-modal").classList.add("hidden");
  document.getElementById("cp-name-input").value = "";
  if (cpPendingAction) { cpPendingAction(); cpPendingAction = null; }
});

document.getElementById("cp-groups").addEventListener("click", async (e) => {
  const sendBtn = e.target.closest("[data-cp-comment-send]");
  if (sendBtn) {
    const taskId = sendBtn.dataset.cpCommentSend;
    const input = document.querySelector(`[data-cp-comment-input="${taskId}"]`);
    const body = input?.value.trim();
    if (!body) return;
    cpWithName(async () => {
      const result = await cpSendAction("comment", taskId, body);
      if (result.error) { toast?.(result.error, "error"); return; }
      toast?.("Note sent", "ok");
      cpReload();
    });
    return;
  }

  const approveBtn = e.target.closest("[data-cp-approve]");
  if (approveBtn) {
    const taskId = approveBtn.dataset.cpApprove;
    cpWithName(async () => {
      const result = await cpSendAction("approve", taskId, "");
      if (result.error) { toast?.(result.error, "error"); return; }
      toast?.("Approved", "ok");
      cpReload();
    });
    return;
  }

  const requestBtn = e.target.closest("[data-cp-request-changes]");
  if (requestBtn) {
    document.querySelector(`[data-cp-changes-box="${requestBtn.dataset.cpRequestChanges}"]`)?.classList.remove("hidden");
    return;
  }

  const changesSendBtn = e.target.closest("[data-cp-changes-send]");
  if (changesSendBtn) {
    const taskId = changesSendBtn.dataset.cpChangesSend;
    const input = document.querySelector(`[data-cp-changes-input="${taskId}"]`);
    const body = input?.value.trim();
    cpWithName(async () => {
      const result = await cpSendAction("request_changes", taskId, body);
      if (result.error) { toast?.(result.error, "error"); return; }
      toast?.("Feedback sent", "ok");
      cpReload();
    });
  }
});

cpLoad();
