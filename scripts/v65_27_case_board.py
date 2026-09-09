from pathlib import Path
import subprocess

ROOT = Path('.')

# board-persistence.js を新設し、board.jsから案件依存保存を分離する
persistence = '''/*
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
'''
(ROOT / 'js/board-persistence.js').write_text(persistence, encoding='utf-8')

# board.js: persistence ownershipを削除、initializeは新モジュールを利用
board_path = ROOT / 'js/board.js'
board = board_path.read_text(encoding='utf-8')
board = board.replace('    const BOARD_FORM_STORAGE_KEY = "electronic-board-camera-board-form-v1";\n    const SAMPLING_NAME_HISTORY_STORAGE_KEY = "electronic-board-camera-sampling-name-history-v1";\n', '', 1)
old_init = '''    function initializeBoard() {
      const savedBoard = loadSavedBoardForm();
      subjectText.value = savedBoard.subject || APP_DATA.subject;
      addressText.value = savedBoard.address || APP_DATA.address;
      syncBoardTextAreaVerticalCenter();
      roomNoInput.value = savedBoard.roomNo || roomNoInput.value || "1-1";
      sampleNoInput.value = savedBoard.sampleNo || sampleNoInput.value || POINT_DISPLAY_DEFAULT;

      if (savedBoard.date && savedBoard.isDateManuallyEdited) {
        dateText.textContent = savedBoard.date;
        isDateManuallyEdited = true;
      } else {
        updateCurrentDate();
      }

      if (savedBoard.boardMode === "sampling" || savedBoard.boardMode === "survey") {
        boardMode = savedBoard.boardMode;
      }

      syncBoardTextareas();
      setStatus(savedBoard.selectedStatus || "visual");
      applyBoardMode();
      setSectionMode(false);
      updatePhotoCount();
      updateSamplingNameHistoryList();
    }'''
new_init = '''    function initializeBoard() {
      BoardPersistence.restoreActiveCaseBoard();
      updatePhotoCount();
    }'''
if old_init not in board:
    raise SystemExit('initializeBoard block not found')
board = board.replace(old_init, new_init, 1)

start = board.index('    function loadSavedBoardForm() {')
end = board.index('    async function renderBoardElementToCanvas(element) {', start)
# Keep setupSamplingNameHistory function only, move persistence/history functions out.
replacement = '''    function setupSamplingNameHistory() {
      updateSamplingNameHistoryList();
    }

'''
board = board[:start] + replacement + board[end:]
board_path.write_text(board, encoding='utf-8')

# case-session.js: switch/new session restores complete board state, not subject only
case_path = ROOT / 'js/case-session.js'
case = case_path.read_text(encoding='utf-8')
case = case.replace('''    const next = createSession();
    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);
    return next;''', '''    const next = createSession();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);
    return next;''', 1)
old_activate_tail = '''    saveActiveSession(session);

    // 現段階では案件情報の正本が未接続なので、件名だけは最新写真の看板値から戻す。
    // 住所・採取場所などの案件別看板状態は全体レビュー後に正式設計する。
    const subject = String(subjectName || "").trim();
    const subjectInput = document.getElementById("subjectText");
    if (subject && subjectInput) {
      subjectInput.value = subject;
      if (typeof syncBoardTextareas === "function") syncBoardTextareas();
      if (typeof saveBoardForm === "function") saveBoardForm();
    }

    renderSessionPanel();'''
new_activate_tail = '''    saveActiveSession(session);

    if (typeof restoreActiveCaseBoard === "function") {
      restoreActiveCaseBoard();
    } else {
      // board-persistence.js未読込時だけ件名を最低限反映する。
      const subject = String(subjectName || "").trim();
      const subjectInput = document.getElementById("subjectText");
      if (subject && subjectInput) subjectInput.value = subject;
    }

    renderSessionPanel();'''
if old_activate_tail not in case:
    raise SystemExit('activate session block not found')
case = case.replace(old_activate_tail, new_activate_tail, 1)
case_path.write_text(case, encoding='utf-8')

# script order: board-persistenceはshared-state後、board.js前
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
needle = '  <script src="./js/shared-state.js"></script>\n'
index = index.replace(needle, needle + '  <script src="./js/board-persistence.js"></script>\n', 1)
index = index.replace('id="settingsVersionText">v65.26<', 'id="settingsVersionText">v65.27<', 1)
index_path.write_text(index, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.26', 'electronic-board-camera-v65.27', 1)
needle = '  "./js/shared-state.js",\n'
sw = sw.replace(needle, needle + '  "./js/board-persistence.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.26";', 'const APP_VERSION = "v65.27";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.26', '# 電子看板カメラ v65.27', 1)
readme += '''\n\n## v65.27 案件別看板状態\n- 看板フォーム保存をcaseId単位へ変更\n- 件名/住所/部屋・採取箇所/試料No./日付/撮影区分/看板種類を案件切替時にまとめて復元\n- 新規案件は前案件の看板を引きずらず初期値から開始\n- 採取箇所履歴も件名キーを廃止しcaseId基準へ変更\n- 旧v1単一看板データは現在案件へ1回だけ移行\n- 保存責務をboard-persistence.jsへ分離\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT / 'docs/v65.27-case-board.md').write_text('''# v65.27 案件別看板状態\n\nトップの「選択中の案件」と実際にカメラで使われる看板状態を一致させるため、看板フォームをcaseId単位で保存する。\n採取箇所履歴もcaseId単位。件名は識別キーに使わない。\n''', encoding='utf-8')

for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('persistence module loaded', './js/board-persistence.js' in index_path.read_text(encoding='utf-8')),
    ('board old key removed', 'BOARD_FORM_STORAGE_KEY' not in board_path.read_text(encoding='utf-8')),
    ('case restore', 'restoreActiveCaseBoard();' in case_path.read_text(encoding='utf-8')),
    ('history case key', 'const key = getActiveCaseId();' in (ROOT/'js/board-persistence.js').read_text(encoding='utf-8')),
    ('version', 'v65.27' in index_path.read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok: raise SystemExit(label + ' validation failed')
print('v65.27 validation passed')
