    const APP_VERSION = "v65.9";

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
    const DEFAULT_POINT_NO = "1";
    const POINT_DISPLAY_DEFAULT = "1-①";
    const PHOTO_QUALITY_STORAGE_KEY = "electronic-board-camera-photo-quality";
    const BOARD_TEXT_SIZE_STORAGE_KEY = "electronic-board-camera-board-text-size";
    const BOARD_FIELD_TEXT_SIZE_STORAGE_KEY = "electronic-board-camera-board-field-text-size-v1";
    const BOARD_FORM_STORAGE_KEY = "electronic-board-camera-board-form-v1";
    const SAMPLING_NAME_HISTORY_STORAGE_KEY = "electronic-board-camera-sampling-name-history-v1";
    const BOARD_TEXT_SIZE_MULTIPLIERS = {
      small: 0.88,
      normal: 1,
      large: 1.12
    };
    const PHOTO_QUALITY_SETTINGS = {
      standard: { label: "標準", width: 3024, height: 2268 },
      high: { label: "高画質", width: 3264, height: 2448 }
    };

    const cameraScreen = document.getElementById("cameraScreen");
    const captureFrame = document.getElementById("captureFrame");
    const video = document.getElementById("video");
    const captureFreezeImage = document.getElementById("captureFreezeImage");
    const cameraFlash = document.getElementById("cameraFlash");
    const captureReviewOverlay = document.getElementById("captureReviewOverlay");
    const captureReviewImage = document.getElementById("captureReviewImage");
    const samplingNameHistoryList = document.getElementById("samplingNameHistoryList");
    const cameraGuide = document.getElementById("cameraGuide");
    const launchModeOverlay = document.getElementById("launchModeOverlay");
    const launchResumePanel = document.getElementById("launchResumePanel");
    const launchResumeMeta = document.getElementById("launchResumeMeta");
    const importPhotoInput = document.getElementById("importPhotoInput");
    const importProgressBadge = document.getElementById("importProgressBadge");
    const importBoardPositionLabel = document.getElementById("importBoardPositionLabel");

    const boardLayer = document.querySelector(".board-layer");
    const boardWrap = document.getElementById("boardWrap");
    const photoBoard = document.getElementById("photoBoard");
    const boardCanvasPreview = document.getElementById("boardCanvasPreview");
    const boardEditOverlay = document.getElementById("boardEditOverlay");
    const boardEditPhotoBackdrop = document.getElementById("boardEditPhotoBackdrop");
    const boardEditPhotoStage = document.getElementById("boardEditPhotoStage");
    const boardEditDoneButton = document.getElementById("boardEditDoneButton");
    const boardEditHost = document.getElementById("boardEditHost");
    const boardEditCanvas = document.getElementById("boardEditCanvas");
    const boardEditSubject = document.getElementById("boardEditSubject");
    const boardEditAddress = document.getElementById("boardEditAddress");
    const boardEditRoom = document.getElementById("boardEditRoom");
    const boardEditSample = document.getElementById("boardEditSample");
    const boardEditDate = document.getElementById("boardEditDate");
    const boardEditStatus = document.getElementById("boardEditStatus");
    const boardEditModeSelect = document.getElementById("boardEditModeSelect");
    const boardEditRoomLabel = document.getElementById("boardEditRoomLabel");
    const boardEditSelectedFieldLabel = document.getElementById("boardEditSelectedFieldLabel");

    const subjectText = document.getElementById("subjectText");
    const addressText = document.getElementById("addressText");
    const roomNoInput = document.getElementById("roomNoInput");
    const sampleNoInput = document.getElementById("sampleNoInput");
    const dateText = document.getElementById("dateText");

    const startButton = document.getElementById("startButton");
    const viewButton = document.getElementById("viewButton");
    const sectionButton = document.getElementById("sectionButton");
    const shootButton = document.getElementById("shootButton");
    const statusButtons = Array.from(document.querySelectorAll(".status-btn"));

    const photoCount = document.getElementById("photoCount");
    const sectionModeBadge = document.getElementById("sectionModeBadge");
    const previewOverlay = document.getElementById("previewOverlay");
    const previewImage = document.getElementById("previewImage");
    const photoZoomOverlay = document.getElementById("photoZoomOverlay");
    const photoZoomImage = document.getElementById("photoZoomImage");
    const boardEditModeBadge = document.getElementById("boardEditModeBadge");
    const previewCounter = document.getElementById("previewCounter");
    const caseSelectButton = document.getElementById("caseSelectButton");
    const casePickerOverlay = document.getElementById("casePickerOverlay");
    const casePickerList = document.getElementById("casePickerList");
    const previewMeta = document.getElementById("previewMeta");
    const previewThumbnails = document.getElementById("previewThumbnails");
    const previewList = document.getElementById("previewList");
    const previewSortButton = document.getElementById("previewSortButton");
    const boardCorrectionButton = document.getElementById("boardCorrectionButton");
    const selectAllButton = document.getElementById("selectAllButton");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const qualityStandardButton = document.getElementById("qualityStandardButton");
    const qualityHighButton = document.getElementById("qualityHighButton");
    const categoryToggleButton = document.getElementById("categoryToggleButton");
    const editBoardModeButton = document.getElementById("editBoardModeButton");
    const boardEditResetButton = document.getElementById("boardEditResetButton");
    const samplingLocationInput = null;
    const panelMainButtons = Array.from(document.querySelectorAll(".panel-main-button"));
    const sidePanels = {
      room: document.getElementById("roomPanel"),
      sample: document.getElementById("samplePanel"),
      board: document.getElementById("boardPanel")
    };
    const roomLabelCell = document.getElementById("roomLabelCell");
    const roomValueCell = document.getElementById("roomValueCell");
    const visualStatusButton = document.getElementById("visualStatusButton");
    const toast = document.getElementById("toast");
    const settingsVersionText = document.getElementById("settingsVersionText");

    let currentStream = null;
    let isTakingPhoto = false;
    let selectedStatus = "visual";
    let isSectionMode = false;
    let hasInitializedBoard = false;
    let toastTimer = null;

    const capturedPhotos = [];

    const savePhotoToIndexedDB = (photo) => PhotoStore.savePhoto(photo);
    const deletePhotoFromIndexedDB = (photoId) => PhotoStore.deletePhoto(photoId);
    const saveImportSession = (session) => PhotoStore.saveImportSession(session);
    const loadImportSession = () => PhotoStore.loadImportSession();
    const deleteImportSession = () => PhotoStore.deleteImportSession();

    let previewIndex = 0;
    let isPreviewListMode = false;
    let previewSortMode = "shooting";
    let selectedCaseSubject = "";
    let isBoardCorrectionSelectMode = false;
    let boardEditTargetPhotoId = null;
    let photoQuality = loadPhotoQuality();
    let boardTextSize = loadBoardTextSize();
    const boardFieldTextSize = loadBoardFieldTextSizes();
    let boardMode = "survey";
    let activeSidePanel = null;
    let isDateManuallyEdited = false;

    // v62: 既存写真読み込み編集セッション。元画像はセッション中だけIndexedDBへ一時保存する。
    let activeImportSession = null;
    let activeImportBaseDataUrl = "";
    let isImportBoardEdit = false;

    const BOARD_POSITIONS = ["bottom-left", "bottom-right", "top-right", "top-left"];
    const BOARD_POSITION_LABELS = {
      "bottom-left": "左下",
      "bottom-right": "右下",
      "top-right": "右上",
      "top-left": "左上"
    };

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

    let previewTouchStartX = 0;
    let previewTouchStartY = 0;
    let lastBoardTapAt = 0;
    let isBoardEditMode = false;
    let captureReviewResolver = null;
    let boardEditHistory = [];
    let boardEditHistoryIndex = -1;
    let isApplyingBoardHistory = false;
    let boardEditHistoryTimer = null;
    let boardEditDraft = null;
    let boardEditSelectedField = "subject";
    let boardEditRenderQueued = false;
    let boardEditRenderToken = 0;
    let boardEditIsComposing = false;
    let boardEditFinishRequested = false;

    document.addEventListener("DOMContentLoaded", async () => {
      setupForcedLandscape();
      renderAppVersion();
      checkAppUpdate();
      initializeBoard();
      setupStatusButtons();
      setupBoardMode();
      setupDateEditTracking();
      setupBoardPersistence();
      setupSamplingNameHistory();
      setupBoardEditGesture();
      setBoardEditable(false);
      setupPreviewSwipe();
      setupPreviewImageTap();
      setupPhotoCountHiddenShoot();
      setupBoardTextareaAutoCenter();
      setupBoardEditHistoryTracking();
    setupBoardEditForm();
      setupReliableBoardEditControls();
      setupSettingsToggleButton();
      renderPhotoQualitySettings();
      renderBoardTextSize();
      applyBoardFieldTextSizes();

      await loadPhotosFromIndexedDB();
      setupImportPhotoInput();
      await refreshImportResumePanel();

      requestAnimationFrame(() => {
        setInitialBoardLayout();
        scheduleBoardPreviewRender();
      });
    });

    window.addEventListener("resize", () => {
      handleWindowResize();
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        handleWindowResize();
      }, 200);
    });

    /*
     * iPhone / iPad のホーム画面PWA対策
     * 画面復帰時にカメラが止まることがあるため復帰を試す
     */
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && currentStream && !previewOverlay.classList.contains("show")) {
        resumeCameraAfterPreview();
      }
    });

    window.addEventListener("pageshow", () => {
      if (currentStream && !previewOverlay.classList.contains("show")) {
        resumeCameraAfterPreview();
      }
    });

    function setupForcedLandscape() {
      const savedFlip = localStorage.getItem("electronicBoardLandscapeFlip") === "1";
      document.body.classList.toggle("landscape-flipped", savedFlip);
      updateLandscapeFlipButton();
    }

    function toggleLandscapeFlip() {
      const flipped = document.body.classList.toggle("landscape-flipped");
      localStorage.setItem("electronicBoardLandscapeFlip", flipped ? "1" : "0");
      updateLandscapeFlipButton();
      setTimeout(handleWindowResize, 80);
    }

    function updateLandscapeFlipButton() {
      const button = document.getElementById("landscapeFlipButton");
      if (!button) return;
      button.setAttribute("aria-pressed", document.body.classList.contains("landscape-flipped") ? "true" : "false");
    }

    function updatePhotoCount() {
      photoCount.textContent = `撮影済み\n${capturedPhotos.length}枚`;
      updateSelectAllButton();
    }

    function getStatusLabel(value) {
      if (value === SECTION_PHOTO_TYPE.value) return SECTION_PHOTO_TYPE.label;
      const found = STATUS_LIST.find(item => item.value === value);
      return found ? found.label : value;
    }

    function getCurrentPhotoType() {
      if (isSectionMode) return SECTION_PHOTO_TYPE;
      return STATUS_LIST.find((item) => item.value === selectedStatus) || STATUS_LIST[0];
    }

    function getStatusCode(value) {
      if (value === SECTION_PHOTO_TYPE.value) return SECTION_PHOTO_TYPE.code;
      const found = STATUS_LIST.find((item) => item.value === value);
      return found ? found.code : "0";
    }

    function normalizeFilePart(value) {
      const text = normalizeFullWidthText(String(value || "").trim());
      return text ? text.replace(/[^0-9A-Za-z_-]/g, "") : "1";
    }

    /*
     * 看板表示用の「試料No.」には、現場運用上「1-①」のような表記が入る想定。
     * ファイル名では丸数字を半角数字に直し、「1-①」も「1-1」も同じ 1-1 として扱う。
     */
    function parseSampleAndPoint(value) {
      const rawText = String(value || "").trim() || POINT_DISPLAY_DEFAULT;
      const normalized = normalizeFullWidthText(rawText)
        .replace(/[−ー―‐]/g, "-")
        .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, (char) => String("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".indexOf(char) + 1));

      const parts = normalized.split("-").filter(Boolean);

      return {
        sampleNo: normalizeFilePart(parts[0] || normalized || "1"),
        pointNo: normalizeFilePart(parts[1] || DEFAULT_POINT_NO)
      };
    }

    function normalizeFullWidthText(value) {
      return String(value || "").replace(/[！-～]/g, (char) => {
        return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
      }).replace(/　/g, " ");
    }

    function generatePhotoFileName(sampleNo, pointNo, statusCode, excludePhotoId = "") {
      const baseName = `${sampleNo}-${pointNo}-${statusCode}`;
      const used = new Set();
      capturedPhotos.forEach((photo) => {
        if (!photo || photo.id === excludePhotoId) return;
        if (String(photo.sampleNo) !== String(sampleNo) || String(photo.pointNo) !== String(pointNo) || String(photo.statusCode) !== String(statusCode)) return;
        const file = String(photo.fileName || "");
        if (file === `${baseName}.jpg`) used.add(1);
        const match = file.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d{2,})\\.jpg$`));
        if (match) used.add(Math.max(2, Number(match[1]) || 0));
      });
      if (!used.has(1)) return `${baseName}.jpg`;
      let next = 2;
      while (used.has(next)) next += 1;
      return `${baseName}_${String(next).padStart(2, "0")}.jpg`;
    }

    async function loadPhotosFromIndexedDB() {
      try {
        const photos = await PhotoStore.getAllPhotos();

        capturedPhotos.splice(0, capturedPhotos.length, ...photos.sort((a, b) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }));

        capturedPhotos.forEach((photo) => {
          if (!photo.subjectName) photo.subjectName = getPhotoSubject(photo);
        });

        if (capturedPhotos.length) {
          previewIndex = capturedPhotos.length - 1;
        }

        updatePhotoCount();
      } catch (error) {
        console.error(error);
        showToast("端末内保存の読込に失敗しました");
      }
    }


    function showToast(message) {
      toast.textContent = message;
      toast.classList.remove("error");
      toast.classList.add("show");

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 1400);
    }

    function showErrorToast(message) {
      toast.textContent = message;
      toast.classList.add("error");
      toast.classList.add("show");

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.remove("error");
      }, 2400);
    }
