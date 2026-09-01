/* ==========================================================================
   BOARDLY - request-portal.js  (Request Portal)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/request-portal.js" defer></script>

   Needs supabase/schema_v45_request_portal.sql run first. Lives inside
   the existing Share link settings modal (see dashboard.html), next to
   the Client Portal link - refreshRequestPortalUI() is called from
   openEditModal's sibling, openShareSettingsModal(), in dashboard.js
   (via a `typeof ... === "function"` guard, the same cross-file pattern
   populateMilestoneSelect uses).
   ========================================================================== */

state.requestPortalReady = false;

async function checkRequestPortalReady() {
  const { error } = await supabaseClient.from("boards").select("request_portal_token").limit(1);
  state.requestPortalReady = !error;
  return state.requestPortalReady;
}

function refreshRequestPortalUI() {
  const row = document.getElementById("request-portal-row");
  const notReady = document.getElementById("request-portal-not-ready");
  const publishBtn = document.getElementById("request-portal-publish-btn");
  const copyBtn = document.getElementById("request-portal-copy-btn");
  if (!row) return;

  if (!state.requestPortalReady) {
    row.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");
  row.classList.remove("hidden");

  const board = state.boards.find((b) => b.id === state.currentBoardId);
  const published = !!board?.request_portal_token;
  publishBtn.classList.toggle("hidden", published);
  copyBtn.classList.toggle("hidden", !published);
}

async function publishRequestPortal() {
  const token = crypto.randomUUID();
  const { error } = await supabaseClient.from("boards").update({ request_portal_token: token }).eq("id", state.currentBoardId);
  if (error) { toast("Couldn't publish: " + error.message, "error"); return; }
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (board) board.request_portal_token = token;
  refreshRequestPortalUI();
  toast("Request Portal published", "ok");
}

async function copyRequestPortalLink() {
  const board = state.boards.find((b) => b.id === state.currentBoardId);
  if (!board?.request_portal_token) return;
  const url = new URL("request.html", window.location.href);
  url.searchParams.set("token", board.request_portal_token);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Request Portal link copied", "ok");
  } catch {
    window.prompt("Copy this public request link:", url.toString());
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkRequestPortalReady();
  document.getElementById("request-portal-publish-btn")?.addEventListener("click", publishRequestPortal);
  document.getElementById("request-portal-copy-btn")?.addEventListener("click", copyRequestPortalLink);
});
