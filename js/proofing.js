/* ==========================================================================
   BOARDLY - proofing.js  (schema_v57_proofing.sql)
   --------------------------------------------------------------------------
   Last piece of Phase 4: "Proofing - place a comment pin at an exact x/y
   coordinate on an image." Opens a full-screen overlay showing one
   attachment at a time; clicking anywhere on the image drops a numbered
   pin right there and asks for a comment. Every pin is stored as a
   percentage position (0-100 on both axes), never raw pixels, so it
   stays correctly placed no matter what size the image renders at on
   whoever else opens it next.

   This is deliberately separate from File-Level Approval Status (also
   Phase 4, no schema change) - that one gives a whole file a single
   verdict. This lets feedback point at one exact spot on it instead,
   which matters most for visual work: "the logo is too big right HERE"
   says something a file-wide "Needs changes" can't.
   ========================================================================== */

state.proofingReady = false;
state.proofingComments = [];       // pins for whichever attachment is currently open in the overlay
state.proofingContext = null;      // { task, attachmentUrl, attachmentName }
state.proofingCounts = {};         // attachment url -> count of unresolved pins, used for the small badge in the attachment list

async function checkProofingReady() {
  const { error } = await supabaseClient.from("proof_comments").select("id").limit(1);
  state.proofingReady = !error;
  return state.proofingReady;
}

async function loadProofComments(attachmentUrl) {
  if (!state.proofingReady) { state.proofingComments = []; return; }
  const { data, error } = await supabaseClient
    .from("proof_comments")
    .select("*")
    .eq("attachment_url", attachmentUrl)
    .order("created_at", { ascending: true });
  state.proofingComments = error ? [] : data;
}

// Refreshes the little red unresolved-count badges shown next to each
// image attachment in the edit modal - called whenever the modal first
// opens on a task, and again after leaving the proofing overlay, so the
// badge is never stale by the time you're looking at the list again.
async function refreshProofingCounts(task) {
  if (!state.proofingReady) return;
  const urls = taskAttachmentList(task).filter((a) => isImageUrl(a.url)).map((a) => a.url);
  if (!urls.length) return;
  const { data, error } = await supabaseClient
    .from("proof_comments")
    .select("attachment_url")
    .eq("resolved", false)
    .in("attachment_url", urls);
  if (error) return;
  const counts = {};
  for (const row of data) counts[row.attachment_url] = (counts[row.attachment_url] || 0) + 1;
  // Only replace counts for URLs that belong to THIS task's attachments -
  // other tasks' counts already sitting in state stay untouched.
  urls.forEach((u) => delete state.proofingCounts[u]);
  Object.assign(state.proofingCounts, counts);
  renderAttachmentList(task);
}

function clampPercent(n) {
  return Math.max(0, Math.min(100, n));
}

// The image is shown with object-fit-style max-width/max-height, so its
// rendered box can be smaller than its container on either axis (a tall
// narrow image inside a wide modal, say). getBoundingClientRect() on the
// <img> itself - not the wrapping div - is what makes a click at the
// very edge of the visible picture map to 0% or 100% instead of landing
// somewhere in empty space around it.
function pointToPercent(clientX, clientY) {
  const img = document.getElementById("proofing-image");
  const rect = img.getBoundingClientRect();
  const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
  const y = clampPercent(((clientY - rect.top) / rect.height) * 100);
  return { x, y };
}

function renderProofingPins() {
  const layer = document.getElementById("proofing-pins-layer");
  if (!layer) return;
  layer.innerHTML = state.proofingComments
    .map((c, i) => `
      <button type="button" data-pin-id="${c.id}"
        title="${escapeHTML(c.body)}"
        class="absolute h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[11px] font-semibold text-white shadow-md"
        style="left:${c.x}%; top:${c.y}%; transform:translate(-50%,-50%); background:${c.resolved ? "var(--teal)" : "var(--orange)"}; pointer-events:auto;">
        ${i + 1}
      </button>`)
    .join("");
}

function renderProofingCommentsList() {
  const wrap = document.getElementById("proofing-comments-list");
  if (!wrap) return;
  if (!state.proofingComments.length) {
    wrap.innerHTML = `<p class="text-xs text-ink-soft text-center py-6">No pins yet - click anywhere on the image to leave feedback right on that spot.</p>`;
    return;
  }
  wrap.innerHTML = state.proofingComments
    .map((c, i) => `
    <div id="proofing-card-${c.id}" class="border border-line rounded-lg p-2.5 ${c.resolved ? "opacity-60" : ""}">
      <div class="flex items-start gap-2">
        <span class="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style="background:${c.resolved ? "var(--teal)" : "var(--orange)"}">${i + 1}</span>
        <p class="text-xs flex-1 break-words">${escapeHTML(c.body)}</p>
      </div>
      <div class="flex items-center justify-between mt-2 pl-7">
        <span class="text-[10px] text-ink-soft">${new Date(c.created_at).toLocaleString()}</span>
        <div class="flex items-center gap-3">
          <button type="button" data-toggle-resolved="${c.id}" class="text-[11px] font-medium hover:underline" style="color:${c.resolved ? "var(--teal)" : "var(--ink-soft)"}">${c.resolved ? "Resolved" : "Mark resolved"}</button>
          <button type="button" data-delete-pin="${c.id}" class="text-ink-soft hover:text-critical"><i class="fa-solid fa-trash-can text-[11px]"></i></button>
        </div>
      </div>
    </div>`)
    .join("");
}

// Building this composer box in JS rather than as static HTML in
// dashboard.html is the whole reason it can appear exactly where the
// click happened - a fixed piece of markup has no way to know that in
// advance. It's clamped a little inward from wherever was clicked so it
// never renders itself partly off the edge of the image.
function openPinComposer(xPercent, yPercent) {
  closePinComposer();
  const layer = document.getElementById("proofing-pins-layer");
  if (!layer) return;
  const box = document.createElement("div");
  box.id = "proofing-composer";
  box.className = "absolute z-10 w-56 bg-[var(--card)] border border-line rounded-lg shadow-lg p-2";
  box.style.left = `${clampPercent(xPercent > 70 ? xPercent - 45 : xPercent)}%`;
  box.style.top = `${clampPercent(yPercent > 70 ? yPercent - 30 : yPercent)}%`;
  box.style.pointerEvents = "auto";
  box.innerHTML = `
    <textarea id="proofing-composer-input" rows="2" placeholder="What needs attention here?" class="input text-xs resize-none w-full mb-1.5"></textarea>
    <div class="flex items-center justify-end gap-2">
      <button type="button" id="proofing-composer-cancel" class="text-[11px] text-ink-soft hover:text-ink">Cancel</button>
      <button type="button" id="proofing-composer-save" class="text-[11px] font-semibold text-orange hover:underline">Save pin</button>
    </div>`;
  layer.appendChild(box);
  const input = document.getElementById("proofing-composer-input");
  input.focus();

  document.getElementById("proofing-composer-cancel").addEventListener("click", closePinComposer);
  document.getElementById("proofing-composer-save").addEventListener("click", () => {
    const body = input.value.trim();
    if (!body) { closePinComposer(); return; }
    createProofPin(xPercent, yPercent, body);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("proofing-composer-save").click(); }
    if (e.key === "Escape") closePinComposer();
  });
}

function closePinComposer() {
  document.getElementById("proofing-composer")?.remove();
}

async function createProofPin(x, y, body) {
  const ctx = state.proofingContext;
  if (!ctx) return;
  const { data, error } = await supabaseClient
    .from("proof_comments")
    .insert({ task_id: ctx.task.id, board_id: ctx.task.board_id, attachment_url: ctx.attachmentUrl, x, y, body, author_id: state.userId })
    .select()
    .single();
  closePinComposer();
  if (error) { toast("Couldn't save that pin: " + error.message, "error"); return; }
  state.proofingComments.push(data);
  renderProofingPins();
  renderProofingCommentsList();
  toast("Pin added", "ok");
}

async function toggleProofResolved(id) {
  const comment = state.proofingComments.find((c) => c.id === id);
  if (!comment) return;
  const newValue = !comment.resolved;
  const { error } = await supabaseClient.from("proof_comments").update({ resolved: newValue }).eq("id", id);
  if (error) { toast("Couldn't update that pin: " + error.message, "error"); return; }
  comment.resolved = newValue;
  renderProofingPins();
  renderProofingCommentsList();
}

async function deleteProofPin(id) {
  if (!confirm("Delete this pin? This can't be undone.")) return;
  const { error } = await supabaseClient.from("proof_comments").delete().eq("id", id);
  if (error) { toast("Couldn't delete that pin: " + error.message, "error"); return; }
  state.proofingComments = state.proofingComments.filter((c) => c.id !== id);
  renderProofingPins();
  renderProofingCommentsList();
}

async function openProofingOverlay(task, attachmentUrl, attachmentName) {
  if (!state.proofingReady) await checkProofingReady();
  state.proofingContext = { task, attachmentUrl, attachmentName };
  document.getElementById("proofing-title").textContent = `Proofing - ${attachmentName || "attachment"}`;
  document.getElementById("proofing-image").src = attachmentUrl;
  document.getElementById("proofing-not-ready")?.classList.toggle("hidden", state.proofingReady);
  document.getElementById("proofing-modal")?.classList.remove("hidden");
  closePinComposer();
  if (state.proofingReady) {
    await loadProofComments(attachmentUrl);
    renderProofingPins();
    renderProofingCommentsList();
  } else {
    state.proofingComments = [];
    renderProofingPins();
    renderProofingCommentsList();
  }
}

function closeProofingOverlay() {
  document.getElementById("proofing-modal")?.classList.add("hidden");
  closePinComposer();
  // Any pin added or resolved while the overlay was open should be
  // reflected in the small badge back on the attachment list the moment
  // it closes, not just the next time the ticket is reopened.
  if (state.proofingContext?.task) refreshProofingCounts(state.proofingContext.task);
  state.proofingContext = null;
  state.proofingComments = [];
}

window.openProofingOverlay = openProofingOverlay;

document.addEventListener("DOMContentLoaded", async () => {
  await checkProofingReady();

  document.querySelectorAll("[data-close-proofing]").forEach((el) => el.addEventListener("click", closeProofingOverlay));

  document.getElementById("proofing-image-wrap")?.addEventListener("click", (e) => {
    // Clicking an existing pin (or the composer sitting on top of it)
    // should never also register as "click on empty image space" and
    // drop a second pin right on top of the first one.
    if (e.target.closest("[data-pin-id]") || e.target.closest("#proofing-composer")) return;
    const { x, y } = pointToPercent(e.clientX, e.clientY);
    openPinComposer(x, y);
  });

  document.getElementById("proofing-pins-layer")?.addEventListener("click", (e) => {
    const pinBtn = e.target.closest("[data-pin-id]");
    if (!pinBtn) return;
    e.stopPropagation();
    document.getElementById(`proofing-card-${pinBtn.dataset.pinId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("proofing-comments-list")?.addEventListener("click", (e) => {
    const resolveBtn = e.target.closest("[data-toggle-resolved]");
    if (resolveBtn) { toggleProofResolved(resolveBtn.dataset.toggleResolved); return; }
    const deleteBtn = e.target.closest("[data-delete-pin]");
    if (deleteBtn) deleteProofPin(deleteBtn.dataset.deletePin);
  });

  // Loads unresolved-pin counts for whichever task's edit modal just
  // opened, the same wrap-openEditModal pattern approval-workflow.js
  // uses - proofing.js never has to touch openEditModal's own body.
  const _originalOpenEditModal = window.openEditModal;
  if (typeof _originalOpenEditModal === "function") {
    window.openEditModal = function (id) {
      const result = _originalOpenEditModal.call(this, id);
      const task = state.tasks.find((t) => t.id === id);
      if (task) refreshProofingCounts(task);
      return result;
    };
  }
});
