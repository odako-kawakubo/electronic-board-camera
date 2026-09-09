/*
 * ============================================================
 * case-session.js - 撮影セッション / 仮案件ID
 * ============================================================
 * 責務:
 * - 現段階の案件識別として yymmdd_枝番 の仮案件IDを発番・保持する
 * - 端末名を保持し、将来のOneDrive保存先フォルダ名を生成する
 * - トップ画面へ現在の選択案件を表示し、新規案件・案件切替を管理する
 *
 * 将来:
 * - projectIdによる正式案件選択へ置換する。camera.jsはCaseSessionの公開APIだけを見る。
 * - 件名は識別キーにしない。件名変更で写真所属や保存先が変わらないようにする。
 * ============================================================
 */

(function () {
  "use strict";

  const ACTIVE_KEY = "electronic-board-camera-active-case-session-v1";
  const COUNTER_PREFIX = "electronic-board-camera-case-session-counter-v1-";
  const DEVICE_NAME_KEY = "electronic-board-camera-device-name-v1";

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

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
    try {
      localStorage.setItem(DEVICE_NAME_KEY, next);
    } catch (error) {}

    const current = getCurrentSession();
    if (current) {
      current.deviceName = next;
      current.folderName = buildFolderName(next, current.id);
      saveActiveSession(current);
    }
    renderSessionPanel();
    return next;
  }

  function buildFolderName(deviceName, caseId) {
    return `${sanitizeFolderPart(deviceName)}_${sanitizeFolderPart(caseId)}`;
  }

  function loadActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.id || !parsed.dateCode || !parsed.branch) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function saveActiveSession(session) {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
    } catch (error) {}
  }

  function nextBranch(dateCode) {
    const key = COUNTER_PREFIX + dateCode;
    let current = 0;
    try {
      current = Number(localStorage.getItem(key) || 0);
    } catch (error) {}
    const next = Math.max(0, current) + 1;
    try {
      localStorage.setItem(key, String(next));
    } catch (error) {}
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
      kind: "temporary"
    };
    saveActiveSession(session);
    renderSessionPanel();
    return session;
  }

  function getCurrentSession() {
    // v65.23: 日付が変わっても勝手に案件を切り替えない。
    // 再起動・スリープ復帰時は「最後に選択していた案件」をそのまま確認できることを優先する。
    let session = loadActiveSession();
    if (!session) session = createSession();
    return session;
  }

  function startNewSession() {
    const current = getCurrentSession();
    const ok = window.confirm(
      `現在：${current.id}\n\n同日の別案件として新しい撮影セッションを開始しますか？`
    );
    if (!ok) return current;
    const next = createSession();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);
    return next;
  }

  function activateSession(caseId, subjectName = "") {
    const id = String(caseId || "").trim();
    const match = id.match(/^(\d{6})_(\d+)$/);
    if (!match) return getCurrentSession();

    const deviceName = getDeviceName();
    const session = {
      id,
      dateCode: match[1],
      branch: Number(match[2]),
      deviceName,
      folderName: buildFolderName(deviceName, id),
      createdAt: new Date().toISOString(),
      kind: "temporary"
    };
    saveActiveSession(session);

    if (typeof restoreActiveCaseBoard === "function") {
      restoreActiveCaseBoard();
    } else {
      // board-persistence.js未読込時だけ件名を最低限反映する。
      const subject = String(subjectName || "").trim();
      const subjectInput = document.getElementById("subjectText");
      if (subject && subjectInput) subjectInput.value = subject;
    }

    renderSessionPanel();
    if (typeof showToast === "function") showToast(`案件 ${id} を選択しました`);
    return session;
  }

  function changeDeviceName() {
    const current = getDeviceName();
    const next = window.prompt("この端末の名前を入力してください", current);
    if (next === null || !String(next).trim()) return;
    const saved = setDeviceName(next);
    if (typeof showToast === "function") showToast(`端末名を ${saved} にしました`);
  }

  function getCurrentSubject() {
    const subjectInput = document.getElementById("subjectText");
    const value = subjectInput ? subjectInput.value : "";
    return String(value || "").trim() || "無題案件";
  }

  function renderSessionPanel() {
    const session = getCurrentSession();
    const id = document.getElementById("launchCurrentCaseId");
    const subject = document.getElementById("launchCurrentCaseSubject");
    const device = document.getElementById("settingsDeviceNameText");
    if (id) id.textContent = session.id;
    if (subject) subject.textContent = getCurrentSubject();
    if (device) device.textContent = session.deviceName || getDeviceName();
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

    // board.jsの初期復元後の値もトップへ反映する。
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
    buildFolderName
  });
})();
