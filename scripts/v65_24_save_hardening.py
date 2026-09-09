from pathlib import Path
import subprocess

ROOT = Path('.')

# ------------------------------------------------------------
# photo-store.js
# ------------------------------------------------------------
store_path = ROOT / 'js/photo-store.js'
store = store_path.read_text(encoding='utf-8')
old = '''      const stored = await getPhoto(photo.id);\n      if (!stored) throw new Error("保存直後の読み返しで写真が見つかりません");\n      if (stored.id !== photo.id) throw new Error("保存直後の読み返しで写真IDが一致しません");\n      if (!stored.dataUrl || !stored.baseDataUrl) throw new Error("保存直後の読み返しで画像データが不足しています");\n\n      return { ok: true, errorName: "", errorMessage: "", estimatedBytes };'''
new = '''      const stored = await getPhoto(photo.id);\n      if (!stored) throw new Error("保存直後の読み返しで写真が見つかりません");\n      if (stored.id !== photo.id) throw new Error("保存直後の読み返しで写真IDが一致しません");\n      if (!stored.dataUrl) throw new Error("保存直後の読み返しで完成画像が不足しています");\n\n      // 元画像はカメラ撮影では必須だが、既存写真への看板添付では仕様上保持しない。\n      // 保存前のphotoがbaseDataUrlを持っていた場合だけ、read-backでも存在確認する。\n      if (photo.baseDataUrl && !stored.baseDataUrl) {\n        throw new Error("保存直後の読み返しで元画像が不足しています");\n      }\n\n      return { ok: true, errorName: "", errorMessage: "", estimatedBytes };'''
if old not in store:
    raise SystemExit('photo-store read-back block not found')
store = store.replace(old, new, 1)
store_path.write_text(store, encoding='utf-8')

# ------------------------------------------------------------
# photo-viewer.js
# ------------------------------------------------------------
viewer_path = ROOT / 'js/photo-viewer.js'
viewer = viewer_path.read_text(encoding='utf-8')

old = '''        photo.dataUrl = newDataUrl;\n        photo.subjectName = getCurrentSubjectName();\n        photo.roomNo = roomNoInput.value.trim();\n        const correctedType = getCurrentPhotoType();\n        const correctedParts = parseSampleAndPoint(sampleNoInput.value);\n        photo.status = correctedType.value;\n        photo.statusLabel = correctedType.label;\n        photo.statusCode = correctedType.code;\n        photo.sampleNo = correctedParts.sampleNo;\n        photo.pointNo = correctedParts.pointNo;\n        photo.isSection = correctedType.value === SECTION_PHOTO_TYPE.value;\n        // v61: 編集後の新しい基本名に対して、対象写真自身を除外して再採番する。\n        photo.fileName = generatePhotoFileName(photo.sampleNo, photo.pointNo, photo.statusCode, photo.id);\n        photo.updatedAt = new Date().toISOString();\n\n        const correctedPhotoSaved = await PhotoStore.savePhoto(photo);\n        if (!correctedPhotoSaved) {\n          throw new Error("看板修正後の写真を端末内へ保存できませんでした");\n        }'''
new = '''        // DB保存に失敗した場合、画面上のphotoだけ新状態にしないため旧値を退避する。\n        const previousPhotoState = {\n          dataUrl: photo.dataUrl,\n          subjectName: photo.subjectName,\n          roomNo: photo.roomNo,\n          status: photo.status,\n          statusLabel: photo.statusLabel,\n          statusCode: photo.statusCode,\n          sampleNo: photo.sampleNo,\n          pointNo: photo.pointNo,\n          isSection: photo.isSection,\n          fileName: photo.fileName,\n          updatedAt: photo.updatedAt\n        };\n\n        photo.dataUrl = newDataUrl;\n        photo.subjectName = getCurrentSubjectName();\n        photo.roomNo = roomNoInput.value.trim();\n        const correctedType = getCurrentPhotoType();\n        const correctedParts = parseSampleAndPoint(sampleNoInput.value);\n        photo.status = correctedType.value;\n        photo.statusLabel = correctedType.label;\n        photo.statusCode = correctedType.code;\n        photo.sampleNo = correctedParts.sampleNo;\n        photo.pointNo = correctedParts.pointNo;\n        photo.isSection = correctedType.value === SECTION_PHOTO_TYPE.value;\n        // v61: 編集後の新しい基本名に対して、対象写真自身を除外して再採番する。\n        photo.fileName = generatePhotoFileName(photo.sampleNo, photo.pointNo, photo.statusCode, photo.id);\n        photo.updatedAt = new Date().toISOString();\n\n        const correctedPhotoSaved = await PhotoStore.savePhoto(photo);\n        if (!correctedPhotoSaved || !correctedPhotoSaved.ok) {\n          Object.assign(photo, previousPhotoState);\n          const detail = correctedPhotoSaved && correctedPhotoSaved.errorMessage\n            ? correctedPhotoSaved.errorMessage\n            : "保存できませんでした";\n          throw new Error(`看板修正後の写真を端末内へ保存できませんでした: ${detail}`);\n        }'''
if old not in viewer:
    raise SystemExit('viewer correction save block not found')
viewer = viewer.replace(old, new, 1)

old = '''    async function markPhotosAsSaved(photos) {\n      const savedAt = new Date().toISOString();\n      for (const photo of photos) {\n        photo.savedLocal = true;\n        photo.savedAt = savedAt;\n        try {\n          await PhotoStore.savePhoto(photo);\n        } catch (error) {\n          console.warn("保存済マークの更新に失敗しました", error);\n        }\n      }\n    }'''
new = '''    async function markPhotosAsSaved(photos) {\n      const savedAt = new Date().toISOString();\n      let failedCount = 0;\n\n      for (const photo of photos) {\n        const previousSavedLocal = photo.savedLocal;\n        const previousSavedAt = photo.savedAt;\n        photo.savedLocal = true;\n        photo.savedAt = savedAt;\n\n        const result = await PhotoStore.savePhoto(photo);\n        if (!result || !result.ok) {\n          // DBへ反映できなかった場合はメモリ上の表示だけ保存済みにしない。\n          photo.savedLocal = previousSavedLocal;\n          photo.savedAt = previousSavedAt;\n          failedCount += 1;\n          console.warn("保存済マークの更新に失敗しました", result);\n        }\n      }\n\n      if (failedCount) {\n        showErrorToast(`保存状態の更新に失敗：${failedCount}枚`);\n      }\n    }'''
if old not in viewer:
    raise SystemExit('viewer mark saved block not found')
viewer = viewer.replace(old, new, 1)
viewer_path.write_text(viewer, encoding='utf-8')

# ------------------------------------------------------------
# photo-album.js
# ------------------------------------------------------------
album_path = ROOT / 'js/photo-album.js'
album = album_path.read_text(encoding='utf-8')
old = '''    async function togglePhotoSelected(index, options = {}) {\n      const photos = getPreviewPhotos();\n      const photo = photos[index];\n      if (!photo) return;\n      photo.selected = !photo.selected;\n      await PhotoStore.savePhoto(photo);\n      updatePhotoCount();\n      renderPreview();\n\n      if (options.keepListMode) {\n        setPreviewListMode(true);\n      }\n    }'''
new = '''    async function togglePhotoSelected(index, options = {}) {\n      const photos = getPreviewPhotos();\n      const photo = photos[index];\n      if (!photo) return;\n\n      const previousSelected = Boolean(photo.selected);\n      photo.selected = !previousSelected;\n      const result = await PhotoStore.savePhoto(photo);\n      if (!result || !result.ok) {\n        photo.selected = previousSelected;\n        showErrorToast("写真の選択状態を保存できませんでした");\n      }\n\n      updatePhotoCount();\n      renderPreview();\n\n      if (options.keepListMode) {\n        setPreviewListMode(true);\n      }\n    }'''
if old not in album:
    raise SystemExit('album toggle selected block not found')
album = album.replace(old, new, 1)

old = '''    async function toggleSelectAllPhotos() {\n      const photos = getPreviewPhotos();\n      if (!photos.length) {\n        showToast("撮影した写真がありません");\n        return;\n      }\n\n      const allSelected = photos.every((photo) => photo.selected);\n      const nextSelected = !allSelected;\n\n      for (const photo of photos) {\n        photo.selected = nextSelected;\n        await PhotoStore.savePhoto(photo);\n      }\n\n      updatePhotoCount();\n      renderPreview();\n      showToast(nextSelected ? "表示中の写真を全選択しました" : "表示中の写真を全解除しました");\n    }'''
new = '''    async function toggleSelectAllPhotos() {\n      const photos = getPreviewPhotos();\n      if (!photos.length) {\n        showToast("撮影した写真がありません");\n        return;\n      }\n\n      const allSelected = photos.every((photo) => photo.selected);\n      const nextSelected = !allSelected;\n      let failedCount = 0;\n\n      for (const photo of photos) {\n        const previousSelected = Boolean(photo.selected);\n        photo.selected = nextSelected;\n        const result = await PhotoStore.savePhoto(photo);\n        if (!result || !result.ok) {\n          photo.selected = previousSelected;\n          failedCount += 1;\n        }\n      }\n\n      updatePhotoCount();\n      renderPreview();\n      if (failedCount) {\n        showErrorToast(`選択状態の保存に失敗：${failedCount}枚`);\n      } else {\n        showToast(nextSelected ? "表示中の写真を全選択しました" : "表示中の写真を全解除しました");\n      }\n    }'''
if old not in album:
    raise SystemExit('album select all block not found')
album = album.replace(old, new, 1)
album_path.write_text(album, encoding='utf-8')

# ------------------------------------------------------------
# photo-import.js: error message includes structured save detail
# ------------------------------------------------------------
imp_path = ROOT / 'js/photo-import.js'
imp = imp_path.read_text(encoding='utf-8')
old = '''        if (!importedPhotoSaved || !importedPhotoSaved.ok) {\n          const detail = importedPhotoSaved && importedPhotoSaved.errorMessage ? importedPhotoSaved.errorMessage : "保存できませんでした";\n          throw new Error(`読み込み写真を端末内へ保存できませんでした: ${detail}`);\n        }'''
new = '''        if (!importedPhotoSaved || !importedPhotoSaved.ok) {\n          const errorName = importedPhotoSaved && importedPhotoSaved.errorName ? importedPhotoSaved.errorName : "UnknownError";\n          const detail = importedPhotoSaved && importedPhotoSaved.errorMessage ? importedPhotoSaved.errorMessage : "保存できませんでした";\n          throw new Error(`読み込み写真を端末内へ保存できませんでした: ${errorName}: ${detail}`);\n        }'''
if old not in imp:
    raise SystemExit('import save check block not found')
imp = imp.replace(old, new, 1)
imp_path.write_text(imp, encoding='utf-8')

# ------------------------------------------------------------
# Version and docs
# ------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8').replace('id="settingsVersionText">v65.23<', 'id="settingsVersionText">v65.24<', 1)
index_path.write_text(index, encoding='utf-8')

pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.23";', 'const APP_VERSION = "v65.24";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.23', 'electronic-board-camera-v65.24', 1)
sw_path.write_text(sw, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.23', '# 電子看板カメラ v65.24', 1)
if '## v65.24 保存判定安定化' not in readme:
    readme += '''\n\n## v65.24 保存判定安定化\n- 既存写真への看板添付は元画像(baseDataUrl)を保持しない仕様のため、完成画像のread-backを必須・元画像は保存対象に存在する場合のみ確認\n- 看板修正時にPhotoStore.savePhoto()の構造化結果 `ok` を確認\n- 看板修正保存失敗時はメモリ上の写真情報を旧値へ戻す\n- 写真選択/全選択の保存結果を確認し、失敗時はメモリ状態を戻す\n- 外部保存済みマークの保存結果を確認し、失敗時は保存済み表示だけ残さない\n- DB schema/versionは2のまま変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')

(ROOT / 'docs/v65.24-save-hardening.md').write_text('''# v65.24 保存判定安定化\n\n## 目的\nv65.23実機確認前に、PhotoStoreの構造化保存結果と各UI側の判定を揃える。\n\n## 修正\n- 完成画像 `dataUrl` は常にread-back必須。\n- 元画像 `baseDataUrl` は保存前レコードが保持している場合だけread-back必須。既存写真への看板添付は元画像を保持しないため正常扱い。\n- 看板修正、選択状態、全選択、保存済みマークは `{ok:false}` を失敗として扱う。\n- DB保存失敗時は、先に変更したメモリ上の状態を旧値へ戻す。\n\nDB versionは2のまま。\n''', encoding='utf-8')

# ------------------------------------------------------------
# Validation
# ------------------------------------------------------------
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('conditional base readback', 'if (photo.baseDataUrl && !stored.baseDataUrl)' in store_path.read_text(encoding='utf-8')),
    ('viewer checks ok', '!correctedPhotoSaved.ok' in viewer_path.read_text(encoding='utf-8')),
    ('viewer rollback', 'Object.assign(photo, previousPhotoState)' in viewer_path.read_text(encoding='utf-8')),
    ('album checks ok', '!result.ok' in album_path.read_text(encoding='utf-8')),
    ('import structured error', 'UnknownError' in imp_path.read_text(encoding='utf-8')),
    ('version 65.24', 'v65.24' in index_path.read_text(encoding='utf-8')),
    ('db unchanged', 'const DB_VERSION = 2;' in store_path.read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.24 validation passed')
