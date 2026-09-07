from pathlib import Path
import subprocess

ROOT = Path('.')
storage_path = ROOT / 'js/storage-manager.js'
settings_path = ROOT / 'js/settings.js'
pwa_path = ROOT / 'js/pwa-controller.js'
sw_path = ROOT / 'service-worker.js'
index_path = ROOT / 'index.html'
readme_path = ROOT / 'README.md'

storage = storage_path.read_text(encoding='utf-8')
settings = settings_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

# storage-manager.js: replace whole module with explicit photo-data metrics + PWA estimate + remaining count.
storage = '''/*
 * ============================================================
 * storage-manager.js - 端末ストレージ状態 / 永続化要求
 * ============================================================
 * 責務:
 * - StorageManager APIが利用可能ならpersistent storageを要求する
 * - IndexedDB内の写真データ量をアプリ自身で集計する
 * - PWA全体の推定使用量 / 推定空き容量 / 推定撮影可能枚数を設定画面へ表示する
 *
 * 保守上の注意:
 * - 写真本体はここへ保存しない。正本はPhotoStore / IndexedDB。
 * - persist() がfalseでも保存失敗ではない。通常のIndexedDB保存は継続する。
 * - navigator.storage.estimate() はブラウザ側の推定値。写真容量の実測表示とは分けて扱う。
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
          await refreshStorageStatusUI(null, false);
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

        await refreshStorageStatusUI(persistent, true);
      } catch (error) {
        console.log("端末ストレージ状態の確認に失敗しました", error);
        renderStorageStatus({
          supported: Boolean(navigator.storage),
          persistent: null,
          usage: null,
          quota: null,
          photoCount: null,
          photoBytes: null,
          averagePhotoBytes: null,
          remainingPhotos: null
        });
      }
    }

    async function getPhotoStorageMetrics() {
      try {
        if (!window.PhotoStore || typeof PhotoStore.getAllPhotos !== "function") {
          return { photoCount: null, photoBytes: null, averagePhotoBytes: null };
        }

        const photos = await PhotoStore.getAllPhotos();
        let photoBytes = 0;

        for (const photo of photos) {
          const completedChars = String(photo && photo.dataUrl || "").length;
          const originalChars = String(photo && photo.baseDataUrl || "").length;
          // data URLのBase64部分は概ね文字数×3/4。metadataは小さいため概算から除外する。
          photoBytes += Math.round((completedChars + originalChars) * 0.75);
        }

        return {
          photoCount: photos.length,
          photoBytes,
          averagePhotoBytes: photos.length ? photoBytes / photos.length : null
        };
      } catch (error) {
        console.log("写真データ容量の集計に失敗しました", error);
        return { photoCount: null, photoBytes: null, averagePhotoBytes: null };
      }
    }

    async function refreshStorageStatusUI(knownPersistent = null, storageSupported = Boolean(navigator.storage)) {
      let persistent = knownPersistent;
      let usage = null;
      let quota = null;

      if (storageSupported && navigator.storage) {
        if (persistent === null && typeof navigator.storage.persisted === "function") {
          try {
            persistent = await navigator.storage.persisted();
          } catch (error) {}
        }

        if (typeof navigator.storage.estimate === "function") {
          try {
            const estimate = await navigator.storage.estimate();
            usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
            quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
          } catch (error) {}
        }
      }

      const photoMetrics = await getPhotoStorageMetrics();
      const estimatedFreeBytes = usage !== null && quota !== null ? Math.max(0, quota - usage) : null;
      let remainingPhotos = null;

      if (estimatedFreeBytes !== null && photoMetrics.averagePhotoBytes && photoMetrics.averagePhotoBytes > 0) {
        // quota/usage自体が推定値なので、残り枚数も整数の概算として扱う。
        remainingPhotos = Math.max(0, Math.floor(estimatedFreeBytes / photoMetrics.averagePhotoBytes));
      }

      renderStorageStatus({
        supported: storageSupported,
        persistent,
        usage,
        quota,
        ...photoMetrics,
        remainingPhotos
      });
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

      if (!storageUsageText) return;

      const lines = [];
      if (status.photoCount === null || status.photoBytes === null) {
        lines.push("写真データ：確認不可");
      } else {
        lines.push(`写真：${status.photoCount}枚 / 約${formatStorageBytes(status.photoBytes)}`);
      }

      if (status.usage === null) {
        lines.push("PWA全体：推定使用量を確認できません");
      } else if (status.quota === null) {
        lines.push(`PWA全体：推定 ${formatStorageBytes(status.usage)}`);
      } else {
        const free = Math.max(0, status.quota - status.usage);
        lines.push(`PWA全体：推定 ${formatStorageBytes(status.usage)} / ${formatStorageBytes(status.quota)}`);
        lines.push(`推定空き容量：約${formatStorageBytes(free)}`);
      }

      if (status.remainingPhotos === null) {
        lines.push(status.photoCount === 0 ? "推定撮影可能枚数：1枚撮影後に算出" : "推定撮影可能枚数：算出不可");
      } else {
        lines.push(`推定撮影可能枚数：約${formatPhotoCount(status.remainingPhotos)}枚`);
      }

      storageUsageText.innerHTML = lines.join("<br>");
    }

    function formatPhotoCount(count) {
      const value = Math.max(0, Math.floor(Number(count) || 0));
      if (value >= 10000) return `${Math.floor(value / 1000) * 1000}+`;
      if (value >= 1000) return `${Math.floor(value / 100) * 100}`;
      if (value >= 100) return `${Math.floor(value / 10) * 10}`;
      return String(value);
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

# Settings: refresh live values whenever settings are opened, and add launch-screen settings/update entry.
settings = settings.replace(
'''    function openSettings() {\n      renderPhotoQualitySettings();\n      settingsOverlay.classList.add("show");\n    }''',
'''    function openSettings() {\n      renderPhotoQualitySettings();\n      settingsOverlay.classList.add("show");\n      if (typeof refreshStorageStatusUI === "function") {\n        refreshStorageStatusUI();\n      }\n    }''',
1)

insert_marker = '    function closeSettings() {\n      settingsOverlay.classList.remove("show");\n    }'
launch_helper = '''    function closeSettings() {\n      settingsOverlay.classList.remove("show");\n    }\n\n    // 写真0枚でも更新不能にならないよう、起動画面にも設定入口を常設する。\n    document.addEventListener("DOMContentLoaded", () => {\n      const actions = document.querySelector(".launch-mode-actions");\n      if (!actions || document.getElementById("launchSettingsButton")) return;\n\n      const button = document.createElement("button");\n      button.id = "launchSettingsButton";\n      button.type = "button";\n      button.className = "launch-mode-button launch-settings-button";\n      button.textContent = "⚙ 設定・更新";\n      button.addEventListener("click", openSettings);\n      actions.appendChild(button);\n    });'''
if insert_marker not in settings:
    raise SystemExit('settings close marker not found')
settings = settings.replace(insert_marker, launch_helper, 1)
settings_path.write_text(settings, encoding='utf-8')

# Add launch settings button style without disturbing existing layout.
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
css_marker = '    .launch-import-button { background: linear-gradient(135deg, #27ae60, #168846); }'
css_replace = css_marker + '''\n    .launch-settings-button {\n      grid-column: 1 / -1;\n      min-height: 58px;\n      background: linear-gradient(135deg, #4b5563, #2f3742);\n      font-size: 17px;\n    }'''
if css_marker not in css:
    raise SystemExit('launch CSS marker not found')
css = css.replace(css_marker, css_replace, 1)
css_path.write_text(css, encoding='utf-8')

# Version bump only; no DB schema/storage format changes.
pwa = pwa.replace('const APP_VERSION = "v65.19";', 'const APP_VERSION = "v65.20";', 1)
pwa_path.write_text(pwa, encoding='utf-8')
sw = sw.replace('electronic-board-camera-v65.19', 'electronic-board-camera-v65.20', 1)
sw_path.write_text(sw, encoding='utf-8')
index = index.replace('id="settingsVersionText">v65.19<', 'id="settingsVersionText">v65.20<', 1)
index_path.write_text(index, encoding='utf-8')

if '# 電子看板カメラ v65.19' in readme:
    readme = readme.replace('# 電子看板カメラ v65.19', '# 電子看板カメラ v65.20', 1)
if '## v65.20 写真容量・推定撮影可能枚数' not in readme:
    readme += '''\n\n## v65.20 写真容量・推定撮影可能枚数\n- IndexedDB内写真の `dataUrl + baseDataUrl` をアプリ自身で集計し、写真枚数と写真データ容量を表示\n- `navigator.storage.estimate()` は「PWA全体の推定値」と明示して分離\n- 推定空き容量を表示\n- 現在の写真1枚あたり平均容量から推定撮影可能枚数を算出\n- 写真0枚時は「1枚撮影後に算出」と表示\n- 設定を開くたびに最新値を再集計\n- 起動画面へ「⚙ 設定・更新」を常設し、写真0枚でも更新可能にした\n- IndexedDB schema/version、Base64保存形式は変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')

(ROOT / 'docs/v65.20-storage-capacity.md').write_text('''# v65.20 写真容量・推定撮影可能枚数\n\n## 表示を分離\n- 写真：IndexedDB内の写真レコードをアプリ自身で集計した概算容量\n- PWA全体：StorageManager APIが返すブラウザ推定使用量\n- 推定空き容量：quota - usage\n- 推定撮影可能枚数：推定空き容量 ÷ 現在写真の平均容量\n\n## 注意\n推定撮影可能枚数はiOS/WebKitが返すquota/usageとJPEGの被写体差に左右されるため、保証値ではない。\n\n## UI改善\n写真0枚でプレビューを開けない場合でも更新できるよう、起動画面へ「設定・更新」を常設。\n''', encoding='utf-8')

for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('photo metrics', 'async function getPhotoStorageMetrics()' in storage_path.read_text(encoding='utf-8')),
    ('remaining count', '推定撮影可能枚数' in storage_path.read_text(encoding='utf-8')),
    ('launch settings', 'launchSettingsButton' in settings_path.read_text(encoding='utf-8')),
    ('version', 'const APP_VERSION = "v65.20";' in pwa_path.read_text(encoding='utf-8')),
    ('db untouched', 'electronic-board-camera-prototype' in (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.20 storage capacity validation passed')
