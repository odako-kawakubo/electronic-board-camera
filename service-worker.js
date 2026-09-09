const CACHE_NAME = "electronic-board-camera-v65.32";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles/app.css",
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
  "./manifest.json",
  "./service-worker.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  // 必須ファイルが1つでも保存できなければinstallを成功扱いにしない。
  // 中途半端なapp shellで圏外起動する状態を防ぐ。
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(event.request, { ignoreSearch: true }) ||
            await caches.match("./index.html") ||
            await caches.match("./")
          );
        })
    );
    return;
  }

  // app shellはcache-first。SWの世代が変わればCACHE_NAMEも変わるため、
  // 圏外時の確実性を優先しつつ更新世代は分離できる。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
