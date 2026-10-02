/*
 * ============================================================
 * camera.js - カメラ起動 / 撮影 / 撮影確認
 * ============================================================
 * 責務: 背面カメラ起動、撮影、静止確認、看板合成、端末内保存を担当する。看板描画はboard.js、保存実体はphoto-store.js。
 *
 * 保守上の注意:
 * - PWA復帰時のカメラ再開処理を維持する。保存失敗写真を撮影済み一覧へ追加しない。
 * ============================================================
 */

    // このモジュール専用の定数・DOM参照・実行状態。
    const video = document.getElementById("video");
    const captureFreezeImage = document.getElementById("captureFreezeImage");
    const cameraFlash = document.getElementById("cameraFlash");
    const captureReviewOverlay = document.getElementById("captureReviewOverlay");
    const captureReviewImage = document.getElementById("captureReviewImage");
    const cameraGuide = document.getElementById("cameraGuide");
    const cameraToast = document.getElementById("cameraToast");
    const cameraOrientationBlocker = document.getElementById("cameraOrientationBlocker");
    const startButton = document.getElementById("startButton");
    const viewButton = document.getElementById("viewButton");
    const sectionButton = document.getElementById("sectionButton");
    const shootButton = document.getElementById("shootButton");
    const sectionModeBadge = document.getElementById("sectionModeBadge");
    const boardInfoWarningModal = document.getElementById("boardInfoWarningModal");
    const boardInfoWarningMessage = document.getElementById("boardInfoWarningMessage");
    let isTakingPhoto = false;
    let captureReviewResolver = null;
    let boardInfoWarningResolver = null;
    let currentStream = null;
    let torchEnabled = false;
    let lastTorchTapAt = 0;
    let lastTorchTapPoint = null;
    let cameraToastTimer = null;
    let cameraLandscape = true;


    function isCameraLandscape() {
      const type = String(screen.orientation?.type || "");
      if (type) return type.startsWith("landscape");
      if (window.matchMedia) return window.matchMedia("(orientation: landscape)").matches;
      return window.innerWidth >= window.innerHeight;
    }

    function syncShootButtonAvailability() {
      if (!shootButton) return;
      shootButton.disabled = Boolean(isTakingPhoto || !cameraLandscape);
    }

    function syncCameraOrientation() {
      cameraLandscape = isCameraLandscape();
      if (cameraOrientationBlocker) cameraOrientationBlocker.hidden = cameraLandscape;
      document.body.classList.toggle("camera-portrait-blocked", !cameraLandscape);
      syncShootButtonAvailability();
    }

    function currentVideoTrack() {
      return currentStream?.getVideoTracks?.().find((track) => track.readyState === "live") || null;
    }

    function supportsTorch() {
      const track = currentVideoTrack();
      if (!track?.getCapabilities) return false;
      try {
        return track.getCapabilities()?.torch === true;
      } catch (error) {
        return false;
      }
    }

    async function setTorch(enabled) {
      const track = currentVideoTrack();
      if (!track || !supportsTorch()) return false;
      const next = Boolean(enabled);
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] });
        torchEnabled = next;
        return true;
      } catch (error) {
        console.warn("Camera torch change failed:", error);
        return false;
      }
    }

    function isTorchEnabled() {
      return Boolean(torchEnabled && supportsTorch());
    }

    function showCameraToast(text) {
      if (!cameraToast) return;
      if (cameraToastTimer) clearTimeout(cameraToastTimer);
      cameraToast.textContent = String(text || "");
      cameraToast.hidden = false;
      cameraToastTimer = window.setTimeout(() => {
        cameraToast.hidden = true;
        cameraToastTimer = null;
      }, 850);
    }

    function pointInsideRect(x, y, rect) {
      return Boolean(
        rect &&
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      );
    }

    function isTorchTapArea(event) {
      if (!captureFrame || !supportsTorch()) return false;
      const rect = captureFrame.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      const x = Number(event.clientX) - rect.left;
      const y = Number(event.clientY) - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height / 2) return false;

      if (!isSectionMode && photoBoard) {
        const boardRect = photoBoard.getBoundingClientRect();
        const relativeBoardRect = {
          x: boardRect.left - rect.left,
          y: boardRect.top - rect.top,
          width: boardRect.width,
          height: boardRect.height
        };
        if (pointInsideRect(x, y, relativeBoardRect)) return false;
      }

      return true;
    }

    async function toggleTorchFromDoubleTap() {
      if (!supportsTorch()) return;
      const next = !isTorchEnabled();
      const changed = await setTorch(next);
      if (changed) showCameraToast(next ? "ライト ON" : "ライト OFF");
    }

    function handleCameraCapturePointerUp(event) {
      if (captureReviewOverlay?.classList.contains("show")) return;

      if (!isTorchTapArea(event)) {
        lastTorchTapAt = 0;
        lastTorchTapPoint = null;
        return;
      }

      const now = performance.now();
      const point = { x: Number(event.clientX), y: Number(event.clientY) };
      const withinTime = lastTorchTapAt > 0 && now - lastTorchTapAt <= 350;
      const withinDistance = lastTorchTapPoint
        ? Math.hypot(point.x - lastTorchTapPoint.x, point.y - lastTorchTapPoint.y) <= 48
        : false;

      if (withinTime && withinDistance) {
        lastTorchTapAt = 0;
        lastTorchTapPoint = null;
        void toggleTorchFromDoubleTap();
        return;
      }

      lastTorchTapAt = now;
      lastTorchTapPoint = point;
    }


    /**

     * 背面カメラを起動し、画質設定を理想解像度として指定する。

     */

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
        torchEnabled = false;
        lastTorchTapAt = 0;
        lastTorchTapPoint = null;
        video.srcObject = stream;

        await video.play();

        showCameraButtons();
        syncCameraOrientation();
        showToast("カメラを起動しました");
      } catch (error) {
        console.error(error);
        showToast("カメラを起動できませんでした");
      }
    }

    function stopCurrentStream() {
      if (!currentStream) return;

      const track = currentVideoTrack();
      if (track && torchEnabled && supportsTorch()) {
        try { void track.applyConstraints({ advanced: [{ torch: false }] }); } catch (error) {}
      }
      torchEnabled = false;
      lastTorchTapAt = 0;
      lastTorchTapPoint = null;

      currentStream.getTracks().forEach((item) => item.stop());
      currentStream = null;
      video.srcObject = null;
      syncCameraOrientation();
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
      syncCameraOrientation();
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
    /**
     * 写真確認やPWA復帰後にカメラ映像を再開する。iOS対策として重要。
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
        torchEnabled = false;
        lastTorchTapAt = 0;
        lastTorchTapPoint = null;
        video.srcObject = stream;
        await video.play();

        showCameraButtons();
      } catch (error) {
        console.error(error);
        showStartButton();
        showToast("カメラを再起動してください");
      }
    }

    /**

     * 元画像取得→看板合成→確認→IndexedDB保存→一覧反映の順で撮影全体を制御する。

     */

    function missingBoardInfoLabels() {
      const missing = [];
      const subject = String(subjectText?.value || "").trim();
      const address = String(addressText?.value || "").trim();
      if (!subject || subject === APP_DATA.subject) missing.push("案件名");
      if (!address || address === APP_DATA.address) missing.push("住所");
      return missing;
    }

    function confirmBoardInfoBeforeCapture() {
      const missing = missingBoardInfoLabels();
      if (!missing.length) return Promise.resolve(true);

      if (!boardInfoWarningModal || !boardInfoWarningMessage) {
        console.error("看板情報確認ダイアログを初期化できませんでした");
        showErrorToast("看板情報を確認できないため撮影を中止しました");
        return Promise.resolve(false);
      }

      boardInfoWarningMessage.textContent =
        `看板情報（${missing.join("・")}）が入力されていません。\nこのまま撮影しますか？`;
      boardInfoWarningModal.classList.add("show");

      return new Promise((resolve) => {
        boardInfoWarningResolver = resolve;
      });
    }

    function closeBoardInfoWarning(continueCapture) {
      boardInfoWarningModal?.classList.remove("show");
      const resolver = boardInfoWarningResolver;
      boardInfoWarningResolver = null;
      if (resolver) resolver(Boolean(continueCapture));
    }

    function continueBoardInfoWarning() {
      closeBoardInfoWarning(true);
    }

    function cancelBoardInfoWarning() {
      closeBoardInfoWarning(false);
    }

    async function takePhoto() {
      if (isTakingPhoto) return;

      syncCameraOrientation();
      if (!cameraLandscape) {
        showToast("端末を横向きにしてください");
        return;
      }

      if (!currentStream || !video.srcObject || video.readyState < 2) {
        showToast("先にカメラを起動してください");
        return;
      }

      const continueCapture = await confirmBoardInfoBeforeCapture();
      if (!continueCapture) return;

      isTakingPhoto = true;
      syncShootButtonAvailability();
      if (window.ShutterSound?.play) {
        void ShutterSound.play(
          typeof getShutterSoundSetting === "function" ? getShutterSoundSetting() : "camera1",
          typeof getShutterVolumeSetting === "function" ? getShutterVolumeSetting() : "medium"
        );
      }
      // 撮影開始時の区分を固定し、確認画面中の状態変化が保存結果へ混入しないようにする。
      const lockedPhotoType = { ...getCurrentPhotoType() };

      try {
        if (!isDateManuallyEdited) {
          updateCurrentDate();
        }

        // Canvasに文字を焼き込む前に、フォント読み込み完了を待つ
        // iPhone/iPadで日本語フォントの描画が不安定になるのを軽減する
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }

        const baseCanvas = await captureBaseImage();
        const baseDataUrl = baseCanvas.toDataURL("image/jpeg", 0.82);

        let canvas = await captureCompositedImage();

        // 白フラッシュで撮影感を出す
        runCameraFlash();

        /*
         * iPhone/iPad向けに少し軽量化
         * 0.95だと重くなりやすいので 0.82
         *
         * v49a:
         * HTML看板をforeignObject経由でCanvas合成すると、
         * iOS/Safari系でCanvasがtainted扱いになり、toDataURL時に
         * SecurityErrorで保存できないことがある。
         * その場合は旧Canvas看板描画へ自動フォールバックして保存を優先する。
         */
        let dataUrl;
        try {
          dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        } catch (error) {
          console.warn("HTML看板合成後の画像化に失敗したため、旧Canvas看板描画で再撮影します", error);
          canvas = await captureCompositedImage({ forceLegacyBoard: true });
          dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        }

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

        const photoType = lockedPhotoType;
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
        });

        // transaction完了だけでなく、保存直後のread-backまで確認してから一覧へ反映する。
        const saveResult = await PhotoState.addNew(photo);
        if (!saveResult || !saveResult.ok) {
          const sizeMb = saveResult && Number.isFinite(saveResult.estimatedBytes)
            ? (saveResult.estimatedBytes / (1024 * 1024)).toFixed(1)
            : "?";
          const errorName = saveResult && saveResult.errorName ? saveResult.errorName : "UnknownError";
          const errorMessage = saveResult && saveResult.errorMessage ? saveResult.errorMessage : "保存できませんでした";
          const error = new Error(`${errorName}: ${errorMessage} / 約${sizeMb}MB`);
          error.storageDiagnostic = true;
          throw error;
        }

        previewIndex = capturedPhotos.length - 1;
        updatePhotoCount();

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        showToast("撮影しました");
      } catch (error) {
        console.error(error);
        if (error && error.storageDiagnostic) {
          showErrorToast(`保存失敗：${error.message}`);
        } else {
          showErrorToast("撮影データの保存に失敗しました");
        }
        hideCapturedStill();
      } finally {
        isTakingPhoto = false;
        syncCameraOrientation();
      }
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

    /**

     * video映像から看板なし元画像を生成し、後から修正できるようbaseDataUrlとして保持する。

     */

    async function captureBaseImage() {
      const quality = PHOTO_QUALITY_SETTINGS[photoQuality] || PHOTO_QUALITY_SETTINGS.standard;

      const canvas = document.createElement("canvas");
      canvas.width = quality.width;
      canvas.height = quality.height;

      const ctx = canvas.getContext("2d");
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

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

      return canvas;
    }

    function getBoardDrawRectForCanvas(canvas) {
      const frameRect = captureFrame.getBoundingClientRect();
      const boardRect = photoBoard.getBoundingClientRect();

      const scaleX = canvas.width / frameRect.width;
      const scaleY = canvas.height / frameRect.height;

      return {
        x: (boardRect.left - frameRect.left) * scaleX,
        y: (boardRect.top - frameRect.top) * scaleY,
        w: boardRect.width * scaleX,
        h: boardRect.height * scaleY
      };
    }

    async function drawCurrentBoardToCanvas(ctx, canvas, options = {}) {
      if (isSectionMode && !options.forceBoard) return;

      const rect = getBoardDrawRectForCanvas(canvas);
      drawBoardOnCanvas(ctx, rect.x, rect.y, rect.w, rect.h);
    }

    /**

     * 元画像へ現在の看板を合成して最終JPEGを作る。元画像自体は変更しない。

     */

    async function composeBoardOnBaseImage(baseDataUrl, options = {}) {
      const img = await loadImage(baseDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (options.useImageRelativeBoardLayout) {
        // 読み込み写真は編集プレビューと同じ4隅・サイズ比率で保存する。
        const rect = getFixedBoardRectForImageRect({ x: 0, y: 0, w: canvas.width, h: canvas.height });
        drawBoardOnCanvas(ctx, rect.x, rect.y, rect.w, rect.h, options.sourceData || getCurrentBoardData());
      } else {
        await drawCurrentBoardToCanvas(ctx, canvas, { forceBoard: true, forceLegacyBoard: options.forceLegacyBoard });
      }
      return canvas;
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    async function captureCompositedImage(options = {}) {
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
        await drawCurrentBoardToCanvas(ctx, canvas, options);
      }

      return canvas;
    }



    if (captureFrame && captureFrame.dataset.torchDoubleTapBound !== "1") {
      captureFrame.dataset.torchDoubleTapBound = "1";
      captureFrame.addEventListener("pointerup", handleCameraCapturePointerUp);
    }

    if (document.body.dataset.cameraOrientationBound !== "1") {
      document.body.dataset.cameraOrientationBound = "1";
      const handleCameraOrientationChange = () => syncCameraOrientation();
      window.addEventListener("orientationchange", handleCameraOrientationChange);
      window.addEventListener("resize", handleCameraOrientationChange);
      if (screen.orientation?.addEventListener) {
        screen.orientation.addEventListener("change", handleCameraOrientationChange);
      }
      syncCameraOrientation();
    }
