/* ==========================================================================
   BOARDLY - js/form.js
   --------------------------------------------------------------------------
   Powers form.html. Standalone page, no dependency on dashboard.js - a
   stranger filling out a form has no Boardly account at all, same
   approach as request.js and roadmap.js.

   Unlike request.html (a fixed shape it can render immediately), this
   page has no idea what fields to show until it asks - the whole point
   of a builder is that every form is different. So this one genuinely
   has to wait on get-custom-form-info before showing anything beyond
   the loading state.
   ========================================================================== */

const FORM_PARAMS = new URLSearchParams(location.search);
const FORM_TOKEN = FORM_PARAMS.get("f") || "";
let FORM_FIELDS = [];

function formShow(id) {
  ["form-loading", "form-notfound", "form-wrap", "form-success"].forEach((x) =>
    document.getElementById(x).classList.toggle("hidden", x !== id)
  );
}

function escapeFormHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// One field's markup, by type. Every input carries data-field-id so the
// submit handler can walk the DOM generically afterward instead of
// needing a hardcoded list of ids the way request.js's fixed fields do.
function fieldHTML(field) {
  const req = field.required ? "required" : "";
  const label = `<label class="form-label">${escapeFormHTML(field.label)}${field.required ? " *" : ""}</label>`;
  if (field.type === "textarea") {
    return `<div>${label}<textarea data-field-id="${field.id}" rows="4" maxlength="4000" ${req} class="input resize-none"></textarea></div>`;
  }
  if (field.type === "select") {
    const options = Array.isArray(field.options) ? field.options : [];
    return `<div>${label}<select data-field-id="${field.id}" ${req} class="input">
      <option value="" disabled selected>Choose one</option>
      ${options.map((o) => `<option value="${escapeFormHTML(o)}">${escapeFormHTML(o)}</option>`).join("")}
    </select></div>`;
  }
  if (field.type === "checkbox") {
    return `<label class="flex items-center gap-2 text-sm py-1"><input type="checkbox" data-field-id="${field.id}" class="h-4 w-4"> ${escapeFormHTML(field.label)}</label>`;
  }
  if (field.type === "number") {
    return `<div>${label}<input type="number" data-field-id="${field.id}" ${req} class="input"></div>`;
  }
  if (field.type === "date") {
    return `<div>${label}<input type="date" data-field-id="${field.id}" ${req} class="input"></div>`;
  }
  // default: plain text
  return `<div>${label}<input type="text" data-field-id="${field.id}" maxlength="4000" ${req} class="input"></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!FORM_TOKEN) { formShow("form-notfound"); return; }

  fetch(`${SUPABASE_URL}/functions/v1/get-custom-form-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: FORM_TOKEN }),
  })
    .then((res) => res.json().then((result) => ({ ok: res.ok, result })))
    .then(({ ok, result }) => {
      if (!ok || !result?.fields) { formShow("form-notfound"); return; }
      FORM_FIELDS = result.fields;
      document.getElementById("form-name").textContent = result.formName || "Form";
      if (result.boardName) {
        const boardLine = document.getElementById("form-board-name");
        boardLine.textContent = `A form from ${result.boardName}`;
        boardLine.classList.remove("hidden");
      }
      if (result.formDescription) {
        const desc = document.getElementById("form-description");
        desc.textContent = result.formDescription;
        desc.classList.remove("hidden");
      }
      document.getElementById("form-fields-list").innerHTML = FORM_FIELDS.map(fieldHTML).join("");
      formShow("form-wrap");
    })
    .catch(() => formShow("form-notfound"));

  document.getElementById("form-fields-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = document.getElementById("form-submit-btn");
    button.disabled = true;
    button.textContent = "Sending…";

    const answers = {};
    FORM_FIELDS.forEach((field) => {
      const el = document.querySelector(`[data-field-id="${field.id}"]`);
      if (!el) return;
      answers[field.id] = field.type === "checkbox" ? el.checked : el.value;
    });

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-custom-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: FORM_TOKEN, answers }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast(result.error || "Couldn't send that - please try again", "error");
        button.disabled = false;
        button.textContent = "Submit";
        return;
      }
      formShow("form-success");
    } catch {
      toast("Couldn't reach Boardly - check your connection and try again", "error");
      button.disabled = false;
      button.textContent = "Submit";
    }
  });
});
