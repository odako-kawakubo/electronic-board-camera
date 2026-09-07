from pathlib import Path
import re
import subprocess

ROOT = Path('.')
store_path = ROOT / 'js/photo-store.js'
camera_path = ROOT / 'js/camera.js'
pwa_path = ROOT / 'js/pwa-controller.js'
sw_path = ROOT / 'service-worker.js'
index_path = ROOT / 'index.html'
readme_path = ROOT / 'README.md'

store = store_path.read_text(encoding='utf-8')
camera = camera_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

# photo-store: add read-back and structured diagnostics without changing DB schema.
old_save = '''  /**\n\n   * 写真1件を保存し、トランザクション完了後に成功=true / 失敗=falseを返す。\n\n   */\n\n  async function savePhoto(photo) {\n    try {\n      const db = await openDB();\n      await new Promise((resolve, reject) => {\n        const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");\n        const req = tx.objectStore(PHOTO_STORE_NAME).put(photo);\n        tx.oncomplete = () => resolve();\n        req.onerror = () => reject(req.error);\n        tx.onerror = () => reject(tx.error);\n        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));\n      });\n      return true;\n    } catch (error) {\n      console.error("写真の端末内保存に失敗しました", error);\n      return false;\n    }\n  }\n'''
new_save = '''  /**\n   * 写真1件をID指定で読み返す。保存直後検証にも利用する。\n   */\n  async function getPhoto(photoId) {\n    const db = await openDB();\n    return new Promise((resolve, reject) => {\n      const tx = db.transaction(PHOTO_STORE_NAME, "readonly");\n      const req = tx.objectStore(PHOTO_STORE_NAME).get(photoId);\n      req.onsuccess = () => resolve(req.result || null);\n      req.onerror = () => reject(req.error);\n      tx.onerror = () => reject(tx.error);\n      tx.onabort = () => reject(tx.error || new Error("写真読込を中断しました"));\n    });\n  }\n\n  function estimatePhotoBytes(photo) {\n    const dataUrlChars = String(photo && photo.dataUrl || "").length;\n    const baseDataUrlChars = String(photo && photo.baseDataUrl || "").length;\n    // Base64本体は概ね3/4。ヘッダやその他metadataを考慮して概算値として扱う。\n    return Math.round((dataUrlChars + baseDataUrlChars) * 0.75);\n  }\n\n  function normalizeStorageError(error) {\n    return {\n      name: String(error && error.name || "Error"),\n      message: String(error && error.message || error || "不明なエラー")\n    };\n  }\n\n  /**\n   * 写真1件を保存し、transaction完了後に同じIDをread-backして実在確認する。\n   * 戻り値は { ok, errorName, errorMessage, estimatedBytes }。\n   */\n  async function savePhoto(photo) {\n    const estimatedBytes = estimatePhotoBytes(photo);\n    try {\n      const db = await openDB();\n      await new Promise((resolve, reject) => {\n        const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");\n        const req = tx.objectStore(PHOTO_STORE_NAME).put(photo);\n        tx.oncomplete = () => resolve();\n        req.onerror = () => reject(req.error || new Error("写真putに失敗しました"));\n        tx.onerror = () => reject(tx.error || new Error("写真保存transactionでエラーが発生しました"));\n        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));\n      });\n\n      const stored = await getPhoto(photo.id);\n      if (!stored) throw new Error("保存直後の読み返しで写真が見つかりません");\n      if (stored.id !== photo.id) throw new Error("保存直後の読み返しで写真IDが一致しません");\n      if (!stored.dataUrl || !stored.baseDataUrl) throw new Error("保存直後の読み返しで画像データが不足しています");\n\n      return { ok: true, errorName: "", errorMessage: "", estimatedBytes };\n    } catch (error) {\n      const detail = normalizeStorageError(error);\n      console.error("写真の端末内保存に失敗しました", { ...detail, estimatedBytes, photoId: photo && photo.id });\n      return { ok: false, errorName: detail.name, errorMessage: detail.message, estimatedBytes };\n    }\n  }\n'''
if old_save not in store:
    raise SystemExit('photo-store save block not found')
store = store.replace(old_save, new_save, 1)
store = store.replace('    getAllPhotos,\n    savePhoto,', '    getAllPhotos,\n    getPhoto,\n    savePhoto,', 1)
store_path.write_text(store, encoding='utf-8')

# camera: handle structured save result and surface concise diagnostic.
old_camera = '''        // 保存成功を確認してから、撮影済み配列と表示枚数へ反映する\n        const photoSaved = await PhotoStore.savePhoto(photo);\n        if (!photoSaved) {\n          throw new Error("撮影写真を端末内へ保存できませんでした");\n        }\n\n        capturedPhotos.push(photo);'''
new_camera = '''        // transaction完了だけでなく、保存直後のread-backまで確認してから一覧へ反映する。\n        const saveResult = await PhotoStore.savePhoto(photo);\n        if (!saveResult || !saveResult.ok) {\n          const sizeMb = saveResult && Number.isFinite(saveResult.estimatedBytes)\n            ? (saveResult.estimatedBytes / (1024 * 1024)).toFixed(1)\n            : "?";\n          const errorName = saveResult && saveResult.errorName ? saveResult.errorName : "UnknownError";\n          const errorMessage = saveResult && saveResult.errorMessage ? saveResult.errorMessage : "保存できませんでした";\n          const error = new Error(`${errorName}: ${errorMessage} / 約${sizeMb}MB`);\n          error.storageDiagnostic = true;\n          throw error;\n        }\n\n        capturedPhotos.push(photo);'''
if old_camera not in camera:
    raise SystemExit('camera save block not found')
camera = camera.replace(old_camera, new_camera, 1)
old_catch = '''      } catch (error) {\n        console.error(error);\n        showErrorToast("撮影データの保存に失敗しました");\n        hideCapturedStill();\n      } finally {'''
new_catch = '''      } catch (error) {\n        console.error(error);\n        if (error && error.storageDiagnostic) {\n          showErrorToast(`保存失敗：${error.message}`);\n        } else {\n          showErrorToast("撮影データの保存に失敗しました");\n        }\n        hideCapturedStill();\n      } finally {'''
if old_catch not in camera:
    raise SystemExit('camera catch block not found')
camera = camera.replace(old_catch, new_catch, 1)
camera_path.write_text(camera, encoding='utf-8')

# Versions only. No offline-entry redesign in this release.
pwa = pwa.replace('const APP_VERSION = "v65.18";', 'const APP_VERSION = "v65.19";', 1)
pwa_path.write_text(pwa, encoding='utf-8')
sw = sw.replace('electronic-board-camera-v65.18', 'electronic-board-camera-v65.19', 1)
sw_path.write_text(sw, encoding='utf-8')
index = index.replace('id="settingsVersionText">v65.18<', 'id="settingsVersionText">v65.19<', 1)
index_path.write_text(index, encoding='utf-8')

readme = readme.replace('# 電子看板カメラ v65.18', '# 電子看板カメラ v65.19', 1)
if '## v65.19 端末保存診断・read-back確認' not in readme:
    readme += '''\n\n## v65.19 端末保存診断・read-back確認\n- PhotoStoreへ `getPhoto(photoId)` を追加\n- 保存成功判定をtransaction完了だけでなく同IDのread-back実在確認まで強化\n- `dataUrl` / `baseDataUrl` の存在も保存直後に確認\n- 保存失敗時にerror.name / error.message / 写真概算サイズを撮影画面へ表示\n- IndexedDB schema/version、Base64保存形式、撮影画質は変更なし\n- 圏外起動修正は保存原因特定後へ延期\n'''
readme_path.write_text(readme, encoding='utf-8')

(ROOT / 'docs/v65.19-storage-diagnostics.md').write_text('''# v65.19 端末保存診断・read-back確認\n\n## 実機症状\n撮影後に「撮影データの保存に失敗しました」と表示され、アプリ再起動後に写真が残らないことを確認。\n\n## この版の目的\n保存形式を変更せず、IndexedDB書込失敗の実体をiPhone実機で確認できるようにする。\n\n## 変更\n1. PhotoStore.savePhoto()はtransaction完了後に同じphotoIdを読み返す。\n2. id / dataUrl / baseDataUrl の実在を確認する。\n3. 保存失敗時は error.name / error.message / dataUrl+baseDataUrl概算サイズを返す。\n4. camera.jsは診断情報を画面に表示し、成功確認前はcapturedPhotosへ追加しない。\n\n## 変更しないもの\n- IndexedDB `electronic-board-camera-prototype` version 2\n- `photos` / `importSessions` store\n- Base64保存形式\n- 解像度・JPEG品質\n- ファイル名規則\n''', encoding='utf-8')

# Static validation.
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

store = store_path.read_text(encoding='utf-8')
camera = camera_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
checks = [
    ('getPhoto exists', 'async function getPhoto(photoId)' in store),
    ('readback exists', 'const stored = await getPhoto(photo.id);' in store),
    ('structured result', 'return { ok: true' in store and 'return { ok: false' in store),
    ('camera checks result', 'saveResult.ok' in camera),
    ('camera diagnostic text', '保存失敗：' in camera),
    ('db version unchanged', 'const DB_VERSION = 2;' in store),
    ('pwa v65.19', 'const APP_VERSION = "v65.19";' in pwa),
    ('sw v65.19', 'electronic-board-camera-v65.19' in sw),
    ('html v65.19', 'id="settingsVersionText">v65.19<' in index),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.19 storage diagnostics validation passed')
