/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "trailforge-v1";
const APP_SHELL_CACHE = "app-shell-v1";
const TILE_CACHE = "map-tiles-v1";
const API_CACHE = "api-cache-v1";

const TILE_PATH_RE = /\/(tiles|api\/proxy\/satellite)\//;

const APP_SHELL_URLS = ["/", "/index.html", "/manifest.json"];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  const CURRENT_CACHES = [CACHE_NAME, APP_SHELL_CACHE, TILE_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: strategy routing
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Tile requests: cache-first
  if (TILE_PATH_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE));
    return;
  }

  // API requests: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // App shell and other assets: cache-first with network fallback
  event.respondWith(cacheFirst(event.request, APP_SHELL_CACHE));
});

async function cacheFirst(
  request: Request,
  cacheName: string
): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function networkFirst(
  request: Request,
  cacheName: string
): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "application/json" },
    });
  }
}
