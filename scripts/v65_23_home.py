from pathlib import Path
import subprocess

ROOT = Path('.')

# ---------- index.html ----------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
start = index.index('  <div id="launchModeOverlay" aria-label="起動方法を選択">')
end = index.index('  <div id="appOrientationShell">', start)
new_home = '''  <div id="launchModeOverlay" aria-label="トップ画面">\n    <div class="launch-mode-card">\n      <div class="launch-mode-title">電子看板カメラ</div>\n\n      <div class="launch-home-grid">\n        <div class="launch-home-case" aria-label="選択中の案件">\n          <div class="launch-home-label">選択中の案件</div>\n          <div id="launchCurrentCaseId" class="launch-home-case-id"></div>\n          <div id="launchCurrentCaseSubject" class="launch-home-case-subject"></div>\n        </div>\n        <button class="launch-home-button launch-settings-button" type="button" onclick="openSettings()">⚙ 設定</button>\n\n        <button class="launch-home-button launch-case-select-button" type="button" onclick="openCasePickerFromTop()">案件選択</button>\n        <button class="launch-home-button launch-new-case-button" type="button" onclick="CaseSession.startNewSession()">新規案件</button>\n\n        <button class="launch-home-button launch-camera-button" type="button" onclick="chooseCameraMode()">📷 カメラ起動</button>\n        <button class="launch-home-button launch-import-button" type="button" onclick="chooseImportMode()">🖼 看板添付</button>\n      </div>\n\n      <div id="launchResumePanel" class="launch-resume-panel">\n        <div class="launch-resume-title">編集中の写真があります</div>\n        <div id="launchResumeMeta" class="launch-resume-meta"></div>\n        <div class="launch-resume-actions">\n          <button class="resume-import-button" type="button" onclick="resumeImportSession()">編集を続ける</button>\n          <button class="discard-import-button" type="button" onclick="discardImportSession()">破棄する</button>\n        </div>\n      </div>\n      <input id="importPhotoInput" type="file" accept="image/*" multiple hidden />\n    </div>\n  </div>\n'''
index = index[:start] + new_home + index[end:]
index = index.replace('id="settingsVersionText">v65.22<', 'id="settingsVersionText">v65.23<', 1)
# Put terminal/device naming in settings instead of home.
needle = '''      <button class="settings-update-button" type="button" onclick="refreshStorageStatusUI()">保存状態を再確認</button>\n\n      <div class="settings-section-title">📷 写真画質</div>'''
replacement = '''      <button class="settings-update-button" type="button" onclick="refreshStorageStatusUI()">保存状態を再確認</button>\n\n      <div class="settings-section-title">📱 端末</div>\n      <div class="settings-version-box">\n        端末名：<strong id="settingsDeviceNameText">-</strong>\n      </div>\n      <button class="settings-update-button" type="button" onclick="CaseSession.changeDeviceName()">端末名を変更</button>\n\n      <div class="settings-section-title">📷 写真画質</div>'''
if needle not in index:
    raise SystemExit('settings insertion marker not found')
index = index.replace(needle, replacement, 1)
index_path.write_text(index, encoding='utf-8')

# ---------- case-session.js ----------
case_path = ROOT / 'js/case-session.js'
case = case_path.read_text(encoding='utf-8')
case = case.replace('- 起動画面へ現在セッションと新規セッション開始UIを表示する', '- トップ画面へ現在の選択案件を表示し、新規案件・案件切替を管理する')
case = case.replace('''  function getCurrentSession() {\n    const today = formatDateCode();\n    let session = loadActiveSession();\n    if (!session || session.dateCode !== today) {\n      session = createSession();\n    }\n    return session;\n  }''', '''  function getCurrentSession() {\n    // v65.23: 日付が変わっても勝手に案件を切り替えない。\n    // 再起動・スリープ復帰時は「最後に選択していた案件」をそのまま確認できることを優先する。\n    let session = loadActiveSession();\n    if (!session) session = createSession();\n    return session;\n  }''', 1)

insert_after = '''  function startNewSession() {\n    const current = getCurrentSession();\n    const ok = window.confirm(\n      `現在：${current.id}\\n\\n同日の別案件として新しい撮影セッションを開始しますか？`\n    );\n    if (!ok) return current;\n    const next = createSession();\n    if (typeof showToast === "function") showToast(`撮影セッション ${next.id} を開始しました`);\n    return next;\n  }\n'''
if insert_after not in case:
    raise SystemExit('startNewSession marker not found')
addition = '''\n  function activateSession(caseId, subjectName = "") {\n    const id = String(caseId || "").trim();\n    const match = id.match(/^(\\d{6})_(\\d+)$/);\n    if (!match) return getCurrentSession();\n\n    const deviceName = getDeviceName();\n    const session = {\n      id,\n      dateCode: match[1],\n      branch: Number(match[2]),\n      deviceName,\n      folderName: buildFolderName(deviceName, id),\n      createdAt: new Date().toISOString(),\n      kind: "temporary"\n    };\n    saveActiveSession(session);\n\n    // 現段階では案件情報の正本が未接続なので、件名だけは最新写真の看板値から戻す。\n    // 住所・採取場所などの案件別看板状態は全体レビュー後に正式設計する。\n    const subject = String(subjectName || "").trim();\n    const subjectInput = document.getElementById("subjectText");\n    if (subject && subjectInput) {\n      subjectInput.value = subject;\n      if (typeof syncBoardTextareas === "function") syncBoardTextareas();\n      if (typeof saveBoardForm === "function") saveBoardForm();\n    }\n\n    renderSessionPanel();\n    if (typeof showToast === "function") showToast(`案件 ${id} を選択しました`);\n    return session;\n  }\n'''
case = case.replace(insert_after, insert_after + addition, 1)

# Replace old dynamic session panel functions with static home renderer.
old_start = case.index('  function ensureSessionPanel() {')
old_end = case.index('  document.addEventListener("DOMContentLoaded", () => {', old_start)
new_render = '''  function getCurrentSubject() {\n    const subjectInput = document.getElementById("subjectText");\n    const value = subjectInput ? subjectInput.value : "";\n    return String(value || "").trim() || "無題案件";\n  }\n\n  function renderSessionPanel() {\n    const session = getCurrentSession();\n    const id = document.getElementById("launchCurrentCaseId");\n    const subject = document.getElementById("launchCurrentCaseSubject");\n    const device = document.getElementById("settingsDeviceNameText");\n    if (id) id.textContent = session.id;\n    if (subject) subject.textContent = getCurrentSubject();\n    if (device) device.textContent = session.deviceName || getDeviceName();\n  }\n\n'''
case = case[:old_start] + new_render + case[old_end:]
case = case.replace('''  document.addEventListener("DOMContentLoaded", () => {\n    getCurrentSession();\n    renderSessionPanel();\n  });''', '''  document.addEventListener("DOMContentLoaded", () => {\n    getCurrentSession();\n    renderSessionPanel();\n\n    const subjectInput = document.getElementById("subjectText");\n    if (subjectInput && subjectInput.dataset.homeCaseBound !== "1") {\n      subjectInput.dataset.homeCaseBound = "1";\n      subjectInput.addEventListener("input", renderSessionPanel);\n      subjectInput.addEventListener("change", renderSessionPanel);\n    }\n\n    // board.jsの初期復元後の値もトップへ反映する。\n    window.setTimeout(renderSessionPanel, 0);\n  });''', 1)
case = case.replace('''    getCurrentSession,\n    startNewSession,''', '''    getCurrentSession,\n    startNewSession,\n    activateSession,\n    renderSessionPanel,''', 1)
case_path.write_text(case, encoding='utf-8')

# ---------- settings.js ----------
settings_path = ROOT / 'js/settings.js'
settings = settings_path.read_text(encoding='utf-8')
old = '''\n    // 写真0枚でも更新不能にならないよう、起動画面にも設定入口を常設する。\n    document.addEventListener("DOMContentLoaded", () => {\n      const actions = document.querySelector(".launch-mode-actions");\n      if (!actions || document.getElementById("launchSettingsButton")) return;\n\n      const button = document.createElement("button");\n      button.id = "launchSettingsButton";\n      button.type = "button";\n      button.className = "launch-mode-button launch-settings-button";\n      button.textContent = "⚙ 設定・更新";\n      button.addEventListener("click", openSettings);\n      actions.appendChild(button);\n    });\n'''
if old not in settings:
    raise SystemExit('old dynamic launch settings block not found')
settings = settings.replace(old, '\n', 1)
settings = settings.replace('''    function openSettings() {\n      renderPhotoQualitySettings();''', '''    function openSettings() {\n      renderPhotoQualitySettings();\n      if (window.CaseSession) CaseSession.renderSessionPanel();''', 1)
settings_path.write_text(settings, encoding='utf-8')

# ---------- photo-album.js ----------
album_path = ROOT / 'js/photo-album.js'
album = album_path.read_text(encoding='utf-8')
album = album.replace('''    let isPreviewListMode = false;\n    let previewSortMode = "shooting";\n    let selectedCaseKey = "";''', '''    let isPreviewListMode = false;\n    let previewSortMode = "shooting";\n    let selectedCaseKey = "";\n    let casePickerOpenedFromTop = false;''', 1)
# Include active empty case in summaries so newly created case can still be selected/seen.
needle = '''      capturedPhotos.forEach((photo) => {\n        const key = getPhotoCaseKey(photo);'''
if needle not in album:
    raise SystemExit('case summary marker missing')
# Add active after loop before return.
ret = '''      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);\n    }'''
replacement = '''      if (window.CaseSession) {\n        const active = CaseSession.getCurrentSession();\n        if (active && active.id) {\n          const key = `case:${active.id}`;\n          if (!map.has(key)) {\n            const currentSubject = typeof getCurrentSubjectName === "function" ? getCurrentSubjectName() : "無題案件";\n            map.set(key, { key, caseId: active.id, subject: currentSubject, count: 0, latest: new Date(active.createdAt || 0).getTime() });\n          }\n        }\n      }\n\n      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);\n    }'''
if ret not in album:
    raise SystemExit('case summaries return marker missing')
album = album.replace(ret, replacement, 1)
# open from top helper
open_marker = '''    function openCasePicker() {\n      renderCasePicker();\n      casePickerOverlay.classList.add("show");\n    }'''
if open_marker not in album:
    raise SystemExit('openCasePicker marker missing')
album = album.replace(open_marker, open_marker + '''\n\n    function openCasePickerFromTop() {\n      casePickerOpenedFromTop = true;\n      openCasePicker();\n    }''', 1)
# close resets only after selection logic? close called selection; so don't reset in close. Instead explicit close button should reset via closeCasePicker. But then selection needs capture flag before close.
old_onclick = '''        button.onclick = () => {\n          selectedCaseKey = item.key;\n          previewIndex = 0;\n          closeCasePicker();\n          renderPreview();\n        };'''
new_onclick = '''        button.onclick = () => {\n          selectedCaseKey = item.key;\n          previewIndex = 0;\n          const openedFromTop = casePickerOpenedFromTop;\n          casePickerOpenedFromTop = false;\n          closeCasePicker();\n\n          if (openedFromTop && item.caseId && window.CaseSession) {\n            CaseSession.activateSession(item.caseId, item.subject);\n            return;\n          }\n          renderPreview();\n        };'''
if old_onclick not in album:
    raise SystemExit('case picker selection marker missing')
album = album.replace(old_onclick, new_onclick, 1)
# close button/manual close should clear top mode.
album = album.replace('''    function closeCasePicker() {\n      casePickerOverlay.classList.remove("show");\n    }''', '''    function closeCasePicker() {\n      casePickerOverlay.classList.remove("show");\n      casePickerOpenedFromTop = false;\n    }''', 1)
# The above resets too early during selection, but openedFromTop is captured first. fine.
album_path.write_text(album, encoding='utf-8')

# ---------- styles/app.css ----------
css_path = ROOT / 'styles/app.css'
css = css_path.read_text(encoding='utf-8')
block_start = css.index('    /* v62: 起動モード選択 / 既存写真への看板追加 */')
block_end = css.index('    /* v65.22 アルバムからトップ画面へ戻る。撮影画面には表示しない。 */', block_start)
new_css = r'''    /* v65.23 トップ画面: 案件確認を起点にした2列 x 3段構成 */
    #launchModeOverlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
      background: radial-gradient(circle at 50% 30%, #26364f 0%, #111823 48%, #080b10 100%);
      color: #fff;
    }
    #launchModeOverlay.hidden { display: none; }
    .launch-mode-card {
      width: min(720px, 100%);
      max-height: 100%;
      padding: clamp(12px, 3vw, 24px);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 20px;
      background: rgba(19, 28, 42, .94);
      box-shadow: 0 20px 60px rgba(0,0,0,.46);
      text-align: center;
    }
    .launch-mode-title {
      margin-bottom: clamp(10px, 2.2vh, 18px);
      font-size: clamp(20px, 4vw, 34px);
      font-weight: 900;
      letter-spacing: .04em;
    }
    .launch-home-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
      grid-template-rows: repeat(3, minmax(64px, auto));
      gap: clamp(8px, 1.8vw, 14px);
    }
    .launch-home-case,
    .launch-home-button {
      min-width: 0;
      min-height: 74px;
      border-radius: 16px;
    }
    .launch-home-case {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,.20);
      background: rgba(255,255,255,.08);
      text-align: left;
      overflow: hidden;
    }
    .launch-home-label { color: #aebccc; font-size: 12px; font-weight: 800; }
    .launch-home-case-id {
      width: 100%;
      margin-top: 3px;
      font-size: clamp(17px, 3vw, 23px);
      font-weight: 900;
      letter-spacing: .035em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .launch-home-case-subject {
      width: 100%;
      margin-top: 2px;
      color: #e7edf5;
      font-size: clamp(11px, 2vw, 14px);
      font-weight: 800;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .launch-home-button {
      border: 0;
      padding: 8px 12px;
      color: #fff;
      font: 900 clamp(15px, 2.5vw, 19px)/1.2 inherit;
      cursor: pointer;
      box-shadow: 0 7px 18px rgba(0,0,0,.24);
      touch-action: manipulation;
    }
    .launch-settings-button { background: linear-gradient(135deg, #4b5563, #2f3742); }
    .launch-case-select-button { background: linear-gradient(135deg, #586b83, #3d4c60); }
    .launch-new-case-button { background: linear-gradient(135deg, #805ad5, #5a3ca8); }
    .launch-camera-button { background: linear-gradient(135deg, #2f80ed, #1b5fc7); }
    .launch-import-button { background: linear-gradient(135deg, #27ae60, #168846); }

    .launch-resume-panel {
      display: none;
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(242,201,76,.55);
      border-radius: 13px;
      background: rgba(242,201,76,.09);
      text-align: left;
    }
    .launch-resume-panel.show { display: block; }
    .launch-resume-title { color: #f2c94c; font-weight: 900; font-size: 14px; }
    .launch-resume-meta { margin-top: 3px; color: #e6e9ee; font-size: 12px; }
    .launch-resume-actions { display: flex; gap: 8px; margin-top: 8px; }
    .launch-resume-actions button { flex: 1; min-height: 40px; border: 0; border-radius: 10px; font-weight: 900; cursor: pointer; }
    .resume-import-button { background: #f2c94c; color: #171717; }
    .discard-import-button { background: #3b4655; color: #fff; }

    #importProgressBadge {
      display: none;
      margin-left: 8px;
      padding: 5px 10px;
      border-radius: 999px;
      background: #27ae60;
      color: #fff;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
    }
    #importProgressBadge.show { display: inline-flex; }
    #importBoardControls {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    #boardEditOverlay.import-board-edit #importBoardControls { display: flex; }
    #importBoardControls button {
      min-width: 64px;
      min-height: 38px;
      border: 1px solid rgba(255,255,255,.55);
      border-radius: 10px;
      background: rgba(0,0,0,.7);
      color: #fff;
      font-weight: 900;
    }
    #importBoardPositionLabel { min-width: 78px; color: #fff; font-weight: 900; font-size: 13px; text-align: center; }

    @media (orientation: landscape) and (max-height: 500px) {
      #launchModeOverlay { align-items: flex-start; }
      .launch-mode-card { padding: 10px 14px; }
      .launch-mode-title { margin-bottom: 8px; font-size: 20px; }
      .launch-home-grid { grid-template-rows: repeat(3, minmax(56px, 1fr)); gap: 7px 10px; }
      .launch-home-case, .launch-home-button { min-height: 56px; border-radius: 12px; }
      .launch-home-case { padding: 6px 10px; }
      .launch-home-label { font-size: 10px; }
      .launch-home-case-id { font-size: 16px; }
      .launch-home-case-subject { font-size: 11px; }
      .launch-home-button { font-size: 14px; }
      .launch-resume-panel { margin-top: 7px; padding: 7px 9px; }
      .launch-resume-title { font-size: 12px; }
      .launch-resume-meta { font-size: 10px; }
      .launch-resume-actions button { min-height: 34px; }
    }

    @media (orientation: portrait) and (max-width: 430px) {
      .launch-mode-card { padding: 14px 12px; }
      .launch-home-grid { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 9px; }
      .launch-home-case, .launch-home-button { min-height: 72px; }
    }

'''
css = css[:block_start] + new_css + css[block_end:]
css_path.write_text(css, encoding='utf-8')

# ---------- version ----------
pwa_path = ROOT / 'js/pwa-controller.js'
pwa = pwa_path.read_text(encoding='utf-8').replace('const APP_VERSION = "v65.22";', 'const APP_VERSION = "v65.23";', 1)
pwa_path.write_text(pwa, encoding='utf-8')
sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8').replace('electronic-board-camera-v65.22', 'electronic-board-camera-v65.23', 1)
sw_path.write_text(sw, encoding='utf-8')

# docs
readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8')
readme = readme.replace('# 電子看板カメラ v65.22', '# 電子看板カメラ v65.23', 1)
if '## v65.23 トップ画面再構成' not in readme:
    readme += '''\n\n## v65.23 トップ画面再構成\n- トップを「選択中の案件 / 設定」「案件選択 / 新規案件」「カメラ起動 / 看板添付」の2列3段へ再構成\n- 縦横どちらでも画面内に収まりやすいレスポンシブ寸法へ変更\n- 選択中案件は仮案件ID + 現在の看板件名を表示\n- 再起動・日付跨ぎで案件を自動切替せず、最後に選択した案件を保持\n- 案件選択時はcaseIdをアクティブ化し、現段階では最新写真の件名を看板へ戻す\n- 端末名変更はトップから設定画面へ移動\n'''
readme_path.write_text(readme, encoding='utf-8')
(ROOT / 'docs/v65.23-home.md').write_text('''# v65.23 トップ画面\n\nトップ画面は案件確認を起点とする。\n\n1. 選択中の案件 / 設定\n2. 案件選択 / 新規案件\n3. カメラ起動 / 看板添付\n\n選択中の案件には仮案件IDと現在の看板件名を表示する。再起動・スリープ・日付跨ぎで勝手に案件を切り替えない。\n\n現段階の案件選択はcaseIdと件名まで復元する。住所・採取場所等を案件別に保持する正式な案件状態は全体レビュー後に設計する。\n''', encoding='utf-8')

# static validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)
subprocess.run(['node', '--check', str(sw_path)], check=True)

checks = [
    ('home grid', 'launch-home-grid' in index_path.read_text(encoding='utf-8')),
    ('top case display', 'launchCurrentCaseId' in index_path.read_text(encoding='utf-8')),
    ('top settings static', 'onclick="openSettings()"' in index_path.read_text(encoding='utf-8')),
    ('no dynamic settings', 'launchSettingsButton' not in settings_path.read_text(encoding='utf-8')),
    ('case activation', 'function activateSession' in case_path.read_text(encoding='utf-8')),
    ('no old session panel', 'launchCaseSessionPanel' not in case_path.read_text(encoding='utf-8')),
    ('version', 'v65.23' in index_path.read_text(encoding='utf-8')),
    ('db unchanged', 'const DB_VERSION = 2;' in (ROOT / 'js/photo-store.js').read_text(encoding='utf-8')),
]
for label, ok in checks:
    if not ok:
        raise SystemExit(label + ' validation failed')
print('v65.23 validation passed')
