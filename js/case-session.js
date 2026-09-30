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
  const FORMAL_PHOTO_FOLDER_NAME = "採取写真";
  const ORIGINAL_FOLDER_NAME = "元画像";
  const folderEnsurePromises = new Map();
  const listeners = [];
  let tutorialSession = null;
  const TUTORIAL_PREVIOUS_CASE_KEY = "electronic-board-camera-tutorial-previous-case-v1";

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
      if (!parsed || !parsed.id) return null;

      // 旧版で永続化されていたチュートリアル案件は通常案件として復元しない。
      if (parsed.kind === "tutorial") {
        let previous = null;
        try { previous = JSON.parse(localStorage.getItem(TUTORIAL_PREVIOUS_CASE_KEY) || "null"); } catch (_) {}
        if (previous?.id && previous.kind !== "tutorial") {
          try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(previous)); } catch (_) {}
          return previous;
        }
        try { localStorage.removeItem(ACTIVE_KEY); } catch (_) {}
        return null;
      }

      if (parsed.kind === "formal") return parsed;
      if (!parsed.dateCode || !parsed.branch) return null;
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
    if (tutorialSession) return { ...tutorialSession };

    let session = loadActiveSession();
    if (!session) session = createSession();
    else rememberSession(session);
    return session;
  }

  async function startNewSession() {
    const current = getCurrentSession();
    if (window.Tutorial?.shouldUseTutorialNewCase?.()) {
      return Tutorial.startTutorialNewCase(current);
    }
    const ok = await AppDialog.confirm({
      title: "新規案件",
      message: "現在の案件から切り替えて、新しい案件を開始しますか？",
      okLabel: "新しい案件を開始",
      cancelLabel: "キャンセル"
    });
    if (!ok) return current;
    const next = createSession();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    if (typeof showToast === "function") showToast(`案件 ${next.id} を開始しました`);
    if (typeof chooseCameraMode === "function") chooseCameraMode();
    return next;
  }

  function activateTutorialSession(route = "existing") {
    const isNew = route === "new";
    tutorialSession = {
      id: isNew ? "TUTORIAL_NEW" : "TUTORIAL_EXISTING",
      kind: "tutorial",
      tutorialRoute: isNew ? "new" : "existing",
      projectName: isNew ? "新規案件チュートリアル" : "チュートリアル案件",
      folderName: "",
      deviceName: getDeviceName(),
      createdAt: new Date().toISOString(),
      oneDriveFolderStatus: "disabled"
    };

    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    renderSessionPanel();
    notify("activate", tutorialSession);
    return { ...tutorialSession };
  }

  function endTutorialSession() {
    if (!tutorialSession) return getCurrentSession();
    tutorialSession = null;
    const session = loadActiveSession() || createSession();
    renderSessionPanel();
    notify("activate", session);
    return { ...session };
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
    let session = loadRememberedSession(id);

    if (session?.kind === "formal") {
      saveActiveSession(session);
      restoreCaseBoard(session.projectName || subjectName);
      renderSessionPanel();
      notify("activate", session);
      void ensureCurrentSessionFolder();
      if (typeof showToast === "function") showToast(`案件 ${session.id} を選択しました`);
      return session;
    }

    const match = id.match(/^(\d{6})_(\d+)$/);
    if (!match) return getCurrentSession();

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
    restoreCaseBoard(subjectName);

    renderSessionPanel();
    notify("activate", session);
    if (typeof showToast === "function") showToast(`案件 ${id} を選択しました`);
    return session;
  }

  function restoreCaseBoard(defaultSubject = "") {
    const subject = String(defaultSubject || "").trim();
    let saved = null;
    if (window.BoardPersistence?.loadSavedBoardForm) saved = BoardPersistence.loadSavedBoardForm();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    const savedSubject = String(saved?.subject || "").trim();
    if (subject && (!savedSubject || savedSubject === APP_DATA.subject)) {
      const input = document.getElementById("subjectText");
      if (input) input.value = subject;
      if (typeof saveBoardForm === "function") saveBoardForm();
    }
  }

  async function readFormalProjectAddress(projectFolder, projectNo) {
    if (!window.OneDriveProjectFile?.readProjectExcelInfo) return "";

    // 住所情報の正本は、しらべと同じ「04 調査」の案件Excel。
    // 04側を参照できない環境では、従来どおり03側案件フォルダも確認する。
    try {
      const surveyProject = await OneDriveRoot.findSurveyProjectFolder(projectNo);
      if (surveyProject) {
        try {
          const info = await OneDriveProjectFile.readProjectExcelInfo(surveyProject, projectNo);
          const address = String(info?.address || "").trim();
          if (address) return address;
        } catch (error) {
          console.warn("04 調査の案件Excelから住所を読めませんでした。03 サンプリング側を確認します。", {
            projectNo,
            message: error?.message || String(error)
          });
        }
      }
    } catch (error) {
      console.warn("04 調査の案件フォルダを確認できませんでした。03 サンプリング側を確認します。", {
        projectNo,
        message: error?.message || String(error)
      });
    }

    try {
      const info = await OneDriveProjectFile.readProjectExcelInfo(projectFolder, projectNo);
      return String(info?.address || "").trim();
    } catch (error) {
      console.warn("案件Excelから住所を補完できないため、住所未入力のまま案件を開きます。", {
        projectNo,
        message: error?.message || String(error)
      });
      return "";
    }
  }

  function applyFormalProjectAddressIfEmpty(address) {
    const value = String(address || "").trim();
    if (!value) return;
    const saved = window.BoardPersistence?.loadSavedBoardForm?.() || null;
    const savedAddress = String(saved?.address || "").trim();
    if (savedAddress && savedAddress !== APP_DATA.address) return;

    const input = document.getElementById("addressText");
    const currentAddress = String(input?.value || "").trim();
    if (!input || (currentAddress && currentAddress !== APP_DATA.address)) return;
    input.value = value;
    if (typeof saveBoardForm === "function") saveBoardForm();
  }

  async function activateFormalProject(project) {
    const projectNo = String(project?.projectNo || "").trim();
    const projectName = String(project?.projectName || "").trim();
    const driveId = String(project?.driveId || "").trim();
    const itemId = String(project?.itemId || project?.id || "").trim();
    const folderName = String(project?.name || "").trim();
    if (!/^\d{9}$/.test(projectNo) || !projectName || !driveId || !itemId) {
      throw new Error("正式案件を特定できません。");
    }

    const remembered = loadRememberedSession(projectNo);
    const session = {
      ...(remembered || {}),
      id: projectNo,
      kind: "formal",
      projectName,
      folderName,
      deviceName: remembered?.deviceName || getDeviceName(),
      createdAt: remembered?.createdAt || new Date().toISOString(),
      oneDriveProjectFolderDriveId: driveId,
      oneDriveProjectFolderItemId: itemId,
      oneDriveFolderDriveId: remembered?.oneDriveProjectFolderItemId === itemId ? (remembered?.oneDriveFolderDriveId || "") : "",
      oneDriveFolderItemId: remembered?.oneDriveProjectFolderItemId === itemId ? (remembered?.oneDriveFolderItemId || "") : "",
      oneDriveOriginalFolderItemId: remembered?.oneDriveProjectFolderItemId === itemId ? (remembered?.oneDriveOriginalFolderItemId || "") : "",
      oneDriveFolderStatus: (
        remembered?.oneDriveProjectFolderItemId === itemId &&
        remembered?.oneDriveFolderItemId &&
        remembered?.oneDriveOriginalFolderItemId
      ) ? "ready" : "pending",
      oneDriveFolderError: ""
    };
    saveActiveSession(session);
    restoreCaseBoard(projectName);
    renderSessionPanel();
    notify("activate", session);

    const address = await readFormalProjectAddress({
      driveId,
      itemId,
      id: itemId,
      name: folderName,
      folder: {}
    }, projectNo);
    applyFormalProjectAddressIfEmpty(address);

    await ensureFormalSessionFolder(session);
    if (typeof showToast === "function") showToast(`案件 ${projectNo} を選択しました`);
    return loadRememberedSession(projectNo) || session;
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

  async function ensureFormalSessionFolder(session = getCurrentSession()) {
    if (!session || session.kind !== "formal" || navigator.onLine === false) return null;
    const latest = loadRememberedSession(session.id) || session;
    const connection = window.OneDriveConnection?.getState?.();
    if (!connection?.connected) return null;

    const projectFolderRef = {
      driveId: latest.oneDriveProjectFolderDriveId || latest.oneDriveFolderDriveId,
      itemId: latest.oneDriveProjectFolderItemId || latest.oneDriveFolderItemId,
      id: latest.oneDriveProjectFolderItemId || latest.oneDriveFolderItemId,
      name: latest.folderName,
      folder: {}
    };
    if (!projectFolderRef.driveId || !projectFolderRef.itemId) return null;

    if (
      latest.oneDriveFolderStatus === "ready" &&
      latest.oneDriveProjectFolderItemId &&
      latest.oneDriveFolderItemId &&
      latest.oneDriveOriginalFolderItemId
    ) {
      return {
        driveId: latest.oneDriveFolderDriveId || projectFolderRef.driveId,
        itemId: latest.oneDriveFolderItemId,
        id: latest.oneDriveFolderItemId,
        name: FORMAL_PHOTO_FOLDER_NAME,
        folder: {},
        originalFolder: {
          driveId: latest.oneDriveFolderDriveId || projectFolderRef.driveId,
          itemId: latest.oneDriveOriginalFolderItemId,
          id: latest.oneDriveOriginalFolderItemId,
          name: ORIGINAL_FOLDER_NAME,
          folder: {}
        }
      };
    }

    const key = `${projectFolderRef.driveId}:${projectFolderRef.itemId}:formal-photo-root`;
    if (folderEnsurePromises.has(key)) return folderEnsurePromises.get(key);

    const promise = (async () => {
      const projectFolder = await OneDriveClient.getDriveItem(projectFolderRef);
      if (!projectFolder?.folder || !projectFolder.driveId || !projectFolder.itemId) {
        throw new Error("正式案件のOneDriveフォルダを確認できませんでした。");
      }

      let photoFolder = await OneDriveClient.ensureChildFolder(projectFolder, FORMAL_PHOTO_FOLDER_NAME);
      photoFolder = await OneDriveClient.getDriveItem(photoFolder);
      if (!photoFolder?.folder || !photoFolder.driveId || !photoFolder.itemId) {
        throw new Error("正式案件の採取写真フォルダを確認できませんでした。");
      }

      let originalFolder = await OneDriveClient.ensureChildFolder(photoFolder, ORIGINAL_FOLDER_NAME);
      originalFolder = await OneDriveClient.getDriveItem(originalFolder);
      if (!originalFolder?.folder || !originalFolder.driveId || !originalFolder.itemId) {
        throw new Error("正式案件の元画像フォルダを確認できませんでした。");
      }

      const current = loadRememberedSession(latest.id) || { ...latest };
      current.oneDriveProjectFolderDriveId = projectFolder.driveId;
      current.oneDriveProjectFolderItemId = projectFolder.itemId;
      current.oneDriveFolderDriveId = photoFolder.driveId;
      current.oneDriveFolderItemId = photoFolder.itemId;
      current.oneDriveOriginalFolderItemId = originalFolder.itemId;
      current.oneDriveFolderStatus = "ready";
      current.oneDriveFolderError = "";
      rememberSession(current);
      if (isSameActiveSession(current)) {
        try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(current)); } catch (storageError) {}
      }

      return { ...photoFolder, originalFolder };
    })()
      .catch((error) => {
        const current = loadRememberedSession(latest.id) || { ...latest };
        current.oneDriveProjectFolderDriveId = projectFolderRef.driveId;
        current.oneDriveProjectFolderItemId = projectFolderRef.itemId;
        current.oneDriveFolderStatus = "error";
        current.oneDriveFolderError = error?.message || "正式案件フォルダの確認に失敗しました。";
        rememberSession(current);
        if (isSameActiveSession(current)) {
          try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(current)); } catch (storageError) {}
        }
        console.warn("正式案件OneDriveフォルダの確認に失敗しました", error);
        return null;
      })
      .finally(() => folderEnsurePromises.delete(key));

    folderEnsurePromises.set(key, promise);
    return promise;
  }

  async function ensureCurrentSessionFolder() {
    const session = getCurrentSession();
    if (session.kind === "tutorial") return null;
    return session.kind === "formal" ? ensureFormalSessionFolder(session) : ensureTemporarySessionFolder(session);
  }

  async function changeDeviceName() {
    const current = getDeviceName();
    const next = await AppDialog.input({
      title: "端末名",
      message: "この端末の名前を入力してください。",
      value: current,
      okLabel: "変更",
      cancelLabel: "キャンセル"
    });
    if (next === null || !String(next).trim()) {
      if (next !== null) showErrorToast("端末名を入力してください");
      return;
    }
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
    if (subject) subject.textContent = (session.kind === "formal" || session.kind === "tutorial")
      ? (session.projectName || getCurrentSubject())
      : getCurrentSubject();
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
    activateFormalProject,
    activateTutorialSession,
    endTutorialSession,
    renderSessionPanel,
    getDeviceName,
    setDeviceName,
    changeDeviceName,
    buildFolderName,
    ensureTemporarySessionFolder,
    ensureFormalSessionFolder,
    ensureCurrentSessionFolder,
    subscribe
  });
})();
