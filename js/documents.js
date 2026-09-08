/* ==========================================================================
   BOARDLY - documents.js  (rich text Documents)
   --------------------------------------------------------------------------
   A drop-in module, loaded AFTER dashboard.js on dashboard.html:
     <script src="js/documents.js" defer></script>

   Needs supabase/schema_v60_documents.sql run first, and js/pdf-export.js
   loaded before it for the Download PDF button.

   The rich text editor itself is Quill (loaded lazily from a CDN the
   first time someone actually opens a document, not on every dashboard
   load) rather than hand-rolled contenteditable + execCommand - Quill
   already handles the genuinely fiddly parts of a real editor
   (consistent paste behavior, undo/redo, list indentation) far more
   reliably than a few toolbar buttons wired to the deprecated
   execCommand API would.
   ========================================================================== */

state.documentsReady = false;
state.documents = [];
state.documentEditingId = null;

let _quillInstance = null;
let _quillLoadPromise = null;

function loadQuillOnce() {
  if (!_quillLoadPromise) {
    loadStyleOnce("https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css");
    _quillLoadPromise = loadScriptOnce("https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js");
  }
  return _quillLoadPromise;
}

async function checkDocumentsReady() {
  const { error } = await supabaseClient.from("documents").select("id").limit(1);
  state.documentsReady = !error;
  return state.documentsReady;
}

async function loadDocuments() {
  if (!state.documentsReady || !state.currentBoardId) { state.documents = []; renderDocumentsList(); return; }
  const { data, error } = await supabaseClient
    .from("documents")
    .select("id, title, updated_at")
    .eq("board_id", state.currentBoardId)
    .order("updated_at", { ascending: false });
  if (error) { console.warn("loadDocuments:", error.message); return; }
  state.documents = data || [];
  renderDocumentsList();
}

function renderDocumentsList() {
  const list = document.getElementById("documents-list");
  const empty = document.getElementById("documents-empty");
  const notReady = document.getElementById("documents-not-ready");
  if (!list) return;

  if (!state.documentsReady) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    notReady?.classList.remove("hidden");
    return;
  }
  notReady?.classList.add("hidden");

  if (!state.documents.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.documents.map((d) => `
    <div class="ticket p-3 flex items-center justify-between gap-3" data-id="${d.id}">
      <div class="min-w-0">
        <p class="text-sm font-semibold truncate">${escapeHTML(d.title)}</p>
        <p class="text-xs text-ink-soft mt-0.5">Edited ${new Date(d.updated_at).toLocaleDateString()}</p>
      </div>
      <button type="button" data-open-document="${d.id}" class="btn btn-secondary text-xs !py-1.5 !px-3 shrink-0">Open</button>
    </div>`).join("");
}

// Starter content for each template - plain semantic HTML (headings,
// bold text, lists) since that's exactly what Quill's own clipboard
// module already knows how to parse into its editor, no extra table
// or layout module needed. Every bracketed placeholder is meant to be
// selected and typed over.
const DOCUMENT_TEMPLATES = {
  blank: "",
  invoice: `<h1>Invoice</h1><p><strong>From:</strong> [Your name or business]<br><strong>To:</strong> [Client name]<br><strong>Date:</strong> [Date]<br><strong>Invoice number:</strong> [Number]</p><h2>Items</h2><ul><li>[Item description] - [Amount]</li><li>[Item description] - [Amount]</li></ul><p><strong>Total: [Amount]</strong></p><p>Payment details: [Bank or account info]</p>`,
  meetingNotes: `<h1>Meeting notes</h1><p><strong>Date:</strong> [Date]<br><strong>Attendees:</strong> [Names]</p><h2>Agenda</h2><ul><li>[Topic]</li></ul><h2>Discussion</h2><p>[Notes from the conversation]</p><h2>Action items</h2><ul><li>[Who] - [What] - [By when]</li></ul>`,
  contract: `<h1>Service agreement</h1><p>This agreement is between <strong>[Your name or business]</strong> ("Provider") and <strong>[Client name]</strong> ("Client"), dated [Date].</p><h2>Scope of work</h2><p>[Describe the work to be done]</p><h2>Payment</h2><p>[Amount, schedule, and method]</p><h2>Timeline</h2><p>[Start date, end date, milestones]</p><h2>Signatures</h2><p>Provider: _____________________ Date: _______</p><p>Client: _____________________ Date: _______</p>`,
  coverLetter: `<p>[Your name]<br>[Your email] [Your phone]</p><p>[Date]</p><p>Dear [Hiring manager's name],</p><p>[Opening paragraph - why you're writing and the role you're applying for]</p><p>[Middle paragraph - your relevant experience and why you're a fit]</p><p>[Closing paragraph - thank them and note your availability]</p><p>Sincerely,<br>[Your name]</p>`,
};

async function openDocumentEditor(documentId, templateKey) {
  state.documentEditingId = documentId || null;
  let doc = null;
  if (documentId) {
    const { data, error } = await supabaseClient.from("documents").select("*").eq("id", documentId).single();
    if (error) { toast("Couldn't open that document: " + error.message, "error"); return; }
    doc = data;
  }

  document.getElementById("document-title-input").value = doc?.title || "";
  document.getElementById("document-delete-btn").classList.toggle("hidden", !doc);

  document.getElementById("documents-modal")?.classList.add("hidden");
  document.getElementById("document-editor-modal")?.classList.remove("hidden");
  document.getElementById("document-editor-loading")?.classList.remove("hidden");
  document.getElementById("document-editor-body")?.classList.add("hidden");

  await loadQuillOnce();

  if (!_quillInstance) {
    _quillInstance = new Quill("#document-quill-editor", {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link"],
          ["clean"],
        ],
      },
    });
  }
  _quillInstance.setContents([]);
  const startingHTML = doc?.content_html || DOCUMENT_TEMPLATES[templateKey] || "";
  if (startingHTML) _quillInstance.clipboard.dangerouslyPasteHTML(startingHTML);

  document.getElementById("document-editor-loading")?.classList.add("hidden");
  document.getElementById("document-editor-body")?.classList.remove("hidden");
}

function closeDocumentEditor(reopenList = true) {
  document.getElementById("document-editor-modal")?.classList.add("hidden");
  state.documentEditingId = null;
  if (reopenList) document.getElementById("documents-modal")?.classList.remove("hidden");
}

async function saveDocument() {
  if (!state.documentsReady) { toast("Run supabase/schema_v60_documents.sql first", "error"); return; }
  const title = document.getElementById("document-title-input").value.trim() || "Untitled document";
  const contentHTML = _quillInstance ? _quillInstance.root.innerHTML : "";

  if (state.documentEditingId) {
    const { error } = await supabaseClient.from("documents").update({ title, content_html: contentHTML }).eq("id", state.documentEditingId);
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
  } else {
    const { data, error } = await supabaseClient.from("documents").insert({
      user_id: state.userId, board_id: state.currentBoardId, title, content_html: contentHTML,
    }).select().single();
    if (error) { toast("Couldn't save: " + error.message, "error"); return; }
    state.documentEditingId = data.id;
    document.getElementById("document-delete-btn").classList.remove("hidden");
  }
  await loadDocuments();
  toast("Document saved", "ok");
}

async function deleteDocument() {
  const id = state.documentEditingId;
  if (!id) return;
  if (!confirm("Delete this document? This can't be undone.")) return;
  const { error } = await supabaseClient.from("documents").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message, "error"); return; }
  await loadDocuments();
  closeDocumentEditor();
  toast("Document deleted", "ok");
}

async function downloadDocumentPDF() {
  if (!_quillInstance) return;
  const title = document.getElementById("document-title-input").value.trim() || "Untitled document";
  const status = document.getElementById("document-pdf-status");
  const editorEl = document.getElementById("document-quill-editor").querySelector(".ql-editor");
  try {
    await exportElementToPDF(editorEl, `${title}.pdf`, (msg) => { if (status) status.textContent = msg; });
    if (status) status.textContent = "Downloaded.";
  } catch (err) {
    if (status) status.textContent = "";
    toast("Couldn't create the PDF: " + (err.message || "unknown error"), "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkDocumentsReady();

  const listModal = document.getElementById("documents-modal");
  document.getElementById("documents-btn")?.addEventListener("click", async () => {
    listModal?.classList.remove("hidden");
    await loadDocuments();
  });
  document.querySelectorAll("[data-close-documents]").forEach((el) => el.addEventListener("click", () => listModal?.classList.add("hidden")));
  document.querySelectorAll("[data-close-document-editor]").forEach((el) => el.addEventListener("click", () => closeDocumentEditor()));

  document.getElementById("document-template-picker")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-new-document]");
    if (btn) openDocumentEditor(null, btn.dataset.newDocument);
  });
  document.getElementById("document-save-btn")?.addEventListener("click", saveDocument);
  document.getElementById("document-delete-btn")?.addEventListener("click", deleteDocument);
  document.getElementById("document-download-pdf-btn")?.addEventListener("click", downloadDocumentPDF);

  document.getElementById("documents-list")?.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open-document]");
    if (openBtn) openDocumentEditor(openBtn.dataset.openDocument);
  });
});
