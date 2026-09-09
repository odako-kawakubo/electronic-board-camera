from pathlib import Path
import subprocess

ROOT = Path('.')

# ------------------------------------------------------------
# OneDrive connection state
# ------------------------------------------------------------
(ROOT / 'js/onedrive-connection.js').write_text(r'''/*
 * ============================================================
 * onedrive-connection.js - OneDrive接続状態の正本
 * ============================================================
 * 責務:
 * - Microsoftログイン状態とは別に、Graph経由でOneDriveへ実アクセス可能か確認する
 * - トップUIへ公開する接続状態を一元管理する
 *
 * v65.31では写真送信・フォルダ生成は行わない。
 * ============================================================
 */
(function () {
  "use strict";

  const listeners = [];
  let generation = 0;
  let initialized = false;
  let state = {
    phase: "unconnected",
    connected: false,
    text: "未接続",
    error: "",
    driveId: ""
  };

  function cloneState() {
    return { ...state };
  }

  function publish(next) {
    state = { ...next };
    listeners.slice().forEach((callback) => callback(cloneState()));
  }

  function getState() {
    return cloneState();
  }

  function subscribe(callback) {
    listeners.push(callback);
    callback(cloneState());
    return () => {
      const index = listeners.indexOf(callback);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function disconnected(text = "未接続", error = "") {
    return { phase: "unconnected", connected: false, text, error, driveId: "" };
  }

  async function fetchDriveRoot(token) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType,webUrl", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error?.message || body?.error?.code || "";
      } catch (error) {}
      const graphError = new Error(detail || `OneDrive接続確認に失敗しました (${response.status})`);
      graphError.status = response.status;
      throw graphError;
    }
    const drive = await response.json();
    if (!drive?.id) throw new Error("OneDriveのdriveIdを確認できませんでした。");
    return drive;
  }

  async function refresh({ force = false } = {}) {
    const currentGeneration = ++generation;

    if (navigator.onLine === false) {
      publish(disconnected("オフライン"));
      return cloneState();
    }

    await GraphSession.initialize().catch(() => null);
    const graph = GraphSession.getState();
    if (!graph.account) {
      publish(disconnected("未接続"));
      return cloneState();
    }

    publish({ phase: "checking", connected: false, text: "確認中", error: "", driveId: "" });

    try {
      const token = await GraphSession.getAccessToken({ allowInteractive: false });
      if (!token) throw new Error("Graphアクセストークンを取得できませんでした。");
      const drive = await fetchDriveRoot(token);
      if (currentGeneration != generation) return cloneState();
      publish({
        phase: "connected",
        connected: true,
        text: "接続",
        error: "",
        driveId: String(drive.id || "")
      });
    } catch (error) {
      if (currentGeneration != generation) return cloneState();
      publish({
        phase: "error",
        connected: false,
        text: "エラー",
        error: error?.message || "OneDriveへ接続できません。",
        driveId: ""
      });
    }
    return cloneState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    GraphSession.subscribe(() => void refresh());
    window.addEventListener("online", () => void refresh({ force: true }));
    window.addEventListener("offline", () => void refresh());
    void refresh();
  }

  window.OneDriveConnection = Object.freeze({ getState, subscribe, refresh, initialize });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# OneDrive top UI
# ------------------------------------------------------------
(ROOT / 'js/onedrive-status-ui.js').write_text(r'''/*
 * ============================================================
 * onedrive-status-ui.js - トップのOneDrive接続表示
 * ============================================================
 */
(function () {
  "use strict";

  const badge = document.getElementById("oneDriveStatusBadge");
  const dot = document.getElementById("oneDriveStatusDot");
  const text = document.getElementById("oneDriveStatusText");

  function render(state) {
    if (!badge || !dot || !text) return;
    const phase = String(state?.phase || "unconnected");
    badge.dataset.phase = phase;
    dot.className = `onedrive-status-dot ${phase}`;
    text.textContent = state?.text || "未接続";
    badge.title = state?.error ? `OneDrive：${state.error}` : `OneDrive：${text.textContent}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    OneDriveConnection.subscribe(render);
    OneDriveConnection.initialize();
  });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# Auth UI: top header ownership / no settings status dependency
# ------------------------------------------------------------
auth_path = ROOT / 'js/microsoft-auth-ui.js'
auth = auth_path.read_text(encoding='utf-8')
auth = auth.replace(' * 設定画面のログイン/アカウント表示だけを担当する。', ' * トップ画面のログイン/アカウント表示だけを担当する。', 1)
auth = auth.replace('  const statusText = document.getElementById("msAuthStatusText");\n', '', 1)
auth = auth.replace('''    if (!signinButton || !accountButton || !statusText) return;''', '''    if (!signinButton || !accountButton) return;''', 1)
start = auth.index('    if (!state?.initialized && state?.error) {')
end = auth.index('  }\n\n  async function loginMicrosoftGraph()', start)
auth = auth[:start] + '  }\n\n' + auth[end+4:]
auth_path.write_text(auth, encoding='utf-8')

# ------------------------------------------------------------
# index: top header + remove settings Microsoft section + scripts/version
# ------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = index.replace('''      <div class="launch-mode-title">電子看板カメラ</div>''', '''      <div class="launch-topbar">
        <div class="launch-mode-title">電子看板カメラ</div>
        <div class="launch-connectivity" aria-label="MicrosoftとOneDriveの接続状態">
          <button id="msAuthButton" class="microsoft-signin-button top-microsoft-button" type="button" onclick="loginMicrosoftGraph()" aria-label="Log in with Microsoft">
            <img src="./assets/microsoft-symbol.svg" alt="" aria-hidden="true" />
            <span class="microsoft-signin-copy"><span>Microsoft</span><strong>Log in</strong></span>
          </button>
          <button id="msAccountButton" class="microsoft-account-button top-microsoft-button" type="button" onclick="logoutMicrosoftGraph()" hidden>
            <img src="./assets/microsoft-symbol.svg" alt="" aria-hidden="true" />
            <span class="microsoft-signin-copy"><span>Microsoft</span><strong id="msAccountName"></strong></span>
          </button>
          <div id="oneDriveStatusBadge" class="onedrive-status-badge" data-phase="unconnected" aria-live="polite">
            <span class="onedrive-status-label">OneDrive</span>
            <span id="oneDriveStatusDot" class="onedrive-status-dot unconnected" aria-hidden="true"></span>
            <strong id="oneDriveStatusText">未接続</strong>
          </div>
        </div>
      </div>''', 1)
settings_section = '''      <div class="settings-section-title">Microsoft</div>
      <div class="settings-version-box microsoft-auth-status-box">
        状態：<strong id="msAuthStatusText">確認中...</strong>
      </div>
      <button id="msAuthButton" class="microsoft-signin-button" type="button" onclick="loginMicrosoftGraph()" aria-label="Log in with Microsoft">
        <img src="./assets/microsoft-symbol.svg" alt="" aria-hidden="true" />
        <span class="microsoft-signin-copy"><span>Microsoft</span><strong>Log in</strong></span>
      </button>
      <button id="msAccountButton" class="microsoft-account-button" type="button" onclick="logoutMicrosoftGraph()" hidden>
        <img src="./assets/microsoft-symbol.svg" alt="" aria-hidden="true" />
        <span class="microsoft-signin-copy"><span>Microsoft</span><strong id="msAccountName"></strong></span>
      </button>

'''
if settings_section not in index:
    raise SystemExit('settings Microsoft section not found')
index = index.replace(settings_section, '', 1)
script_marker = '  <script src="./js/microsoft-auth-ui.js"></script>\n'
if script_marker not in index:
    raise SystemExit('auth script marker missing')
index = index.replace(script_marker, script_marker + '  <script src="./js/onedrive-connection.js"></script>\n  <script src="./js/onedrive-status-ui.js"></script>\n', 1)
index = index.replace('id="settingsVersionText">v65.30<', 'id="settingsVersionText">v65.31<', 1)
index_path.write_text(index, encoding='utf-8')

# ------------------------------------------------------------
# CSS: top bar + compact Microsoft button + shira-be-like status colors
# ------------------------------------------------------------
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
css += r'''

    /* v65.31 トップ接続ヘッダー */
    .launch-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: clamp(10px, 2.2vh, 18px);
    }
    .launch-topbar .launch-mode-title { margin-bottom: 0; text-align: left; flex: 0 0 auto; }
    .launch-connectivity {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    .top-microsoft-button {
      width: auto;
      max-width: 205px;
      min-height: 40px;
      padding: 5px 10px;
      border-radius: 8px;
      flex: 0 1 auto;
    }
    .top-microsoft-button img { width: 20px; height: 20px; flex-basis: 20px; }
    .top-microsoft-button .microsoft-signin-copy > span { font-size: 9px; }
    .top-microsoft-button .microsoft-signin-copy > strong { font-size: 12px; }
    .onedrive-status-badge {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 9px;
      background: rgba(255,255,255,.07);
      color: #fff;
      font-size: 12px;
      white-space: nowrap;
    }
    .onedrive-status-label { font-weight: 800; }
    .onedrive-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #7b8491;
      box-shadow: 0 0 0 2px rgba(255,255,255,.08);
      flex: 0 0 10px;
    }
    .onedrive-status-dot.connected { background: #2ecc71; }
    .onedrive-status-dot.checking { background: #f2b84b; }
    .onedrive-status-dot.error { background: #e05252; }
    .onedrive-status-dot.unconnected { background: #7b8491; }

    @media (orientation: landscape) and (max-height: 500px) {
      .launch-topbar { margin-bottom: 7px; gap: 8px; }
      .top-microsoft-button { min-height: 34px; padding: 3px 8px; max-width: 180px; }
      .onedrive-status-badge { min-height: 34px; padding: 4px 8px; font-size: 11px; }
    }

    @media (max-width: 560px) {
      .launch-topbar { align-items: flex-start; }
      .launch-connectivity { gap: 5px; }
      .top-microsoft-button { max-width: 145px; padding: 4px 7px; }
      .top-microsoft-button .microsoft-signin-copy > span { display: none; }
      .top-microsoft-button .microsoft-signin-copy > strong { font-size: 11px; }
      .onedrive-status-badge { padding: 5px 7px; font-size: 10px; }
    }
'''
css_path.write_text(css, encoding='utf-8')

# ------------------------------------------------------------
# SW / version / docs
# ------------------------------------------------------------
sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.30', 'electronic-board-camera-v65.31', 1)
marker = '  "./js/microsoft-auth-ui.js",\n'
if marker not in sw:
    raise SystemExit('SW auth marker missing')
sw = sw.replace(marker, marker + '  "./js/onedrive-connection.js",\n  "./js/onedrive-status-ui.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.30";', 'const APP_VERSION = "v65.31";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.30', '# 電子看板カメラ v65.31', 1)
readme += '''\n\n## v65.31 OneDrive接続表示\n- Microsoftログイン表示を設定画面からトップタイトル横へ移動\n- トップを「電子看板カメラ / Microsoft / OneDrive接続状態」に統一\n- `onedrive-connection.js` を追加し、Microsoft認証とOneDrive実接続を別状態として管理\n- Graph `/me/drive` の実アクセス成功時だけOneDriveを「接続」にする\n- 接続色: 緑=接続、黄=確認中、灰=未接続/オフライン、赤=エラー\n- 写真送信・再送はまだ行わない\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT / 'docs/v65.31-onedrive-connection.md').write_text('''# v65.31 OneDrive接続表示\n\nMicrosoftログイン状態とOneDrive接続状態を分離する。\nトップは `電子看板カメラ [Microsoft] OneDrive ● 接続状態`。\nOneDriveはGraph `/me/drive` の実アクセスが成功した場合のみconnected。\n''', encoding='utf-8')

# validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

html = index_path.read_text(encoding='utf-8')
checks = [
    ('top auth', 'class="launch-connectivity"' in html and 'id="msAuthButton"' in html),
    ('single login button', html.count('id="msAuthButton"') == 1),
    ('onedrive badge', 'id="oneDriveStatusBadge"' in html),
    ('drive endpoint', '/me/drive?$select=id,driveType,webUrl' in (ROOT/'js/onedrive-connection.js').read_text(encoding='utf-8')),
    ('separate state', 'window.OneDriveConnection' in (ROOT/'js/onedrive-connection.js').read_text(encoding='utf-8')),
    ('scripts loaded', './js/onedrive-status-ui.js' in html),
    ('version', 'v65.31' in html),
    ('db unchanged', 'const DB_VERSION = 2;' in (ROOT/'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.31 validation passed')
