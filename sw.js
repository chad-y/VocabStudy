// Service worker caches the "app shell" so the app opens fast and works offline.
// IMPORTANT: decks.json is intentionally NOT cached here.
// Offline decks come from localStorage "last known good" (saved by app.js).

const CACHE = "vocab-study-shell-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache decks.json via service worker
  if (url.pathname.endsWith("/decks.json")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
