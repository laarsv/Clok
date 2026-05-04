/* Clok Service Worker – minimal, ohne Workbox.
 *
 * Strategie:
 *   - API-Requests (/api/*): immer Netz, nie cachen.
 *   - GET-Requests auf statische Assets (HTML, JS, CSS, Bilder, Fonts):
 *     Stale-While-Revalidate. Bei Offline reicht der Cache-Treffer.
 *   - Andere Methoden (POST/PATCH/DELETE): always network.
 *
 * Cache-Version: bei strukturellen Änderungen hochzählen, dann werden
 * alte Caches im activate-Handler aufgeräumt.
 */
const CACHE_VERSION = "clok-v1";
const APP_SHELL = ["/", "/index.html", "/clok-icon.png", "/clok-logo.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // API: never cache, immer ans Netz
  if (url.pathname.startsWith("/api/")) return;
  // Cross-Origin: ignorieren
  if (url.origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        cache.put(req, res.clone()).catch(() => undefined);
      }
      return res;
    })
    .catch(() => undefined);
  return cached || network || new Response("", { status: 504 });
}
