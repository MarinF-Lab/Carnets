/* Service worker de Carnets: abre rápido y sin depender de internet.
 * - Archivos de la app (/_next/static) y lector de texto (/tesseract): caché primero.
 * - Páginas: red primero; sin conexión, la última versión guardada.
 * Los datos (Firestore) no pasan por aquí: tienen su propio almacenamiento local.
 */
const STATIC = "carnets-static-v1";
const PAGES = "carnets-pages-v1";
const OCR = "carnets-ocr-v1";
const KEEP = [STATIC, PAGES, OCR];
const SHELL = ["/", "/contratista/", "/escanear/", "/carnet/", "/configuracion/", "/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(SHELL)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match("/")) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/tesseract/")) return event.respondWith(cacheFirst(OCR, request));
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(STATIC, request));
  if (request.mode === "navigate") return event.respondWith(networkFirst(request));
  event.respondWith(staleWhileRevalidate(request));
});
