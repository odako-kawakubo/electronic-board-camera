/*
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
