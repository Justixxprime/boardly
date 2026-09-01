/* ==========================================================================
   BOARDLY - js/request.js
   --------------------------------------------------------------------------
   Powers request.html. Standalone page, no dependency on dashboard.js -
   a stranger sending a request has no Boardly account at all, same
   approach as roadmap.js and booking-status.js.
   ========================================================================== */

const reqParams = new URLSearchParams(location.search);
const REQ_TOKEN = reqParams.get("token") || "";

function reqShow(id) {
  ["req-loading", "req-notfound", "req-form-wrap", "req-success"].forEach((x) =>
    document.getElementById(x).classList.toggle("hidden", x !== id)
  );
}

document.addEventListener("DOMContentLoaded", () => {
  // There's nothing to actually fetch just to show the form (unlike the
  // roadmap page, which needs real data first) - the token itself is
  // only checked for real when the form is submitted. Showing the form
  // immediately avoids an unnecessary round trip before anyone's even
  // typed anything.
  if (!REQ_TOKEN) { reqShow("req-notfound"); return; }
  reqShow("req-form-wrap");

  document.getElementById("req-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = document.getElementById("req-submit-btn");
    button.disabled = true;
    button.textContent = "Sending…";

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: REQ_TOKEN,
          name: document.getElementById("req-name").value,
          email: document.getElementById("req-email").value,
          title: document.getElementById("req-title").value,
          details: document.getElementById("req-details").value,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast(result.error || "Couldn't send that - please try again", "error");
        button.disabled = false;
        button.textContent = "Send request";
        return;
      }
      reqShow("req-success");
    } catch {
      toast("Couldn't reach Boardly - check your connection and try again", "error");
      button.disabled = false;
      button.textContent = "Send request";
    }
  });
});
