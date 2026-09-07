/*
 * v65.7 Camera
 * カメラ起動・復帰・断面モード・撮影・撮影確認・画像生成を担当。
 * 看板の描画ルール本体 drawBoardOnCanvas() は app.js に残す。
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
      // v61: 撮影開始時の区分を固定し、レビュー中の状態変化を受けない。
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

        const createdAt = new Date();
        const photoType = lockedPhotoType;
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const sampleNo = sampleParts.sampleNo;
        const pointNo = sampleParts.pointNo;
        const fileName = generatePhotoFileName(sampleNo, pointNo, photoType.code);
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
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          selected: false,
          createdAt: createdAt.toISOString(),
          savedLocal: false,
          savedAt: ""
        };

        // 保存成功を確認してから、撮影済み配列と表示枚数へ反映する
        const photoSaved = await PhotoStore.savePhoto(photo);
        if (!photoSaved) {
          throw new Error("撮影写真を端末内へ保存できませんでした");
        }

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

    async function composeBoardOnBaseImage(baseDataUrl, options = {}) {
      const img = await loadImage(baseDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (options.useImageRelativeBoardLayout) {
        // v63: ファイル読み込み写真は編集プレビューと完全に同じ4隅・サイズ比率で保存する。
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


