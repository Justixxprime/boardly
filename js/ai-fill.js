/* ==========================================================================
   BOARDLY: js/ai-fill.js
   --------------------------------------------------------------------------
   One shared "Fill with AI" strip for any modal form. A page registers a
   form with AiFill.register({...}) and this file does the rest: it adds
   the button and the little text panel under the modal's header, calls
   the ai-fill-form edge function, and hands the draft back to the page's
   own apply() function.

   Used by clients.js (Add lead, New client) and money.js (New invoice,
   Add expense, New retainer).

   THE RULE, same as Write with AI on Proposals and the CV Builder: AI
   proposes, you approve. Nothing here saves anything. It only fills form
   fields the person still has to read and press Save on.

   Needs: supabaseClient (js/supabase-client.js), toast (js/site.js), and
   the ai-fill-form edge function deployed.

   register() options:
     modalId      id of the modal element to attach to
     kind         "lead" | "client" | "invoice" | "expense" | "retainer",
                  or a function returning one (the clients modal is used
                  for both leads and clients)
     placeholder  example sentence shown in the text box
     visibleWhen  optional function, return false to hide the strip for
                  this opening (used to hide it when editing something
                  that already exists)
     apply        function(draft) that fills the form. May return a short
                  string to show as a heads-up under the button.
   ========================================================================== */

const AiFill = (() => {
  function localToday() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // supabase-js reports any non-2xx reply as a generic message. The real
  // reason (like "Type a sentence first") is in the response body.
  async function readError(error, data) {
    if (data && data.error) return data.error;
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return body.error;
    } catch { /* fall through */ }
    return error?.message || "Couldn't fill the form.";
  }

  function build(cfg) {
    const modal = document.getElementById(cfg.modalId);
    const panelEl = modal?.querySelector(".modal-panel");
    const header = panelEl?.firstElementChild;
    if (!modal || !panelEl || !header) return null;

    const wrap = document.createElement("div");
    wrap.setAttribute("data-ai-fill", "");
    wrap.innerHTML = `
      <button type="button" class="btn btn-secondary text-sm w-full mb-3" data-ai-toggle>
        <i class="fa-solid fa-wand-magic-sparkles mr-1 text-violet"></i>Fill with AI
      </button>
      <div class="hidden ticket p-3 space-y-2 mb-4" data-ai-panel>
        <label class="form-label">Say it in your own words</label>
        <textarea rows="3" class="input text-sm" data-ai-text></textarea>
        <button type="button" class="btn btn-primary btn-pop text-sm w-full" data-ai-run>
          <i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Fill the form
        </button>
        <p class="hidden text-xs text-ink-soft" data-ai-status></p>
      </div>`;
    header.insertAdjacentElement("afterend", wrap);
    wrap.querySelector("[data-ai-text]").placeholder = cfg.placeholder || "";
    return wrap;
  }

  async function run(cfg, wrap) {
    const textEl = wrap.querySelector("[data-ai-text]");
    const runBtn = wrap.querySelector("[data-ai-run]");
    const statusEl = wrap.querySelector("[data-ai-status]");
    const text = textEl.value.trim();
    const say = (msg) => {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("hidden", !msg);
    };
    if (!text) { say("Type a sentence or two first."); return; }

    runBtn.disabled = true;
    say("Reading that…");
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const kind = typeof cfg.kind === "function" ? cfg.kind() : cfg.kind;
      const { data, error } = await supabaseClient.functions.invoke("ai-fill-form", {
        body: { kind, text, today: localToday() },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error || !data?.draft) throw new Error(await readError(error, data));

      if (!Object.keys(data.draft).length) {
        say("I couldn't find anything to fill in from that. Try adding more detail.");
        return;
      }
      const headsUp = cfg.apply(data.draft);
      say(headsUp || "Filled in below. Check everything before you save.");
      toast("Form filled, check it before saving", "ok");
    } catch (err) {
      say("");
      toast("AI fill didn't work: " + (err.message || "unknown error"), "error");
    } finally {
      runBtn.disabled = false;
    }
  }

  function register(cfg) {
    const wrap = build(cfg);
    if (!wrap) return;
    const modal = document.getElementById(cfg.modalId);
    const panel = wrap.querySelector("[data-ai-panel]");

    wrap.querySelector("[data-ai-toggle]").addEventListener("click", () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) wrap.querySelector("[data-ai-text]").focus();
    });
    wrap.querySelector("[data-ai-run]").addEventListener("click", () => run(cfg, wrap));

    // Reset every time the modal opens, without needing the page's own
    // open function to know AI fill exists. The page sets up its fields
    // first and only then un-hides the modal, so visibleWhen() sees the
    // right state (for example "am I editing or creating").
    // The observer reads each record's old class value, so a close and an
    // immediate re-open that get batched together still count as an open.
    new MutationObserver((records) => {
      const nowHidden = modal.classList.contains("hidden");
      const justOpened = !nowHidden && records.some((r) => (r.oldValue || "").split(/\s+/).includes("hidden"));
      if (!justOpened) return;
      panel.classList.add("hidden");
      wrap.querySelector("[data-ai-text]").value = "";
      const statusEl = wrap.querySelector("[data-ai-status]");
      statusEl.textContent = "";
      statusEl.classList.add("hidden");
      wrap.classList.toggle("hidden", cfg.visibleWhen ? !cfg.visibleWhen() : false);
    }).observe(modal, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  }

  // Small helper both pages use in their apply() functions: set a form
  // field only when the AI actually returned something for it, so a field
  // the person already typed is never blanked out.
  function setField(id, value) {
    if (value === undefined || value === null || value === "") return;
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  return { register, setField };
})();
