/*
 * ============================================================
 * board-persistence.js - 案件別看板状態 / 採取箇所履歴
 * ============================================================
 * 責務:
 * - 看板フォームを caseId ごとにlocalStorageへ保存・復元する
 * - 採取箇所履歴も caseId ごとに保持する
 * - 旧v1の単一看板データは最初の案件へ1回だけ移行する
 *
 * 保守上の注意:
 * - 画面描画や編集UIはboard.jsの責務。
 * - 件名は識別キーに使わない。
 * ============================================================
 */

(function () {
  "use strict";

  const LEGACY_BOARD_FORM_STORAGE_KEY = "electronic-board-camera-board-form-v1";
  const BOARD_FORM_STORAGE_PREFIX = "electronic-board-camera-board-form-v2:";
  const BOARD_FORM_MIGRATION_KEY = "electronic-board-camera-board-form-v2-migrated";
  const SAMPLING_NAME_HISTORY_STORAGE_KEY = "electronic-board-camera-sampling-name-history-v2";

  function getActiveCaseId() {
    const session = window.CaseSession ? CaseSession.getCurrentSession() : null;
    return session && session.id ? String(session.id) : "default";
  }

  function getBoardStorageKey(caseId = getActiveCaseId()) {
    return BOARD_FORM_STORAGE_PREFIX + String(caseId || "default");
  }

  function loadSavedBoardForm() {
    try {
      const key = getBoardStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);

      // 旧単一データは、初回だけ現在案件へ移す。別案件作成時には再利用しない。
      if (localStorage.getItem(BOARD_FORM_MIGRATION_KEY) !== "1") {
        const legacyRaw = localStorage.getItem(LEGACY_BOARD_FORM_STORAGE_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw);
          localStorage.setItem(key, JSON.stringify(legacy));
          localStorage.setItem(BOARD_FORM_MIGRATION_KEY, "1");
          return legacy;
        }
        localStorage.setItem(BOARD_FORM_MIGRATION_KEY, "1");
      }
    } catch (error) {}
    return {};
  }

  function saveBoardForm() {
    try {
      const data = {
        subject: subjectText ? subjectText.value : "",
        address: addressText ? addressText.value : "",
        roomNo: roomNoInput ? roomNoInput.value : "",
        sampleNo: sampleNoInput ? sampleNoInput.value : "",
        date: dateText ? dateText.textContent : "",
        isDateManuallyEdited,
        selectedStatus,
        boardMode,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(getBoardStorageKey(), JSON.stringify(data));
      if (typeof scheduleBoardPreviewRender === "function") scheduleBoardPreviewRender();
      if (window.CaseSession && typeof CaseSession.renderSessionPanel === "function") {
        CaseSession.renderSessionPanel();
      }
    } catch (error) {}
  }

  function applySavedBoardForm(savedBoard = {}) {
    subjectText.value = savedBoard.subject || APP_DATA.subject;
    addressText.value = savedBoard.address || APP_DATA.address;
    roomNoInput.value = savedBoard.roomNo || "1-1";
    sampleNoInput.value = savedBoard.sampleNo || POINT_DISPLAY_DEFAULT;

    if (savedBoard.date && savedBoard.isDateManuallyEdited) {
      dateText.textContent = savedBoard.date;
      isDateManuallyEdited = true;
    } else {
      isDateManuallyEdited = false;
      updateCurrentDate();
    }

    boardMode = savedBoard.boardMode === "sampling" ? "sampling" : "survey";
    selectedStatus = savedBoard.selectedStatus || "visual";

    syncBoardTextAreaVerticalCenter();
    syncBoardTextareas();
    applyBoardMode();
    setStatus(selectedStatus);
    setSectionMode(false);
    updateSamplingNameHistoryList();
    placeBoardByFixedPosition();
    scheduleBoardPreviewRender();
    if (window.CaseSession && typeof CaseSession.renderSessionPanel === "function") {
      CaseSession.renderSessionPanel();
    }
  }

  function restoreActiveCaseBoard() {
    applySavedBoardForm(loadSavedBoardForm());
  }

  function loadSamplingNameHistoryMap() {
    try {
      const raw = localStorage.getItem(SAMPLING_NAME_HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function saveSamplingNameHistoryMap(map) {
    try {
      localStorage.setItem(SAMPLING_NAME_HISTORY_STORAGE_KEY, JSON.stringify(map));
    } catch (error) {}
  }

  function getSamplingNameHistoryForCurrentCase() {
    const map = loadSamplingNameHistoryMap();
    const key = getActiveCaseId();
    const list = Array.isArray(map[key]) ? map[key] : [];
    return list.filter(Boolean).slice(0, 12);
  }

  function saveSamplingNameHistoryForCurrentCase(value) {
    const name = String(value || "").trim();
    if (!name) return;
    const key = getActiveCaseId();
    const map = loadSamplingNameHistoryMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    map[key] = [name, ...list.filter((item) => item !== name)].slice(0, 20);
    saveSamplingNameHistoryMap(map);
    updateSamplingNameHistoryList();
  }

  function updateSamplingNameHistoryList() {
    if (!samplingNameHistoryList) return;
    samplingNameHistoryList.innerHTML = "";
    getSamplingNameHistoryForCurrentCase().forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      samplingNameHistoryList.appendChild(option);
    });
  }

  window.BoardPersistence = Object.freeze({
    loadSavedBoardForm,
    saveBoardForm,
    restoreActiveCaseBoard,
    getSamplingNameHistoryForCurrentCase,
    saveSamplingNameHistoryForCurrentCase,
    updateSamplingNameHistoryList
  });

  // classic script互換: 既存inline/他モジュール呼び出し名を維持
  window.loadSavedBoardForm = loadSavedBoardForm;
  window.saveBoardForm = saveBoardForm;
  window.restoreActiveCaseBoard = restoreActiveCaseBoard;
  window.getSamplingNameHistoryForCurrentCase = getSamplingNameHistoryForCurrentCase;
  window.saveSamplingNameHistoryForCurrentCase = saveSamplingNameHistoryForCurrentCase;
  window.updateSamplingNameHistoryList = updateSamplingNameHistoryList;
})();
