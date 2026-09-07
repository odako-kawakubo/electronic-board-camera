from pathlib import Path
import subprocess
import re

ROOT = Path('.')
viewer_path = ROOT / 'js/photo-viewer.js'
index_path = ROOT / 'index.html'
sw_path = ROOT / 'service-worker.js'
pwa_path = ROOT / 'js/pwa-controller.js'
readme_path = ROOT / 'README.md'

def extract_block(text, start_marker, end_marker):
    start = text.find(start_marker)
    end = text.find(end_marker)
    if start < 0 or end < 0 or end <= start:
        raise SystemExit(f'block markers not found: {start_marker[:40]} / {end_marker[:40]}')
    return text[start:end], text[:start] + text[end:]

viewer = viewer_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

if not (ROOT / 'js/photo-album.js').exists():
    # Move album-owned DOM/state and helpers from viewer.
    old_header = '''/*\n * ============================================================\n * photo-viewer.js - 保存写真の閲覧 / 選択 / 出力\n * ============================================================\n * 責務: 写真プレビュー、並び替え、一覧、複数選択、削除、保存・共有、拡大表示を担当する。\n *\n * 保守上の注意:\n * - 削除はIndexedDBとcapturedPhotosの両方を同じ対象で更新する。共有はWeb Share非対応環境へのフォールバックを残す。\n * ============================================================\n */'''
    new_header = '''/*\n * ============================================================\n * photo-viewer.js - 1枚表示 / 拡大 / 看板修正 / 出力\n * ============================================================\n * 責務: 現在写真の表示、前後移動、拡大、看板修正、共有・外部保存を担当する。\n * 案件別一覧・並び替え・選択・削除はphoto-album.jsを正本とする。\n * ============================================================\n */'''
    if old_header not in viewer:
        raise SystemExit('viewer header not found')
    viewer = viewer.replace(old_header, new_header, 1)

    # Replace ownership declarations at top.
    decl_start = '    // v65.13: このモジュールだけが所有する定数・DOM参照・実行状態。\n'
    helper_start = '    function getCurrentSubjectName() {'
    ds = viewer.find(decl_start)
    hs = viewer.find(helper_start)
    if ds < 0 or hs < 0 or hs <= ds:
        raise SystemExit('viewer declaration markers not found')
    viewer_decl = '''    // viewer専用DOM・状態。アルバム状態はphoto-album.jsが所有する。\n    const previewImage = document.getElementById("previewImage");\n    const photoZoomOverlay = document.getElementById("photoZoomOverlay");\n    const photoZoomImage = document.getElementById("photoZoomImage");\n    const previewCounter = document.getElementById("previewCounter");\n    const previewMeta = document.getElementById("previewMeta");\n    const boardCorrectionButton = document.getElementById("boardCorrectionButton");\n    let isBoardCorrectionSelectMode = false;\n    let previewTouchStartX = 0;\n    let previewTouchStartY = 0;\n\n'''
    viewer = viewer[:ds] + viewer_decl + viewer[hs:]

    # Album helper block: current subject through numberToCircle.
    album_helpers, viewer = extract_block(
        viewer,
        '    function getPhotoSubject(photo) {',
        '    /* 写真ビューア */\n'
    )

    # Album rendering/selection block: thumbnails through before board correction mode.
    album_render, viewer = extract_block(
        viewer,
        '    function renderThumbnails() {',
        '    function startBoardCorrectionSelectMode() {'
    )

    # Delete selected belongs to album. Keep export/share in viewer.
    delete_block, viewer = extract_block(
        viewer,
        '    async function deleteSelectedPreviewPhotos() {',
        '    /**\n\n     * Web Share対応端末では共有し、非対応時はダウンロードへフォールバックする。\n\n     */\n'
    )

    album = '''/*\n * ============================================================\n * photo-album.js - ローカル写真アルバム / 一覧管理\n * ============================================================\n * 責務:\n * - IndexedDBから復元されたcapturedPhotosを案件単位で整理して見せる\n * - 撮影順/検体順の並び替え、サムネイル、一覧表示\n * - 写真の選択/全選択、削除、撮影不足確認\n *\n * 保守上の注意:\n * - 写真本体の保存正本はPhotoStore。album側で別DBや一時保存を作らない。\n * - 削除は必ずPhotoStore.deletePhoto()を通し、capturedPhotosだけ消さない。\n * - 共有・外部保存、看板修正はphoto-viewer.jsの責務。\n * ============================================================\n */\n\n    const caseSelectButton = document.getElementById("caseSelectButton");\n    const casePickerOverlay = document.getElementById("casePickerOverlay");\n    const casePickerList = document.getElementById("casePickerList");\n    const previewThumbnails = document.getElementById("previewThumbnails");\n    const previewList = document.getElementById("previewList");\n    const previewSortButton = document.getElementById("previewSortButton");\n    const selectAllButton = document.getElementById("selectAllButton");\n\n    let isPreviewListMode = false;\n    let previewSortMode = "shooting";\n    let selectedCaseSubject = "";\n\n'''
    album += album_helpers
    album += '\n'
    album += album_render
    album += '\n'
    album += delete_block
    (ROOT / 'js/photo-album.js').write_text(album, encoding='utf-8')

    viewer_path.write_text(viewer, encoding='utf-8')

    # Load album before viewer so viewer can use its API at runtime.
    old_scripts = '  <script src="./js/photo-import.js"></script>\n  <script src="./js/photo-viewer.js"></script>\n'
    new_scripts = '  <script src="./js/photo-import.js"></script>\n  <script src="./js/photo-album.js"></script>\n  <script src="./js/photo-viewer.js"></script>\n'
    if old_scripts not in index:
        raise SystemExit('index viewer script block not found')
    index = index.replace(old_scripts, new_scripts, 1)
    index = index.replace('id="settingsVersionText">v65.16<', 'id="settingsVersionText">v65.17<', 1)
    index_path.write_text(index, encoding='utf-8')

    sw = sw.replace('const CACHE_NAME = "electronic-board-camera-v65.16";', 'const CACHE_NAME = "electronic-board-camera-v65.17";', 1)
    sw = sw.replace('  "./js/photo-import.js",\n  "./js/photo-viewer.js",', '  "./js/photo-import.js",\n  "./js/photo-album.js",\n  "./js/photo-viewer.js",', 1)
    sw_path.write_text(sw, encoding='utf-8')

    pwa = pwa.replace('const APP_VERSION = "v65.16";', 'const APP_VERSION = "v65.17";', 1)
    pwa_path.write_text(pwa, encoding='utf-8')

    readme = readme.replace('# 電子看板カメラ v65.16', '# 電子看板カメラ v65.17', 1)
    if '## v65.17 ローカルアルバム責務分離' not in readme:
        readme += '''\n\n## v65.17 ローカルアルバム責務分離\n- `js/photo-album.js` を追加\n- 案件別整理、並び替え、サムネ/一覧、選択/全選択、削除、撮影不足確認をviewerから移動\n- `photo-viewer.js` は1枚表示、前後移動、拡大、看板修正、共有/外部保存へ縮小\n- 写真本体の正本は引き続き `PhotoStore` / IndexedDB\n- DB構造、Base64保存形式、撮影処理、ファイル名規則は変更なし\n'''
    readme_path.write_text(readme, encoding='utf-8')

    doc = '''# v65.17 ローカルアルバム責務分離\n\n## 目的\n既存の写真一覧機能を独立したアルバム責務として切り出し、今後の永続ストレージ・OneDrive同期を安全に追加できる境界を作る。\n\n## photo-album.js\n- 案件別写真グルーピング\n- 撮影順/検体順\n- サムネイル/一覧\n- 選択/全選択\n- 削除\n- 撮影不足確認\n\n## photo-viewer.js\n- 1枚表示\n- 前後移動\n- 拡大\n- 看板修正\n- 共有/外部保存\n\n## 保存境界\nアルバムは写真本体を所有しない。写真本体の正本は `PhotoStore` のIndexedDB `photos` store。\n削除以外のアルバム操作で写真本体を書き換えない。\n\n## 変更しないもの\n- IndexedDB schema/version\n- Base64 dataUrl/baseDataUrl\n- 撮影・合成\n- ファイル名採番\n- OneDrive（未実装）\n'''
    (ROOT / 'docs/v65.17-photo-album.md').write_text(doc, encoding='utf-8')

# Validation.
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)

viewer = viewer_path.read_text(encoding='utf-8')
album = (ROOT / 'js/photo-album.js').read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
pwa = pwa_path.read_text(encoding='utf-8')

checks = [
    ('album script loaded', './js/photo-album.js' in index),
    ('album cached', '"./js/photo-album.js"' in sw),
    ('version pwa', 'const APP_VERSION = "v65.17";' in pwa),
    ('version html', 'id="settingsVersionText">v65.17<' in index),
    ('version sw', 'electronic-board-camera-v65.17' in sw),
    ('album owns cases', 'function getCaseSummaries()' in album and 'function getCaseSummaries()' not in viewer),
    ('album owns list', 'function renderPhotoList()' in album and 'function renderPhotoList()' not in viewer),
    ('album owns selection', 'function toggleSelectAllPhotos()' in album and 'function toggleSelectAllPhotos()' not in viewer),
    ('album owns delete', 'function deleteSelectedPreviewPhotos()' in album and 'function deleteSelectedPreviewPhotos()' not in viewer),
    ('viewer owns correction', 'function startBoardCorrectionSelectMode()' in viewer),
    ('viewer owns share', 'function shareOrDownloadPhotos(photos)' in viewer),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')

# No duplicate top-level function declarations across app JS files.
all_files = sorted((ROOT / 'js').glob('*.js'))
owner = {}
for path in all_files:
    text = path.read_text(encoding='utf-8')
    for name in re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(', text):
        if name in owner:
            raise SystemExit(f'duplicate function {name}: {owner[name]} and {path}')
        owner[name] = path.name

# All inline onclick call targets must resolve to one function declaration.
for body in re.findall(r'onclick="([^"]+)"', index):
    for name in re.findall(r'\b([A-Za-z_$][\w$]*)\s*\(', body):
        if name in {'if', 'return'}:
            continue
        if name not in owner:
            raise SystemExit(f'onclick target missing: {name}')

print('v65.17 album split validation passed')
