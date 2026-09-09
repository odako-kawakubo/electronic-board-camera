from pathlib import Path
import subprocess

ROOT = Path('.')

case_session_path = ROOT / 'js/case-session.js'
index_path = ROOT / 'index.html'
camera_path = ROOT / 'js/camera.js'
sw_path = ROOT / 'service-worker.js'
pwa_path = ROOT / 'js/pwa-controller.js'
readme_path = ROOT / 'README.md'
doc_path = ROOT / 'docs/v65.21-case-session.md'

case_session = r'''/*
 * ============================================================
 * case-session.js - 撮影セッション / 仮案件ID
 * ============================================================
 * 責務:
 * - 現段階の案件識別として yymmdd_枝番 の仮案件IDを発番・保持する
 * - 端末名を保持し、将来のOneDrive保存先フォルダ名を生成する
 * - 起動画面へ現在セッションと新規セッション開始UIを表示する
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
    const today = formatDateCode();
    let session = loadActiveSession();
    if (!session || session.dateCode !== today) {
      session = createSession();
    }
    return session;
  }

  function startNewSession() {
    const current = getCurrentSession();
    const ok = window.confirm(
      `現在：${current.id}\n\n同日の別案件として新しい撮影セッションを開始しますか？`
    );
    if (!ok) return current;
    const next = createSession();
    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);
    return next;
  }

  function changeDeviceName() {
    const current = getDeviceName();
    const next = window.prompt("この端末の名前を入力してください", current);
    if (next === null || !String(next).trim()) return;
    const saved = setDeviceName(next);
    if (typeof showToast === "function") showToast(`端末名を ${saved} にしました`);
  }

  function ensureSessionPanel() {
    const card = document.querySelector(".launch-mode-card");
    const actions = document.querySelector(".launch-mode-actions");
    if (!card || !actions || document.getElementById("launchCaseSessionPanel")) return;

    const panel = document.createElement("div");
    panel.id = "launchCaseSessionPanel";
    panel.className = "launch-case-session-panel";
    panel.innerHTML = `
      <div class="launch-case-session-label">撮影セッション</div>
      <div id="launchCaseSessionId" class="launch-case-session-id"></div>
      <div id="launchCaseSessionFolder" class="launch-case-session-folder"></div>
      <div class="launch-case-session-actions">
        <button type="button" class="launch-session-button" onclick="CaseSession.startNewSession()">新しい撮影を開始</button>
        <button type="button" class="launch-session-button secondary" onclick="CaseSession.changeDeviceName()">端末名変更</button>
      </div>
    `;
    card.insertBefore(panel, actions);
  }

  function renderSessionPanel() {
    ensureSessionPanel();
    const session = getCurrentSession();
    const id = document.getElementById("launchCaseSessionId");
    const folder = document.getElementById("launchCaseSessionFolder");
    if (id) id.textContent = session.id;
    if (folder) folder.textContent = `保存先予定：${session.folderName}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    getCurrentSession();
    renderSessionPanel();
  });

  window.CaseSession = Object.freeze({
    getCurrentSession,
    startNewSession,
    getDeviceName,
    setDeviceName,
    changeDeviceName,
    buildFolderName
  });
})();
'''
case_session_path.write_text(case_session, encoding='utf-8')

index = index_path.read_text(encoding='utf-8')
script_marker = '<script src="./js/photo-store.js"></script>'
if script_marker not in index:
    raise SystemExit('photo-store script marker not found')
if './js/case-session.js' not in index:
    index = index.replace(script_marker, script_marker + '\n  <script src="./js/case-session.js"></script>', 1)
index = index.replace('id="settingsVersionText">v65.20<', 'id="settingsVersionText">v65.21<', 1)
index_path.write_text(index, encoding='utf-8')

camera = camera_path.read_text(encoding='utf-8')
photo_marker = '''        const photo = {\n          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,'''
if photo_marker not in camera:
    raise SystemExit('camera photo marker not found')
photo_replace = '''        const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;\n        const photo = {\n          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,'''
camera = camera.replace(photo_marker, photo_replace, 1)
field_marker = '''          subjectName: getCurrentSubjectName(),\n          isSection: photoType.value === SECTION_PHOTO_TYPE.value,'''
if field_marker not in camera:
    raise SystemExit('camera field marker not found')
field_replace = '''          subjectName: getCurrentSubjectName(),\n          // 撮影時点の所属セッションを固定する。件名変更で所属や保存先を変えない。\n          caseId: caseSession ? caseSession.id : "",\n          caseDate: caseSession ? caseSession.dateCode : "",\n          caseBranch: caseSession ? caseSession.branch : null,\n          deviceName: caseSession ? caseSession.deviceName : "",\n          oneDriveFolderName: caseSession ? caseSession.folderName : "",\n          uploadStatus: "pending",\n          uploadedAt: "",\n          oneDriveItemId: "",\n          isSection: photoType.value === SECTION_PHOTO_TYPE.value,'''
camera = camera.replace(field_marker, field_replace, 1)
camera_path.write_text(camera, encoding='utf-8')

# Launch panel styling. Keep it scoped to the new session panel.
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
if '.launch-case-session-panel {' not in css:
    css += r'''

    /* v65.21 撮影セッション */
    .launch-case-session-panel {
      margin-top: 18px;
      padding: 14px 16px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 14px;
      background: rgba(255,255,255,.07);
      text-align: left;
    }
    .launch-case-session-label {
      font-size: 13px;
      opacity: .72;
    }
    .launch-case-session-id {
      margin-top: 3px;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: .04em;
    }
    .launch-case-session-folder {
      margin-top: 4px;
      font-size: 12px;
      opacity: .75;
      overflow-wrap: anywhere;
    }
    .launch-case-session-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .launch-session-button {
      flex: 1;
      min-height: 38px;
      border: 0;
      border-radius: 10px;
      font: 800 13px/1.2 inherit;
      cursor: pointer;
    }
    .launch-session-button.secondary {
      opacity: .82;
    }
'''
css_path.write_text(css, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace('electronic-board-camera-v65.20', 'electronic-board-camera-v65.21', 1)
sw_marker = '  "./js/photo-store.js",\n'
if sw_marker not in sw:
    raise SystemExit('service worker photo-store marker not found')
if '"./js/case-session.js"' not in sw:
    sw = sw.replace(sw_marker, sw_marker + '  "./js/case-session.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

pwa = pwa_path.read_text(encoding='utf-8')
pwa = pwa.replace('const APP_VERSION = "v65.20";', 'const APP_VERSION = "v65.21";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme = readme_path.read_text(encoding='utf-8')
readme = readme.replace('# 電子看板カメラ v65.20', '# 電子看板カメラ v65.21', 1)
if '## v65.21 撮影セッション基盤' not in readme:
    readme += '''\n\n## v65.21 撮影セッション基盤\n- 現段階の仮案件IDとして `yymmdd_枝番` を採用\n- 同日2案件目以降は `_02`, `_03` と明示的に新規セッション開始\n- 端末名をローカル保持し、保存先予定名を `端末名_yymmdd_枝番` で生成\n- 件名は識別キーに使わない\n- 撮影写真へ `caseId / caseDate / caseBranch / deviceName / oneDriveFolderName` を固定保存\n- OneDrive用の `uploadStatus / uploadedAt / oneDriveItemId` を先行追加（送信自体は未実装）\n- 日付が変わった場合は当日 `_01` セッションを自動開始\n- DB schema/versionは変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')

doc_path.write_text('''# v65.21 撮影セッション基盤\n\n## 現段階\n- 仮案件ID: `yymmdd_枝番`\n- 保存先予定: `03 サンプリング / サンプリング写真 / 端末名_yymmdd_枝番`\n- 件名は識別キーにしない。\n\n## 将来\n案件選択時に `projectId` を正式案件IDとして設定し、案件情報から看板を生成、保存先を案件フォルダ内の採取写真へ切り替える。\n\n## OneDrive\nこの版では認証・アップロードは実装しない。写真レコードに将来必要な送信状態フィールドだけ持たせる。\n''', encoding='utf-8')

for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('case-session script', './js/case-session.js' in index_path.read_text(encoding='utf-8')),
    ('case id photo field', 'caseId: caseSession ? caseSession.id' in camera_path.read_text(encoding='utf-8')),
    ('pending upload field', 'uploadStatus: "pending"' in camera_path.read_text(encoding='utf-8')),
    ('sw cache', 'electronic-board-camera-v65.21' in sw_path.read_text(encoding='utf-8')),
    ('app version', 'const APP_VERSION = "v65.21";' in pwa_path.read_text(encoding='utf-8')),
    ('db untouched', 'const DB_VERSION = 2;' in (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.21 case session validation passed')
