/*
 * v65.37 Service Worker
 * 最新版優先 + 圏外時は直近キャッシュから起動する。
 */
const APP_CACHE = "electronic-board-camera-v65.37-stable";
const APP_CACHE_PREFIX = "electronic-board-camera-";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./manifest.json",
  "./version.json",
  "./js/app-version.js",
  "./js/microsoft-config.js",
  "./js/graph-session.js",
  "./js/microsoft-auth-ui.js",
  "./js/onedrive-client.js",
  "./js/onedrive-root.js",
  "./js/onedrive-connection.js",
  "./js/onedrive-status-ui.js",
  "./assets/microsoft-symbol.svg",
  "./js/photo-store.js",
  "./js/photo-state.js",
  "./js/case-session.js",
  "./js/photo-record.js",
  "./js/photo-onedrive-sync.js",
  "./js/settings.js",
  "./js/shared-state.js",
  "./js/board-persistence.js",
  "./js/board-sampling.js",
  "./js/app.js",
  "./js/photo-utils.js",
  "./js/board.js",
  "./js/camera.js",
  "./js/photo-import.js",
  "./js/photo-album.js",
  "./js/photo-viewer.js",
  "./js/storage-manager.js",
  "./js/pwa-controller.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

function appCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

async function networkFirstAppRequest(request) {
  const cache = await caches.open(APP_CACHE);
  const cacheKey = appCacheKey(request);

  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return (await cache.match("./index.html")) || (await cache.match("./"));
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== APP_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirstAppRequest(request));
});
