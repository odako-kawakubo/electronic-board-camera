
    const APP_VERSION = "v49-inapp-update";

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
    const DB_NAME = "electronic-board-camera-prototype";
    const DB_VERSION = 1;
    const DB_STORE_NAME = "photos";
    const DEFAULT_POINT_NO = "1";
    const POINT_DISPLAY_DEFAULT = "1-①";
    const PHOTO_QUALITY_STORAGE_KEY = "electronic-board-camera-photo-quality";
    const BOARD_TEXT_SIZE_STORAGE_KEY = "electronic-board-camera-board-text-size";
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

    const boardLayer = document.querySelector(".board-layer");
    const boardWrap = document.getElementById("boardWrap");
    const photoBoard = document.getElementById("photoBoard");
    const boardEditOverlay = document.getElementById("boardEditOverlay");
    const boardEditHost = document.getElementById("boardEditHost");

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
    const previewCounter = document.getElementById("previewCounter");
    const caseSelectButton = document.getElementById("caseSelectButton");
    const casePickerOverlay = document.getElementById("casePickerOverlay");
    const casePickerList = document.getElementById("casePickerList");
    const previewMeta = document.getElementById("previewMeta");
    const previewThumbnails = document.getElementById("previewThumbnails");
    const previewList = document.getElementById("previewList");
    const previewModeToggleButton = document.getElementById("previewModeToggleButton");
    const previewSortButton = document.getElementById("previewSortButton");
    const selectAllButton = document.getElementById("selectAllButton");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const qualityStandardButton = document.getElementById("qualityStandardButton");
    const qualityHighButton = document.getElementById("qualityHighButton");
    const categoryToggleButton = document.getElementById("categoryToggleButton");
    const editBoardModeButton = document.getElementById("editBoardModeButton");
    const samplingLocationInput = null;
    const textSizeSmallButton = document.getElementById("textSizeSmallButton");
    const textSizeNormalButton = document.getElementById("textSizeNormalButton");
    const textSizeLargeButton = document.getElementById("textSizeLargeButton");
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
    const appVersionBadge = document.getElementById("appVersionBadge");
    const settingsVersionText = document.getElementById("settingsVersionText");

    let currentStream = null;
    let isTakingPhoto = false;
    let selectedStatus = "visual";
    let isSectionMode = false;
    let hasInitializedBoard = false;
    let toastTimer = null;
    let dbInstance = null;

    const capturedPhotos = [];
    let previewIndex = 0;
    let isPreviewListMode = false;
    let previewSortMode = "shooting";
    let selectedCaseSubject = "";
    let photoQuality = loadPhotoQuality();
    let boardTextSize = loadBoardTextSize();
    const boardFieldTextSize = { subject: 18, address: 17, room: 24 };
    let boardMode = "survey";
    let activeSidePanel = null;
    let isDateManuallyEdited = false;

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

    document.addEventListener("DOMContentLoaded", async () => {
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
      renderPhotoQualitySettings();
      renderBoardTextSize();
      applyBoardFieldTextSizes();

      await loadPhotosFromIndexedDB();

      requestAnimationFrame(() => {
        setInitialBoardLayout();
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

    function initializeBoard() {
      const savedBoard = loadSavedBoardForm();
      subjectText.value = savedBoard.subject || APP_DATA.subject;
      addressText.value = savedBoard.address || APP_DATA.address;
      syncBoardTextAreaVerticalCenter();
      roomNoInput.value = savedBoard.roomNo || roomNoInput.value || "1-1";
      sampleNoInput.value = savedBoard.sampleNo || sampleNoInput.value || POINT_DISPLAY_DEFAULT;

      if (savedBoard.date && savedBoard.isDateManuallyEdited) {
        dateText.textContent = savedBoard.date;
        isDateManuallyEdited = true;
      } else {
        updateCurrentDate();
      }

      if (savedBoard.boardMode === "sampling" || savedBoard.boardMode === "survey") {
        boardMode = savedBoard.boardMode;
      }

      syncBoardTextareas();
      setStatus(savedBoard.selectedStatus || "visual");
      applyBoardMode();
      setSectionMode(false);
      updatePhotoCount();
      updateSamplingNameHistoryList();
    }

    function updateCurrentDate() {
      dateText.textContent = formatJapaneseDate(new Date());
    }

    function formatJapaneseDate(date) {
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const d = date.getDate();
      return `${y}年${m}月${d}日`;
    }

    function formatFileDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const h = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      const s = String(date.getSeconds()).padStart(2, "0");
      return `${y}${m}${d}_${h}${min}${s}`;
    }

    function setupBoardMode() {
      applyBoardMode();
    }

    function toggleBoardMode() {
      boardMode = boardMode === "survey" ? "sampling" : "survey";
      applyBoardMode();
      showToast(boardMode === "sampling" ? "サンプリング看板" : "調査看板");
    }

    function applyBoardMode() {
      const isSampling = boardMode === "sampling";
      document.body.classList.toggle("sampling-mode", isSampling);

      if (editBoardModeButton) {
        editBoardModeButton.textContent = isSampling ? "サンプリング" : "調査";
      }
      updateCategoryToggleButton();

      if (roomLabelCell) {
        roomLabelCell.textContent = isSampling ? "" : "　部屋No.";
      }

      if (roomValueCell) {
        roomValueCell.colSpan = isSampling ? 2 : 1;
      }

      if (roomNoInput) {
        roomNoInput.placeholder = isSampling ? "例：階段 1-2階 / 駐車場" : "";
        if (isSampling) {
          roomNoInput.setAttribute("list", "samplingNameHistoryList");
        } else {
          roomNoInput.removeAttribute("list");
        }
      }

      updateSamplingNameHistoryList();
      saveBoardForm();

      if (visualStatusButton) {
        visualStatusButton.style.display = isSampling ? "none" : "inline-flex";
      }

      if (isSampling && selectedStatus === "visual") {
        setStatus("before");
      }
    }

    function openSidePanel(name) {
      activeSidePanel = activeSidePanel === name ? null : name;

      Object.entries(sidePanels).forEach(([key, panel]) => {
        if (panel) panel.classList.toggle("show", key === activeSidePanel);
      });

      panelMainButtons.forEach((button) => {
        const isActive =
          (activeSidePanel === "room" && button.id === "panelRoomButton") ||
          (activeSidePanel === "sample" && button.id === "panelSampleButton") ||
          (activeSidePanel === "board" && button.id === "panelBoardButton");
        button.classList.toggle("active", isActive);
      });
    }

    function closeSidePanel() {
      activeSidePanel = null;
      Object.values(sidePanels).forEach((panel) => {
        if (panel) panel.classList.remove("show");
      });
      panelMainButtons.forEach((button) => button.classList.remove("active"));
    }

    function promptRoomNo() {
      const label = boardMode === "sampling" ? "採取箇所" : "部屋No.";
      const next = window.prompt(`${label}を入力してください`, roomNoInput.value || "");
      if (next === null) return;
      roomNoInput.value = next.trim();
      saveBoardForm();
      if (boardMode === "sampling") saveSamplingNameHistoryForCurrentCase(roomNoInput.value);
      showToast(`${label}を変更しました`);
    }

    function promptSampleNo() {
      const next = window.prompt("試料No.を入力してください", sampleNoInput.value || POINT_DISPLAY_DEFAULT);
      if (next === null) return;
      sampleNoInput.value = next.trim() || POINT_DISPLAY_DEFAULT;
      saveBoardForm();
      showToast("試料No.を変更しました");
    }

    function changeRoomNumber(part, delta) {
      if (boardMode === "sampling") {
        promptRoomNo();
        return;
      }

      roomNoInput.value = incrementNumberInText(roomNoInput.value, part === "floor" ? "first" : "last", delta);
      saveBoardForm();
      showToast(part === "floor" ? "階を変更しました" : "部屋を変更しました");
    }

    function incrementNumberInText(value, target, delta) {
      const text = String(value || "1");
      const matches = Array.from(text.matchAll(/\d+/g));

      if (!matches.length) {
        return String(Math.max(1, 1 + delta));
      }

      const match = target === "first" ? matches[0] : matches[matches.length - 1];
      const current = Number(match[0]);
      const next = Math.max(1, current + delta);

      return text.slice(0, match.index) + String(next) + text.slice(match.index + match[0].length);
    }

    function changeSampleNo(delta) {
      const parts = parseSampleDisplayValue(sampleNoInput.value);
      parts.sampleNo = Math.max(1, parts.sampleNo + delta);
      sampleNoInput.value = formatSampleDisplayValue(parts.sampleNo, parts.pointNo);
      saveBoardForm();
      showToast("検体No.を変更しました");
    }

    function changePointNo(delta) {
      const parts = parseSampleDisplayValue(sampleNoInput.value);
      parts.pointNo = Math.max(1, parts.pointNo + delta);
      sampleNoInput.value = formatSampleDisplayValue(parts.sampleNo, parts.pointNo);
      saveBoardForm();
      showToast("箇所No.を変更しました");
    }

    function parseSampleDisplayValue(value) {
      const parsed = parseSampleAndPoint(value || POINT_DISPLAY_DEFAULT);
      return {
        sampleNo: Number(parsed.sampleNo) || 1,
        pointNo: Number(parsed.pointNo) || 1
      };
    }

    function formatSampleDisplayValue(sampleNo, pointNo) {
      return `${sampleNo}-${toCircledNumber(pointNo)}`;
    }

    function toCircledNumber(value) {
      const circles = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
      return circles[value] || String(value);
    }

    function setupDateEditTracking() {
      if (!dateText) return;
      dateText.addEventListener("input", () => {
        isDateManuallyEdited = true;
        saveBoardForm();
      });
    }

    function getActiveStatusList() {
      return boardMode === "sampling"
        ? STATUS_LIST.filter((item) => item.value !== "visual")
        : STATUS_LIST;
    }

    function setupStatusButtons() {
      statusButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setStatus(button.dataset.value);
        });
      });
    }

    function setStatus(value) {
      selectedStatus = value;
      setSectionMode(false);

      statusButtons.forEach((button) => {
        const checked = button.dataset.value === value;
        const box = button.querySelector(".status-box");

        button.setAttribute("aria-pressed", checked ? "true" : "false");

        if (box) {
          box.textContent = checked ? "■" : "□";
        }
      });

      updateCategoryToggleButton();
      saveBoardForm();
    }

    function cyclePhotoStatus() {
      const list = getActiveStatusList();
      const currentIndex = Math.max(0, list.findIndex((item) => item.value === selectedStatus));
      const next = list[(currentIndex + 1) % list.length];
      setStatus(next.value);
      showToast(`区分：${next.label}`);
    }

    function updateCategoryToggleButton() {
      if (!categoryToggleButton) return;
      const current = getActiveStatusList().find((item) => item.value === selectedStatus) || getActiveStatusList()[0];
      categoryToggleButton.textContent = current.label;
    }

    function setInitialBoardLayout() {
      placeBoardByFixedPosition();
      hasInitializedBoard = true;
    }

    function handleWindowResize() {
      placeBoardByFixedPosition();
      hasInitializedBoard = true;
    }

    function getScreenSize() {
      return {
        width: captureFrame.clientWidth || window.innerWidth,
        height: captureFrame.clientHeight || window.innerHeight
      };
    }

    function getBoardBaseSize() {
      return {
        width: photoBoard.offsetWidth,
        height: photoBoard.offsetHeight
      };
    }

    function applyBoardTransform() {
      boardWrap.style.transform =
        `translate(${boardState.x}px, ${boardState.y}px) scale(${boardState.scale})`;
    }

    function placeBoardByFixedPosition() {
      const screen = getScreenSize();
      const base = getBoardBaseSize();
      const margin = 4;

      boardState.sizeRatio = clamp(boardState.sizeRatio, boardState.minSizeRatio, boardState.maxSizeRatio);
      const targetWidth = screen.width * boardState.sizeRatio;
      boardState.scale = clamp(targetWidth / base.width, boardState.minScale, boardState.maxScale);

      const boardWidth = base.width * boardState.scale;
      const boardHeight = base.height * boardState.scale;
      const maxX = Math.max(margin, screen.width - boardWidth - margin);
      const maxY = Math.max(margin, screen.height - boardHeight - margin);

      switch (boardState.position) {
        case "top-left":
          boardState.x = margin;
          boardState.y = margin;
          break;
        case "top-right":
          boardState.x = maxX;
          boardState.y = margin;
          break;
        case "bottom-right":
          boardState.x = maxX;
          boardState.y = maxY;
          break;
        case "bottom-left":
        default:
          boardState.x = margin;
          boardState.y = maxY;
          break;
      }

      applyBoardTransform();
      syncBoardTextareas();
    }

    function cycleBoardPosition() {
      const currentIndex = BOARD_POSITIONS.indexOf(boardState.position);
      const nextIndex = (currentIndex + 1) % BOARD_POSITIONS.length;
      boardState.position = BOARD_POSITIONS[nextIndex];
      placeBoardByFixedPosition();
      showToast(`看板位置：${BOARD_POSITION_LABELS[boardState.position]}`);
    }

    function increaseBoardSize() {
      boardState.sizeRatio = Math.min(boardState.maxSizeRatio, boardState.sizeRatio + 0.05);
      placeBoardByFixedPosition();
      showToast("看板を拡大しました");
    }

    function decreaseBoardSize() {
      boardState.sizeRatio = Math.max(boardState.minSizeRatio, boardState.sizeRatio - 0.05);
      placeBoardByFixedPosition();
      showToast("看板を縮小しました");
    }



    function setupBoardEditGesture() {
      let lastTapAt = 0;
      photoBoard.addEventListener("pointerup", (event) => {
        if (isBoardEditMode) return;
        if (isSectionMode) return;

        const now = Date.now();
        if (now - lastTapAt < 380) {
          event.preventDefault();
          event.stopPropagation();
          openBoardEditMode();
        }
        lastTapAt = now;
      }, true);
    }

    function setBoardEditable(enabled) {
      subjectText.readOnly = !enabled;
      addressText.readOnly = !enabled;
      roomNoInput.readOnly = !enabled;
      sampleNoInput.readOnly = !enabled;
      dateText.contentEditable = enabled ? "true" : "false";
      boardWrap.classList.toggle("board-readonly", !enabled);
    }

    function openBoardEditMode() {
      if (isBoardEditMode) return;
      if (isSectionMode) {
        showToast("断面モード中は看板を編集できません");
        return;
      }

      isBoardEditMode = true;
      document.body.classList.add("board-editing");
      boardEditHost.appendChild(boardWrap);
      boardEditOverlay.classList.add("show");
      setBoardEditable(true);

      setTimeout(() => {
        syncBoardTextareas();
        if (subjectText && subjectText.focus) subjectText.focus();
      }, 120);
    }

    function closeBoardEditMode() {
      if (!isBoardEditMode) return;

      boardLayer.appendChild(boardWrap);
      boardEditOverlay.classList.remove("show");
      document.body.classList.remove("board-editing");
      setBoardEditable(false);
      isBoardEditMode = false;
      placeBoardByFixedPosition();
      saveBoardForm();
      if (boardMode === "sampling") saveSamplingNameHistoryForCurrentCase(roomNoInput.value);
      showToast("看板編集を完了しました");
    }



    function syncBoardTextareas() {
      const targets = [subjectText, addressText, samplingLocationInput].filter(Boolean);

      targets.forEach((textarea) => {
        if (!textarea || textarea.tagName !== "TEXTAREA") return;

        textarea.style.paddingTop = "0px";
        textarea.style.paddingBottom = "0px";

        const parent = textarea.parentElement;
        const boxHeight = parent ? parent.clientHeight : textarea.clientHeight;
        const scrollHeight = textarea.scrollHeight;
        const top = Math.max(0, (boxHeight - scrollHeight) / 2);

        textarea.style.paddingTop = `${top}px`;
      });
    }

    function setupBoardTextareaAutoCenter() {
      [subjectText, addressText, samplingLocationInput].filter(Boolean).forEach((textarea) => {
        if (!textarea || textarea.tagName !== "TEXTAREA") return;
        textarea.addEventListener("input", syncBoardTextareas);
      });

      requestAnimationFrame(syncBoardTextareas);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function setupBoardGesture() {
      boardWrap.addEventListener("pointerdown", onBoardPointerDown);
      boardWrap.addEventListener("pointermove", onBoardPointerMove);
      boardWrap.addEventListener("pointerup", onBoardPointerEnd);
      boardWrap.addEventListener("pointercancel", onBoardPointerEnd);
      boardWrap.addEventListener("pointerleave", onBoardPointerEnd);
    }

    function onBoardPointerDown(event) {
      if (isInteractiveBoardTarget(event.target)) {
        return;
      }

      event.preventDefault();
      boardWrap.classList.add("dragging");

      try {
        boardWrap.setPointerCapture(event.pointerId);
      } catch (error) {}

      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      if (activePointers.size === 1) {
        gestureState.mode = "drag";
        gestureState.dragStartX = event.clientX;
        gestureState.dragStartY = event.clientY;
        gestureState.originX = boardState.x;
        gestureState.originY = boardState.y;
      } else if (activePointers.size === 2) {
        preparePinchGesture();
      }
    }

    function onBoardPointerMove(event) {
      if (!activePointers.has(event.pointerId)) return;

      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      if (activePointers.size >= 2) {
        handlePinchMove();
        return;
      }

      if (activePointers.size === 1 && gestureState.mode === "drag") {
        event.preventDefault();

        const dx = event.clientX - gestureState.dragStartX;
        const dy = event.clientY - gestureState.dragStartY;

        boardState.x = gestureState.originX + dx;
        boardState.y = gestureState.originY + dy;

        clampBoardWithinScreen();
        applyBoardTransform();
      }
    }

    function onBoardPointerEnd(event) {
      if (activePointers.has(event.pointerId)) {
        activePointers.delete(event.pointerId);
      }

      try {
        boardWrap.releasePointerCapture(event.pointerId);
      } catch (error) {}

      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];

        gestureState.mode = "drag";
        gestureState.dragStartX = remaining.x;
        gestureState.dragStartY = remaining.y;
        gestureState.originX = boardState.x;
        gestureState.originY = boardState.y;
      } else {
        gestureState.mode = null;
        boardWrap.classList.remove("dragging");
      }
    }

    function preparePinchGesture() {
      const points = Array.from(activePointers.values());
      if (points.length < 2) return;

      const p1 = points[0];
      const p2 = points[1];
      const mid = getMidpoint(p1, p2);

      gestureState.mode = "pinch";
      gestureState.startDistance = getDistance(p1, p2);
      gestureState.startScale = boardState.scale;

      gestureState.localMidX = (mid.x - boardState.x) / boardState.scale;
      gestureState.localMidY = (mid.y - boardState.y) / boardState.scale;
    }

    function handlePinchMove() {
      const points = Array.from(activePointers.values());
      if (points.length < 2) return;

      const p1 = points[0];
      const p2 = points[1];

      const newDistance = getDistance(p1, p2);
      const mid = getMidpoint(p1, p2);

      if (!gestureState.startDistance) return;

      let nextScale =
        gestureState.startScale * (newDistance / gestureState.startDistance);

      nextScale = clamp(nextScale, boardState.minScale, boardState.maxScale);

      boardState.scale = nextScale;
      boardState.x = mid.x - gestureState.localMidX * boardState.scale;
      boardState.y = mid.y - gestureState.localMidY * boardState.scale;

      clampBoardWithinScreen();
      applyBoardTransform();
    }

    function getDistance(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getMidpoint(p1, p2) {
      return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
    }

    function isInteractiveBoardTarget(target) {
      return Boolean(
        target.closest(".board-input") || target.closest(".board-editable") || target.closest(".status-btn")
      );
    }

    async function startCamera() {
      try {
        await requestFullscreenSafe();
        stopCurrentStream();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        currentStream = stream;
        video.srcObject = stream;

        await video.play();

        showCameraButtons();
        showToast("カメラを起動しました");
      } catch (error) {
        console.error(error);
        showToast("カメラを起動できませんでした");
      }
    }

    function stopCurrentStream() {
      if (!currentStream) return;

      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
      video.srcObject = null;
    }

    async function requestFullscreenSafe() {
      const target = document.documentElement;

      if (!document.fullscreenElement && target.requestFullscreen) {
        try {
          await target.requestFullscreen();
        } catch (error) {}
      }
    }

    function showCameraButtons() {
      cameraGuide.classList.add("hidden");
      startButton.classList.add("hidden-control");
      viewButton.classList.remove("hidden-control");
      sectionButton.classList.remove("hidden-control");
      shootButton.classList.remove("hidden-control");
      if (categoryToggleButton) categoryToggleButton.classList.remove("hidden-control");
    }

    function showStartButton() {
      cameraGuide.classList.remove("hidden");
      startButton.classList.remove("hidden-control");
      viewButton.classList.add("hidden-control");
      sectionButton.classList.add("hidden-control");
      shootButton.classList.add("hidden-control");
      if (categoryToggleButton) categoryToggleButton.classList.add("hidden-control");
    }

    function toggleSectionMode() {
      setSectionMode(!isSectionMode);
    }

    function setSectionMode(enabled) {
      isSectionMode = Boolean(enabled);
      document.body.classList.toggle("section-mode", isSectionMode);
      sectionButton.classList.toggle("active", isSectionMode);

      // 断面モードの表示バッジは出さない。
      // ボタン色と看板の表示/非表示だけで状態を判断する。
      sectionModeBadge.classList.remove("show");
    }

    /*
     * プレビューから戻った後のカメラ復帰
     * iPhone / iPad のホーム画面PWAで重要
     */
    async function resumeCameraAfterPreview() {
      try {
        const hasLiveTrack =
          currentStream &&
          currentStream.getVideoTracks &&
          currentStream.getVideoTracks().some((track) => track.readyState === "live");

        if (hasLiveTrack) {
          video.srcObject = currentStream;
          await video.play();
          showCameraButtons();
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        currentStream = stream;
        video.srcObject = stream;
        await video.play();

        showCameraButtons();
      } catch (error) {
        console.error(error);
        showStartButton();
        showToast("カメラを再起動してください");
      }
    }

    async function takePhoto() {
      if (isTakingPhoto) return;

      if (!currentStream || !video.srcObject || video.readyState < 2) {
        showToast("先にカメラを起動してください");
        return;
      }

      isTakingPhoto = true;
      shootButton.disabled = true;

      try {
        if (!isDateManuallyEdited) {
          updateCurrentDate();
        }

        // Canvasに文字を焼き込む前に、フォント読み込み完了を待つ
        // iPhone/iPadで日本語フォントの描画が不安定になるのを軽減する
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }

        const canvas = await captureCompositedImage();

        // 白フラッシュで撮影感を出す
        runCameraFlash();

        /*
         * iPhone/iPad向けに少し軽量化
         * 0.95だと重くなりやすいので 0.82
         */
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

        // 実際に保存する合成後画像を確認してから保存する
        const accepted = await showCaptureReview(dataUrl);
        if (!accepted) {
          showToast("撮り直しできます");
          return;
        }
        showCapturedStill(dataUrl);
        await delay(650);
        hideCapturedStill();

        saveBoardForm();
        if (boardMode === "sampling") saveSamplingNameHistoryForCurrentCase(roomNoInput.value);

        const createdAt = new Date();
        const photoType = getCurrentPhotoType();
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const sampleNo = sampleParts.sampleNo;
        const pointNo = sampleParts.pointNo;
        const fileName = generatePhotoFileName(sampleNo, pointNo, photoType.code);
        const photo = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          dataUrl,
          fileName,
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo,
          pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          selected: false,
          createdAt: createdAt.toISOString()
        };

        // 保存成功を確認してから、撮影済み配列と表示枚数へ反映する
        await savePhotoToIndexedDB(photo);

        capturedPhotos.push(photo);
        previewIndex = capturedPhotos.length - 1;
        updatePhotoCount();

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        showToast("撮影しました");
      } catch (error) {
        console.error(error);
        showErrorToast("撮影データの保存に失敗しました");
        hideCapturedStill();
      } finally {
        isTakingPhoto = false;
        shootButton.disabled = false;
      }
    }



    function setupBoardPersistence() {
      [subjectText, addressText, roomNoInput, sampleNoInput].forEach((element) => {
        if (!element) return;
        element.addEventListener("input", () => {
          saveBoardForm();
          if (element === subjectText) updateSamplingNameHistoryList();
        });
        element.addEventListener("change", () => {
          saveBoardForm();
          if (boardMode === "sampling" && element === roomNoInput) {
            saveSamplingNameHistoryForCurrentCase(roomNoInput.value);
          }
        });
      });
    }

    function loadSavedBoardForm() {
      try {
        const raw = localStorage.getItem(BOARD_FORM_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (error) {
        return {};
      }
    }

    function saveBoardForm() {
      try {
        const data = {
          subject: subjectText ? subjectText.value : "",
          address: addressText ? addressText.value : "",
          roomNo: roomNoInput ? roomNoInput.value : "",
          sampleNo: sampleNoInput ? sampleNoInput.value : "",
          date: dateText ? dateText.textContent : "",
          isDateManuallyEdited,
          selectedStatus,
          boardMode,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(BOARD_FORM_STORAGE_KEY, JSON.stringify(data));
      } catch (error) {}
    }

    function setupSamplingNameHistory() {
      updateSamplingNameHistoryList();
    }

    function getSamplingHistoryKey() {
      const subject = getCurrentSubjectName();
      return subject || "無題案件";
    }

    function loadSamplingNameHistoryMap() {
      try {
        const raw = localStorage.getItem(SAMPLING_NAME_HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (error) {
        return {};
      }
    }

    function saveSamplingNameHistoryMap(map) {
      try {
        localStorage.setItem(SAMPLING_NAME_HISTORY_STORAGE_KEY, JSON.stringify(map));
      } catch (error) {}
    }

    function getSamplingNameHistoryForCurrentCase() {
      const map = loadSamplingNameHistoryMap();
      const list = Array.isArray(map[getSamplingHistoryKey()]) ? map[getSamplingHistoryKey()] : [];
      return list.filter(Boolean).slice(0, 12);
    }

    function saveSamplingNameHistoryForCurrentCase(value) {
      const name = String(value || "").trim();
      if (!name) return;
      const key = getSamplingHistoryKey();
      const map = loadSamplingNameHistoryMap();
      const list = Array.isArray(map[key]) ? map[key] : [];
      map[key] = [name, ...list.filter((item) => item !== name)].slice(0, 20);
      saveSamplingNameHistoryMap(map);
      updateSamplingNameHistoryList();
    }

    function updateSamplingNameHistoryList() {
      if (!samplingNameHistoryList) return;
      samplingNameHistoryList.innerHTML = "";
      getSamplingNameHistoryForCurrentCase().forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        samplingNameHistoryList.appendChild(option);
      });
    }

    function showCaptureReview(dataUrl) {
      return new Promise((resolve) => {
        if (!captureReviewOverlay || !captureReviewImage) {
          resolve(true);
          return;
        }

        captureReviewResolver = resolve;
        captureReviewImage.src = dataUrl;
        captureReviewOverlay.classList.add("show");
      });
    }

    function closeCaptureReview(result) {
      if (!captureReviewOverlay || !captureReviewImage) return;
      captureReviewOverlay.classList.remove("show");
      setTimeout(() => {
        if (!captureReviewOverlay.classList.contains("show")) {
          captureReviewImage.removeAttribute("src");
        }
      }, 120);

      const resolver = captureReviewResolver;
      captureReviewResolver = null;
      if (resolver) resolver(Boolean(result));
    }

    function acceptCaptureReview() {
      closeCaptureReview(true);
    }

    function rejectCaptureReview() {
      closeCaptureReview(false);
    }

    async function renderBoardElementToCanvas(element) {
      if (!element) throw new Error("看板要素がありません");

      syncBoardTextareas();
      syncBoardTextAreaVerticalCenter();

      const rect = element.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const clone = element.cloneNode(true);

      prepareBoardCloneForCapture(element, clone);
      addBoardInnerFrameForCapture(clone);
      inlineComputedStyles(element, clone);

      clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      clone.style.margin = "0";
      clone.style.transform = "none";
      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;
      clone.style.boxSizing = "border-box";

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject>
        </svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      try {
        const image = await loadImage(url);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, width, height);
        return canvas;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function prepareBoardCloneForCapture(sourceNode, cloneNode) {
      const sourceControls = sourceNode.querySelectorAll("textarea, input, [contenteditable]");
      const cloneControls = cloneNode.querySelectorAll("textarea, input, [contenteditable]");

      sourceControls.forEach((source, index) => {
        const clone = cloneControls[index];
        if (!clone) return;

        const value = source.tagName === "INPUT" || source.tagName === "TEXTAREA"
          ? source.value
          : source.textContent;

        if (clone.tagName === "TEXTAREA" || clone.tagName === "INPUT") {
          const replacement = document.createElement("div");
          replacement.textContent = value || "";
          replacement.className = clone.className;
          replacement.style.whiteSpace = "pre-wrap";
          replacement.style.display = "flex";
          replacement.style.alignItems = "center";
          replacement.style.justifyContent = "center";
          replacement.style.width = "100%";
          replacement.style.height = "100%";
          replacement.style.border = "0";
          replacement.style.outline = "0";
          replacement.style.background = "transparent";
          replacement.style.boxSizing = "border-box";
          clone.replaceWith(replacement);
        } else {
          clone.textContent = value || "";
        }
      });
    }



    function addBoardInnerFrameForCapture(clone) {
      if (!clone) return;
      const frame = document.createElement("div");
      frame.style.position = "absolute";
      frame.style.left = "4px";
      frame.style.top = "4px";
      frame.style.right = "4px";
      frame.style.bottom = "4px";
      frame.style.border = "1.5px solid #000";
      frame.style.pointerEvents = "none";
      frame.style.zIndex = "50";
      frame.style.boxSizing = "border-box";
      clone.appendChild(frame);
    }

    function inlineComputedStyles(sourceNode, cloneNode) {
      if (!sourceNode || !cloneNode || sourceNode.nodeType !== 1 || cloneNode.nodeType !== 1) return;

      const computed = window.getComputedStyle(sourceNode);
      const importantProperties = [
        "display", "position", "box-sizing", "width", "height", "min-width", "min-height",
        "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin", "border", "border-top", "border-right", "border-bottom", "border-left",
        "border-collapse", "border-spacing", "background", "background-color", "color",
        "font", "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
        "text-align", "vertical-align", "white-space", "overflow", "border-radius",
        "align-items", "justify-content", "flex-direction", "gap", "table-layout"
      ];

      importantProperties.forEach((property) => {
        try {
          cloneNode.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
        } catch (error) {}
      });

      const sourceChildren = Array.from(sourceNode.children);
      const cloneChildren = Array.from(cloneNode.children);
      sourceChildren.forEach((child, index) => inlineComputedStyles(child, cloneChildren[index]));
    }

    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("看板画像の生成に失敗しました"));
        image.src = url;
      });
    }

    function runCameraFlash() {
      if (!cameraFlash) return;

      cameraFlash.classList.add("flash");
      setTimeout(() => {
        cameraFlash.classList.remove("flash");
      }, 90);
    }

    function showCapturedStill(dataUrl) {
      if (!captureFreezeImage) return;

      captureFreezeImage.src = dataUrl;
      captureFreezeImage.classList.add("show");
    }

    function hideCapturedStill() {
      if (!captureFreezeImage) return;

      captureFreezeImage.classList.remove("show");
      setTimeout(() => {
        if (!captureFreezeImage.classList.contains("show")) {
          captureFreezeImage.removeAttribute("src");
        }
      }, 120);
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function captureCompositedImage() {
      const quality = PHOTO_QUALITY_SETTINGS[photoQuality] || PHOTO_QUALITY_SETTINGS.standard;

      const canvas = document.createElement("canvas");
      canvas.width = quality.width;
      canvas.height = quality.height;

      const ctx = canvas.getContext("2d");

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      /*
       * 保存画像は撮影エリアだけにする。
       * 黒帯はUI用なので保存しない。
       * previewの object-fit: cover と同じ考えで、Canvasも4:3いっぱいに描画する。
       */
      const videoScale = Math.max(
        canvas.width / videoWidth,
        canvas.height / videoHeight
      );

      const drawVideoW = videoWidth * videoScale;
      const drawVideoH = videoHeight * videoScale;
      const drawVideoX = (canvas.width - drawVideoW) / 2;
      const drawVideoY = (canvas.height - drawVideoH) / 2;

      ctx.drawImage(
        video,
        0,
        0,
        videoWidth,
        videoHeight,
        drawVideoX,
        drawVideoY,
        drawVideoW,
        drawVideoH
      );

      if (!isSectionMode) {
        const frameRect = captureFrame.getBoundingClientRect();
        const boardRect = photoBoard.getBoundingClientRect();

        // 撮影エリアの中の看板だけを、4:3保存画像へ同じ比率で変換する。
        const scaleX = canvas.width / frameRect.width;
        const scaleY = canvas.height / frameRect.height;

        const boardX = (boardRect.left - frameRect.left) * scaleX;
        const boardY = (boardRect.top - frameRect.top) * scaleY;
        const boardW = boardRect.width * scaleX;
        const boardH = boardRect.height * scaleY;

        try {
          const boardCanvas = await renderBoardElementToCanvas(photoBoard);
          ctx.drawImage(boardCanvas, boardX, boardY, boardW, boardH);
        } catch (error) {
          console.warn("HTML看板の画像化に失敗したため、旧Canvas描画へフォールバックします", error);
          drawBoardOnCanvas(ctx, boardX, boardY, boardW, boardH);
        }
      }

      return canvas;
    }


    function getCurrentSubjectName() {
      const value = subjectText && ("value" in subjectText ? subjectText.value : subjectText.textContent);
      return String(value || "").trim() || "無題案件";
    }

    function getPhotoSubject(photo) {
      return String(photo.subjectName || photo.subject || APP_DATA.subject || "無題案件").trim() || "無題案件";
    }

    function getCaseSummaries() {
      const map = new Map();

      capturedPhotos.forEach((photo) => {
        const subject = getPhotoSubject(photo);
        const current = map.get(subject) || { subject, count: 0, latest: 0 };
        current.count += 1;
        current.latest = Math.max(current.latest, new Date(photo.createdAt || 0).getTime());
        map.set(subject, current);
      });

      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
    }

    function getLatestCaseSubject() {
      const cases = getCaseSummaries();
      return cases.length ? cases[0].subject : "";
    }

    function getPreviewPhotos() {
      let photos = capturedPhotos.slice();

      if (selectedCaseSubject) {
        photos = photos.filter((photo) => getPhotoSubject(photo) === selectedCaseSubject);
      }

      if (previewSortMode === "sample") {
        photos.sort(comparePhotosBySample);
      } else {
        photos.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      }

      return photos;
    }

    function comparePhotosBySample(a, b) {
      const sampleA = Number(a.sampleNo || 0);
      const sampleB = Number(b.sampleNo || 0);
      if (sampleA !== sampleB) return sampleA - sampleB;

      const pointA = Number(a.pointNo || 0);
      const pointB = Number(b.pointNo || 0);
      if (pointA !== pointB) return pointA - pointB;

      const codeA = Number(a.statusCode || getStatusCode(a.status));
      const codeB = Number(b.statusCode || getStatusCode(b.status));
      if (codeA !== codeB) return codeA - codeB;

      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }

    function updatePreviewHeader() {
      if (caseSelectButton) {
        const title = selectedCaseSubject || getLatestCaseSubject() || "案件なし";
        const count = getPreviewPhotos().length;
        caseSelectButton.textContent = `${title}　${count}枚 ▼`;
      }

      if (previewSortButton) {
        previewSortButton.textContent = previewSortMode === "sample" ? "検体順" : "撮影順";
      }
    }

    function openCasePicker() {
      renderCasePicker();
      casePickerOverlay.classList.add("show");
    }

    function closeCasePicker() {
      casePickerOverlay.classList.remove("show");
    }

    function renderCasePicker() {
      casePickerList.innerHTML = "";

      getCaseSummaries().forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "case-item";
        button.classList.toggle("active", item.subject === selectedCaseSubject);
        button.onclick = () => {
          selectedCaseSubject = item.subject;
          previewIndex = 0;
          closeCasePicker();
          renderPreview();
        };

        const name = document.createElement("div");
        name.className = "case-name";
        name.textContent = item.subject;

        const count = document.createElement("div");
        count.className = "case-count";
        count.textContent = `${item.count}枚`;

        button.appendChild(name);
        button.appendChild(count);
        casePickerList.appendChild(button);
      });
    }

    function togglePreviewSortMode() {
      previewSortMode = previewSortMode === "shooting" ? "sample" : "shooting";
      previewIndex = 0;
      renderPreview();
      showToast(previewSortMode === "sample" ? "検体順にしました" : "撮影順にしました");
    }

    function checkMissingPhotos() {
      const photos = getPreviewPhotos();
      if (!photos.length) {
        showToast("写真がありません");
        return;
      }

      const required = ["1", "2", "3"];
      const labels = { "1": "施工前", "2": "施工中", "3": "施工後" };
      const groups = new Map();

      photos.forEach((photo) => {
        const key = `${photo.sampleNo || "1"}-${photo.pointNo || "1"}`;
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key).add(String(photo.statusCode || getStatusCode(photo.status)));
      });

      const missingLines = [];
      groups.forEach((codes, key) => {
        const hasSampling = required.some((code) => codes.has(code));
        if (!hasSampling) return;

        const missing = required.filter((code) => !codes.has(code));
        if (missing.length) {
          missingLines.push(`${formatSamplePointLabel(key)}：${missing.map((code) => labels[code]).join("・")}`);
        }
      });

      if (!missingLines.length) {
        window.alert("撮影不足はありません。");
        return;
      }

      window.alert(`撮影不足\n\n${missingLines.join("\n")}`);
    }

    function formatSamplePointLabel(key) {
      const [sample, point] = String(key).split("-");
      return `${sample || "1"}-${numberToCircle(Number(point || 1))}`;
    }

    function numberToCircle(num) {
      const circles = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
      return circles[num] || String(num);
    }

    /* 写真ビューア */
    async function openPreview() {
      await loadPhotosFromIndexedDB();

      if (!capturedPhotos.length) {
        showToast("撮影した写真がありません");
        return;
      }

      selectedCaseSubject = getLatestCaseSubject();
      const photos = getPreviewPhotos();
      previewIndex = Math.max(0, photos.length - 1);
      setPreviewListMode(false);
      renderPreview();
      previewOverlay.classList.add("show");
    }

    async function closePreview() {
      previewOverlay.classList.remove("show");
      setPreviewListMode(false);

      /*
       * 戻るを押したらカメラ画面へ復帰
       * PWAでカメラが止まっていたら再取得を試す
       */
      await resumeCameraAfterPreview();
    }

    function showPrevPhoto() {
      const photos = getPreviewPhotos();
      if (!photos.length) return;

      previewIndex -= 1;

      if (previewIndex < 0) {
        previewIndex = photos.length - 1;
      }

      renderPreview();
    }

    function showNextPhoto() {
      const photos = getPreviewPhotos();
      if (!photos.length) return;

      previewIndex += 1;

      if (previewIndex >= photos.length) {
        previewIndex = 0;
      }

      renderPreview();
    }

    function renderPreview() {
      const photos = getPreviewPhotos();

      if (!photos.length) {
        previewImage.removeAttribute("src");
        previewCounter.textContent = "0 / 0";
        previewMeta.textContent = "この案件の写真がありません";
        previewThumbnails.innerHTML = "";
        previewList.innerHTML = "";
        updatePreviewHeader();
        updateSelectAllButton();
        return;
      }

      previewIndex = clamp(previewIndex, 0, photos.length - 1);
      const photo = photos[previewIndex];
      previewImage.src = photo.dataUrl;
      previewCounter.textContent = `${previewIndex + 1} / ${photos.length}`;
      previewMeta.textContent = `${photo.fileName}　${photo.statusLabel || getStatusLabel(photo.status)}${photo.selected ? "　✓選択中" : ""}`;
      updatePreviewHeader();
      renderThumbnails();
      renderPhotoList();
      updateSelectAllButton();
    }

    function renderThumbnails() {
      previewThumbnails.innerHTML = "";

      getPreviewPhotos().forEach((photo, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "thumb-item";
        item.classList.toggle("current", index === previewIndex);
        item.classList.toggle("selected", Boolean(photo.selected));
        item.onclick = () => {
          previewIndex = index;
          renderPreview();
        };

        const img = document.createElement("img");
        img.src = photo.dataUrl;
        img.alt = photo.fileName;

        const check = document.createElement("span");
        check.className = "thumb-check";
        check.textContent = photo.selected ? "✓" : "";
        check.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await togglePhotoSelected(index);
        };

        item.appendChild(img);
        item.appendChild(check);
        previewThumbnails.appendChild(item);
      });

      const currentThumb = previewThumbnails.querySelector(".thumb-item.current");
      if (currentThumb) {
        currentThumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }

    function renderPhotoList() {
      previewList.innerHTML = "";

      getPreviewPhotos().forEach((photo, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "photo-list-item";
        item.classList.toggle("current", index === previewIndex);
        item.classList.toggle("selected", Boolean(photo.selected));
        item.onclick = () => {
          previewIndex = index;
          setPreviewListMode(false);
          renderPreview();
        };

        const img = document.createElement("img");
        img.src = photo.dataUrl;
        img.alt = photo.fileName;

        const check = document.createElement("span");
        check.className = "list-check";
        check.textContent = photo.selected ? "✓" : "";
        check.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await togglePhotoSelected(index, { keepListMode: true });
        };

        const info = document.createElement("div");
        info.className = "photo-list-info";

        const status = document.createElement("div");
        status.className = "photo-list-status";
        status.textContent = photo.statusLabel || getStatusLabel(photo.status);

        const file = document.createElement("div");
        file.textContent = photo.fileName;

        info.appendChild(status);
        info.appendChild(file);
        item.appendChild(img);
        item.appendChild(check);
        item.appendChild(info);
        previewList.appendChild(item);
      });
    }

    function togglePreviewListMode() {
      setPreviewListMode(!isPreviewListMode);
      renderPreview();
    }

    function setPreviewListMode(value) {
      isPreviewListMode = Boolean(value);
      previewOverlay.classList.toggle("list-mode", isPreviewListMode);
      if (previewModeToggleButton) {
        previewModeToggleButton.textContent = isPreviewListMode ? "拡大表示" : "2列一覧";
      }
      updateSelectAllButton();
    }

    async function toggleCurrentPhotoSelected() {
      const photos = getPreviewPhotos();
      if (!photos.length) return;
      await togglePhotoSelected(previewIndex);
    }

    async function togglePhotoSelected(index, options = {}) {
      const photos = getPreviewPhotos();
      const photo = photos[index];
      if (!photo) return;
      photo.selected = !photo.selected;
      await savePhotoToIndexedDB(photo);
      updatePhotoCount();
      renderPreview();

      if (options.keepListMode) {
        setPreviewListMode(true);
      }
    }

    async function toggleSelectAllPhotos() {
      const photos = getPreviewPhotos();
      if (!photos.length) {
        showToast("撮影した写真がありません");
        return;
      }

      const allSelected = photos.every((photo) => photo.selected);
      const nextSelected = !allSelected;

      for (const photo of photos) {
        photo.selected = nextSelected;
        await savePhotoToIndexedDB(photo);
      }

      updatePhotoCount();
      renderPreview();
      showToast(nextSelected ? "表示中の写真を全選択しました" : "表示中の写真を全解除しました");
    }

    function updateSelectAllButton() {
      if (!selectAllButton) return;
      const photos = getPreviewPhotos();
      if (!photos.length) {
        selectAllButton.textContent = "全選択";
        return;
      }
      const allSelected = photos.every((photo) => photo.selected);
      selectAllButton.textContent = allSelected ? "全解除" : "全選択";
    }

    async function saveCurrentPreviewPhoto() {
      if (!capturedPhotos.length) {
        showToast("撮影した写真がありません");
        return;
      }

      const selectedPhotos = getPreviewPhotos().filter((photo) => photo.selected);

      if (!selectedPhotos.length) {
        showToast("共有する写真をチェックしてください");
        return;
      }

      await shareOrDownloadPhotos(selectedPhotos);
    }

    async function deleteSelectedPreviewPhotos() {
      if (!capturedPhotos.length) {
        showToast("撮影した写真がありません");
        return;
      }

      const selectedPhotos = getPreviewPhotos().filter((photo) => photo.selected);

      if (!selectedPhotos.length) {
        showToast("削除する写真をチェックしてください");
        return;
      }

      const ok = window.confirm(`選択した画像 ${selectedPhotos.length}枚を削除しますか？`);
      if (!ok) return;

      const selectedIds = new Set(selectedPhotos.map((photo) => photo.id));

      for (const photo of selectedPhotos) {
        await deletePhotoFromIndexedDB(photo.id);
      }

      for (let i = capturedPhotos.length - 1; i >= 0; i--) {
        if (selectedIds.has(capturedPhotos[i].id)) {
          capturedPhotos.splice(i, 1);
        }
      }

      const remainingPhotos = getPreviewPhotos();

      if (!remainingPhotos.length) {
        previewIndex = 0;
        renderPreview();
      } else {
        previewIndex = Math.min(previewIndex, remainingPhotos.length - 1);
        renderPreview();
      }

      updatePhotoCount();
      showToast("削除しました");
    }

    async function shareOrDownloadPhotos(photos) {
      if (!photos.length) return;

      if (navigator.share && navigator.canShare) {
        try {
          const files = photos.map((photo) => {
            const blob = dataUrlToBlob(photo.dataUrl);
            return new File([blob], photo.fileName, { type: "image/jpeg" });
          });

          if (navigator.canShare({ files })) {
            await navigator.share({
              files,
              title: photos.length === 1 ? photos[0].fileName : `電子看板写真 ${photos.length}枚`
            });
            return;
          }
        } catch (error) {
          if (error && error.name === "AbortError") return;
          console.error(error);
          showToast("共有できませんでした");
        }
      }

      photos.forEach((photo, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = photo.dataUrl;
          link.download = photo.fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, index * 250);
      });
    }

    function dataUrlToBlob(dataUrl) {
      const parts = dataUrl.split(",");
      const header = parts[0];
      const base64 = parts[1];
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }

      return new Blob([array], { type: mime });
    }

    function setupPreviewSwipe() {
      previewOverlay.addEventListener("touchstart", (event) => {
        if (!event.touches || event.touches.length !== 1) return;

        previewTouchStartX = event.touches[0].clientX;
        previewTouchStartY = event.touches[0].clientY;
      }, { passive: true });

      previewOverlay.addEventListener("touchend", (event) => {
        if (!event.changedTouches || event.changedTouches.length !== 1) return;
        if (isPreviewListMode) return;

        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;

        const dx = endX - previewTouchStartX;
        const dy = endY - previewTouchStartY;

        if (Math.abs(dx) < 45) return;
        if (Math.abs(dx) < Math.abs(dy)) return;

        if (dx < 0) {
          showNextPhoto();
        } else {
          showPrevPhoto();
        }
      }, { passive: true });
    }

    /*
     * 写真プレビューの大きい画像をタップしたら、現在の写真を選択/解除する。
     * サムネイルの小さいチェックだけだと現場で押しにくいため、画像全体をチェック操作にする。
     */
    function setupPhotoCountHiddenShoot() {
      // 隠し機能：左上の「撮影済み ○枚 / 選択 ○枚」を押しても撮影する。
      // 音量ボタン撮影の代わりに、片手で押しやすいサブシャッターとして使う。
      photoCount.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // プレビュー表示中は誤作動させない。
        if (previewOverlay.classList.contains("show")) return;

        await takePhoto();
      });
    }

    function setupPreviewImageTap() {
      previewImage.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleCurrentPhotoSelected();
      });
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

    function generatePhotoFileName(sampleNo, pointNo, statusCode) {
      const baseName = `${sampleNo}-${pointNo}-${statusCode}`;
      const sameCount = capturedPhotos.filter((photo) => {
        return photo.sampleNo === sampleNo &&
          photo.pointNo === pointNo &&
          photo.statusCode === statusCode;
      }).length;

      if (sameCount === 0) {
        return `${baseName}.jpg`;
      }

      return `${baseName}_${String(sameCount + 1).padStart(2, "0")}.jpg`;
    }

    function openPhotoDB() {
      return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
          resolve(null);
          return;
        }

        if (dbInstance) {
          resolve(dbInstance);
          return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
            db.createObjectStore(DB_STORE_NAME, { keyPath: "id" });
          }
        };

        request.onsuccess = () => {
          dbInstance = request.result;
          resolve(dbInstance);
        };

        request.onerror = () => {
          console.error(request.error);
          reject(request.error);
        };
      });
    }

    async function loadPhotosFromIndexedDB() {
      try {
        const db = await openPhotoDB();
        if (!db) return;

        const photos = await new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE_NAME, "readonly");
          const store = transaction.objectStore(DB_STORE_NAME);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });

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

    async function savePhotoToIndexedDB(photo) {
      try {
        const db = await openPhotoDB();
        if (!db) return;

        await new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE_NAME, "readwrite");
          const store = transaction.objectStore(DB_STORE_NAME);
          const request = store.put(photo);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.error(error);
        showToast("端末内保存に失敗しました");
      }
    }

    async function deletePhotoFromIndexedDB(photoId) {
      try {
        const db = await openPhotoDB();
        if (!db) return;

        await new Promise((resolve, reject) => {
          const transaction = db.transaction(DB_STORE_NAME, "readwrite");
          const store = transaction.objectStore(DB_STORE_NAME);
          const request = store.delete(photoId);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.error(error);
        showToast("端末内写真の削除に失敗しました");
      }
    }

    /* キャンバス上に看板を描画 */
    function drawBoardOnCanvas(ctx, x, y, w, h) {
      const data = {
        subject: subjectText.value || "",
        address: addressText.value || "",
        roomNo: roomNoInput.value.trim(),
        sampleNo: sampleNoInput.value.trim(),
        date: dateText.textContent || "",
        status: selectedStatus,
        roomLabel: boardMode === "sampling" ? "" : "　部屋No."
      };

      const outerLine = Math.max(1.2, h * 0.0085);
      const innerLine = Math.max(0.9, h * 0.0065);
      const frameGap = Math.max(2.2, h * 0.017);
      const frameInset = outerLine + frameGap;

      const outerX = x;
      const outerY = y;
      const outerW = w;
      const outerH = h;

      // 細線二重枠の内側に、表本体を描く。
      x = outerX + frameInset;
      y = outerY + frameInset;
      w = Math.max(1, outerW - frameInset * 2);
      h = Math.max(1, outerH - frameInset * 2);

      const leftColW = w * 0.20;
      const rightW = w - leftColW;

      const row1H = h * (52 / 230);
      const row2H = h * (40 / 230);
      const row3H = h * (96 / 230);
      const row4H = h - row1H - row2H - row3H;

      const contentY = y + row1H + row2H;
      const contentH = row3H;

      // 確定設定：No.セル「少し広」+ 値位置「右」。
      // テストHTMLの 120px + 48px を、右側幅416px基準の比率でCanvasへ反映する。
      const innerLabelW = rightW * 0.404;
      const roomRowH = contentH * 0.31;
      const sampleRowH = contentH * 0.31;
      const statusRowH = contentH - roomRowH - sampleRowH;

      ctx.save();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(outerX, outerY, outerW, outerH);

      ctx.strokeStyle = "#000000";
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      drawOuterBorder(ctx, outerX, outerY, outerW, outerH, outerLine);
      drawOuterBorder(ctx, x, y, w, h, innerLine);

      ctx.lineWidth = innerLine;

      // v45: 罫線は二重枠の内側だけに描く。内容欄の太線・下側の飛び出しを防ぐ。
      const gridTop = y + innerLine;
      const gridBottom = y + h - innerLine;
      const gridLeft = x + innerLine;
      const gridRight = x + w - innerLine;
      drawLine(ctx, x + leftColW, gridTop, x + leftColW, gridBottom);
      drawLine(ctx, gridLeft, y + row1H, gridRight, y + row1H);
      drawLine(ctx, gridLeft, y + row1H + row2H, gridRight, y + row1H + row2H);
      drawLine(ctx, gridLeft, y + row1H + row2H + row3H, gridRight, y + row1H + row2H + row3H);

      drawLine(ctx, x + leftColW, contentY + roomRowH, gridRight, contentY + roomRowH);
      drawLine(ctx, x + leftColW, contentY + roomRowH + sampleRowH, gridRight, contentY + roomRowH + sampleRowH);
      // 部屋No. / 試料No. はラベルと値の間の縦線を描かない。

      const textMultiplier = BOARD_TEXT_SIZE_MULTIPLIERS[boardTextSize] || 1;
      const labelFont = Math.max(10, w * 0.046);
      const titleFont = Math.max(10, w * 0.047 * textMultiplier);
      const addressFont = Math.max(10, w * 0.044 * textMultiplier);
      const innerLabelFont = Math.max(9, w * 0.043);
      const innerValueFont = Math.max(11, w * 0.055 * textMultiplier);
      const statusFont = Math.max(9, w * 0.038);
      const dateFont = Math.max(12, w * 0.055);

      drawCenteredText(ctx, "件名", x, y, leftColW, row1H, labelFont);
      drawCenteredText(ctx, "採取場所", x, y + row1H, leftColW, row2H, labelFont);
      drawCenteredText(ctx, "内容", x, contentY, leftColW, contentH, labelFont);
      drawCenteredText(ctx, "日付", x, y + row1H + row2H + row3H, leftColW, row4H, labelFont);

      drawWrappedCenterText(ctx, data.subject, x + leftColW + 6, y, rightW - 12, row1H, titleFont, 1.25, 2);
      drawWrappedCenterText(ctx, data.address, x + leftColW + 6, y + row1H, rightW - 12, row2H, addressFont, 1.2, 2);

      if (boardMode === "sampling") {
        drawLeftMiddleText(ctx, data.roomNo, x + leftColW + 10, contentY, rightW - 20, roomRowH, innerValueFont);
      } else {
        drawLeftMiddleText(ctx, data.roomLabel, x + leftColW + 8, contentY, innerLabelW - 8, roomRowH, innerLabelFont);
        drawLeftMiddleText(ctx, data.roomNo, x + leftColW + innerLabelW, contentY, rightW - innerLabelW, roomRowH, innerValueFont);
      }

      drawLeftMiddleText(ctx, "　試料No.", x + leftColW + 8, contentY + roomRowH, innerLabelW - 8, sampleRowH, innerLabelFont);
      drawLeftMiddleText(ctx, data.sampleNo, x + leftColW + innerLabelW, contentY + roomRowH, rightW - innerLabelW, sampleRowH, innerValueFont);

      const statusStartX = x + leftColW + 3;
      const statusWidth = rightW - 6;
      const activeStatusList = getActiveStatusList();
      const segmentW = statusWidth / activeStatusList.length;
      const statusCenterY = contentY + roomRowH + sampleRowH + statusRowH / 2;

      ctx.fillStyle = "#000";
      ctx.font = `900 ${statusFont}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      activeStatusList.forEach((item, index) => {
        const symbol = item.value === data.status ? "■" : "□";
        const text = `${symbol}${item.label}`;
        const centerX = statusStartX + segmentW * index + segmentW / 2;
        ctx.fillText(text, centerX, statusCenterY);
      });

      drawCenteredText(ctx, data.date, x + leftColW, y + row1H + row2H + row3H, rightW, row4H, dateFont);

      // 最後に二重枠をもう一度描いて、焼き込み時の外周を安定させる。
      drawOuterBorder(ctx, outerX, outerY, outerW, outerH, outerLine);
      drawOuterBorder(ctx, x, y, w, h, innerLine);

      ctx.restore();
    }

    function drawOuterBorder(ctx, x, y, w, h, lineWidth) {
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, w, lineWidth);
      ctx.fillRect(x, y + h - lineWidth, w, lineWidth);
      ctx.fillRect(x, y, lineWidth, h);
      ctx.fillRect(x + w - lineWidth, y, lineWidth, h);
      ctx.restore();
    }

    function drawLine(ctx, x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    function drawCenteredText(ctx, text, x, y, w, h, fontSize) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.font = `900 ${fontSize}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text || "", x + w / 2, y + h / 2);
      ctx.restore();
    }

    function drawLeftMiddleText(ctx, text, x, y, w, h, fontSize) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.font = `900 ${fontSize}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text || "", x, y + h / 2);
      ctx.restore();
    }

    function drawWrappedLeftText(ctx, text, x, y, w, h, fontSize, lineRate, maxLines) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.font = `900 ${fontSize}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const lines = getWrappedLines(ctx, text || "", w).slice(0, maxLines);
      const lineHeight = fontSize * lineRate;
      const totalHeight = lines.length * lineHeight;
      let currentY = y + h / 2 - totalHeight / 2 + lineHeight / 2;

      lines.forEach((line) => {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
      });

      ctx.restore();
    }

    function drawWrappedCenterText(ctx, text, x, y, w, h, fontSize, lineRate, maxLines) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.font = `900 ${fontSize}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = getWrappedLines(ctx, text || "", w).slice(0, maxLines);
      const lineHeight = fontSize * lineRate;
      const totalHeight = lines.length * lineHeight;
      let currentY = y + h / 2 - totalHeight / 2 + lineHeight / 2;

      lines.forEach((line) => {
        ctx.fillText(line, x + w / 2, currentY);
        currentY += lineHeight;
      });

      ctx.restore();
    }

    function getWrappedLines(ctx, text, maxWidth) {
      const result = [];
      const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const manualLines = source.split("\n");

      manualLines.forEach((manualLine) => {
        const segment = manualLine || "";
        let current = "";

        for (const char of segment) {
          const test = current + char;
          const testWidth = ctx.measureText(test).width;

          if (testWidth > maxWidth && current !== "") {
            result.push(current);
            current = char;
          } else {
            current = test;
          }
        }

        // 手動改行だけの空行も保持する
        result.push(current);
      });

      return result.length ? result : [""];
    }


    function setupBoardTextAreaCentering() {
      [subjectText, addressText].forEach((element) => {
        if (!element) return;
        element.addEventListener("input", syncBoardTextAreaVerticalCenter);
        element.addEventListener("change", syncBoardTextAreaVerticalCenter);
      });
      syncBoardTextAreaVerticalCenter();
    }

    function syncBoardTextAreaVerticalCenter() {
      [subjectText, addressText].forEach((element) => {
        if (!element) return;
        element.style.paddingTop = "0px";
        element.style.paddingBottom = "0px";

        const visibleHeight = element.clientHeight;
        const contentHeight = element.scrollHeight;
        const padding = Math.max(0, Math.floor((visibleHeight - contentHeight) / 2));

        element.style.paddingTop = `${padding}px`;
        element.style.paddingBottom = "0px";
      });
    }

    function loadPhotoQuality() {
      try {
        const saved = localStorage.getItem(PHOTO_QUALITY_STORAGE_KEY);
        if (saved && PHOTO_QUALITY_SETTINGS[saved]) return saved;
      } catch (error) {}

      return "standard";
    }

    function setPhotoQuality(value) {
      if (!PHOTO_QUALITY_SETTINGS[value]) return;

      photoQuality = value;

      try {
        localStorage.setItem(PHOTO_QUALITY_STORAGE_KEY, value);
      } catch (error) {}

      renderPhotoQualitySettings();
      const setting = PHOTO_QUALITY_SETTINGS[photoQuality];
      showToast(`${setting.label}（${setting.width}×${setting.height}）にしました`);
    }

    function renderPhotoQualitySettings() {
      if (!qualityStandardButton || !qualityHighButton) return;

      qualityStandardButton.classList.toggle("active", photoQuality === "standard");
      qualityHighButton.classList.toggle("active", photoQuality === "high");
    }

    function adjustBoardFieldTextSize(field, delta) {
      if (!boardFieldTextSize[field]) return;
      boardFieldTextSize[field] = clamp(boardFieldTextSize[field] + delta, 12, 32);
      applyBoardFieldTextSizes();
      syncBoardTextAreaVerticalCenter();
      showToast("文字サイズを変更しました");
    }

    function applyBoardFieldTextSizes() {
      if (subjectText) subjectText.style.fontSize = `${boardFieldTextSize.subject}px`;
      if (addressText) addressText.style.fontSize = `${boardFieldTextSize.address}px`;
      if (roomNoInput) roomNoInput.style.fontSize = `${boardFieldTextSize.room}px`;
      syncBoardTextAreaVerticalCenter();
    }

    function loadBoardTextSize() {
      try {
        const saved = localStorage.getItem(BOARD_TEXT_SIZE_STORAGE_KEY);
        if (saved && BOARD_TEXT_SIZE_MULTIPLIERS[saved]) return saved;
      } catch (error) {}

      return "normal";
    }

    function setBoardTextSize(value) {
      if (!BOARD_TEXT_SIZE_MULTIPLIERS[value]) return;

      boardTextSize = value;

      try {
        localStorage.setItem(BOARD_TEXT_SIZE_STORAGE_KEY, value);
      } catch (error) {}

      renderBoardTextSize();
      showToast(value === "small" ? "文字サイズ：小" : value === "large" ? "文字サイズ：大" : "文字サイズ：標準");
    }

    function renderBoardTextSize() {
      if (!boardWrap) return;

      boardWrap.classList.toggle("text-small", boardTextSize === "small");
      boardWrap.classList.toggle("text-large", boardTextSize === "large");

      if (textSizeSmallButton) textSizeSmallButton.classList.toggle("active", boardTextSize === "small");
      if (textSizeNormalButton) textSizeNormalButton.classList.toggle("active", boardTextSize === "normal");
      if (textSizeLargeButton) textSizeLargeButton.classList.toggle("active", boardTextSize === "large");
    }

    function openSettings() {
      renderPhotoQualitySettings();
      settingsOverlay.classList.add("show");
    }

    function closeSettings() {
      settingsOverlay.classList.remove("show");
    }

    function renderAppVersion() {
      if (appVersionBadge) appVersionBadge.textContent = APP_VERSION.replace(/^v/, "v");
      if (settingsVersionText) settingsVersionText.textContent = APP_VERSION;
    }

    async function getLatestAppVersion() {
      const url = new URL(window.location.href);
      url.searchParams.set("_update_check", Date.now());

      const response = await fetch(url.toString(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });

      const html = await response.text();
      const match = html.match(/const APP_VERSION = "([^"]+)"/);
      return match ? match[1] : null;
    }

    async function clearAppCachesAndServiceWorker() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch (error) {
        console.log("Service Worker解除に失敗しました", error);
      }

      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.log("キャッシュ削除に失敗しました", error);
      }
    }

    async function reloadAppWithVersion(versionLabel) {
      await clearAppCachesAndServiceWorker();
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set("v", versionLabel || Date.now());
      reloadUrl.searchParams.set("_reload", Date.now());
      window.location.replace(reloadUrl.toString());
    }

    async function checkAppUpdate() {
      try {
        const latestVersion = await getLatestAppVersion();
        if (!latestVersion) return;

        if (latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。

現在：${APP_VERSION}
最新：${latestVersion}

更新しますか？`
          );

          if (ok) await reloadAppWithVersion(latestVersion);
        }
      } catch (error) {
        console.log("更新確認に失敗しました", error);
      }
    }

    async function forceAppUpdate() {
      try {
        showToast("最新版を確認中...");
        const latestVersion = await getLatestAppVersion();
        if (latestVersion && latestVersion !== APP_VERSION) {
          const ok = window.confirm(
            `新しいバージョンがあります。

現在：${APP_VERSION}
最新：${latestVersion}

更新しますか？`
          );
          if (!ok) return;
          await reloadAppWithVersion(latestVersion);
          return;
        }

        const ok = window.confirm(
          `現在のバージョン：${APP_VERSION}

キャッシュを削除して、このバージョンを読み込み直しますか？`
        );
        if (ok) await reloadAppWithVersion(latestVersion || APP_VERSION);
      } catch (error) {
        console.log("手動更新に失敗しました", error);
        showErrorToast("更新に失敗しました");
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
  </script>
  <script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => console.log("Service Worker 登録完了"))
      .catch(err => console.error("Service Worker登録失敗", err));
  });
}
