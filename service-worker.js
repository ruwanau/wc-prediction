// Service worker for World Cup 2026 Predictions PWA
// Designed to work both at site root AND under a GitHub Pages subpath like /repo-name/.
// All paths are resolved relative to this file's location, so no hard-coded base URL needed.
//
// Bump CACHE_VERSION whenever you ship a new index.html so users get the update.
const CACHE_VERSION = "wc2026-v5";

// Resolve paths against the service worker's own URL so they work no matter
// where the site is hosted (root, subdirectory, custom domain, etc.).
const BASE = new URL("./", self.location).href; // ends with a slash
const INDEX_URL = BASE + "index.html";

const CORE_ASSETS = [
  BASE,                       // the directory itself (acts as "/")
  INDEX_URL,
  BASE + "manifest.json",
  BASE + "icon-192.png",
  BASE + "icon-512.png",
  BASE + "icon-512-maskable.png",
  BASE + "apple-touch-icon.png"
];

// Install: pre-cache the app shell.
// Use addAll with individual catches so one missing file doesn't fail the whole install.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn("[SW] Skipped caching", url, err.message)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - Navigations (HTML pages): network-first, fall back to cached index.html when offline
//   - Same-origin GETs: cache-first, then network
//   - Cross-origin (Firebase, API-Football, Anthropic proxy, fonts CDN): go straight to network
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let Firebase/CDN traffic through untouched

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Cache a fresh copy of the page for offline use
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(INDEX_URL).then(r => r || caches.match(BASE)))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
