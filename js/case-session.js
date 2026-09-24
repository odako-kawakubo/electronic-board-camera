/*
 * ============================================================
 * case-session.js - 撮影セッション / 仮案件ID
 * ============================================================
 * 責務:
 * - yymmdd_枝番 の仮案件IDを発番・保持する
 * - 案件作成時の端末名 / OneDriveフォルダ名を案件単位で固定する
 * - 仮案件フォルダと「元画像」フォルダのOneDrive参照を案件単位で保持する
 * - 案件切替を購読可能にし、写真同期の再判定トリガーにする
 *
 * 保守上の注意:
 * - 端末名変更は「次に作る案件」から反映し、既存案件の保存先は変更しない。
 * - 件名は識別キーにしない。
 * ============================================================
 */
(function () {
  "use strict";

  const ACTIVE_KEY = "electronic-board-camera-active-case-session-v1";
  const SESSION_MAP_KEY = "electronic-board-camera-case-session-map-v1";
  const COUNTER_PREFIX = "electronic-board-camera-case-session-counter-v1-";
  const DEVICE_NAME_KEY = "electronic-board-camera-device-name-v1";
  const ORIGINAL_FOLDER_NAME = "元画像";
  const folderEnsurePromises = new Map();
  const listeners = [];

  function pad2(value) { return String(value).padStart(2, "0"); }

  function formatDateCode(date = new Date()) {
    return `${String(date.getFullYear()).slice(-2)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  }

  function sanitizeFolderPart(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|#%]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 60) || "端末";
  }

  function createDefaultDeviceName() {
    let suffix = "";
    try {
      suffix = crypto.getRandomValues(new Uint16Array(1))[0].toString(36).toUpperCase().padStart(3, "0").slice(-3);
    } catch (error) {
      suffix = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, "0");
    }
    return `端末-${suffix}`;
  }

  function getDeviceName() {
    try {
      const saved = localStorage.getItem(DEVICE_NAME_KEY);
      if (saved) return saved;
      const initial = createDefaultDeviceName();
      localStorage.setItem(DEVICE_NAME_KEY, initial);
      return initial;
    } catch (error) {
      return "端末";
    }
  }

  function setDeviceName(value) {
    const next = sanitizeFolderPart(value);
    try { localStorage.setItem(DEVICE_NAME_KEY, next); } catch (error) {}
    renderSessionPanel();
    return next;
  }

  function buildFolderName(deviceName, caseId) {
    return `${sanitizeFolderPart(deviceName)}_${sanitizeFolderPart(caseId)}`;
  }

  function loadSessionMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_MAP_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSessionMap(map) {
    try { localStorage.setItem(SESSION_MAP_KEY, JSON.stringify(map || {})); } catch (error) {}
  }

  function rememberSession(session) {
    if (!session?.id) return;
    const map = loadSessionMap();
    map[session.id] = { ...session };
    saveSessionMap(map);
  }

  function loadRememberedSession(caseId) {
    const session = loadSessionMap()[String(caseId || "")];
    return session?.id ? { ...session } : null;
  }

  function loadActiveSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
      if (!parsed || !parsed.id || !parsed.dateCode || !parsed.branch) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function saveActiveSession(session) {
    if (!session?.id) return;
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(session)); } catch (error) {}
    rememberSession(session);
  }

  function notify(type, session) {
    listeners.slice().forEach((callback) => {
      try { callback({ type, session: session ? { ...session } : null }); }
      catch (error) { console.warn("案件セッション購読処理に失敗しました", error); }
    });
  }

  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.push(callback);
    return () => {
      const index = listeners.indexOf(callback);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function nextBranch(dateCode) {
    const key = COUNTER_PREFIX + dateCode;
    let current = 0;
    try { current = Number(localStorage.getItem(key) || 0); } catch (error) {}
    const next = Math.max(0, current) + 1;
    try { localStorage.setItem(key, String(next)); } catch (error) {}
    return next;
  }

  function createSession(date = new Date()) {
    const dateCode = formatDateCode(date);
    const branch = nextBranch(dateCode);
    const id = `${dateCode}_${pad2(branch)}`;
    const deviceName = getDeviceName();
    const session = {
      id,
      dateCode,
      branch,
      deviceName,
      folderName: buildFolderName(deviceName, id),
      createdAt: new Date().toISOString(),
      kind: "temporary",
      oneDriveFolderDriveId: "",
      oneDriveFolderItemId: "",
      oneDriveOriginalFolderItemId: "",
      oneDriveFolderStatus: "pending",
      oneDriveFolderError: ""
    };
    saveActiveSession(session);
    renderSessionPanel();
    notify("activate", session);
    void ensureTemporarySessionFolder(session);
    return session;
  }

  function getCurrentSession() {
    let session = loadActiveSession();
    if (!session) session = createSession();
    else rememberSession(session);
    return session;
  }

  function startNewSession() {
    const current = getCurrentSession();
    const ok = window.confirm(`現在：${current.id}\n\n同日の別案件として新しい撮影セッションを開始しますか？`);
    if (!ok) return current;
    const next = createSession();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);
    return next;
  }

  function legacySessionHints(caseId) {
    try {
      if (typeof capturedPhotos === "undefined") return null;
      const photo = capturedPhotos.find((item) => String(item?.caseId || "") === String(caseId || ""));
      if (!photo) return null;
      return {
        deviceName: String(photo.deviceName || ""),
        folderName: String(photo.oneDriveFolderName || ""),
        createdAt: String(photo.createdAt || "")
      };
    } catch (error) {
      return null;
    }
  }

  function activateSession(caseId, subjectName = "") {
    const id = String(caseId || "").trim();
    const match = id.match(/^(\d{6})_(\d+)$/);
    if (!match) return getCurrentSession();

    let session = loadRememberedSession(id);
    if (!session) {
      const hints = legacySessionHints(id);
      const fixedDeviceName = hints?.deviceName || getDeviceName();
      session = {
        id,
        dateCode: match[1],
        branch: Number(match[2]),
        deviceName: fixedDeviceName,
        folderName: hints?.folderName || buildFolderName(fixedDeviceName, id),
        createdAt: hints?.createdAt || new Date().toISOString(),
        kind: "temporary",
        oneDriveFolderDriveId: "",
        oneDriveFolderItemId: "",
        oneDriveOriginalFolderItemId: "",
        oneDriveFolderStatus: "pending",
        oneDriveFolderError: ""
      };
    }

    saveActiveSession(session);
    void ensureTemporarySessionFolder(session);

    if (typeof restoreActiveCaseBoard === "function") {
      restoreActiveCaseBoard();
    } else {
      const subject = String(subjectName || "").trim();
      const input = document.getElementById("subjectText");
      if (subject && input) input.value = subject;
    }

    renderSessionPanel();
    notify("activate", session);
    if (typeof showToast === "function") showToast(`案件 ${id} を選択しました`);
    return session;
  }

  function isSameActiveSession(session) {
    const active = loadActiveSession();
    return Boolean(active && session && active.id === session.id && active.folderName === session.folderName);
  }

  function applyRemoteFolderState(session, folder, originalFolder, status, error = "") {
    if (!session?.id) return;
    const current = loadRememberedSession(session.id) || { ...session };
    current.oneDriveFolderDriveId = folder?.driveId || current.oneDriveFolderDriveId || "";
    current.oneDriveFolderItemId = folder?.itemId || folder?.id || current.oneDriveFolderItemId || "";
    current.oneDriveOriginalFolderItemId = originalFolder?.itemId || originalFolder?.id || current.oneDriveOriginalFolderItemId || "";
    current.oneDriveFolderStatus = status;
    current.oneDriveFolderError = error;
    rememberSession(current);
    if (isSameActiveSession(current)) {
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(current)); } catch (storageError) {}
    }
  }

  async function ensureTemporarySessionFolder(session = getCurrentSession()) {
    if (!session || session.kind !== "temporary" || !session.folderName) return null;
    if (navigator.onLine === false) return null;

    const latest = loadRememberedSession(session.id) || session;
    const connection = window.OneDriveConnection?.getState?.();
    if (!connection?.connected || !connection.photoRoot) return null;

    if (
      latest.oneDriveFolderStatus === "ready" &&
      latest.oneDriveFolderDriveId &&
      latest.oneDriveFolderItemId &&
      latest.oneDriveOriginalFolderItemId
    ) {
      return {
        driveId: latest.oneDriveFolderDriveId,
        itemId: latest.oneDriveFolderItemId,
        id: latest.oneDriveFolderItemId,
        name: latest.folderName,
        folder: {},
        originalFolder: {
          driveId: latest.oneDriveFolderDriveId,
          itemId: latest.oneDriveOriginalFolderItemId,
          id: latest.oneDriveOriginalFolderItemId,
          name: ORIGINAL_FOLDER_NAME,
          folder: {}
        }
      };
    }

    const key = `${connection.photoRoot.driveId}:${connection.photoRoot.itemId}:${latest.folderName}`;
    if (folderEnsurePromises.has(key)) return folderEnsurePromises.get(key);

    applyRemoteFolderState(latest, null, null, "creating");
    const promise = OneDriveClient.ensureChildFolder(connection.photoRoot, latest.folderName)
      .then(async (folder) => {
        const verified = await OneDriveClient.getDriveItem(folder);
        if (!verified?.folder || !verified.driveId || !verified.itemId) throw new Error("仮案件のOneDriveフォルダを確認できませんでした。");

        const originalFolder = await OneDriveClient.ensureChildFolder(verified, ORIGINAL_FOLDER_NAME);
        const verifiedOriginal = await OneDriveClient.getDriveItem(originalFolder);
        if (!verifiedOriginal?.folder || !verifiedOriginal.driveId || !verifiedOriginal.itemId) throw new Error("仮案件の元画像フォルダを確認できませんでした。");

        applyRemoteFolderState(latest, verified, verifiedOriginal, "ready");
        return { ...verified, originalFolder: verifiedOriginal };
      })
      .catch((error) => {
        applyRemoteFolderState(latest, null, null, "error", error?.message || "フォルダ作成に失敗しました。");
        console.warn("仮案件OneDriveフォルダの確保に失敗しました", error);
        return null;
      })
      .finally(() => folderEnsurePromises.delete(key));

    folderEnsurePromises.set(key, promise);
    return promise;
  }

  async function ensureCurrentSessionFolder() {
    return ensureTemporarySessionFolder(getCurrentSession());
  }

  function changeDeviceName() {
    const current = getDeviceName();
    const next = window.prompt("この端末の名前を入力してください", current);
    if (next === null || !String(next).trim()) return;
    const saved = setDeviceName(next);
    if (typeof showToast === "function") showToast(`端末名を ${saved} にしました。次の新規案件から反映します`);
  }

  function getCurrentSubject() {
    const input = document.getElementById("subjectText");
    return String(input?.value || "").trim() || "無題案件";
  }

  function renderSessionPanel() {
    const session = getCurrentSession();
    const id = document.getElementById("launchCurrentCaseId");
    const subject = document.getElementById("launchCurrentCaseSubject");
    const device = document.getElementById("settingsDeviceNameText");
    if (id) id.textContent = session.id;
    if (subject) subject.textContent = getCurrentSubject();
    if (device) device.textContent = getDeviceName();
  }

  document.addEventListener("DOMContentLoaded", () => {
    getCurrentSession();
    renderSessionPanel();

    const subjectInput = document.getElementById("subjectText");
    if (subjectInput && subjectInput.dataset.homeCaseBound !== "1") {
      subjectInput.dataset.homeCaseBound = "1";
      subjectInput.addEventListener("input", renderSessionPanel);
      subjectInput.addEventListener("change", renderSessionPanel);
    }

    if (window.OneDriveConnection?.subscribe) {
      OneDriveConnection.subscribe((state) => {
        if (state?.connected) void ensureCurrentSessionFolder();
      });
    }

    window.setTimeout(renderSessionPanel, 0);
  });

  window.CaseSession = Object.freeze({
    getCurrentSession,
    startNewSession,
    activateSession,
    renderSessionPanel,
    getDeviceName,
    setDeviceName,
    changeDeviceName,
    buildFolderName,
    ensureTemporarySessionFolder,
    ensureCurrentSessionFolder,
    subscribe
  });
})();
