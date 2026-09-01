// ===========================================================================
// BOARDLY - Notification Center
//
// Feeds the bell icon in the dashboard header. Needs schema_v36 run once
// (see supabase/schema_v36_notifications.sql) - until then this quietly
// shows a "still needs setup" note in the panel instead of erroring.
//
// How to add a new kind of notification later: for something that
// happens to the CURRENT signed-in user, insert a row directly:
//   await supabaseClient.from("notifications").insert({
//     user_id: (await supabaseClient.auth.getUser()).data.user.id,
//     type: "deadline_today", title: "...", body: "...", link_url: "...",
//   });
// For something that happens TO SOMEONE ELSE (like "you were invited to
// a board"), it has to go through an Edge Function using the service
// role client, the same way invite-member/index.ts does it - a normal
// user can never insert a notification for another user (see RLS in
// schema_v36).
// ===========================================================================

const NOTIFICATION_ICONS = {
  board_invite: "fa-people-group",
  task_assigned: "fa-user-check",
};

let notificationsLoaded = false;

async function loadNotifications() {
  const badge = document.getElementById("notifications-badge");
  const list = document.getElementById("notifications-list");
  const emptyEl = document.getElementById("notifications-empty");
  const notReadyEl = document.getElementById("notifications-not-ready");
  if (!list) return;

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("id, type, title, body, link_url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    // Most likely: schema_v36_notifications.sql hasn't been run on this
    // project yet - a one-time setup step still pending, not a real error.
    notReadyEl?.classList.remove("hidden");
    badge?.classList.add("hidden");
    return;
  }

  const unreadCount = (data || []).filter((n) => !n.read_at).length;
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  if (!data || data.length === 0) {
    emptyEl?.classList.remove("hidden");
    list.innerHTML = "";
    return;
  }
  emptyEl?.classList.add("hidden");

  list.innerHTML = data.map((n) => `
    <li>
      <button type="button" data-notification-id="${n.id}" data-link="${escapeHTML(n.link_url || "")}"
        class="notification-item w-full text-left px-4 py-3 flex items-start gap-2.5 hover:bg-cream transition ${n.read_at ? "" : "bg-violet/5"}">
        <i class="fa-solid ${NOTIFICATION_ICONS[n.type] || "fa-circle-info"} text-violet text-xs mt-1 w-4 text-center shrink-0"></i>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHTML(n.title)}</span>
          ${n.body ? `<span class="block text-xs text-ink-soft mt-0.5 line-clamp-2">${escapeHTML(n.body)}</span>` : ""}
        </span>
        ${n.read_at ? "" : '<span class="h-2 w-2 rounded-full bg-orange shrink-0 mt-1.5"></span>'}
      </button>
    </li>
  `).join("");
}

async function markNotificationRead(id) {
  await supabaseClient.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

async function markAllNotificationsRead() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  await supabaseClient.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  await loadNotifications();
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("notifications-btn");
  const panel = document.getElementById("notifications-panel");
  if (!btn || !panel) return;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    if (opening) {
      if (!notificationsLoaded) {
        notificationsLoaded = true;
        await loadNotifications();
      } else {
        await loadNotifications();
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });

  document.getElementById("notifications-mark-all-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    markAllNotificationsRead();
  });

  document.getElementById("notifications-list")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".notification-item");
    if (!item) return;
    const id = item.dataset.notificationId;
    const link = item.dataset.link;
    await markNotificationRead(id);
    await loadNotifications();
    if (link) window.location.href = link;
  });

  // A quick badge check on page load, without opening the panel, so the
  // unread count is right there the moment you land on the dashboard.
  loadNotifications();
});
