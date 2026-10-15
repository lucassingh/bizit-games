/*
 * Service worker de Bizit Game Center: offline-first para el kiosco.
 *
 * - Navegaciones: red primero con 3 s de límite; si falla, la última copia en caché.
 *   (Wi-Fi malo → igual carga; sin red → carga lo que se cacheó).
 * - /_next/static, fuentes, íconos y marca: caché primero (son inmutables o versionados).
 * - /api/*: nunca se cachea (los leads los maneja la cola de IndexedDB del cliente).
 *
 * Para forzar una limpieza total, subí VERSION.
 */
const VERSION = "bgc-v2";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ["/", "/config", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/bgen-personaje.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(request), timeout(3000)]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/"));
    return hit || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // los chunks de `next dev` no llevan hash y vienen con no-store: no se guardan nunca
  const cc = (res && res.headers.get("cache-control")) || "";
  if (res && res.ok && !/no-store/i.test(cc)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || /\.(woff2?|png|svg|jpg|webp|glb|json)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // payloads RSC y demás: rápido desde caché y se actualiza por detrás
  event.respondWith(staleWhileRevalidate(request));
});

// El cliente puede pedir que se precalienten URLs (por ejemplo, desde /config).
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(STATIC).then((c) =>
        Promise.allSettled(
          data.urls.map((u) =>
            c.match(u).then((hit) => hit || fetch(u).then((r) => (r.ok ? c.put(u, r) : undefined))),
          ),
        ),
      ),
    );
  }
});
