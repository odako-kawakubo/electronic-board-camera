from pathlib import Path
import subprocess
import re

ROOT = Path('.')
index_path = ROOT / 'index.html'
sw_path = ROOT / 'service-worker.js'
pwa_path = ROOT / 'js/pwa-controller.js'
readme_path = ROOT / 'README.md'

index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

storage_path = ROOT / 'js/storage-manager.js'
if not storage_path.exists():
    storage = '''/*
 * ============================================================
 * storage-manager.js - 端末ストレージ状態 / 永続化要求
 * ============================================================
 * 責務:
 * - StorageManager APIが利用可能ならpersistent storageを要求する
 * - 現在の永続化状態と推定使用量を設定画面へ表示する
 *
 * 保守上の注意:
 * - 写真本体はここへ保存しない。正本はPhotoStore / IndexedDB。
 * - persist() がfalseでも保存失敗ではない。通常のIndexedDB保存は継続する。
 * - API非対応端末でもアプリ起動・撮影を止めない。
 * ============================================================
 */

    const storagePersistenceText = document.getElementById("storagePersistenceText");
    const storageUsageText = document.getElementById("storageUsageText");

    document.addEventListener("DOMContentLoaded", async () => {
      await initializePersistentStorage();
    });

    async function initializePersistentStorage() {
      try {
        if (!navigator.storage) {
          renderStorageStatus({ supported: false, persistent: null, usage: null, quota: null });
          return;
        }

        let persistent = null;
        if (typeof navigator.storage.persisted === "function") {
          persistent = await navigator.storage.persisted();
        }

        if (persistent === false && typeof navigator.storage.persist === "function") {
          try {
            persistent = await navigator.storage.persist();
          } catch (error) {
            console.log("永続ストレージ要求を利用できませんでした", error);
          }
        }

        await refreshStorageStatusUI(persistent);
      } catch (error) {
        console.log("端末ストレージ状態の確認に失敗しました", error);
        renderStorageStatus({ supported: true, persistent: null, usage: null, quota: null });
      }
    }

    async function refreshStorageStatusUI(knownPersistent = null) {
      if (!navigator.storage) {
        renderStorageStatus({ supported: false, persistent: null, usage: null, quota: null });
        return;
      }

      let persistent = knownPersistent;
      if (persistent === null && typeof navigator.storage.persisted === "function") {
        try {
          persistent = await navigator.storage.persisted();
        } catch (error) {}
      }

      let usage = null;
      let quota = null;
      if (typeof navigator.storage.estimate === "function") {
        try {
          const estimate = await navigator.storage.estimate();
          usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
          quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
        } catch (error) {}
      }

      renderStorageStatus({ supported: true, persistent, usage, quota });
    }

    function renderStorageStatus(status) {
      if (storagePersistenceText) {
        if (!status.supported) {
          storagePersistenceText.textContent = "通常保存（永続化API非対応）";
        } else if (status.persistent === true) {
          storagePersistenceText.textContent = "永続化済み";
        } else if (status.persistent === false) {
          storagePersistenceText.textContent = "通常保存";
        } else {
          storagePersistenceText.textContent = "状態確認不可";
        }
      }

      if (storageUsageText) {
        if (status.usage === null) {
          storageUsageText.textContent = "使用量：確認不可";
        } else if (status.quota === null) {
          storageUsageText.textContent = `使用量：約${formatStorageBytes(status.usage)}`;
        } else {
          storageUsageText.textContent = `使用量：約${formatStorageBytes(status.usage)} / ${formatStorageBytes(status.quota)}`;
        }
      }
    }

    function formatStorageBytes(bytes) {
      const value = Math.max(0, Number(bytes) || 0);
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
'''
    storage_path.write_text(storage, encoding='utf-8')

    # Settings UI: status only, no destructive controls.
    anchor = '''      <button class="settings-update-button" type="button" onclick="forceAppUpdate()">最新版を読み込み直す</button>\n\n      <div class="settings-section-title">📷 写真画質</div>'''
    replacement = '''      <button class="settings-update-button" type="button" onclick="forceAppUpdate()">最新版を読み込み直す</button>\n\n      <div class="settings-section-title">💾 端末保存</div>\n      <div class="settings-version-box">\n        状態：<strong id="storagePersistenceText">確認中...</strong><br>\n        <span id="storageUsageText">使用量：確認中...</span>\n      </div>\n      <button class="settings-update-button" type="button" onclick="refreshStorageStatusUI()">保存状態を再確認</button>\n\n      <div class="settings-section-title">📷 写真画質</div>'''
    if anchor not in index:
        raise SystemExit('settings insertion anchor not found')
    index = index.replace(anchor, replacement, 1)

    # Load storage manager before PWA controller.
    scripts_anchor = '  <script src="./js/photo-viewer.js"></script>\n  <script src="./js/pwa-controller.js"></script>\n'
    scripts_replacement = '  <script src="./js/photo-viewer.js"></script>\n  <script src="./js/storage-manager.js"></script>\n  <script src="./js/pwa-controller.js"></script>\n'
    if scripts_anchor not in index:
        raise SystemExit('script insertion anchor not found')
    index = index.replace(scripts_anchor, scripts_replacement, 1)
    index = index.replace('id="settingsVersionText">v65.17<', 'id="settingsVersionText">v65.18<', 1)
    index_path.write_text(index, encoding='utf-8')

    # Service Worker: atomic app-shell install and explicit offline navigation fallback.
    sw = sw.replace('const CACHE_NAME = "electronic-board-camera-v65.17";', 'const CACHE_NAME = "electronic-board-camera-v65.18";', 1)
    sw = sw.replace('  "./js/photo-viewer.js",\n  "./js/pwa-controller.js",', '  "./js/photo-viewer.js",\n  "./js/storage-manager.js",\n  "./js/pwa-controller.js",', 1)

    old_install = '''self.addEventListener("install", (event) => {\n  self.skipWaiting();\n\n  event.waitUntil(\n    caches.open(CACHE_NAME).then((cache) => {\n      return cache.addAll(APP_FILES).catch(() => undefined);\n    })\n  );\n});'''
    new_install = '''self.addEventListener("install", (event) => {\n  self.skipWaiting();\n\n  // 必須ファイルが1つでも保存できなければinstallを成功扱いにしない。\n  // 中途半端なapp shellで圏外起動する状態を防ぐ。\n  event.waitUntil(\n    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))\n  );\n});'''
    if old_install not in sw:
        raise SystemExit('service worker install block not found')
    sw = sw.replace(old_install, new_install, 1)

    old_fetch = '''self.addEventListener("fetch", (event) => {\n  if (event.request.method !== "GET") return;\n\n  event.respondWith(\n    fetch(event.request)\n      .then((response) => {\n        const copy = response.clone();\n        caches.open(CACHE_NAME).then((cache) => {\n          cache.put(event.request, copy);\n        });\n        return response;\n      })\n      .catch(() => caches.match(event.request))\n  );\n});'''
    new_fetch = '''self.addEventListener("fetch", (event) => {\n  if (event.request.method !== "GET") return;\n\n  const requestUrl = new URL(event.request.url);\n  if (requestUrl.origin !== self.location.origin) return;\n\n  if (event.request.mode === "navigate") {\n    event.respondWith(\n      fetch(event.request)\n        .then((response) => {\n          const copy = response.clone();\n          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));\n          return response;\n        })\n        .catch(async () => {\n          return (\n            await caches.match(event.request, { ignoreSearch: true }) ||\n            await caches.match("./index.html") ||\n            await caches.match("./")\n          );\n        })\n    );\n    return;\n  }\n\n  // app shellはcache-first。SWの世代が変わればCACHE_NAMEも変わるため、\n  // 圏外時の確実性を優先しつつ更新世代は分離できる。\n  event.respondWith(\n    caches.match(event.request).then((cached) => {\n      if (cached) return cached;\n      return fetch(event.request).then((response) => {\n        const copy = response.clone();\n        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));\n        return response;\n      });\n    })\n  );\n});'''
    if old_fetch not in sw:
        raise SystemExit('service worker fetch block not found')
    sw = sw.replace(old_fetch, new_fetch, 1)
    sw_path.write_text(sw, encoding='utf-8')

    pwa = pwa.replace('const APP_VERSION = "v65.17";', 'const APP_VERSION = "v65.18";', 1)
    pwa_path.write_text(pwa, encoding='utf-8')

    readme = readme.replace('# 電子看板カメラ v65.17', '# 電子看板カメラ v65.18', 1)
    if '## v65.18 永続ストレージ・圏外起動強化' not in readme:
        readme += '''\n\n## v65.18 永続ストレージ・圏外起動強化\n- `storage-manager.js` を追加し、利用可能端末でpersistent storageを要求\n- 設定画面に永続化状態と推定ストレージ使用量を表示\n- Service Workerのapp shellキャッシュを必須ファイル全成功方式へ変更\n- 圏外navigation時はquery有無に依存せず `index.html` / `./` へフォールバック\n- app shell静的ファイルはcache-firstとして圏外起動を優先\n- 写真正本は引き続きPhotoStore / IndexedDB。DB schema・Base64形式は変更なし\n'''
    readme_path.write_text(readme, encoding='utf-8')

    doc = '''# v65.18 永続ストレージ・圏外起動強化\n\n## 目的\nホーム画面PWAを終了・端末再起動・圏外起動した後でも、既存のIndexedDB写真アルバムを復元できる可能性を高める。\n\n## 永続ストレージ\n`navigator.storage.persisted()` を確認し、未永続かつ `persist()` が利用可能なら永続化を要求する。\n拒否・API非対応でも撮影やIndexedDB保存は止めない。永続化は保証ではなく、ブラウザへ保護を要求する追加策として扱う。\n\n## 設定表示\n- 永続化済み / 通常保存 / API非対応 / 状態確認不可\n- `navigator.storage.estimate()` が利用できる場合は推定使用量とquota\n\n## Service Worker\n- 必須app shellのcache.addAll失敗を握りつぶさない\n- navigationのfetch失敗時はqueryを無視した既存キャッシュ、`index.html`、`./` の順で復帰\n- 静的app shellはcache-first\n\n## 写真データ\n写真データの正本は変更しない。`electronic-board-camera-prototype` IndexedDB version 2 / `photos` storeを継続利用する。起動時は既存の `loadPhotosFromIndexedDB()` で全件復元する。\n'''
    (ROOT / 'docs/v65.18-persistent-storage.md').write_text(doc, encoding='utf-8')

# Validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)

index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
storage = storage_path.read_text(encoding='utf-8')
photo_store = (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')
photo_utils = (ROOT / 'js/photo-utils.js').read_text(encoding='utf-8')

checks = [
    ('storage manager loaded', './js/storage-manager.js' in index),
    ('storage manager cached', '"./js/storage-manager.js"' in sw),
    ('persistent request exists', 'navigator.storage.persist()' in storage),
    ('storage estimate exists', 'navigator.storage.estimate()' in storage),
    ('settings status ui exists', 'storagePersistenceText' in index and 'storageUsageText' in index),
    ('version pwa', 'const APP_VERSION = "v65.18";' in pwa),
    ('version html', 'id="settingsVersionText">v65.18<' in index),
    ('version sw', 'electronic-board-camera-v65.18' in sw),
    ('install does not swallow failure', 'cache.addAll(APP_FILES).catch' not in sw),
    ('offline navigation fallback', 'caches.match("./index.html")' in sw and 'ignoreSearch: true' in sw),
    ('db unchanged', 'const DB_VERSION = 2;' in photo_store and 'electronic-board-camera-prototype' in photo_store),
    ('startup restore remains', 'async function loadPhotosFromIndexedDB()' in photo_utils),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')

# Inline onclick targets resolve.
all_js = '\n'.join(p.read_text(encoding='utf-8') for p in (ROOT / 'js').glob('*.js'))
funcs = set(re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(', all_js))
for body in re.findall(r'onclick="([^"]+)"', index):
    for name in re.findall(r'\b([A-Za-z_$][\w$]*)\s*\(', body):
        if name in {'if', 'return'}:
            continue
        if name not in funcs:
            raise SystemExit(f'onclick target missing: {name}')

print('v65.18 persistent storage/offline validation passed')
