// Service worker caches the "app shell" so the app opens fast and UI works offline.
// IMPORTANT: app.js and decks.json are intentionally NOT cached here.
// - app.js always loads fresh (fixes iOS stuck-on-old-JS issues)
// - decks.json loads fresh when online; offline decks come from localStorage "last known good"

const CACHE = "vocab-study-shell-v5";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
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

  // Never cache app.js or decks.json
  if (url.pathname.endsWith("/app.js") || url.pathname.endsWith("/decks.json")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
