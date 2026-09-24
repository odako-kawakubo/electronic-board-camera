/*
 * ============================================================
 * pwa-controller.js - PWA起動 / 更新 / 復帰制御
 * ============================================================
 * しらべと同じ更新思想:
 * - version.json の version + revision で最新版を判定
 * - 利用者が「アップデート」を押した時だけwaiting SWへ切替要求
 * - Service Worker全解除 / Cache Storage全削除は行わない
 * - localStorage / IndexedDB / 写真データには触れない
 * ============================================================
 */
(function () {
  "use strict";

  const FIRST_CONTROL_RELOAD_KEY = "boardCameraPwaFirstControlReloaded";
  const UPDATE_VERIFY_KEY = "boardCameraExpectedRevisionAfterReload";
  let registrationPromise = null;

  const settingsVersionText = document.getElementById("settingsVersionText");
  const updateModal = document.getElementById("updateModal");
  const updateMessage = document.getElementById("updateMessage");
  const closeUpdateButton = document.getElementById("closeAppUpdateButton");
  const confirmUpdateButton = document.getElementById("confirmAppUpdateButton");

  function currentVersionInfo() {
    return {
      version: String(window.AppVersion?.version || "").trim(),
      revision: String(window.AppVersion?.revision || "").trim()
    };
  }

  function normalizeVersionInfo(info = {}) {
    return {
      version: String(info.version || "").trim(),
      revision: String(info.revision || "").trim()
    };
  }

  function sameBuild(left, right) {
    const a = normalizeVersionInfo(left);
    const b = normalizeVersionInfo(right);
    return Boolean(a.version && b.version)
      && a.version === b.version
      && a.revision === b.revision;
  }

  function buildLabel(info) {
    const value = normalizeVersionInfo(info);
    return value.revision ? `v${value.version}（${value.revision}）` : `v${value.version}`;
  }

  function renderAppVersion() {
    if (settingsVersionText) settingsVersionText.textContent = buildLabel(currentVersionInfo());
  }

  function bindFirstControlReload() {
    if (!("serviceWorker" in navigator)) return;
    if (navigator.serviceWorker.controller) {
      sessionStorage.removeItem(FIRST_CONTROL_RELOAD_KEY);
      return;
    }

    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (sessionStorage.getItem(FIRST_CONTROL_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(FIRST_CONTROL_RELOAD_KEY, "1");
      location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  }

  function initializePwa() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    if (registrationPromise) return registrationPromise;

    bindFirstControlReload();
    registrationPromise = navigator.serviceWorker
      .register("./service-worker.js", { scope: "./", updateViaCache: "none" })
      .then((registration) => {
        if (navigator.serviceWorker.controller) {
          sessionStorage.removeItem(FIRST_CONTROL_RELOAD_KEY);
        }
        return registration;
      })
      .catch((error) => {
        console.warn("Service Workerを登録できませんでした", error);
        return null;
      });

    return registrationPromise;
  }

  function waitForWaitingWorker(registration, timeoutMs = 12000) {
    if (registration?.waiting) return Promise.resolve(registration.waiting);

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = (worker = null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(worker);
      };

      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") finish(registration.waiting || worker);
        });
      };

      watch(registration?.installing);
      registration?.addEventListener("updatefound", () => watch(registration.installing), { once: true });
      timer = window.setTimeout(() => finish(registration?.waiting || null), timeoutMs);
    });
  }

  async function preparePwaUpdate() {
    const registration = await initializePwa();
    if (!registration) return null;
    await registration.update();
    return waitForWaitingWorker(registration);
  }

  async function activatePreparedPwaUpdate(worker) {
    if (!worker || !("serviceWorker" in navigator)) return false;

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", onChange);
        resolve(value);
      };

      const onChange = () => finish(true);
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      timer = window.setTimeout(() => finish(false), 12000);
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  }

  async function fetchLatestVersionInfo() {
    try {
      const response = await fetch(`./version.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`version.json fetch failed: ${response.status}`);
      return normalizeVersionInfo(await response.json());
    } catch (error) {
      console.warn("最新バージョンを取得できませんでした", error);
      return { ...currentVersionInfo(), fetchFailed: true };
    }
  }

  function renderUpdateActions(canUpdate) {
    if (closeUpdateButton) closeUpdateButton.textContent = canUpdate ? "キャンセル" : "閉じる";
    if (confirmUpdateButton) {
      confirmUpdateButton.hidden = !canUpdate;
      confirmUpdateButton.disabled = false;
    }
  }

  function openUpdatePrompt() {
    updateModal?.classList.add("show");
  }

  function closeUpdatePrompt() {
    updateModal?.classList.remove("show");
  }

  async function showUpdatePrompt() {
    const current = currentVersionInfo();

    if (updateMessage) {
      updateMessage.innerHTML =
        `現在：${buildLabel(current)}<br>` +
        "最新バージョンを確認しています...";
    }

    renderUpdateActions(false);
    openUpdatePrompt();

    const latest = await fetchLatestVersionInfo();
    if (!updateMessage) return;

    if (latest.fetchFailed) {
      updateMessage.innerHTML =
        `現在：${buildLabel(current)}<br><br>` +
        "最新バージョンを確認できませんでした。<br>" +
        "通信状態を確認して、もう一度お試しください。";
      renderUpdateActions(false);
      return;
    }

    if (sameBuild(latest, current)) {
      updateMessage.innerHTML =
        `現在：${buildLabel(current)}<br>` +
        `最新：${buildLabel(latest)}<br><br>` +
        "<b>最新の状態です。</b>";
      renderUpdateActions(false);
      return;
    }

    updateMessage.innerHTML =
      `現在：${buildLabel(current)}<br>` +
      `最新：${buildLabel(latest)}<br><br>` +
      "<b>アップデートできます。</b>";
    renderUpdateActions(true);
  }

  async function applyAppUpdate() {
    if (confirmUpdateButton) confirmUpdateButton.disabled = true;

    try {
      const latest = await fetchLatestVersionInfo();
      if (latest.fetchFailed) throw new Error("最新バージョンを確認できませんでした。");

      sessionStorage.setItem(UPDATE_VERIFY_KEY, JSON.stringify(latest));

      if (updateMessage) updateMessage.textContent = "アップデートをダウンロードしています…";
      const worker = await preparePwaUpdate();

      if (updateMessage) updateMessage.textContent = "アップデートを適用しています…";
      const switched = await activatePreparedPwaUpdate(worker);
      if (!switched && worker) {
        console.warn("Service Worker切替完了を確認できませんでした。通常reloadを続行します。");
      }

      location.reload();
    } catch (error) {
      sessionStorage.removeItem(UPDATE_VERIFY_KEY);
      console.error("アプリをアップデートできませんでした", error);
      if (updateMessage) {
        updateMessage.innerHTML =
          "アップデートできませんでした。<br>" +
          "通信状態を確認して、もう一度お試しください。";
      }
      renderUpdateActions(false);
    }
  }

  async function verifyPendingAppUpdate() {
    const raw = sessionStorage.getItem(UPDATE_VERIFY_KEY);
    if (!raw) return;
    sessionStorage.removeItem(UPDATE_VERIFY_KEY);

    let expected;
    try {
      expected = normalizeVersionInfo(JSON.parse(raw));
    } catch (error) {
      expected = { version: String(raw || ""), revision: "" };
    }

    const latest = await fetchLatestVersionInfo();
    const target = latest.fetchFailed ? expected : latest;
    if (sameBuild(currentVersionInfo(), target)) return;

    if (updateMessage) {
      updateMessage.innerHTML =
        "アップデートを確認できませんでした。<br><br>" +
        "Safariでこのアプリを直接開いて、もう一度アップデートしてください。<br>" +
        "それでも切り替わらない場合は、ホーム画面のアプリを終了して開き直してください。";
    }
    renderUpdateActions(false);
    openUpdatePrompt();
  }

  function setupPwaResumeHandlers() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) resumeCameraIfNeeded();
    });
    window.addEventListener("pageshow", resumeCameraIfNeeded);
  }

  function resumeCameraIfNeeded() {
    if (typeof currentStream === "undefined" || !currentStream) return;
    if (typeof previewOverlay !== "undefined" && previewOverlay?.classList.contains("show")) return;
    if (typeof resumeCameraAfterPreview === "function") void resumeCameraAfterPreview();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAppVersion();
    setupPwaResumeHandlers();
    void initializePwa();
    void verifyPendingAppUpdate();
  });

  window.showUpdatePrompt = showUpdatePrompt;
  window.closeUpdatePrompt = closeUpdatePrompt;
  window.applyAppUpdate = applyAppUpdate;
  window.forceAppUpdate = showUpdatePrompt;
})();
