from pathlib import Path
import subprocess

ROOT = Path('.')
app_path = ROOT / 'js/app.js'
settings_path = ROOT / 'js/settings.js'
index_path = ROOT / 'index.html'
sw_path = ROOT / 'service-worker.js'
readme_path = ROOT / 'README.md'

app = app_path.read_text(encoding='utf-8')
settings = settings_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

if 'const APP_VERSION = "v65.16";' not in (ROOT / 'js/pwa-controller.js').read_text(encoding='utf-8') if (ROOT / 'js/pwa-controller.js').exists() else True:
    # settings.js: remove PWA/update ownership, keep settings UI only.
    settings = settings.replace(' * settings.js - 設定 / アプリ更新', ' * settings.js - 表示・撮影設定')
    settings = settings.replace(' * 責務: 画質、看板文字サイズ、設定画面、バージョン表示、PWA更新確認を担当する。app.jsの初期状態生成で使うためapp.jsより先に読む。', ' * 責務: 画質、看板文字サイズ、設定画面を担当する。app.jsの初期状態生成で使うためshared-state.jsより先に読む。')
    settings = settings.replace(' * - localStorageのキー名変更は既存利用者の設定消失につながる。Service Worker更新処理は片側だけ変更しない。', ' * - localStorageのキー名変更は既存利用者の設定消失につながる。PWA更新処理はpwa-controller.jsが担当する。')
    settings = settings.replace('    const APP_VERSION = "v65.15";\n', '')
    settings = settings.replace('    const settingsVersionText = document.getElementById("settingsVersionText");\n', '')
    marker = '    function getShortAppVersion(version = APP_VERSION) {'
    cut = settings.find(marker)
    if cut < 0:
        raise SystemExit('settings PWA block marker not found')
    settings = settings[:cut].rstrip() + '\n'

    # app.js: remove update calls and PWA resume listeners.
    app = app.replace('      renderAppVersion();\n      checkAppUpdate();\n', '')
    pwa_comment = '''    /*\n     * iPhone / iPad のホーム画面PWA対策\n     * 画面復帰時にカメラが止まることがあるため復帰を試す\n     */\n'''
    pwa_start = app.find(pwa_comment)
    pwa_end_marker = '    /**\n     * 横向き運用の表示状態と左右反転設定を復元する。\n     */\n'
    pwa_end = app.find(pwa_end_marker)
    if pwa_start < 0 or pwa_end < 0 or pwa_end <= pwa_start:
        raise SystemExit('app PWA resume block markers not found')
    app = app[:pwa_start] + app[pwa_end:]
    app = app.replace(' * 責務: 各機能モジュールをつなぐ起点。初期化順序、全体イベント、app専用UIだけを担当する。共有状態はshared-state.jsを正本とする。', ' * 責務: 各機能モジュールをつなぐ起点。機能初期化、画面向きイベント、app専用UIだけを担当する。共有状態はshared-state.js、PWA制御はpwa-controller.jsを正本とする。')

    pwa = '''/*
 * ============================================================
 * pwa-controller.js - PWA起動 / 更新 / 復帰制御
 * ============================================================
 * 責務:
 * - アプリバージョン表示と更新確認
 * - Service Worker登録、解除、Cache Storage整理
 * - iPhone/iPadホーム画面PWAの復帰時カメラ再開
 *
 * 保守上の注意:
 * - 写真本体のIndexedDBはここから削除しない。更新処理で消してよいのは
 *   Service Worker登録とCache Storageだけ。
 * - 圏外でも起動できることを優先し、更新確認失敗は起動失敗にしない。
 * - カメラ復帰処理はcamera.jsのresumeCameraAfterPreview()を利用する。
 * ============================================================
 */

    const APP_VERSION = "v65.16";
    const settingsVersionText = document.getElementById("settingsVersionText");

    document.addEventListener("DOMContentLoaded", () => {
      renderAppVersion();
      checkAppUpdate();
      setupPwaResumeHandlers();
    });

    window.addEventListener("load", () => {
      registerAppServiceWorker();
    });

    function registerAppServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register("./service-worker.js")
        .then(() => console.log("Service Worker 登録完了"))
        .catch((error) => console.error("Service Worker登録失敗", error));
    }

    function setupPwaResumeHandlers() {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) resumeCameraIfNeeded();
      });

      window.addEventListener("pageshow", () => {
        resumeCameraIfNeeded();
      });
    }

    function resumeCameraIfNeeded() {
      if (!currentStream) return;
      if (previewOverlay && previewOverlay.classList.contains("show")) return;
      resumeCameraAfterPreview();
    }

    function getShortAppVersion(version = APP_VERSION) {
      const match = String(version || "").match(/^v?([0-9]+(?:\\.[0-9]+)?[a-z]?)/i);
      return match ? `v${match[1]}` : String(version || "");
    }

    function renderAppVersion() {
      if (settingsVersionText) settingsVersionText.textContent = getShortAppVersion();
    }

    async function getLatestAppVersion() {
      const url = new URL(window.location.href);
      url.searchParams.set("_update_check", Date.now());

      const response = await fetch(url.toString(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });

      const html = await response.text();
      const match = html.match(/const APP_VERSION = "([^"]+)"/);
      return match ? match[1] : null;
    }

    async function clearAppCachesAndServiceWorker() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch (error) {
        console.log("Service Worker解除に失敗しました", error);
      }

      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.log("キャッシュ削除に失敗しました", error);
      }
    }

    async function reloadAppWithVersion(versionLabel) {
      await clearAppCachesAndServiceWorker();
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set("v", versionLabel || Date.now());
      reloadUrl.searchParams.set("_reload", Date.now());
      window.location.replace(reloadUrl.toString());
    }

    async function checkAppUpdate() {
      try {
        const latestVersion = await getLatestAppVersion();
        if (!latestVersion) return;

        if (latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。\n\n現在：${getShortAppVersion(APP_VERSION)}\n最新：${getShortAppVersion(latestVersion)}\n\n更新しますか？`
          );

          if (ok) await reloadAppWithVersion(latestVersion);
        }
      } catch (error) {
        // 圏外や通信不良は正常運用の一部。更新確認失敗で起動を止めない。
        console.log("更新確認に失敗しました", error);
      }
    }

    async function forceAppUpdate() {
      try {
        showToast("最新版を確認中...");
        const latestVersion = await getLatestAppVersion();
        if (latestVersion && latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。\n\n現在：${getShortAppVersion(APP_VERSION)}\n最新：${getShortAppVersion(latestVersion)}\n\n更新しますか？`
          );
          if (!ok) return;
          await reloadAppWithVersion(latestVersion);
          return;
        }

        const ok = window.confirm(
          `現在のバージョン：${getShortAppVersion(APP_VERSION)}\n\nキャッシュを削除して、このバージョンを読み込み直しますか？`
        );
        if (ok) await reloadAppWithVersion(latestVersion || APP_VERSION);
      } catch (error) {
        console.log("手動更新に失敗しました", error);
        showErrorToast("更新に失敗しました");
      }
    }
'''
    (ROOT / 'js/pwa-controller.js').write_text(pwa, encoding='utf-8')

    # index: remove inline SW registration and add pwa-controller last.
    inline = '''  <script>\nif ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => {\n    navigator.serviceWorker\n      .register("./service-worker.js")\n      .then(() => console.log("Service Worker 登録完了"))\n      .catch(err => console.error("Service Worker登録失敗", err));\n  });\n}\n</script>\n'''
    if inline not in index:
        raise SystemExit('inline service worker registration not found')
    index = index.replace(inline, '', 1)
    viewer_line = '  <script src="./js/photo-viewer.js"></script>\n'
    index = index.replace(viewer_line, viewer_line + '  <script src="./js/pwa-controller.js"></script>\n', 1)
    index = index.replace('id="settingsVersionText">v65.15<', 'id="settingsVersionText">v65.16<', 1)

    sw = sw.replace('const CACHE_NAME = "electronic-board-camera-v65.15";', 'const CACHE_NAME = "electronic-board-camera-v65.16";', 1)
    sw = sw.replace('  "./js/photo-viewer.js",\n', '  "./js/photo-viewer.js",\n  "./js/pwa-controller.js",\n', 1)

    readme = readme.replace('# 電子看板カメラ v65.15', '# 電子看板カメラ v65.16', 1)
    if '## v65.16 PWA責務分離' not in readme:
        readme += '''\n\n## v65.16 PWA責務分離\n- `js/pwa-controller.js` を追加し、PWA更新・Service Worker登録・iOS復帰制御を集約\n- `settings.js` は画質・文字サイズ・設定画面だけに縮小\n- `app.js` からPWA復帰イベントを除去し、機能初期化の司令塔へ整理\n- `index.html` のinline Service Worker登録を廃止\n- 圏外時の更新確認失敗は起動を止めない方針をコメントで明文化\n- IndexedDB、写真形式、撮影、看板、ファイル名、OneDrive仕様は変更なし\n'''

    app_path.write_text(app, encoding='utf-8')
    settings_path.write_text(settings, encoding='utf-8')
    index_path.write_text(index, encoding='utf-8')
    sw_path.write_text(sw, encoding='utf-8')
    readme_path.write_text(readme, encoding='utf-8')

    doc = '''# v65.16 PWA責務分離\n\n## 目的\n圏外起動強化の前段として、PWA固有処理を `pwa-controller.js` に集約する。\n\n## pwa-controller.js の責務\n- APP_VERSIONの正本\n- バージョン表示・更新確認・手動更新\n- Service Worker登録/解除\n- Cache Storage削除\n- iPhone/iPadホーム画面PWAのvisibility/pageshow復帰\n\n## 境界\n- IndexedDB写真データはPWA更新処理から削除しない。\n- settings.jsはユーザー設定だけ。\n- app.jsは機能初期化と共通UIだけ。\n- service-worker.jsはオフラインキャッシュ本体。\n\n## 次段階\n`pwa-controller.js` と `service-worker.js` を中心に、完全圏外での起動・更新世代不一致・キャッシュ整合性を監査する。\n'''
    (ROOT / 'docs/v65.16-pwa-controller.md').write_text(doc, encoding='utf-8')

# validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)

app = app_path.read_text(encoding='utf-8')
settings = settings_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
pwa = (ROOT / 'js/pwa-controller.js').read_text(encoding='utf-8')

checks = [
    ('APP_VERSION in pwa', 'const APP_VERSION = "v65.16";' in pwa),
    ('no APP_VERSION settings', 'const APP_VERSION' not in settings),
    ('no checkAppUpdate app', 'checkAppUpdate();' not in app),
    ('no visibilitychange app', 'visibilitychange' not in app),
    ('pwa script index', './js/pwa-controller.js' in index),
    ('no inline SW index', '.register("./service-worker.js")' not in index),
    ('pwa cached', '"./js/pwa-controller.js"' in sw),
    ('sw version', 'electronic-board-camera-v65.16' in sw),
    ('html version', 'id="settingsVersionText">v65.16<' in index),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')

# Inline onclick targets must still exist.
import re
all_js = '\n'.join(p.read_text(encoding='utf-8') for p in (ROOT / 'js').glob('*.js'))
funcs = set(re.findall(r'\\bfunction\\s+([A-Za-z_$][\\w$]*)\\s*\\(', all_js))
for body in re.findall(r'onclick="([^"]+)"', index):
    for name in re.findall(r'\\b([A-Za-z_$][\\w$]*)\\s*\\(', body):
        if name in {'if', 'return'}:
            continue
        if name not in funcs:
            raise SystemExit(f'onclick target missing: {name}')

print('v65.16 PWA responsibility split validation passed')
