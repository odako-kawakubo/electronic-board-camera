from pathlib import Path
import subprocess

ROOT = Path('.')

# ------------------------------------------------------------
# index.html: settings / case pickerをtransform stacking contextの外へ出す
# ------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
modal_start = index.index('  <div id="casePickerOverlay">')
board_start = index.index('  <div id="boardEditOverlay">', modal_start)
modal_block = index[modal_start:board_start]
index = index[:modal_start] + index[board_start:]

scripts_marker = '  <script src="./js/photo-store.js"></script>'
if scripts_marker not in index:
    raise SystemExit('scripts marker not found')
# appOrientationShellの閉じタグはscripts直前。モーダルはその外側・scripts前に置く。
index = index.replace(scripts_marker, modal_block + '\n' + scripts_marker, 1)
index = index.replace('id="settingsVersionText">v65.24<', 'id="settingsVersionText">v65.25<', 1)
index_path.write_text(index, encoding='utf-8')

# ------------------------------------------------------------
# photo-album.js: top起点とpreview起点で向きを切り替える
# ------------------------------------------------------------
album_path = ROOT / 'js/photo-album.js'
album = album_path.read_text(encoding='utf-8')
old = '''    function openCasePicker() {\n      renderCasePicker();\n      casePickerOverlay.classList.add("show");\n    }\n\n    function openCasePickerFromTop() {\n      casePickerOpenedFromTop = true;\n      openCasePicker();\n    }\n\n    function closeCasePicker() {\n      casePickerOverlay.classList.remove("show");\n      casePickerOpenedFromTop = false;\n    }'''
new = '''    function openCasePicker() {\n      // アルバム側はappOrientationShellと同じ強制横向きで表示する。\n      casePickerOpenedFromTop = false;\n      casePickerOverlay.classList.add("app-oriented-modal");\n      renderCasePicker();\n      casePickerOverlay.classList.add("show");\n    }\n\n    function openCasePickerFromTop() {\n      // トップ画面は端末の縦横をそのまま使う。\n      casePickerOpenedFromTop = true;\n      casePickerOverlay.classList.remove("app-oriented-modal");\n      renderCasePicker();\n      casePickerOverlay.classList.add("show");\n    }\n\n    function closeCasePicker() {\n      casePickerOverlay.classList.remove("show", "app-oriented-modal");\n      casePickerOpenedFromTop = false;\n    }'''
if old not in album:
    raise SystemExit('case picker functions not found')
album = album.replace(old, new, 1)
album_path.write_text(album, encoding='utf-8')

# ------------------------------------------------------------
# settings.js: top起点なら通常向き、preview起点ならshell向き
# ------------------------------------------------------------
settings_path = ROOT / 'js/settings.js'
settings = settings_path.read_text(encoding='utf-8')
old = '''    function openSettings() {\n      renderPhotoQualitySettings();\n      if (window.CaseSession) CaseSession.renderSessionPanel();\n      settingsOverlay.classList.add("show");\n      if (typeof refreshStorageStatusUI === "function") {\n        refreshStorageStatusUI();\n      }\n    }\n\n    function closeSettings() {\n      settingsOverlay.classList.remove("show");\n    }'''
new = '''    function openSettings() {\n      renderPhotoQualitySettings();\n      if (window.CaseSession) CaseSession.renderSessionPanel();\n\n      // トップは端末の向きをそのまま使い、アルバム側は従来の強制横向きへ合わせる。\n      const topVisible = Boolean(launchModeOverlay && !launchModeOverlay.classList.contains("hidden"));\n      settingsOverlay.classList.toggle("app-oriented-modal", !topVisible);\n      settingsOverlay.classList.add("show");\n      if (typeof refreshStorageStatusUI === "function") {\n        refreshStorageStatusUI();\n      }\n    }\n\n    function closeSettings() {\n      settingsOverlay.classList.remove("show", "app-oriented-modal");\n    }'''
if old not in settings:
    raise SystemExit('settings open/close block not found')
settings = settings.replace(old, new, 1)
settings_path.write_text(settings, encoding='utf-8')

# ------------------------------------------------------------
# CSS: body直下modalを必要時だけorientation shellと同じ回転へ
# ------------------------------------------------------------
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
marker = '''    #settingsOverlay.show {\n      display: flex;\n    }\n'''
addition = '''    #settingsOverlay.show {\n      display: flex;\n    }\n\n    /* v65.25: body直下へ出した共通モーダルを、撮影/アルバム起点時だけ\n     * appOrientationShellと同じ向きへ合わせる。トップ起点時は無回転。 */\n    @media (orientation: portrait) {\n      #casePickerOverlay.app-oriented-modal,\n      #settingsOverlay.app-oriented-modal {\n        inset: auto;\n        left: 50%;\n        top: 50%;\n        width: var(--app-vw);\n        height: var(--app-vh);\n        transform: translate(-50%, -50%) rotate(90deg);\n        transform-origin: center center;\n      }\n\n      body.landscape-flipped #casePickerOverlay.app-oriented-modal,\n      body.landscape-flipped #settingsOverlay.app-oriented-modal {\n        transform: translate(-50%, -50%) rotate(-90deg);\n      }\n    }\n'''
if marker not in css:
    raise SystemExit('settings show marker not found')
css = css.replace(marker, addition, 1)
css_path.write_text(css, encoding='utf-8')

# ------------------------------------------------------------
# version/docs
# ------------------------------------------------------------
pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.24";', 'const APP_VERSION = "v65.25";', 1)
pwa_path.write_text(pwa, encoding='utf-8')

sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.24', 'electronic-board-camera-v65.25', 1)
sw_path.write_text(sw, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('# 電子看板カメラ v65.24', '# 電子看板カメラ v65.25', 1)
if '## v65.25 トップモーダル階層修正' not in readme:
    readme += '''\n\n## v65.25 トップモーダル階層修正\n- トップ画面だけがappOrientationShell外にあり、shell内の設定/案件選択がtransform stacking contextから抜けられず裏に隠れる問題を修正\n- 設定・案件選択をbody直下へ移動し、トップより確実に前面表示\n- トップ起点では端末の縦横をそのまま使用\n- アルバム起点ではappOrientationShellと同じ強制横向きを適用\n- 共通モーダルは1つのまま維持し、トップ用/アルバム用に重複実装しない\n'''
readme_path.write_text(readme, encoding='utf-8')

(ROOT / 'docs/v65.25-modal-layer.md').write_text('''# v65.25 トップモーダル階層修正\n\n## 原因\n`launchModeOverlay` は `appOrientationShell` の外、`settingsOverlay` と `casePickerOverlay` はshell内にあった。\n縦向き時のshellは `transform: rotate(...)` により独立したstacking contextを作るため、子のz-indexを大きくしても外側のトップ画面を越えられなかった。\n\n## 修正\n- 設定・案件選択をbody直下へ移動。\n- トップ起点では無回転。\n- アルバム起点では `app-oriented-modal` を付け、shellと同じ回転を適用。\n- z-index値をさらに増やすだけの対症療法は行わない。\n''', encoding='utf-8')

# validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

html = index_path.read_text(encoding='utf-8')
# Both overlays must appear after the closing boardEdit/shell area and before scripts.
case_pos = html.index('<div id="casePickerOverlay">')
settings_pos = html.index('<div id="settingsOverlay"')
scripts_pos = html.index(scripts_marker)
board_pos = html.index('<div id="boardEditOverlay">')
if not (board_pos < case_pos < settings_pos < scripts_pos):
    raise SystemExit('modal DOM order validation failed')

checks = [
    ('top case picker normal orientation', 'casePickerOverlay.classList.remove("app-oriented-modal")' in album_path.read_text(encoding='utf-8')),
    ('preview case picker oriented', 'casePickerOverlay.classList.add("app-oriented-modal")' in album_path.read_text(encoding='utf-8')),
    ('settings source-aware orientation', 'const topVisible = Boolean' in settings_path.read_text(encoding='utf-8')),
    ('portrait modal orientation css', '#casePickerOverlay.app-oriented-modal' in css_path.read_text(encoding='utf-8')),
    ('version 65.25', 'v65.25' in html),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.25 validation passed')
