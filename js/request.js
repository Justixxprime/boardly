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
  // typed anything. The board name is a nice-to-have, so it's fetched
  // in the background afterward and only swapped in once it arrives -
  // never blocking the form itself, and if it fails, the generic "Send
  // a request" heading was already showing and just stays put.
  if (!REQ_TOKEN) { reqShow("req-notfound"); return; }
  reqShow("req-form-wrap");

  fetch(`${SUPABASE_URL}/functions/v1/get-request-portal-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: REQ_TOKEN }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result?.boardName) {
        document.getElementById("req-board-name").textContent = `Send a request to ${result.boardName}`;
      }
    })
    .catch(() => {}); // purely cosmetic - the form already works without this

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
