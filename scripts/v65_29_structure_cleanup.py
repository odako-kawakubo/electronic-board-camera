from pathlib import Path
import subprocess

ROOT = Path('.')

# board.jsから採取箇所ロジックを抽出
board_path = ROOT/'js/board.js'
board = board_path.read_text(encoding='utf-8')
start = board.index('    let samplingLocationTargetIndex = 0;')
prompt_start = board.index('    function promptRoomNo() {', start)
get_targets_start = board.index('    function getSamplingLocationTargets(value) {', prompt_start)
prompt_sample_start = board.index('    function promptSampleNo() {', get_targets_start)
prompt_room_block = board[prompt_start:get_targets_start]
sampling_logic = board[get_targets_start:prompt_sample_start]

sampling_file = '''/*
 * ============================================================
 * board-sampling.js - 採取箇所文字列の解析 / 増減操作
 * ============================================================
 * 責務:
 * - 「1-2階」「101」「東」など採取箇所文字列の操作対象解析
 * - 採取箇所の対象切替と増減
 *
 * 保守上の注意:
 * - 看板フォーム保存はboard-persistence.js。
 * - 通常の看板表示・編集はboard.js。
 * ============================================================
 */

    let samplingLocationTargetIndex = 0;

''' + sampling_logic
(ROOT/'js/board-sampling.js').write_text(sampling_file, encoding='utf-8')

board = board[:start] + prompt_room_block + board[prompt_sample_start:]
# board専用状態をshared-stateから戻す
state_marker = '    let boardEditFinishRequested = false;\n'
if state_marker not in board: raise SystemExit('board state marker missing')
board = board.replace(state_marker, state_marker + '    let activeSidePanel = null;\n', 1)
board = board.replace(' * 責務: 看板初期化、入力、調査/サンプリング切替、位置/サイズ、編集履歴、Canvas描画まで看板仕様を担当する。', ' * 責務: 看板初期化、入力、調査/サンプリング切替、位置/サイズ、編集履歴、Canvas描画を担当する。保存はboard-persistence.js、採取箇所解析はboard-sampling.js。', 1)
board_path.write_text(board, encoding='utf-8')

# shared-stateから単独所有状態を除去
shared_path = ROOT/'js/shared-state.js'
shared = shared_path.read_text(encoding='utf-8')
shared = shared.replace('    let currentStream = null;\n', '', 1)
shared = shared.replace('    let activeSidePanel = null;\n', '', 1)
shared_path.write_text(shared, encoding='utf-8')

# cameraへcurrentStream所有を移動
camera_path = ROOT/'js/camera.js'
camera = camera_path.read_text(encoding='utf-8')
marker = '    let captureReviewResolver = null;\n'
if marker not in camera: raise SystemExit('camera state marker missing')
camera = camera.replace(marker, marker + '    let currentStream = null;\n', 1)
camera_path.write_text(camera, encoding='utf-8')

# index / SW
index_path = ROOT/'index.html'
index = index_path.read_text(encoding='utf-8')
needle = '  <script src="./js/board-persistence.js"></script>\n'
if needle not in index: raise SystemExit('board persistence script marker missing')
index = index.replace(needle, needle + '  <script src="./js/board-sampling.js"></script>\n', 1)
index = index.replace('id="settingsVersionText">v65.28<', 'id="settingsVersionText">v65.29<', 1)
index_path.write_text(index, encoding='utf-8')

sw_path = ROOT/'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.28', 'electronic-board-camera-v65.29', 1)
needle = '  "./js/board-persistence.js",\n'
if needle not in sw: raise SystemExit('SW board persistence marker missing')
sw = sw.replace(needle, needle + '  "./js/board-sampling.js",\n', 1)
sw_path.write_text(sw, encoding='utf-8')

pwa_path = ROOT/'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.28";', 'const APP_VERSION = "v65.29";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

readme_path = ROOT/'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.28', '# 電子看板カメラ v65.29', 1)
readme += '''\n\n## v65.29 構造整理\n- `board-sampling.js` を追加し、採取箇所文字列の解析/対象切替/増減をboard.jsから分離\n- `currentStream` をshared-stateからcamera.jsへ戻す\n- `activeSidePanel` をshared-stateからboard.jsへ戻す\n- shared-stateには複数モジュールで本当に共有する状態だけを残す\n- 機能仕様・DB schemaは変更なし\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT/'docs/v65.29-structure-cleanup.md').write_text('''# v65.29 構造整理\n\n全体レビューで残っていたboard.js肥大化とshared-state混在を整理。\n採取箇所解析をboard-sampling.jsへ分離し、単独所有状態を担当モジュールへ戻した。\n''', encoding='utf-8')

for js in sorted((ROOT/'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('sampling extracted', 'function getSamplingLocationTargets' in (ROOT/'js/board-sampling.js').read_text(encoding='utf-8')),
    ('sampling removed board', 'function getSamplingLocationTargets' not in board_path.read_text(encoding='utf-8')),
    ('prompt stays board', 'function promptRoomNo()' in board_path.read_text(encoding='utf-8')),
    ('current stream camera', 'let currentStream = null;' in camera_path.read_text(encoding='utf-8')),
    ('current stream not shared', 'let currentStream = null;' not in shared_path.read_text(encoding='utf-8')),
    ('side panel board', 'let activeSidePanel = null;' in board_path.read_text(encoding='utf-8')),
    ('side panel not shared', 'let activeSidePanel = null;' not in shared_path.read_text(encoding='utf-8')),
    ('version', 'v65.29' in index_path.read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok: raise SystemExit(label + ' validation failed')
print('v65.29 validation passed')
print('board.js bytes:', board_path.stat().st_size)
print('board-sampling.js bytes:', (ROOT/'js/board-sampling.js').stat().st_size)
