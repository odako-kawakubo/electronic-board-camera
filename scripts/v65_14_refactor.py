from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


# -----------------------------------------------------------------------------
# app.js: 複数モジュール共有の宣言を外し、app専用DOM/状態だけ残す。
# -----------------------------------------------------------------------------
app = read("js/app.js")
start_marker = "    // ============================================================\n    // アプリ共通定数\n"
end_marker = "    // ============================================================\n    // アプリ起動・全体イベント\n"
start = app.find(start_marker)
end = app.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("app.js shared declaration section markers not found")

app_owned = '''    // ============================================================
    // app.js専用DOM・状態
    // 他モジュールから参照しないものだけをここに残す。
    // ============================================================
    const cameraScreen = document.getElementById("cameraScreen");
    const boardLayer = document.querySelector(".board-layer");
    const boardEditPhotoStage = document.getElementById("boardEditPhotoStage");
    const boardEditHost = document.getElementById("boardEditHost");
    const toast = document.getElementById("toast");
    let toastTimer = null;

'''
app = app[:start] + app_owned + app[end:]
app = app.replace(
    " * app.js - アプリ全体の起点 / 共有状態",
    " * app.js - アプリ全体の起点 / 共通UI",
)
app = app.replace(
    " * 責務: 各機能モジュールをつなぐ中心。共有定数・DOM参照・共有状態・初期化順序・共通UIだけを担当する。",
    " * 責務: 各機能モジュールをつなぐ起点。初期化順序、全体イベント、app専用UIだけを担当する。共有状態はshared-state.jsを正本とする。",
)
write("js/app.js", app)


# -----------------------------------------------------------------------------
# shared-state.js: 既存名を維持したまま、横断共有だけを一か所へ集約。
# settings.jsで定義されるロード関数を使うため、settings.jsより後に読む。
# -----------------------------------------------------------------------------
shared = '''/*
 * ============================================================
 * shared-state.js - モジュール間共有の定数 / DOM / 実行状態
 * ============================================================
 * 責務: camera / board / import / viewer / photo-utils など複数モジュールが
 *       同じ名前で参照する値だけを一か所に集約する。
 *
 * 保守上の注意:
 * - classic script の共有スコープを意図的に利用している。ES modules化までは
 *   ここで宣言した名前を各ファイルへ重複定義しない。
 * - 単一モジュールだけで使う値はここへ追加せず、その担当モジュールへ置く。
 * - photoQuality / boardTextSize の初期化は settings.js の読込後でなければならない。
 * - APP_DATA は現状テスト用初期値。OneDrive/SharePoint案件連携時の置換対象。
 * ============================================================
 */

    // ============================================================
    // 共有定数
    // ============================================================
    const APP_DATA = {
      subject: "テストビル解体に伴うアスベスト調査",
      address: "神奈川県小田原市小八幡2-3-6"
    };

    const STATUS_LIST = [
      { value: "visual", label: "目視", code: "5" },
      { value: "before", label: "施工前", code: "1" },
      { value: "during", label: "施工中", code: "2" },
      { value: "after", label: "施工後", code: "3" }
    ];

    const SECTION_PHOTO_TYPE = { value: "section", label: "断面", code: "4" };
    const POINT_DISPLAY_DEFAULT = "1-①";
    const BOARD_TEXT_SIZE_MULTIPLIERS = {
      small: 0.88,
      normal: 1,
      large: 1.12
    };
    const PHOTO_QUALITY_SETTINGS = {
      standard: { label: "標準", width: 3024, height: 2268 },
      high: { label: "高画質", width: 3264, height: 2448 }
    };

    const BOARD_POSITIONS = ["bottom-left", "bottom-right", "top-right", "top-left"];
    const BOARD_POSITION_LABELS = {
      "bottom-left": "左下",
      "bottom-right": "右下",
      "top-right": "右上",
      "top-left": "左上"
    };

    // ============================================================
    // 共有DOM参照
    // ============================================================
    const captureFrame = document.getElementById("captureFrame");
    const boardWrap = document.getElementById("boardWrap");
    const photoBoard = document.getElementById("photoBoard");
    const boardEditOverlay = document.getElementById("boardEditOverlay");
    const boardEditPhotoBackdrop = document.getElementById("boardEditPhotoBackdrop");
    const boardEditDoneButton = document.getElementById("boardEditDoneButton");
    const subjectText = document.getElementById("subjectText");
    const addressText = document.getElementById("addressText");
    const roomNoInput = document.getElementById("roomNoInput");
    const sampleNoInput = document.getElementById("sampleNoInput");
    const dateText = document.getElementById("dateText");
    const photoCount = document.getElementById("photoCount");
    const previewOverlay = document.getElementById("previewOverlay");
    const categoryToggleButton = document.getElementById("categoryToggleButton");

    // ============================================================
    // 共有実行状態
    // 変数名を維持し、既存モジュールの参照方法は変更しない。
    // ============================================================
    let currentStream = null;
    let selectedStatus = "visual";
    let isSectionMode = false;
    const capturedPhotos = [];
    let previewIndex = 0;
    let boardEditTargetPhotoId = null;
    let photoQuality = loadPhotoQuality();
    let boardTextSize = loadBoardTextSize();
    const boardFieldTextSize = loadBoardFieldTextSizes();
    let boardMode = "survey";
    let activeSidePanel = null;
    let isDateManuallyEdited = false;

    const boardState = {
      x: 12,
      y: 12,
      scale: 1,
      minScale: 0.35,
      maxScale: 1.8,
      sizeRatio: 0.45,
      minSizeRatio: 0.35,
      maxSizeRatio: 0.55,
      position: "bottom-left"
    };
'''
write("js/shared-state.js", shared)


# -----------------------------------------------------------------------------
# 読込順・バージョン・Service Workerキャッシュを更新。
# -----------------------------------------------------------------------------
index = read("index.html")
old_scripts = (
    '  <script src="./js/photo-store.js"></script>\n'
    '  <script src="./js/settings.js"></script>\n'
    '  <script src="./js/app.js"></script>'
)
new_scripts = (
    '  <script src="./js/photo-store.js"></script>\n'
    '  <script src="./js/settings.js"></script>\n'
    '  <script src="./js/shared-state.js"></script>\n'
    '  <script src="./js/app.js"></script>'
)
if old_scripts not in index:
    raise SystemExit("index script marker not found")
index = index.replace(old_scripts, new_scripts, 1)
index = index.replace('id="settingsVersionText">v65.13<', 'id="settingsVersionText">v65.14<', 1)
write("index.html", index)

settings = read("js/settings.js")
if 'const APP_VERSION = "v65.13";' not in settings:
    raise SystemExit("settings source version mismatch")
write("js/settings.js", settings.replace('const APP_VERSION = "v65.13";', 'const APP_VERSION = "v65.14";', 1))

sw = read("service-worker.js")
if 'const CACHE_NAME = "electronic-board-camera-v65.13";' not in sw:
    raise SystemExit("service worker source version mismatch")
sw = sw.replace('const CACHE_NAME = "electronic-board-camera-v65.13";', 'const CACHE_NAME = "electronic-board-camera-v65.14";', 1)
sw = sw.replace(
    '  "./js/settings.js",\n  "./js/app.js",',
    '  "./js/settings.js",\n  "./js/shared-state.js",\n  "./js/app.js",',
    1,
)
write("service-worker.js", sw)

readme = read("README.md").replace("# 電子看板カメラ v65.13", "# 電子看板カメラ v65.14", 1)
if "## v65.14 共有状態整理" not in readme:
    readme += """

## v65.14 共有状態整理
- 複数モジュールが直接参照する共有定数・共有DOM・共有実行状態を `js/shared-state.js` へ集約
- 既存の変数名とclassic scriptの参照方法は維持し、機能側の呼び出し変更を回避
- `app.js` は初期化・全体イベント・app専用UIへ責務を縮小
- IndexedDB、写真形式、命名規則、UI、OneDrive連携仕様は変更なし
"""
write("README.md", readme)

write(
    "docs/v65.14-shared-state.md",
    """# v65.14 共有状態整理

## 目的
`app.js` に残っていた複数モジュール共有の宣言を `shared-state.js` に集約し、起動処理と共有状態の責務を分離する。

## 設計
- classic scriptは継続し、既存モジュールの変数参照を書き換えない。
- `settings.js` → `shared-state.js` → `app.js` の順に読み込む。
- `photoQuality` 等の初期値ロードが `settings.js` に依存するため、この順序は変更しない。
- 単一モジュール所有の宣言は各担当モジュールに置く。
- app専用のDOM/状態（toast等）はapp.jsに残す。

## 非変更
撮影、看板、写真取込、IndexedDB、Base64保存、ファイル名、OneDrive、画面操作。
""",
)


# -----------------------------------------------------------------------------
# 静的検証。構文・所有・読込順・onclickの関数解決を確認。
# -----------------------------------------------------------------------------
for js in sorted((ROOT / "js").glob("*.js")):
    subprocess.run(["node", "--check", str(js)], check=True)

app = read("js/app.js")
shared = read("js/shared-state.js")
index = read("index.html")
sw = read("service-worker.js")
settings = read("js/settings.js")
all_js = "\n".join(read(f"js/{p.name}") for p in sorted((ROOT / "js").glob("*.js")))

shared_names = [
    "APP_DATA", "STATUS_LIST", "SECTION_PHOTO_TYPE", "POINT_DISPLAY_DEFAULT",
    "BOARD_TEXT_SIZE_MULTIPLIERS", "PHOTO_QUALITY_SETTINGS", "BOARD_POSITIONS",
    "BOARD_POSITION_LABELS", "captureFrame", "boardWrap", "photoBoard",
    "boardEditOverlay", "boardEditPhotoBackdrop", "boardEditDoneButton",
    "subjectText", "addressText", "roomNoInput", "sampleNoInput", "dateText",
    "photoCount", "previewOverlay", "categoryToggleButton", "currentStream",
    "selectedStatus", "isSectionMode", "capturedPhotos", "previewIndex",
    "boardEditTargetPhotoId", "photoQuality", "boardTextSize", "boardFieldTextSize",
    "boardMode", "activeSidePanel", "isDateManuallyEdited", "boardState",
]
for name in shared_names:
    pattern = re.compile(rf"^\s*(?:const|let)\s+{re.escape(name)}\b", re.M)
    if not pattern.search(shared):
        raise SystemExit(f"{name} missing from shared-state.js")
    if pattern.search(app):
        raise SystemExit(f"{name} still declared in app.js")

for name in ["cameraScreen", "boardLayer", "boardEditPhotoStage", "boardEditHost", "toast", "toastTimer"]:
    if not re.search(rf"^\s*(?:const|let)\s+{re.escape(name)}\b", app, re.M):
        raise SystemExit(f"{name} must remain app-owned")

order = [
    "./js/photo-store.js", "./js/settings.js", "./js/shared-state.js", "./js/app.js",
    "./js/photo-utils.js", "./js/board.js", "./js/camera.js", "./js/photo-import.js", "./js/photo-viewer.js",
]
last = -1
for src in order:
    at = index.find(f'src="{src}"')
    if at < 0 or at <= last:
        raise SystemExit(f"script order mismatch: {src}")
    last = at

if "electronic-board-camera-v65.14" not in sw or '"./js/shared-state.js"' not in sw:
    raise SystemExit("service worker mismatch")
if 'const APP_VERSION = "v65.14";' not in settings:
    raise SystemExit("APP_VERSION mismatch")
if 'id="settingsVersionText">v65.14<' not in index:
    raise SystemExit("HTML version mismatch")

function_names = set(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", all_js))
onclick_bodies = re.findall(r'onclick="([^"]+)"', index)
calls = []
for body in onclick_bodies:
    calls.extend(re.findall(r"(?:^|[;\s])([A-Za-z_$][\w$]*)\s*\(", body))
missing = sorted({name for name in calls if name not in {"if", "return"} and name not in function_names})
if missing:
    raise SystemExit("missing onclick functions: " + ", ".join(missing))


# -----------------------------------------------------------------------------
# 一時実行物を最終コミットに残さない。
# review-pages.ymlの一時差分はWorkflow側で小さく入れるため、ここで元へ戻す。
# -----------------------------------------------------------------------------
workflow_path = ROOT / ".github/workflows/review-pages.yml"
workflow = workflow_path.read_text(encoding="utf-8")
workflow = workflow.replace("  contents: write\n", "  contents: read\n", 1)
workflow = workflow.replace("          fetch-depth: 0\n", "", 1)
step = '''
      - name: Run v65.14 refactor
        working-directory: review-src
        shell: bash
        run: |
          python scripts/v65_14_refactor.py
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -m "v65.14 共有状態を分離 [v65.14-done]"
          git push origin HEAD:review/v65.1
'''
workflow = workflow.replace(step, "", 1)
workflow_path.write_text(workflow, encoding="utf-8")

for temp in [
    ROOT / ".github/workflows/v65-14-shared-state.yml",
    ROOT / ".v65.14-trigger",
    Path(__file__),
]:
    if temp.exists():
        temp.unlink()

print("v65.14 refactor validation passed")
