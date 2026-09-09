from pathlib import Path
import subprocess

ROOT = Path('.')

photo_state = '''/*
 * ============================================================
 * photo-state.js - 画面側写真状態 / PhotoStore更新窓口
 * ============================================================
 * 責務:
 * - capturedPhotosを所有する
 * - 新規追加、更新、削除、DB再読込をPhotoStore成功後だけ画面状態へ確定する
 *
 * 保守上の注意:
 * - 永続正本はPhotoStore / IndexedDB。
 * - 他モジュールはcapturedPhotosを参照してよいが、push/splice/プロパティ変更はPhotoState経由にする。
 * ============================================================
 */

const capturedPhotos = [];

(function () {
  "use strict";

  function restoreObject(target, snapshot) {
    Object.keys(target).forEach((key) => {
      if (!(key in snapshot)) delete target[key];
    });
    Object.assign(target, snapshot);
  }

  async function reload() {
    const photos = await PhotoStore.getAllPhotos();
    photos.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    capturedPhotos.splice(0, capturedPhotos.length, ...photos);
    return capturedPhotos;
  }

  async function addNew(photo) {
    const result = await PhotoStore.savePhoto(photo);
    if (!result || !result.ok) return result || { ok: false, errorName: "UnknownError", errorMessage: "保存できませんでした" };
    capturedPhotos.push(photo);
    return result;
  }

  async function update(photo, mutator) {
    if (!photo || typeof mutator !== "function") {
      return { ok: false, errorName: "InvalidPhotoUpdate", errorMessage: "更新対象が不正です" };
    }
    const previous = { ...photo };
    mutator(photo);
    const result = await PhotoStore.savePhoto(photo);
    if (!result || !result.ok) {
      restoreObject(photo, previous);
      return result || { ok: false, errorName: "UnknownError", errorMessage: "保存できませんでした" };
    }
    return result;
  }

  async function deleteMany(photos) {
    const targets = Array.from(photos || []).filter(Boolean);
    const deletedIds = new Set();
    const failed = [];

    for (const photo of targets) {
      try {
        await PhotoStore.deletePhoto(photo.id);
        deletedIds.add(photo.id);
      } catch (error) {
        failed.push({ photo, error });
      }
    }

    if (deletedIds.size) {
      for (let i = capturedPhotos.length - 1; i >= 0; i--) {
        if (deletedIds.has(capturedPhotos[i].id)) capturedPhotos.splice(i, 1);
      }
    }

    return { ok: failed.length === 0, deletedIds, failed };
  }

  window.PhotoState = Object.freeze({
    items: capturedPhotos,
    reload,
    addNew,
    update,
    deleteMany
  });
})();
'''
(ROOT/'js/photo-state.js').write_text(photo_state, encoding='utf-8')

# shared-state: capturedPhotos ownership removed
shared_path = ROOT/'js/shared-state.js'
shared = shared_path.read_text(encoding='utf-8')
shared = shared.replace('    const capturedPhotos = [];\n', '', 1)
shared = shared.replace(' * - camera / board / import / viewer / photo-utils など複数モジュールが\n', ' * - camera / board / import / viewer / photo-utils など複数モジュールが\n', 1)
shared_path.write_text(shared, encoding='utf-8')

# camera: save + push -> PhotoState.addNew
camera_path = ROOT/'js/camera.js'
camera = camera_path.read_text(encoding='utf-8')
camera = camera.replace('const saveResult = await PhotoStore.savePhoto(photo);', 'const saveResult = await PhotoState.addNew(photo);', 1)
camera = camera.replace('''
        capturedPhotos.push(photo);
        previewIndex = capturedPhotos.length - 1;''', '''
        previewIndex = capturedPhotos.length - 1;''', 1)
camera_path.write_text(camera, encoding='utf-8')

# import: same
imp_path = ROOT/'js/photo-import.js'
imp = imp_path.read_text(encoding='utf-8')
imp = imp.replace('const importedPhotoSaved = await PhotoStore.savePhoto(photo);', 'const importedPhotoSaved = await PhotoState.addNew(photo);', 1)
imp = imp.replace('''
        capturedPhotos.push(photo);
        previewIndex = capturedPhotos.length - 1;''', '''
        previewIndex = capturedPhotos.length - 1;''', 1)
imp_path.write_text(imp, encoding='utf-8')

# photo-utils: reload centralized
utils_path = ROOT/'js/photo-utils.js'
utils = utils_path.read_text(encoding='utf-8')
old = '''        const photos = await PhotoStore.getAllPhotos();

        capturedPhotos.splice(0, capturedPhotos.length, ...photos.sort((a, b) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }));'''
new = '''        await PhotoState.reload();'''
if old not in utils: raise SystemExit('photo-utils load block missing')
utils = utils.replace(old, new, 1)
utils_path.write_text(utils, encoding='utf-8')

# album: all mutation/delete through PhotoState
album_path = ROOT/'js/photo-album.js'
album = album_path.read_text(encoding='utf-8')
old = '''      const previousSelected = Boolean(photo.selected);
      photo.selected = !previousSelected;
      const result = await PhotoStore.savePhoto(photo);
      if (!result || !result.ok) {
        photo.selected = previousSelected;
        showErrorToast("写真の選択状態を保存できませんでした");
      }'''
new = '''      const nextSelected = !Boolean(photo.selected);
      const result = await PhotoState.update(photo, (draft) => {
        draft.selected = nextSelected;
      });
      if (!result || !result.ok) showErrorToast("写真の選択状態を保存できませんでした");'''
if old not in album: raise SystemExit('album single select missing')
album = album.replace(old, new, 1)
old = '''      for (const photo of photos) {
        const previousSelected = Boolean(photo.selected);
        photo.selected = nextSelected;
        const result = await PhotoStore.savePhoto(photo);
        if (!result || !result.ok) {
          photo.selected = previousSelected;
          failedCount += 1;
        }
      }'''
new = '''      for (const photo of photos) {
        const result = await PhotoState.update(photo, (draft) => {
          draft.selected = nextSelected;
        });
        if (!result || !result.ok) failedCount += 1;
      }'''
if old not in album: raise SystemExit('album all select missing')
album = album.replace(old, new, 1)
old_start = album.index('      const selectedIds = new Set(selectedPhotos.map((photo) => photo.id));')
old_end = album.index('      const remainingPhotos = getPreviewPhotos();', old_start)
replacement = '''      const deleteResult = await PhotoState.deleteMany(selectedPhotos);
      if (!deleteResult.ok) {
        showErrorToast(`削除失敗：${deleteResult.failed.length}枚`);
      }

'''
album = album[:old_start] + replacement + album[old_end:]
album = album.replace('      showToast("削除しました");', '      if (deleteResult.ok) showToast("削除しました");', 1)
album_path.write_text(album, encoding='utf-8')

# viewer: correction/save flags through PhotoState
viewer_path = ROOT/'js/photo-viewer.js'
viewer = viewer_path.read_text(encoding='utf-8')
start = viewer.index('        // DB保存に失敗した場合、画面上のphotoだけ新状態にしないため旧値を退避する。')
end = viewer.index('        previewIndex = Math.max(0, getPreviewPhotos().findIndex((item) => item.id === photo.id));', start)
replacement = '''        const correctedType = getCurrentPhotoType();
        const correctedParts = parseSampleAndPoint(sampleNoInput.value);
        const nextFileName = generatePhotoFileName(correctedParts.sampleNo, correctedParts.pointNo, correctedType.code, photo.id);
        const correctedPhotoSaved = await PhotoState.update(photo, (draft) => {
          draft.dataUrl = newDataUrl;
          draft.subjectName = getCurrentSubjectName();
          draft.roomNo = roomNoInput.value.trim();
          draft.status = correctedType.value;
          draft.statusLabel = correctedType.label;
          draft.statusCode = correctedType.code;
          draft.sampleNo = correctedParts.sampleNo;
          draft.pointNo = correctedParts.pointNo;
          draft.isSection = correctedType.value === SECTION_PHOTO_TYPE.value;
          draft.fileName = nextFileName;
          draft.updatedAt = new Date().toISOString();
        });
        if (!correctedPhotoSaved || !correctedPhotoSaved.ok) {
          const detail = correctedPhotoSaved && correctedPhotoSaved.errorMessage ? correctedPhotoSaved.errorMessage : "保存できませんでした";
          throw new Error(`看板修正後の写真を端末内へ保存できませんでした: ${detail}`);
        }
'''
viewer = viewer[:start] + replacement + viewer[end:]
old = '''      for (const photo of photos) {
        const previousSavedLocal = photo.savedLocal;
        const previousSavedAt = photo.savedAt;
        photo.savedLocal = true;
        photo.savedAt = savedAt;

        const result = await PhotoStore.savePhoto(photo);
        if (!result || !result.ok) {
          // DBへ反映できなかった場合はメモリ上の表示だけ保存済みにしない。
          photo.savedLocal = previousSavedLocal;
          photo.savedAt = previousSavedAt;
          failedCount += 1;
          console.warn("保存済マークの更新に失敗しました", result);
        }
      }'''
new = '''      for (const photo of photos) {
        const result = await PhotoState.update(photo, (draft) => {
          draft.savedLocal = true;
          draft.savedAt = savedAt;
        });
        if (!result || !result.ok) {
          failedCount += 1;
          console.warn("保存済マークの更新に失敗しました", result);
        }
      }'''
if old not in viewer: raise SystemExit('viewer saved flags missing')
viewer = viewer.replace(old, new, 1)
viewer_path.write_text(viewer, encoding='utf-8')

# index order: PhotoStore -> PhotoState -> CaseSession
index_path = ROOT/'index.html'
index = index_path.read_text(encoding='utf-8')
needle = '  <script src="./js/photo-store.js"></script>\n'
index = index.replace(needle, needle + '  <script src="./js/photo-state.js"></script>\n', 1)
index = index.replace('id="settingsVersionText">v65.27<', 'id="settingsVersionText">v65.28<', 1)
index_path.write_text(index, encoding='utf-8')

sw_path = ROOT/'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.27', 'electronic-board-camera-v65.28', 1)
needle = '  "./js/photo-store.js",\n'
sw = sw.replace(needle, needle + '  "./js/photo-state.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

pwa_path = ROOT/'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.27";', 'const APP_VERSION = "v65.28";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme_path = ROOT/'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.27', '# 電子看板カメラ v65.28', 1)
readme += '''\n\n## v65.28 写真状態更新経路一本化\n- `photo-state.js` がcapturedPhotosを所有\n- 新規追加/更新/削除/再読込をPhotoState経由へ統一\n- DB保存成功後だけ画面状態を確定し、失敗時は自動ロールバック\n- camera/import/album/viewerの直接push/splice/プロパティ更新を整理\n- 永続正本は従来どおりPhotoStore / IndexedDB\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT/'docs/v65.28-photo-state.md').write_text('''# v65.28 写真状態更新経路一本化\n\nPhotoStoreを永続正本、PhotoStateを画面側の唯一の更新窓口とする。\nDB保存に失敗した変更はcapturedPhotosへ確定しない。\n''', encoding='utf-8')

for js in sorted((ROOT/'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('capturedPhotos moved', 'const capturedPhotos = [];' in (ROOT/'js/photo-state.js').read_text(encoding='utf-8')),
    ('shared removed', 'const capturedPhotos = [];' not in shared_path.read_text(encoding='utf-8')),
    ('camera state add', 'PhotoState.addNew(photo)' in camera_path.read_text(encoding='utf-8')),
    ('import state add', 'PhotoState.addNew(photo)' in imp_path.read_text(encoding='utf-8')),
    ('album state update', 'PhotoState.update(photo' in album_path.read_text(encoding='utf-8')),
    ('viewer state update', 'PhotoState.update(photo' in viewer_path.read_text(encoding='utf-8')),
    ('version', 'v65.28' in index_path.read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok: raise SystemExit(label + ' validation failed')
print('v65.28 validation passed')
