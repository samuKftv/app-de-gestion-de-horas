// Service worker: guarda la app para abrirla sin conexión.
// Primero pregunta al servidor si hay versión nueva (sin fiarse de la caché del navegador)
// y, si no hay conexión, usa la copia guardada.
const CACHE = "cuadrante-docente-v4";
const BASICOS = ["./", "index.html", "css/estilos.css", "js/app.js", "js/firebase-config.js",
  "js/vendor/htm-preact-standalone.umd.js", "js/vendor/firebase-app-compat.js", "js/vendor/firebase-auth-compat.js",
  "js/vendor/firebase-firestore-compat.js", "manifest.webmanifest", "icons/icono.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
