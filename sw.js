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

const CACHE_NAME = "boardly-shell-v6";
const SHELL_FILES = [
  "index.html",
  "dashboard.html",
  "login.html",
  "signup.html",
  "settings.html",
  "stats.html",
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
  "js/auth.js",
  "js/charts.js",
  "js/stats.js",
  "js/settings.js",
  "js/supabase-client.js",
  "manifest.json",
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
