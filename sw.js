/* ==========================================================================
   BOARDLY - service worker
   Caches the "app shell" (the HTML/CSS/JS that make the app look and feel
   like Boardly) so the site still opens when there's no connection.
   It does NOT cache your tasks - those always come live from Supabase.
   Offline just means: the app opens instantly instead of a browser error,
   even though it can't load or save tasks until you're back online.

   Bump CACHE_NAME any time you want returning visitors to pick up fresh
   shell files (a plain edit to these files is not enough on its own -
   see GUIDE.md's "PWA" section for why).
   ========================================================================== */

const CACHE_NAME = "boardly-shell-v9";
const SHELL_FILES = [
  "index.html",
  "dashboard.html",
  "login.html",
  "signup.html",
  "settings.html",
  "stats.html",
  "tools.html",
  "share.html",
  "cookies.html",
  "features.html",
  "pricing.html",
  "contact.html",
  "changelog.html",
  "404.html",
  "css/style.css",
  "js/site.js",
  "js/dashboard.js",
  "js/timely.js",
  "js/visual.js",
  "js/datepicker.js",
  "js/auth.js",
  "js/charts.js",
  "js/stats.js",
  "js/settings.js",
  "js/tools.js",
  "js/supabase-client.js",
  "manifest.json",
  "favicon.ico",
  "icons/icon-32.png",
  "icons/icon-70.png",
  "icons/icon-150.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for same-origin shell files (so edits show up on next
// visit while online), falling back to the cached copy the moment a
// request fails - which is what makes the app open at all when offline.
// Anything cross-origin (Supabase, fonts, CDNs) is left completely
// alone - the browser handles those normally, and if they fail because
// you're offline, Boardly's own code already shows a toast for that.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("dashboard.html")))
  );
});

// ---------------------------------------------------------------------------
// TIMELY: real push notifications
// This is what makes an alert land even when Boardly isn't open in a tab -
// the send-push edge function (cron, server-side) hits the browser's push
// service directly, which wakes this service worker up to show it.
// A locked/silenced phone can still suppress the sound (that's an OS rule,
// not something a website can override) but the notification itself will
// be there waiting, with requireInteraction so it doesn't auto-dismiss.
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: "Boardly", body: event.data ? event.data.text() : "You have a reminder" };
  }

  const title = payload.title || "Boardly reminder";
  const options = {
    body: payload.body || "A ticket needs you",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    vibrate: [500, 250, 500, 250, 500, 250, 500],
    requireInteraction: true,
    tag: payload.taskId ? `boardly-task-${payload.taskId}` : "boardly-reminder",
    renotify: true,
    data: payload,
    actions: [
      { action: "snooze", title: "Snooze 10 min" },
      { action: "done", title: "Mark done" },
      { action: "open", title: "Open" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const taskId = event.notification.data && event.notification.data.taskId;
  event.notification.close();

  if (event.action === "snooze") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        list.forEach((client) => client.postMessage({ type: "boardly-snooze", taskId }));
      })
    );
    return;
  }

  if (event.action === "done") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        list.forEach((client) => client.postMessage({ type: "boardly-mark-done", taskId }));
      })
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("dashboard.html") && "focus" in client) {
          client.postMessage({ type: "boardly-alarm-open", taskId });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow("dashboard.html");
    })
  );
});
