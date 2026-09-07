/*
 * ============================================================
 * pwa-controller.js - PWA起動 / 更新 / 復帰制御
 * ============================================================
 * 責務:
 * - アプリバージョン表示と更新確認
 * - Service Worker登録、解除、Cache Storage整理
 * - iPhone/iPadホーム画面PWAの復帰時カメラ再開
 *
 * 保守上の注意:
 * - 写真本体のIndexedDBはここから削除しない。更新処理で消してよいのは
 *   Service Worker登録とCache Storageだけ。
 * - 圏外でも起動できることを優先し、更新確認失敗は起動失敗にしない。
 * - カメラ復帰処理はcamera.jsのresumeCameraAfterPreview()を利用する。
 * ============================================================
 */

    const APP_VERSION = "v65.17";
    const settingsVersionText = document.getElementById("settingsVersionText");

    document.addEventListener("DOMContentLoaded", () => {
      renderAppVersion();
      checkAppUpdate();
      setupPwaResumeHandlers();
    });

    window.addEventListener("load", () => {
      registerAppServiceWorker();
    });

    function registerAppServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register("./service-worker.js")
        .then(() => console.log("Service Worker 登録完了"))
        .catch((error) => console.error("Service Worker登録失敗", error));
    }

    function setupPwaResumeHandlers() {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) resumeCameraIfNeeded();
      });

      window.addEventListener("pageshow", () => {
        resumeCameraIfNeeded();
      });
    }

    function resumeCameraIfNeeded() {
      if (!currentStream) return;
      if (previewOverlay && previewOverlay.classList.contains("show")) return;
      resumeCameraAfterPreview();
    }

    function getShortAppVersion(version = APP_VERSION) {
      const match = String(version || "").match(/^v?([0-9]+(?:\.[0-9]+)?[a-z]?)/i);
      return match ? `v${match[1]}` : String(version || "");
    }

    function renderAppVersion() {
      if (settingsVersionText) settingsVersionText.textContent = getShortAppVersion();
    }

    async function getLatestAppVersion() {
      const url = new URL(window.location.href);
      url.searchParams.set("_update_check", Date.now());

      const response = await fetch(url.toString(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });

      const html = await response.text();
      const match = html.match(/const APP_VERSION = "([^"]+)"/);
      return match ? match[1] : null;
    }

    async function clearAppCachesAndServiceWorker() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch (error) {
        console.log("Service Worker解除に失敗しました", error);
      }

      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.log("キャッシュ削除に失敗しました", error);
      }
    }

    async function reloadAppWithVersion(versionLabel) {
      await clearAppCachesAndServiceWorker();
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set("v", versionLabel || Date.now());
      reloadUrl.searchParams.set("_reload", Date.now());
      window.location.replace(reloadUrl.toString());
    }

    async function checkAppUpdate() {
      try {
        const latestVersion = await getLatestAppVersion();
        if (!latestVersion) return;

        if (latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。

現在：${getShortAppVersion(APP_VERSION)}
最新：${getShortAppVersion(latestVersion)}

更新しますか？`
          );

          if (ok) await reloadAppWithVersion(latestVersion);
        }
      } catch (error) {
        // 圏外や通信不良は正常運用の一部。更新確認失敗で起動を止めない。
        console.log("更新確認に失敗しました", error);
      }
    }

    async function forceAppUpdate() {
      try {
        showToast("最新版を確認中...");
        const latestVersion = await getLatestAppVersion();
        if (latestVersion && latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。

現在：${getShortAppVersion(APP_VERSION)}
最新：${getShortAppVersion(latestVersion)}

更新しますか？`
          );
          if (!ok) return;
          await reloadAppWithVersion(latestVersion);
          return;
        }

        const ok = window.confirm(
          `現在のバージョン：${getShortAppVersion(APP_VERSION)}

キャッシュを削除して、このバージョンを読み込み直しますか？`
        );
        if (ok) await reloadAppWithVersion(latestVersion || APP_VERSION);
      } catch (error) {
        console.log("手動更新に失敗しました", error);
        showErrorToast("更新に失敗しました");
      }
    }
