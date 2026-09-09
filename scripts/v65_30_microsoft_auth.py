from pathlib import Path
import subprocess

ROOT = Path('.')

# ------------------------------------------------------------
# Microsoft config (しらべと同じEntra app)
# ------------------------------------------------------------
(ROOT / 'js/microsoft-config.js').write_text(r'''/*
 * ============================================================
 * microsoft-config.js - Microsoft Graph認証設定
 * ============================================================
 * しらべと同じEntraアプリ登録を共用する。
 * ブラウザSPAなのでclient secretは持たない。
 */
(function () {
  "use strict";
  window.MicrosoftConfig = Object.freeze({
    graphClientId: "f7074fad-6ea0-467b-98db-e308f01950cc",
    tenantId: "538265b8-8d15-49ef-9d51-ca252954de1d",
    graphScopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
  });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# Graph session - しらべgraph-session.jsをclassic script向けに移植
# ------------------------------------------------------------
(ROOT / 'js/graph-session.js').write_text(r'''/*
 * ============================================================
 * graph-session.js - Microsoft Graph専用セッション
 * ============================================================
 * しらべと同じ MSAL browser / redirect / localStorage 構成。
 * OneDrive送信処理はここへ入れない。
 */
(function () {
  "use strict";

  const PRIMARY_MSAL = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js";
  const FALLBACK_MSAL = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js";
  const listeners = [];
  let msalClient = null;
  let initPromise = null;
  let state = { initialized: false, account: null, tokenReady: false, error: "" };

  function cloneState() {
    return { ...state, account: state.account ? { ...state.account } : null };
  }

  function accountKey(account) {
    return [account?.homeAccountId || "", account?.username || "", account?.name || ""].join("|");
  }

  function publish(patch = {}) {
    const next = { ...state, ...patch };
    const changed = next.initialized !== state.initialized
      || next.tokenReady !== state.tokenReady
      || next.error !== state.error
      || accountKey(next.account) !== accountKey(state.account);
    state = next;
    if (!changed) return;
    listeners.slice().forEach((callback) => callback(cloneState()));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.msal) return resolve();
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`MSALライブラリを読み込めませんでした: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`MSALライブラリを読み込めませんでした: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureMsalLibrary() {
    if (window.msal) return;
    try {
      await loadScript(PRIMARY_MSAL);
    } catch (error) {
      await loadScript(FALLBACK_MSAL);
    }
    if (!window.msal) throw new Error("MSALライブラリを読み込めませんでした。");
  }

  function activeAccount() {
    if (!msalClient) return null;
    const active = msalClient.getActiveAccount?.();
    if (active) return active;
    const account = msalClient.getAllAccounts?.()?.[0] || null;
    if (account) msalClient.setActiveAccount(account);
    return account;
  }

  async function initialize() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        await ensureMsalLibrary();
        const config = window.MicrosoftConfig;
        if (!config?.graphClientId || !config?.tenantId) throw new Error("Microsoft認証設定がありません。");

        msalClient = new window.msal.PublicClientApplication({
          auth: {
            clientId: config.graphClientId,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
            redirectUri: window.location.origin + window.location.pathname
          },
          cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false }
        });

        try {
          const redirectResult = await msalClient.handleRedirectPromise();
          if (redirectResult?.account) msalClient.setActiveAccount(redirectResult.account);
        } catch (error) {
          publish({ error: error?.message || "Microsoftログイン結果を処理できませんでした。" });
        }

        const account = activeAccount();
        publish({ initialized: true, account, tokenReady: false });
        return cloneState();
      } catch (error) {
        publish({ initialized: false, account: null, tokenReady: false, error: error?.message || "Graphセッションを初期化できませんでした。" });
        initPromise = null;
        throw error;
      }
    })();
    return initPromise;
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

  async function login() {
    await initialize();
    const account = activeAccount();
    if (account) {
      publish({ account, error: "" });
      return account;
    }
    await msalClient.loginRedirect({
      scopes: window.MicrosoftConfig.graphScopes,
      prompt: "select_account"
    });
    return null;
  }

  async function getAccessToken({ allowInteractive = false } = {}) {
    await initialize();
    const account = activeAccount();
    if (!account) {
      publish({ account: null, tokenReady: false });
      const error = new Error("Microsoft Graphへログインしていません。");
      error.code = "GRAPH_LOGIN_REQUIRED";
      throw error;
    }

    try {
      const result = await msalClient.acquireTokenSilent({
        scopes: window.MicrosoftConfig.graphScopes,
        account
      });
      const token = result?.accessToken || "";
      if (!token) throw new Error("Graphアクセストークンが空です。");
      publish({ account, tokenReady: true, error: "" });
      return token;
    } catch (error) {
      publish({ account, tokenReady: false, error: error?.message || "Graphトークンを取得できませんでした。" });
      if (allowInteractive) {
        await msalClient.acquireTokenRedirect({
          scopes: window.MicrosoftConfig.graphScopes,
          account
        });
        return "";
      }
      const wrapped = new Error("Microsoft Graphトークンを取得できませんでした。再接続してください。");
      wrapped.code = "GRAPH_TOKEN_ACQUIRE_FAILED";
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async function logout() {
    await initialize();
    const account = activeAccount();
    publish({ account: null, tokenReady: false, error: "" });
    if (!account) return;
    await msalClient.logoutRedirect({
      account,
      postLogoutRedirectUri: window.location.origin + window.location.pathname
    });
  }

  window.GraphSession = Object.freeze({ initialize, getState, subscribe, login, getAccessToken, logout });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# Auth UI
# ------------------------------------------------------------
(ROOT / 'js/microsoft-auth-ui.js').write_text(r'''/*
 * ============================================================
 * microsoft-auth-ui.js - Microsoftログイン表示
 * ============================================================
 * 設定画面のログイン/アカウント表示だけを担当する。
 */
(function () {
  "use strict";

  const signinButton = document.getElementById("msAuthButton");
  const accountButton = document.getElementById("msAccountButton");
  const accountName = document.getElementById("msAccountName");
  const statusText = document.getElementById("msAuthStatusText");

  function displayAccountName(account) {
    return String(account?.name || account?.username || "Microsoftアカウント").trim();
  }

  function render(state) {
    if (!signinButton || !accountButton || !statusText) return;
    const loggedIn = Boolean(state?.account);
    signinButton.hidden = loggedIn;
    accountButton.hidden = !loggedIn;
    if (accountName) accountName.textContent = loggedIn ? displayAccountName(state.account) : "";

    if (!state?.initialized && state?.error) {
      statusText.textContent = navigator.onLine === false ? "オフライン（ログイン確認不可）" : "認証準備エラー";
    } else if (!loggedIn) {
      statusText.textContent = "未ログイン";
    } else if (state.tokenReady) {
      statusText.textContent = "ログイン済み・Graph接続可";
    } else if (navigator.onLine === false) {
      statusText.textContent = "ログイン済み（オフライン）";
    } else {
      statusText.textContent = "ログイン済み";
    }
  }

  async function loginMicrosoftGraph() {
    try {
      await GraphSession.login();
    } catch (error) {
      console.error("Microsoftログイン開始失敗", error);
      showErrorToast("Microsoftログインを開始できませんでした");
    }
  }

  async function logoutMicrosoftGraph() {
    const state = GraphSession.getState();
    if (!state.account) return;
    const ok = window.confirm(`${displayAccountName(state.account)}\n\nMicrosoftからログアウトしますか？`);
    if (!ok) return;
    try {
      await GraphSession.logout();
    } catch (error) {
      console.error("Microsoftログアウト失敗", error);
      showErrorToast("Microsoftログアウトに失敗しました");
    }
  }

  async function verifyMicrosoftGraphSession() {
    try {
      await GraphSession.initialize();
      const state = GraphSession.getState();
      if (state.account && navigator.onLine !== false) {
        await GraphSession.getAccessToken().catch(() => null);
      }
    } catch (error) {
      // 認証が使えない状態でも、カメラPWA本体の起動は止めない。
      console.log("Microsoft認証初期化をスキップ", error);
    }
    render(GraphSession.getState());
  }

  window.loginMicrosoftGraph = loginMicrosoftGraph;
  window.logoutMicrosoftGraph = logoutMicrosoftGraph;
  window.verifyMicrosoftGraphSession = verifyMicrosoftGraphSession;

  document.addEventListener("DOMContentLoaded", () => {
    GraphSession.subscribe(render);
    void verifyMicrosoftGraphSession();
  });

  window.addEventListener("online", () => void verifyMicrosoftGraphSession());
  window.addEventListener("offline", () => render(GraphSession.getState()));
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# Microsoft symbol: しらべと同じSVG
# ------------------------------------------------------------
assets = ROOT / 'assets'
assets.mkdir(exist_ok=True)
(assets / 'microsoft-symbol.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" role="img" aria-label="Microsoft">
  <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
  <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
  <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
  <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
</svg>
''', encoding='utf-8')

# ------------------------------------------------------------
# index.html: settings UI + script order + version
# ------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
marker = '''      <div class="settings-section-title">🔄 アプリ更新</div>'''
section = '''      <div class="settings-section-title">Microsoft</div>
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
if marker not in index:
    raise SystemExit('settings Microsoft insertion marker not found')
index = index.replace(marker, section + marker, 1)

script_marker = '  <script src="./js/photo-store.js"></script>\n'
if script_marker not in index:
    raise SystemExit('script marker not found')
auth_scripts = '''  <script src="./js/microsoft-config.js"></script>
  <script src="./js/graph-session.js"></script>
  <script src="./js/microsoft-auth-ui.js"></script>
'''
index = index.replace(script_marker, auth_scripts + script_marker, 1)
index = index.replace('id="settingsVersionText">v65.29<', 'id="settingsVersionText">v65.30<', 1)
index_path.write_text(index, encoding='utf-8')

# ------------------------------------------------------------
# CSS
# ------------------------------------------------------------
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
css += r'''

    /* v65.30 Microsoftログイン - しらべと同じMicrosoftシンボル/2段表記 */
    .microsoft-auth-status-box { margin-bottom: 8px; }
    .microsoft-signin-button,
    .microsoft-account-button {
      width: 100%;
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      padding: 7px 14px;
      border: 1px solid #8a8a8a;
      border-radius: 8px;
      background: #fff;
      color: #1f1f1f;
      cursor: pointer;
      font: inherit;
      box-shadow: 0 1px 2px rgba(0,0,0,.08);
    }
    .microsoft-signin-button[hidden],
    .microsoft-account-button[hidden] { display: none; }
    .microsoft-signin-button img,
    .microsoft-account-button img { width: 23px; height: 23px; flex: 0 0 23px; }
    .microsoft-signin-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.05;
    }
    .microsoft-signin-copy > span { font-size: 10px; color: #555; }
    .microsoft-signin-copy > strong {
      max-width: 100%;
      margin-top: 2px;
      font-size: 15px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
'''
css_path.write_text(css, encoding='utf-8')

# ------------------------------------------------------------
# SW / version / docs
# ------------------------------------------------------------
sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.29', 'electronic-board-camera-v65.30', 1)
cache_marker = '  "./js/photo-store.js",\n'
if cache_marker not in sw:
    raise SystemExit('SW marker not found')
sw = sw.replace(cache_marker, '''  "./js/microsoft-config.js",
  "./js/graph-session.js",
  "./js/microsoft-auth-ui.js",
  "./assets/microsoft-symbol.svg",
''' + cache_marker, 1)
sw_path.write_text(sw, encoding='utf-8')

pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.29";', 'const APP_VERSION = "v65.30";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.29', '# 電子看板カメラ v65.30', 1)
readme += '''\n\n## v65.30 Microsoftログイン基盤\n- しらべと同じEntraアプリ登録 / clientId / tenantId / Graph scopesを使用\n- MSAL Browser 2.38.3、redirectログイン、localStorageセッション保持を採用\n- `prompt: select_account` でMicrosoftアカウント選択\n- 設定画面にしらべと同じMicrosoftシンボルを使ったログイン表示を追加\n- ログイン済みアカウント名、Graphトークン取得可否を表示\n- オフラインやMSAL読込失敗でもカメラPWA本体の起動を止めない\n- OneDrive写真送信はv65.31以降。DB schemaは変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT / 'docs/v65.30-microsoft-auth.md').write_text('''# v65.30 Microsoftログイン基盤\n\nしらべと同じMicrosoft Graph認証方式を単体カメラへ導入。\n認証と写真送信を分離し、この版ではログイン/ログアウト/セッション復元/トークン確認だけを行う。\n\nEntra SPA redirect URI:\n- https://odako-kawakubo.github.io/electronic-board-camera/review/\n- https://odako-kawakubo.github.io/electronic-board-camera/\n''', encoding='utf-8')

# ------------------------------------------------------------
# Validation
# ------------------------------------------------------------
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

html = index_path.read_text(encoding='utf-8')
checks = [
    ('config', 'f7074fad-6ea0-467b-98db-e308f01950cc' in (ROOT/'js/microsoft-config.js').read_text(encoding='utf-8')),
    ('same tenant', '538265b8-8d15-49ef-9d51-ca252954de1d' in (ROOT/'js/microsoft-config.js').read_text(encoding='utf-8')),
    ('redirect login', 'loginRedirect' in (ROOT/'js/graph-session.js').read_text(encoding='utf-8')),
    ('local storage msal', 'cacheLocation: "localStorage"' in (ROOT/'js/graph-session.js').read_text(encoding='utf-8')),
    ('select account', 'prompt: "select_account"' in (ROOT/'js/graph-session.js').read_text(encoding='utf-8')),
    ('logo ui', './assets/microsoft-symbol.svg' in html),
    ('auth scripts', './js/graph-session.js' in html and './js/microsoft-auth-ui.js' in html),
    ('sw auth cache', './js/graph-session.js' in sw_path.read_text(encoding='utf-8')),
    ('version', 'v65.30' in html),
    ('db unchanged', 'const DB_VERSION = 2;' in (ROOT/'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.30 validation passed')
