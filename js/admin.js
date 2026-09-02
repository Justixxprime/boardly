/* ==========================================================================
   BOARDLY - admin.js
   --------------------------------------------------------------------------
   Powers admin.html. There is no client-side "am I an admin" flag here on
   purpose - this file just asks admin-list-users for the data, and if the
   signed-in account isn't in the ADMIN_EMAILS Edge Function secret, that
   call refuses outright and no user data ever reaches this page. Hiding
   the "Manage plans" link from regular users would just be etiquette;
   this is the actual access control.
   ========================================================================== */

let adminUsers = [];

function planBadgeClass(plan) {
  if (plan === "pro_plus") return "bg-violet/15 text-violet";
  if (plan === "pro") return "bg-orange/15 text-orange";
  return "bg-[var(--paper-2)] text-ink-soft";
}

function planLabelFor(plan) {
  return plan === "pro_plus" ? "Pro+" : plan === "pro" ? "Pro" : "Free";
}

function renderAdminUsers() {
  const rows = document.getElementById("admin-user-rows");
  const empty = document.getElementById("admin-empty");
  const query = (document.getElementById("admin-search").value || "").trim().toLowerCase();
  const filtered = query ? adminUsers.filter((u) => (u.email || "").toLowerCase().includes(query)) : adminUsers;

  empty.classList.toggle("hidden", filtered.length > 0);
  rows.innerHTML = filtered
    .map(
      (u) => `
    <tr class="border-t border-line">
      <td class="p-3 font-medium">${escapeHTML(u.email || "(no email)")}</td>
      <td class="p-3 text-ink-soft">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}</td>
      <td class="p-3">
        <select data-user-id="${u.id}" class="admin-plan-select text-xs rounded-full px-2.5 py-1 border-0 font-medium ${planBadgeClass(u.plan)}">
          <option value="free" ${u.plan === "free" ? "selected" : ""}>Free</option>
          <option value="pro" ${u.plan === "pro" ? "selected" : ""}>Pro</option>
          <option value="pro_plus" ${u.plan === "pro_plus" ? "selected" : ""}>Pro+</option>
        </select>
      </td>
      <td class="p-3">
        <input type="text" data-note-id="${u.id}" value="${escapeHTML(u.planNote || "")}" placeholder="Internal note (optional)" class="input !py-1.5 text-xs w-full">
      </td>
    </tr>`
    )
    .join("");
}

// Simple, dependency-free HTML escaping - this page has no other script
// that already defines escapeHTML (unlike dashboard.html), so it needs
// its own copy rather than assuming one exists globally.
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

async function setUserPlan(userId, plan, note) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-set-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ userId, plan, note }),
  });
  const result = await res.json();
  if (!res.ok) { toast(result.error || "Couldn't update plan", "error"); return false; }
  const u = adminUsers.find((x) => x.id === userId);
  if (u) { u.plan = plan; u.planNote = note; }
  toast(`Set to ${planLabelFor(plan)}`, "ok");
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-list-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
  });
  const result = await res.json();
  document.getElementById("admin-loading").classList.add("hidden");

  if (!res.ok) {
    document.getElementById("admin-denied").classList.remove("hidden");
    return;
  }

  adminUsers = result.users || [];
  document.getElementById("admin-content").classList.remove("hidden");
  renderAdminUsers();

  document.getElementById("admin-search").addEventListener("input", renderAdminUsers);

  document.getElementById("admin-user-rows").addEventListener("change", async (e) => {
    const select = e.target.closest(".admin-plan-select");
    if (!select) return;
    const userId = select.dataset.userId;
    const noteInput = document.querySelector(`[data-note-id="${userId}"]`);
    const ok = await setUserPlan(userId, select.value, noteInput?.value.trim() || "");
    if (ok) select.className = `admin-plan-select text-xs rounded-full px-2.5 py-1 border-0 font-medium ${planBadgeClass(select.value)}`;
  });

  // Saving the note doesn't need its own button - it rides along the
  // next time the plan select changes, or blur commits it immediately
  // for someone who only wants to leave a note without changing plan.
  document.getElementById("admin-user-rows").addEventListener(
    "focusout",
    async (e) => {
      const input = e.target.closest("[data-note-id]");
      if (!input) return;
      const userId = input.dataset.noteId;
      const select = document.querySelector(`.admin-plan-select[data-user-id="${userId}"]`);
      const u = adminUsers.find((x) => x.id === userId);
      if (!select || !u || input.value.trim() === (u.planNote || "")) return; // nothing actually changed
      await setUserPlan(userId, select.value, input.value.trim());
    },
    true
  );
});
