from pathlib import Path
import subprocess

ROOT = Path('.')

photo_record = '''/*
 * ============================================================
 * photo-record.js - 写真レコード生成
 * ============================================================
 * 責務:
 * - カメラ撮影 / 既存写真への看板添付で共通する写真レコード生成を1か所に集約する
 * - 撮影時点の案件セッション情報と同期初期値を固定する
 *
 * 保守上の注意:
 * - ここでは保存しない。保存正本はPhotoStore。
 * - UIや撮影処理を持たない。
 * - v65.26では既存プロパティのみ使用し、新しいプロパティは追加しない。
 * ============================================================
 */

(function () {
  "use strict";

  function create(options = {}) {
    const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;
    const createdAt = options.createdAt instanceof Date
      ? options.createdAt.toISOString()
      : String(options.createdAt || new Date().toISOString());

    const photo = {
      id: options.id || `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      dataUrl: String(options.dataUrl || ""),
      baseDataUrl: String(options.baseDataUrl || ""),
      fileName: String(options.fileName || ""),
      status: String(options.status || ""),
      statusLabel: String(options.statusLabel || ""),
      statusCode: String(options.statusCode || ""),
      sampleNo: options.sampleNo,
      pointNo: options.pointNo,
      roomNo: String(options.roomNo || ""),
      subjectName: String(options.subjectName || ""),

      // 撮影時点の所属案件を固定する。件名変更で所属や保存先を変えない。
      caseId: caseSession ? caseSession.id : "",
      caseDate: caseSession ? caseSession.dateCode : "",
      caseBranch: caseSession ? caseSession.branch : null,
      deviceName: caseSession ? caseSession.deviceName : "",
      oneDriveFolderName: caseSession ? caseSession.folderName : "",

      uploadStatus: "pending",
      uploadedAt: "",
      oneDriveItemId: "",
      isSection: Boolean(options.isSection),
      selected: false,
      createdAt,
      savedLocal: false,
      savedAt: ""
    };

    // 既存写真への看板添付だけが従来から持つ既存プロパティ。
    if (options.source) photo.source = String(options.source);

    return photo;
  }

  window.PhotoRecord = Object.freeze({ create });
})();
'''
(ROOT / 'js/photo-record.js').write_text(photo_record, encoding='utf-8')

# camera.js
camera_path = ROOT / 'js/camera.js'
camera = camera_path.read_text(encoding='utf-8')
old = '''        const createdAt = new Date();
        const photoType = lockedPhotoType;
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const sampleNo = sampleParts.sampleNo;
        const pointNo = sampleParts.pointNo;
        const fileName = generatePhotoFileName(sampleNo, pointNo, photoType.code);
        const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;
        const photo = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          dataUrl,
          baseDataUrl,
          fileName,
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo,
          pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          // 撮影時点の所属セッションを固定する。件名変更で所属や保存先を変えない。
          caseId: caseSession ? caseSession.id : "",
          caseDate: caseSession ? caseSession.dateCode : "",
          caseBranch: caseSession ? caseSession.branch : null,
          deviceName: caseSession ? caseSession.deviceName : "",
          oneDriveFolderName: caseSession ? caseSession.folderName : "",
          uploadStatus: "pending",
          uploadedAt: "",
          oneDriveItemId: "",
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          selected: false,
          createdAt: createdAt.toISOString(),
          savedLocal: false,
          savedAt: ""
        };'''
new = '''        const photoType = lockedPhotoType;
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const sampleNo = sampleParts.sampleNo;
        const pointNo = sampleParts.pointNo;
        const fileName = generatePhotoFileName(sampleNo, pointNo, photoType.code);
        const photo = PhotoRecord.create({
          dataUrl,
          baseDataUrl,
          fileName,
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo,
          pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          isSection: photoType.value === SECTION_PHOTO_TYPE.value
        });'''
if old not in camera:
    raise SystemExit('camera photo object block not found')
camera = camera.replace(old, new, 1)
camera_path.write_text(camera, encoding='utf-8')

# photo-import.js
imp_path = ROOT / 'js/photo-import.js'
imp = imp_path.read_text(encoding='utf-8')
old = '''        const photoType = getCurrentPhotoType();
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const createdAt = new Date();
        const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;
        const photo = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          dataUrl,
          // 読み込み元はカメラロールに残るため、完成後の元画像は保持しない。
          baseDataUrl: "",
          fileName: generatePhotoFileName(sampleParts.sampleNo, sampleParts.pointNo, photoType.code),
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo: sampleParts.sampleNo,
          pointNo: sampleParts.pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          caseId: caseSession ? caseSession.id : "",
          caseDate: caseSession ? caseSession.dateCode : "",
          caseBranch: caseSession ? caseSession.branch : null,
          deviceName: caseSession ? caseSession.deviceName : "",
          oneDriveFolderName: caseSession ? caseSession.folderName : "",
          uploadStatus: "pending",
          uploadedAt: "",
          oneDriveItemId: "",
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          selected: false,
          createdAt: createdAt.toISOString(),
          savedLocal: false,
          savedAt: "",
          source: "import"
        };'''
new = '''        const photoType = getCurrentPhotoType();
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const photo = PhotoRecord.create({
          dataUrl,
          // 読み込み元はカメラロールに残るため、完成後の元画像は保持しない。
          baseDataUrl: "",
          fileName: generatePhotoFileName(sampleParts.sampleNo, sampleParts.pointNo, photoType.code),
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo: sampleParts.sampleNo,
          pointNo: sampleParts.pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          source: "import"
        });'''
if old not in imp:
    raise SystemExit('import photo object block not found')
imp = imp.replace(old, new, 1)
imp_path.write_text(imp, encoding='utf-8')

# index.html script order
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
needle = '  <script src="./js/case-session.js"></script>\n'
if needle not in index:
    raise SystemExit('case-session script marker missing')
index = index.replace(needle, needle + '  <script src="./js/photo-record.js"></script>\n', 1)
index = index.replace('id="settingsVersionText">v65.25<', 'id="settingsVersionText">v65.26<', 1)
index_path.write_text(index, encoding='utf-8')

# service worker
sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace('electronic-board-camera-v65.25', 'electronic-board-camera-v65.26', 1)
needle = '  "./js/case-session.js",\n'
if needle not in sw:
    raise SystemExit('service-worker case-session marker missing')
sw = sw.replace(needle, needle + '  "./js/photo-record.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

# pwa version
pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.25";', 'const APP_VERSION = "v65.26";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

# docs/readme
readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.25', '# 電子看板カメラ v65.26', 1)
if '## v65.26 写真レコード生成一本化' not in readme:
    readme += '''\n\n## v65.26 写真レコード生成一本化\n- `photo-record.js` を追加し、写真レコード生成の正本を `PhotoRecord.create()` に統一\n- `camera.js` と `photo-import.js` の重複した写真オブジェクト組み立てを削除\n- 撮影時案件情報、同期初期値、保存初期値を1か所で生成\n- 既存プロパティのみ使用し、新規プロパティ追加なし\n- カメラ撮影は元画像あり、看板添付は元画像なし + `source: import` の既存差分を維持\n- DB schema/versionは2のまま変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT / 'docs/v65.26-photo-record.md').write_text('''# v65.26 写真レコード生成一本化\n\n写真レコードのプロパティ構造は変更せず、生成責務だけを `photo-record.js` へ集約した。\n\n- カメラ撮影: 元画像 `baseDataUrl` を保持。\n- 看板添付: 元画像は保持せず、既存の `source: "import"` を維持。\n- `caseId` / `caseDate` / `caseBranch` / `deviceName` / `oneDriveFolderName` は撮影・保存時点のCaseSessionから生成。\n- `uploadStatus` 等の既存同期初期値もPhotoRecordで生成。\n- 保存は従来どおりPhotoStoreが担当。\n''', encoding='utf-8')

# validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

camera_text = camera_path.read_text(encoding='utf-8')
imp_text = imp_path.read_text(encoding='utf-8')
pr_text = (ROOT / 'js/photo-record.js').read_text(encoding='utf-8')
checks = [
    ('camera uses PhotoRecord', 'PhotoRecord.create({' in camera_text),
    ('import uses PhotoRecord', 'PhotoRecord.create({' in imp_text),
    ('camera no direct caseId build', 'caseId: caseSession ?' not in camera_text),
    ('import no direct caseId build', 'caseId: caseSession ?' not in imp_text),
    ('record source conditional', 'if (options.source) photo.source' in pr_text),
    ('script loaded', './js/photo-record.js' in index_path.read_text(encoding='utf-8')),
    ('sw caches record', './js/photo-record.js' in sw_path.read_text(encoding='utf-8')),
    ('db unchanged', 'const DB_VERSION = 2;' in (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')),
    ('version', 'v65.26' in index_path.read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.26 validation passed')
