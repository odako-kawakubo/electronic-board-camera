from pathlib import Path
import subprocess

ROOT = Path('.')

# ------------------------------------------------------------
# Microsoft config: 03 サンプリング業務ルートを追加
# ------------------------------------------------------------
config_path = ROOT / 'js/microsoft-config.js'
config_path.write_text(r'''/*
 * ============================================================
 * microsoft-config.js - Microsoft Graph / OneDrive設定
 * ============================================================
 * しらべと同じEntraアプリ登録を共用する。
 * ブラウザSPAなのでclient secretは持たない。
 */
(function () {
  "use strict";
  window.MicrosoftConfig = Object.freeze({
    graphClientId: "f7074fad-6ea0-467b-98db-e308f01950cc",
    tenantId: "538265b8-8d15-49ef-9d51-ca252954de1d",
    graphScopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"],

    // 看板カメラが使用するOneDrive業務ルート。
    samplingRootName: "03 サンプリング",
    samplingRootUrl: "https://odawarakoseki-my.sharepoint.com/:f:/g/personal/account_odawarakoseki_onmicrosoft_com/IgD7qiKp1DyBTIpmQ4llJZOXAUlxxtsP0TM0qPaXoD2MOjM?e=xh2BfU"
  });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# OneDrive low-level Graph client
# ------------------------------------------------------------
(ROOT / 'js/onedrive-client.js').write_text(r'''/*
 * ============================================================
 * onedrive-client.js - Microsoft Graph / OneDrive低レベルAPI
 * ============================================================
 * Graph認証はgraph-session、業務ルート解決はonedrive-rootが担当する。
 */
(function () {
  "use strict";

  const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

  async function graphRequest(path) {
    const token = await GraphSession.getAccessToken({ allowInteractive: false });
    const response = await fetch(`${GRAPH_BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) {
      let detail = "";
      let graphCode = "";
      try {
        const payload = await response.json();
        detail = payload?.error?.message || "";
        graphCode = payload?.error?.code || "";
      } catch (error) {}
      const graphError = new Error(detail || `OneDrive通信に失敗しました (${response.status})`);
      graphError.status = response.status;
      graphError.graphCode = graphCode;
      graphError.code = response.status === 401 ? "GRAPH_UNAUTHORIZED"
        : response.status === 403 ? "GRAPH_FORBIDDEN"
          : response.status === 404 ? "GRAPH_NOT_FOUND"
            : "GRAPH_REQUEST_FAILED";
      throw graphError;
    }
    return response.json();
  }

  async function listPaged(path) {
    const items = [];
    let nextPath = path;
    while (nextPath) {
      const payload = await graphRequest(nextPath);
      items.push(...(payload?.value || []));
      const nextLink = payload?.["@odata.nextLink"] || "";
      nextPath = nextLink.startsWith(GRAPH_BASE) ? nextLink.slice(GRAPH_BASE.length) : "";
    }
    return items;
  }

  function base64UrlEncodeUtf8(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  function sharedLinkId(url) {
    return `u!${base64UrlEncodeUtf8(url)}`;
  }

  function refForItem(item, fallbackDriveId = "") {
    const remote = item?.remoteItem || null;
    const source = remote || item || {};
    return {
      driveId: String(source?.parentReference?.driveId || item?.parentReference?.driveId || fallbackDriveId || ""),
      itemId: String(source?.id || item?.id || ""),
      id: String(source?.id || item?.id || ""),
      name: String(source?.name || item?.name || ""),
      folder: source?.folder || item?.folder || null,
      parentReference: source?.parentReference || item?.parentReference || null,
      webUrl: source?.webUrl || item?.webUrl || "",
      remoteItem: remote
    };
  }

  function normalizeRef(value) {
    if (value && typeof value === "object") {
      return {
        driveId: String(value.driveId || ""),
        itemId: String(value.itemId || value.id || "")
      };
    }
    return { driveId: "", itemId: String(value || "") };
  }

  async function resolveSharedUrl(sharedUrl) {
    const url = String(sharedUrl || "").trim();
    if (!url) {
      const error = new Error("OneDrive共有URLが設定されていません。");
      error.code = "SHARED_URL_MISSING";
      throw error;
    }
    const shareId = sharedLinkId(url);
    const item = await graphRequest(`/shares/${encodeURIComponent(shareId)}/driveItem?$select=id,name,folder,webUrl,parentReference,remoteItem`);
    const ref = refForItem(item);
    if (!ref.driveId || !ref.itemId) {
      const error = new Error("共有URLからフォルダのdriveId/itemIdを取得できませんでした。");
      error.code = "SHARED_URL_RESOLVE_FAILED";
      throw error;
    }
    return ref;
  }

  async function searchDriveFolders(keyword) {
    const query = String(keyword || "").trim();
    if (!query) return [];
    const safe = query.replace(/'/g, "''");
    const items = await listPaged(`/me/drive/root/search(q='${encodeURIComponent(safe)}')?$select=id,name,folder,webUrl,parentReference,remoteItem`);
    return items
      .map((item) => refForItem(item))
      .filter((item) => (item.folder || item.remoteItem?.folder) && item.driveId && item.itemId);
  }

  async function getDriveItem(itemRef) {
    const ref = normalizeRef(itemRef);
    if (!ref.driveId || !ref.itemId) return null;
    const item = await graphRequest(`/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}?$select=id,name,folder,webUrl,parentReference,remoteItem`);
    return refForItem(item, ref.driveId);
  }

  async function listDriveChildren(parentRef) {
    const ref = normalizeRef(parentRef);
    if (!ref.driveId || !ref.itemId) throw new Error("OneDriveフォルダを特定できません。");
    const items = await listPaged(`/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/children?$select=id,name,folder,file,parentReference,webUrl,remoteItem&$top=200`);
    return items.map((item) => refForItem(item, ref.driveId));
  }

  window.OneDriveClient = Object.freeze({ resolveSharedUrl, searchDriveFolders, getDriveItem, listDriveChildren });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# 03 サンプリング root resolver / cache
# ------------------------------------------------------------
(ROOT / 'js/onedrive-root.js').write_text(r'''/*
 * ============================================================
 * onedrive-root.js - 「03 サンプリング」業務ルートの解決
 * ============================================================
 * しらべの「04 調査」と同じ解決順序:
 * 1. 固定共有URLをGraph /sharesで解決
 * 2. 失敗した場合だけOneDrive検索へフォールバック
 * 3. 表示名から「03 サンプリング」を選ぶ
 * ============================================================
 */
(function () {
  "use strict";

  let samplingRootCache = null;

  function cloneRoot(root) {
    return root ? { ...root } : null;
  }

  async function resolveSamplingRoot() {
    const expectedName = String(MicrosoftConfig.samplingRootName || "").trim();
    let sharedError = null;

    try {
      const root = await OneDriveClient.resolveSharedUrl(MicrosoftConfig.samplingRootUrl);
      return { ...root, rootSource: "fixed-share" };
    } catch (error) {
      sharedError = error;
      console.warn("03 サンプリング共有URL解決失敗。OneDrive検索へフォールバックします", error);
    }

    const keyword = expectedName.replace(/^\d+\s*/, "").trim() || expectedName;
    const found = await OneDriveClient.searchDriveFolders(keyword);
    const candidates = found.filter((item) => String(item?.name || "").includes(expectedName));
    const candidate = candidates[0]
      || found.find((item) => String(item?.name || "").includes(keyword))
      || null;

    if (!candidate?.driveId || !candidate?.itemId) {
      const error = new Error(`${expectedName || "共有フォルダ"}のdriveId/itemIdを取得できませんでした。`);
      error.code = "SAMPLING_ROOT_RESOLVE_FAILED";
      error.sharedUrlError = sharedError;
      throw error;
    }

    return { ...candidate, rootSource: "legacy-search" };
  }

  async function getSamplingRoot({ force = false } = {}) {
    if (!force && samplingRootCache?.driveId && samplingRootCache?.itemId) {
      return cloneRoot(samplingRootCache);
    }
    samplingRootCache = await resolveSamplingRoot();
    return cloneRoot(samplingRootCache);
  }

  function clearSamplingRoot() {
    samplingRootCache = null;
  }

  function getCachedSamplingRoot() {
    return cloneRoot(samplingRootCache);
  }

  window.OneDriveRoot = Object.freeze({ getSamplingRoot, clearSamplingRoot, getCachedSamplingRoot });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# Connection: 03実体+childrenまで確認した時だけconnected
# ------------------------------------------------------------
connection_path = ROOT / 'js/onedrive-connection.js'
connection_path.write_text(r'''/*
 * ============================================================
 * onedrive-connection.js - OneDrive接続状態の正本
 * ============================================================
 * Microsoftログインとは別に、「03 サンプリング」を実際に使用できるか確認する。
 * v65.32では写真送信・フォルダ作成は行わない。
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
    root: null,
    rootSource: ""
  };

  function cloneState() {
    return { ...state, root: state.root ? { ...state.root } : null };
  }

  function publish(next) {
    state = { ...next, root: next.root ? { ...next.root } : null };
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

  function unavailableState(text = "未接続", error = "") {
    return { phase: "unconnected", connected: false, text, error, root: null, rootSource: "" };
  }

  function isExpectedRootName(name) {
    const expected = String(MicrosoftConfig.samplingRootName || "").trim();
    const actual = String(name || "").trim();
    return Boolean(expected && actual && (actual === expected || actual.includes(expected)));
  }

  async function verifyResolvedRoot(candidate) {
    const verified = await OneDriveClient.getDriveItem(candidate);
    if (!verified?.folder || !verified.driveId || !verified.itemId) {
      const error = new Error("03 サンプリングの実体へアクセスできませんでした。");
      error.code = "SAMPLING_ROOT_VERIFY_FAILED";
      throw error;
    }
    if (!isExpectedRootName(verified.name)) {
      const error = new Error(`接続先「${verified.name || "-"}」は「${MicrosoftConfig.samplingRootName}」ではありません。`);
      error.code = "SAMPLING_ROOT_NAME_MISMATCH";
      throw error;
    }

    // 実運用で子フォルダを読むため、childrenまで取得できることを接続条件にする。
    await OneDriveClient.listDriveChildren(verified);
    return { ...verified, rootSource: candidate.rootSource || "" };
  }

  async function getUsableSamplingRoot({ force = false } = {}) {
    if (navigator.onLine === false) {
      const error = new Error("圏外です。");
      error.code = "NETWORK_OFFLINE";
      throw error;
    }
    await GraphSession.initialize();
    if (!GraphSession.getState().account) {
      const error = new Error("Microsoft Graphへログインしていません。");
      error.code = "GRAPH_LOGIN_REQUIRED";
      throw error;
    }
    await GraphSession.getAccessToken({ allowInteractive: false });
    const candidate = await OneDriveRoot.getSamplingRoot({ force });
    return verifyResolvedRoot(candidate);
  }

  async function refresh({ force = false } = {}) {
    const currentGeneration = ++generation;

    if (navigator.onLine === false) {
      OneDriveRoot.clearSamplingRoot();
      publish(unavailableState("オフライン"));
      return cloneState();
    }

    await GraphSession.initialize().catch(() => null);
    const graph = GraphSession.getState();
    if (!graph.account) {
      OneDriveRoot.clearSamplingRoot();
      publish(unavailableState("未接続", graph.error || ""));
      return cloneState();
    }

    publish({
      phase: "checking",
      connected: false,
      text: "確認中",
      error: "",
      root: OneDriveRoot.getCachedSamplingRoot(),
      rootSource: OneDriveRoot.getCachedSamplingRoot()?.rootSource || ""
    });

    try {
      const root = await getUsableSamplingRoot({ force });
      if (currentGeneration !== generation) return cloneState();
      publish({
        phase: "connected",
        connected: true,
        text: "接続",
        error: "",
        root,
        rootSource: root.rootSource || ""
      });
    } catch (error) {
      if (currentGeneration !== generation) return cloneState();
      OneDriveRoot.clearSamplingRoot();
      publish({
        phase: "error",
        connected: false,
        text: "未接続",
        error: error?.message || "OneDriveへ接続できません。",
        root: null,
        rootSource: ""
      });
    }
    return cloneState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    GraphSession.subscribe(() => void refresh({ force: true }));
    window.addEventListener("online", () => void refresh({ force: true }));
    window.addEventListener("offline", () => void refresh());
    void refresh();
  }

  window.OneDriveConnection = Object.freeze({
    getState,
    subscribe,
    refresh,
    initialize,
    getUsableSamplingRoot
  });
})();
''', encoding='utf-8')

# ------------------------------------------------------------
# index title/text/scripts/version
# ------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = index.replace('<title>電子看板カメラ</title>', '<title>看板カメラ</title>', 1)
index = index.replace('<div class="launch-mode-title">電子看板カメラ</div>', '<div class="launch-mode-title">看板カメラ</div>', 1)
index = index.replace('id="settingsVersionText">v65.31<', 'id="settingsVersionText">v65.32<', 1)
script_marker = '  <script src="./js/microsoft-auth-ui.js"></script>\n'
if script_marker not in index:
    raise SystemExit('auth script marker missing')
if './js/onedrive-client.js' not in index:
    index = index.replace(
        script_marker,
        script_marker + '  <script src="./js/onedrive-client.js"></script>\n  <script src="./js/onedrive-root.js"></script>\n',
        1
    )
index_path.write_text(index, encoding='utf-8')

# ------------------------------------------------------------
# PWA version / service worker cache list / README docs
# ------------------------------------------------------------
pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.31";', 'const APP_VERSION = "v65.32";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.31', 'electronic-board-camera-v65.32', 1)
marker = '  "./js/onedrive-connection.js",\n'
if marker not in sw:
    raise SystemExit('SW OneDrive marker missing')
if './js/onedrive-client.js' not in sw:
    sw = sw.replace(marker, '  "./js/onedrive-client.js",\n  "./js/onedrive-root.js",\n' + marker, 1)
sw_path.write_text(sw, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8')
readme = readme.replace('# 電子看板カメラ v65.31', '# 看板カメラ v65.32', 1)
readme += '''\n\n## v65.32 03サンプリング業務ルート接続\n- トップ表示名を「看板カメラ」に変更\n- `03 サンプリング` の固定共有URLを設定\n- しらべと同じ順序で、固定共有URL解決 → 失敗時OneDrive検索へフォールバック\n- 解決後に実体フォルダ名を再確認し、children取得まで成功した場合のみOneDriveを「接続」と判定\n- OneDrive接続状態はMicrosoftログイン状態と引き続き分離\n- 写真送信・フォルダ作成はまだ行わない\n'''
readme_path.write_text(readme, encoding='utf-8')

(ROOT / 'docs/v65.32-sampling-root.md').write_text('''# v65.32 03サンプリング業務ルート接続\n\n接続条件を `/me/drive` から「03 サンプリング」実利用確認へ変更。\n固定共有URL → Graph shares解決 → 失敗時検索 → 実体名確認 → children取得。\n''', encoding='utf-8')

# ------------------------------------------------------------
# Validation
# ------------------------------------------------------------
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

html = index_path.read_text(encoding='utf-8')
connection = connection_path.read_text(encoding='utf-8')
root = (ROOT/'js/onedrive-root.js').read_text(encoding='utf-8')
client = (ROOT/'js/onedrive-client.js').read_text(encoding='utf-8')
config = config_path.read_text(encoding='utf-8')
checks = [
    ('title', '<div class="launch-mode-title">看板カメラ</div>' in html),
    ('sampling name', 'samplingRootName: "03 サンプリング"' in config),
    ('sampling url', 'IgD7qiKp1DyBTIpmQ4llJZOXAUlxxtsP0TM0qPaXoD2MOjM' in config),
    ('share resolver', '/shares/' in client and 'driveItem' in client),
    ('fallback search', 'searchDriveFolders' in root and 'legacy-search' in root),
    ('verify name', 'SAMPLING_ROOT_NAME_MISMATCH' in connection),
    ('verify children', 'listDriveChildren(verified)' in connection),
    ('scripts order', html.index('./js/onedrive-client.js') < html.index('./js/onedrive-root.js') < html.index('./js/onedrive-connection.js')),
    ('version', 'v65.32' in html),
    ('db unchanged', 'const DB_VERSION = 2;' in (ROOT/'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.32 validation passed')
