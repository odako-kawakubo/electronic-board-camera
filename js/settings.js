/*
 * ============================================================
 * settings.js - 設定 / アプリ更新
 * ============================================================
 * 責務: 画質、看板文字サイズ、設定画面、バージョン表示、PWA更新確認を担当する。app.jsの初期状態生成で使うためapp.jsより先に読む。
 *
 * 保守上の注意:
 * - localStorageのキー名変更は既存利用者の設定消失につながる。Service Worker更新処理は片側だけ変更しない。
 * ============================================================
 */

    /**

     * 保存済み画質設定を読み込み、不正値ならstandardへ戻す。

     */

    function loadPhotoQuality() {
      try {
        const saved = localStorage.getItem(PHOTO_QUALITY_STORAGE_KEY);
        if (saved && PHOTO_QUALITY_SETTINGS[saved]) return saved;
      } catch (error) {}

      return "standard";
    }

    /**

     * 撮影画質を保存して設定UIへ即時反映する。

     */

    function setPhotoQuality(value) {
      if (!PHOTO_QUALITY_SETTINGS[value]) return;

      photoQuality = value;

      try {
        localStorage.setItem(PHOTO_QUALITY_STORAGE_KEY, value);
      } catch (error) {}

      renderPhotoQualitySettings();
      const setting = PHOTO_QUALITY_SETTINGS[photoQuality];
      showToast(`${setting.label}（${setting.width}×${setting.height}）にしました`);
    }

    function renderPhotoQualitySettings() {
      if (!qualityStandardButton || !qualityHighButton) return;

      qualityStandardButton.classList.toggle("active", photoQuality === "standard");
      qualityHighButton.classList.toggle("active", photoQuality === "high");
    }

    /**

     * 看板各項目の個別文字サイズを復元し、安全な範囲へ制限する。

     */

    function loadBoardFieldTextSizes() {
      const defaults = { subject: 18, address: 17, room: 24, sample: 24, date: 24 };
      try {
        const raw = localStorage.getItem(BOARD_FIELD_TEXT_SIZE_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === "object") {
          return {
            subject: clamp(Number(saved.subject) || defaults.subject, 12, 32),
            address: clamp(Number(saved.address) || defaults.address, 12, 32),
            room: clamp(Number(saved.room) || defaults.room, 12, 36),
            sample: clamp(Number(saved.sample) || defaults.sample, 12, 36),
            date: clamp(Number(saved.date) || defaults.date, 14, 34)
          };
        }
      } catch (error) {}
      return defaults;
    }

    function saveBoardFieldTextSizes() {
      try {
        localStorage.setItem(BOARD_FIELD_TEXT_SIZE_STORAGE_KEY, JSON.stringify(boardFieldTextSize));
      } catch (error) {}
    }

    function applyBoardFieldTextSizes() {
      if (subjectText) subjectText.style.fontSize = `${boardFieldTextSize.subject}px`;
      if (addressText) addressText.style.fontSize = `${boardFieldTextSize.address}px`;
      if (roomNoInput) roomNoInput.style.fontSize = `${boardFieldTextSize.room}px`;
      if (sampleNoInput) sampleNoInput.style.fontSize = `${boardFieldTextSize.sample}px`;
      if (dateText) dateText.style.fontSize = `${boardFieldTextSize.date}px`;
      syncBoardTextAreaVerticalCenter();
      scheduleBoardPreviewRender();
    }

    function loadBoardTextSize() {
      try {
        const saved = localStorage.getItem(BOARD_TEXT_SIZE_STORAGE_KEY);
        if (saved && BOARD_TEXT_SIZE_MULTIPLIERS[saved]) return saved;
      } catch (error) {}

      return "normal";
    }

    function renderBoardTextSize() {
      if (!boardWrap) return;

      boardWrap.classList.toggle("text-small", boardTextSize === "small");
      boardWrap.classList.toggle("text-large", boardTextSize === "large");

      scheduleBoardPreviewRender();
    }

    function setupSettingsToggleButton() {
      const button = document.getElementById("settingsButton");
      if (!button || button.dataset.toggleBound === "1") return;
      button.dataset.toggleBound = "1";
      let lastToggle = 0;
      const toggle = (event) => {
        const now = Date.now();
        if (now - lastToggle < 350) return;
        lastToggle = now;
        event.preventDefault();
        event.stopPropagation();
        toggleSettings();
      };
      button.addEventListener("pointerup", toggle, { passive: false });
      button.addEventListener("touchend", toggle, { passive: false });
      button.addEventListener("click", toggle, false);
    }

    function toggleSettings() {
      if (settingsOverlay.classList.contains("show")) {
        closeSettings();
      } else {
        openSettings();
      }
    }

    function openSettings() {
      renderPhotoQualitySettings();
      settingsOverlay.classList.add("show");
    }

    function closeSettings() {
      settingsOverlay.classList.remove("show");
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

    /**

     * Service WorkerとCache Storageを消して古いPWAキャッシュを外してから再読込する。

     */

    async function reloadAppWithVersion(versionLabel) {
      await clearAppCachesAndServiceWorker();
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set("v", versionLabel || Date.now());
      reloadUrl.searchParams.set("_reload", Date.now());
      window.location.replace(reloadUrl.toString());
    }

    /**

     * 公開中HTMLのAPP_VERSIONを確認し、差分がある場合だけ更新を提案する。

     */

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

