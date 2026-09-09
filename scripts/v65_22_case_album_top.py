from pathlib import Path
import subprocess

ROOT = Path('.')
album_path = ROOT / 'js/photo-album.js'
viewer_path = ROOT / 'js/photo-viewer.js'
import_path = ROOT / 'js/photo-import.js'
index_path = ROOT / 'index.html'
css_path = ROOT / 'styles/app.css'
sw_path = ROOT / 'service-worker.js'
pwa_path = ROOT / 'js/pwa-controller.js'
readme_path = ROOT / 'README.md'
doc_path = ROOT / 'docs/v65.22-case-album-top.md'

album = album_path.read_text(encoding='utf-8')
album = album.replace('''    let isPreviewListMode = false;\n    let previewSortMode = "shooting";\n    let selectedCaseSubject = "";\n\n    function getPhotoSubject(photo) {\n      return String(photo.subjectName || photo.subject || APP_DATA.subject || "無題案件").trim() || "無題案件";\n    }\n\n    function getCaseSummaries() {\n      const map = new Map();\n\n      capturedPhotos.forEach((photo) => {\n        const subject = getPhotoSubject(photo);\n        const current = map.get(subject) || { subject, count: 0, latest: 0 };\n        current.count += 1;\n        current.latest = Math.max(current.latest, new Date(photo.createdAt || 0).getTime());\n        map.set(subject, current);\n      });\n\n      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);\n    }\n\n    function getLatestCaseSubject() {\n      const cases = getCaseSummaries();\n      return cases.length ? cases[0].subject : "";\n    }\n\n    function getPreviewPhotos() {\n      let photos = capturedPhotos.slice();\n\n      if (selectedCaseSubject) {\n        photos = photos.filter((photo) => getPhotoSubject(photo) === selectedCaseSubject);\n      }\n''', '''    let isPreviewListMode = false;\n    let previewSortMode = "shooting";\n    let selectedCaseKey = "";\n\n    function getPhotoSubject(photo) {\n      return String(photo.subjectName || photo.subject || APP_DATA.subject || "無題案件").trim() || "無題案件";\n    }\n\n    // v65.22以降は案件番号(caseId)を写真所属の正本とする。\n    // 旧版写真にはcaseIdがないため、その写真だけ従来の件名グループへ退避する。\n    function getPhotoCaseKey(photo) {\n      const caseId = String(photo.caseId || "").trim();\n      return caseId ? `case:${caseId}` : `legacy:${getPhotoSubject(photo)}`;\n    }\n\n    function getPhotoCaseId(photo) {\n      return String(photo.caseId || "").trim();\n    }\n\n    function getCaseSummaries() {\n      const map = new Map();\n\n      capturedPhotos.forEach((photo) => {\n        const key = getPhotoCaseKey(photo);\n        const caseId = getPhotoCaseId(photo);\n        const subject = getPhotoSubject(photo);\n        const photoTime = new Date(photo.createdAt || 0).getTime();\n        const current = map.get(key) || { key, caseId, subject, count: 0, latest: 0 };\n        current.count += 1;\n        // 件名は識別キーに使わず、その案件で最も新しい写真の看板件名を表示名に使う。\n        if (photoTime >= current.latest) {\n          current.latest = photoTime;\n          current.subject = subject;\n        }\n        map.set(key, current);\n      });\n\n      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);\n    }\n\n    function getCaseDisplayName(item) {\n      if (!item) return "案件なし";\n      return item.caseId ? `${item.caseId}_${item.subject}` : item.subject;\n    }\n\n    function getLatestCaseKey() {\n      const cases = getCaseSummaries();\n      return cases.length ? cases[0].key : "";\n    }\n\n    function getSelectedCaseSummary() {\n      const cases = getCaseSummaries();\n      return cases.find((item) => item.key === selectedCaseKey) || cases[0] || null;\n    }\n\n    function getPreviewPhotos() {\n      let photos = capturedPhotos.slice();\n\n      if (selectedCaseKey) {\n        photos = photos.filter((photo) => getPhotoCaseKey(photo) === selectedCaseKey);\n      }\n''', 1)

album = album.replace('''        const title = selectedCaseSubject || getLatestCaseSubject() || "案件なし";\n        const count = getPreviewPhotos().length;\n        caseSelectButton.textContent = `${title}　${count}枚 ▼`;''', '''        const summary = getSelectedCaseSummary();\n        const title = getCaseDisplayName(summary);\n        const count = getPreviewPhotos().length;\n        caseSelectButton.textContent = `${title}　${count}枚 ▼`;''', 1)

album = album.replace('''        button.classList.toggle("active", item.subject === selectedCaseSubject);\n        button.onclick = () => {\n          selectedCaseSubject = item.subject;''', '''        button.classList.toggle("active", item.key === selectedCaseKey);\n        button.onclick = () => {\n          selectedCaseKey = item.key;''', 1)
album = album.replace('''        name.textContent = item.subject;''', '''        name.textContent = getCaseDisplayName(item);''', 1)

if 'selectedCaseSubject' in album:
    raise SystemExit('selectedCaseSubject remains in photo-album.js')
album_path.write_text(album, encoding='utf-8')

viewer = viewer_path.read_text(encoding='utf-8')
viewer = viewer.replace('''      selectedCaseSubject = getLatestCaseSubject();''', '''      selectedCaseKey = getLatestCaseKey();''', 1)
close_marker = '''    async function closePreview() {\n      isBoardCorrectionSelectMode = false;\n      previewOverlay.classList.remove("board-correction-selecting");\n      previewOverlay.classList.remove("show");\n      setPreviewListMode(false);\n\n      /*\n       * 戻るを押したらカメラ画面へ復帰\n       * PWAでカメラが止まっていたら再取得を試す\n       */\n      await resumeCameraAfterPreview();\n    }\n'''
if close_marker not in viewer:
    raise SystemExit('closePreview marker not found')
viewer = viewer.replace(close_marker, close_marker + '''\n    /**\n     * 写真一覧から起動画面へ戻る。撮影画面にはトップ導線を置かない。\n     * カメラストリームは止め、起動方法を改めて選べる状態へ戻す。\n     */\n    async function returnToTopScreen() {\n      isBoardCorrectionSelectMode = false;\n      previewOverlay.classList.remove("board-correction-selecting", "show");\n      setPreviewListMode(false);\n      if (typeof stopCurrentStream === "function") stopCurrentStream();\n      if (typeof showStartButton === "function") showStartButton();\n      if (typeof closeSettings === "function") closeSettings();\n      if (typeof closeCasePicker === "function") closeCasePicker();\n      if (launchModeOverlay) launchModeOverlay.classList.remove("hidden");\n      if (typeof refreshImportResumePanel === "function") await refreshImportResumePanel();\n    }\n''', 1)
viewer_path.write_text(viewer, encoding='utf-8')

# Imported photos must belong to the same current case-session as camera photos.
imp = import_path.read_text(encoding='utf-8')
marker = '''        const photoType = getCurrentPhotoType();\n        const sampleParts = parseSampleAndPoint(sampleNoInput.value);\n        const createdAt = new Date();\n        const photo = {'''
if marker not in imp:
    raise SystemExit('import photo marker not found')
imp = imp.replace(marker, '''        const photoType = getCurrentPhotoType();\n        const sampleParts = parseSampleAndPoint(sampleNoInput.value);\n        const createdAt = new Date();\n        const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;\n        const photo = {''', 1)
field_marker = '''          subjectName: getCurrentSubjectName(),\n          isSection: photoType.value === SECTION_PHOTO_TYPE.value,'''
if field_marker not in imp:
    raise SystemExit('import subject marker not found')
imp = imp.replace(field_marker, '''          subjectName: getCurrentSubjectName(),\n          caseId: caseSession ? caseSession.id : "",\n          caseDate: caseSession ? caseSession.dateCode : "",\n          caseBranch: caseSession ? caseSession.branch : null,\n          deviceName: caseSession ? caseSession.deviceName : "",\n          oneDriveFolderName: caseSession ? caseSession.folderName : "",\n          uploadStatus: "pending",\n          uploadedAt: "",\n          oneDriveItemId: "",\n          isSection: photoType.value === SECTION_PHOTO_TYPE.value,''', 1)
# v65.19 savePhoto returns a structured result; keep import path consistent.
imp = imp.replace('''        const importedPhotoSaved = await PhotoStore.savePhoto(photo);\n        if (!importedPhotoSaved) {\n          throw new Error("読み込み写真を端末内へ保存できませんでした");\n        }''', '''        const importedPhotoSaved = await PhotoStore.savePhoto(photo);\n        if (!importedPhotoSaved || !importedPhotoSaved.ok) {\n          const detail = importedPhotoSaved && importedPhotoSaved.errorMessage ? importedPhotoSaved.errorMessage : "保存できませんでした";\n          throw new Error(`読み込み写真を端末内へ保存できませんでした: ${detail}`);\n        }''', 1)
import_path.write_text(imp, encoding='utf-8')

index = index_path.read_text(encoding='utf-8')
index = index.replace('''    <div class="preview-topbar">\n      <button id="settingsButton" class="settings-button" type="button" aria-label="設定">⚙</button>\n    </div>''', '''    <div class="preview-topbar">\n      <button id="previewTopButton" class="preview-top-button" type="button" onclick="returnToTopScreen()">トップ</button>\n      <button id="settingsButton" class="settings-button" type="button" aria-label="設定">⚙</button>\n    </div>''', 1)
index = index.replace('id="settingsVersionText">v65.21<', 'id="settingsVersionText">v65.22<', 1)
index_path.write_text(index, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
if '.preview-top-button {' not in css:
    css += r'''

    /* v65.22 アルバムからトップ画面へ戻る。撮影画面には表示しない。 */
    .preview-top-button {
      min-width: 72px;
      height: 38px;
      padding: 0 14px;
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 10px;
      background: rgba(0,0,0,.48);
      color: #fff;
      font: 800 14px/1 inherit;
      cursor: pointer;
    }
    .preview-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
'''
css_path.write_text(css, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.21', 'electronic-board-camera-v65.22', 1)
sw_path.write_text(sw, encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.21";', 'const APP_VERSION = "v65.22";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme = readme_path.read_text(encoding='utf-8')
readme = readme.replace('# 電子看板カメラ v65.21', '# 電子看板カメラ v65.22', 1)
if '## v65.22 案件別アルバム / トップ導線' not in readme:
    readme += '''\n\n## v65.22 案件別アルバム / トップ導線\n- 新規写真は `caseId`（現状 `yymmdd_枝番`）で案件グループを固定\n- アルバム表示名は `案件番号_件名`\n- 件名は識別キーにせず、その案件で最も新しい写真の看板件名を表示\n- v65.20以前のcaseIdなし写真は従来どおり件名単位で表示する互換処理\n- 写真読み込み機能で作る写真にも現在のcaseId/OneDrive予定情報を保存\n- 写真アルバム上部に「トップ」ボタンを追加\n- 撮影画面にはトップボタンを追加しない\n- トップへ戻る時はカメラストリームを停止して起動画面へ戻る\n- DB schema/versionは変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')

doc_path.write_text('''# v65.22 案件別アルバム / トップ導線\n\n## 案件表示\n写真の所属はcaseIdで固定し、画面表示だけ `caseId_件名` とする。件名は同じcaseId内の最新写真の看板件名を採用する。\n\n## 旧写真\ncaseIdを持たない旧写真は従来どおり件名単位でまとめる。\n\n## トップ導線\n写真アルバムの上部だけにトップボタンを置く。撮影画面には置かない。トップへ戻る際はカメラストリームを停止し、起動画面を再表示する。\n''', encoding='utf-8')

for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('case grouping', 'function getPhotoCaseKey' in album_path.read_text(encoding='utf-8')),
    ('display name', '`${item.caseId}_${item.subject}`' in album_path.read_text(encoding='utf-8')),
    ('top button', 'returnToTopScreen()' in index_path.read_text(encoding='utf-8')),
    ('import caseId', 'caseId: caseSession ? caseSession.id' in import_path.read_text(encoding='utf-8')),
    ('version', 'v65.22' in index_path.read_text(encoding='utf-8')),
    ('db untouched', 'const DB_VERSION = 2;' in (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.22 validation passed')
