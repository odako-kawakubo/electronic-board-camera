/*
 * ============================================================
 * photo-viewer.js - 1枚表示 / 拡大 / 看板修正 / 出力
 * ============================================================
 * 責務: 現在写真の表示、前後移動、拡大、看板修正、共有・外部保存を担当する。
 * 案件別一覧・並び替え・選択・削除はphoto-album.jsを正本とする。
 * ============================================================
 */

    // viewer専用DOM・状態。アルバム状態はphoto-album.jsが所有する。
    const previewImage = document.getElementById("previewImage");
    const photoZoomOverlay = document.getElementById("photoZoomOverlay");
    const photoZoomImage = document.getElementById("photoZoomImage");
    const previewCounter = document.getElementById("previewCounter");
    const previewMeta = document.getElementById("previewMeta");
    const boardCorrectionButton = document.getElementById("boardCorrectionButton");
    let isBoardCorrectionSelectMode = false;
    let previewTouchStartX = 0;
    let previewTouchStartY = 0;

    function getCurrentSubjectName() {
      const value = subjectText && ("value" in subjectText ? subjectText.value : subjectText.textContent);
      return String(value || "").trim() || "無題案件";
    }

    /* 写真ビューア */
    /**
     * 保存写真の閲覧画面を開き、現在の案件と写真位置に合わせて表示を構築する。
     */
    async function openPreview() {
      // v61: セッション内に写真があれば再読込を省略し、表示ボタンの待ち時間を短縮する。
      if (!capturedPhotos.length) await loadPhotosFromIndexedDB();

      selectedCaseSubject = getLatestCaseSubject();
      const photos = getPreviewPhotos();
      previewIndex = Math.max(0, photos.length - 1);
      setPreviewListMode(false);
      renderPreview();
      previewOverlay.classList.add("show");
    }

    async function closePreview() {
      isBoardCorrectionSelectMode = false;
      previewOverlay.classList.remove("board-correction-selecting");
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

    /**

     * 現在写真・メタ情報・一覧・選択状態をまとめて更新する。

     */

    function renderPreview() {
      const photos = getPreviewPhotos();
      previewOverlay.classList.toggle("board-correction-selecting", isBoardCorrectionSelectMode);
      if (boardCorrectionButton) {
        boardCorrectionButton.textContent = isBoardCorrectionSelectMode ? "中止" : "看板修正";
      }

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
      previewImage.onclick = () => {
        if (isBoardCorrectionSelectMode) {
          selectPhotoForBoardCorrection(previewIndex);
        }
      };
      previewCounter.textContent = `${previewIndex + 1} / ${photos.length}`;
      previewMeta.textContent = isBoardCorrectionSelectMode
        ? "看板修正する写真を選択してください"
        : `${photo.fileName}　${photo.statusLabel || getStatusLabel(photo.status)}${photo.savedLocal ? "　✓保存済" : ""}${photo.selected ? "　✓選択中" : ""}`;
      updatePreviewHeader();
      renderThumbnails();
      renderPhotoList();
      updateSelectAllButton();
    }

    function startBoardCorrectionSelectMode() {
      const photos = getPreviewPhotos();
      if (!photos.length) {
        showToast("修正する写真がありません");
        return;
      }

      isBoardCorrectionSelectMode = !isBoardCorrectionSelectMode;
      if (isBoardCorrectionSelectMode) {
        setPreviewListMode(false);
        showToast("看板修正する写真を選択してください");
      } else {
        showToast("看板修正を中止しました");
      }
      renderPreview();
    }

    async function selectPhotoForBoardCorrection(index) {
      const photos = getPreviewPhotos();
      const photo = photos[index];
      if (!photo) return;

      if (!photo.baseDataUrl) {
        window.alert("この写真は看板修正用データがありません。\n\nv49b以降で撮影した写真から、撮影後に看板を修正できます。");
        return;
      }

      previewIndex = index;
      isBoardCorrectionSelectMode = false;
      previewOverlay.classList.remove("board-correction-selecting");
      previewOverlay.classList.remove("show");
      setPreviewListMode(false);
      await openPhotoBoardCorrectionMode(photo.id);
    }

    async function openPhotoBoardCorrectionMode(photoId) {
      const photo = capturedPhotos.find((item) => item.id === photoId);
      if (!photo) {
        showToast("修正対象の写真が見つかりません");
        return;
      }

      boardEditTargetPhotoId = photo.id;

      // 選択した写真の撮影時情報を、修正開始時の看板に戻す
      if (photo.subjectName) subjectText.value = photo.subjectName;
      if (photo.roomNo) roomNoInput.value = photo.roomNo;
      if (photo.sampleNo) sampleNoInput.value = formatSamplePointLabel(`${photo.sampleNo}-${photo.pointNo || 1}`);
      if (photo.status) setStatus(photo.status);
      syncBoardTextareas();

      if (boardEditPhotoBackdrop) {
        boardEditPhotoBackdrop.src = photo.baseDataUrl || photo.dataUrl;
        boardEditPhotoBackdrop.onload = () => scheduleBoardEditCanvasRender();
      }
      if (boardEditDoneButton) {
        boardEditDoneButton.textContent = "修正\n完了";
      }
      boardEditOverlay.classList.add("photo-board-correction");
      openBoardEditMode({ focusFirstField: false });
      showToast("看板を直して、完了を押してください");
    }

    async function finishPhotoBoardCorrection() {
      const photo = capturedPhotos.find((item) => item.id === boardEditTargetPhotoId);
      if (!photo) {
        boardEditTargetPhotoId = null;
        return;
      }

      if (!photo.baseDataUrl) {
        boardEditTargetPhotoId = null;
        window.alert("この写真は看板修正用データがありません。");
        return;
      }

      try {
        saveBoardForm();
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }

        let canvas;
        let newDataUrl;
        try {
          canvas = await composeBoardOnBaseImage(photo.baseDataUrl, { useImageRelativeBoardLayout: true, sourceData: getCurrentBoardData() });
          newDataUrl = canvas.toDataURL("image/jpeg", 0.82);
        } catch (error) {
          console.warn("HTML看板での再合成に失敗したため、旧Canvas描画で再合成します", error);
          canvas = await composeBoardOnBaseImage(photo.baseDataUrl, { useImageRelativeBoardLayout: true, sourceData: getCurrentBoardData(), forceLegacyBoard: true });
          newDataUrl = canvas.toDataURL("image/jpeg", 0.82);
        }

        photo.dataUrl = newDataUrl;
        photo.subjectName = getCurrentSubjectName();
        photo.roomNo = roomNoInput.value.trim();
        const correctedType = getCurrentPhotoType();
        const correctedParts = parseSampleAndPoint(sampleNoInput.value);
        photo.status = correctedType.value;
        photo.statusLabel = correctedType.label;
        photo.statusCode = correctedType.code;
        photo.sampleNo = correctedParts.sampleNo;
        photo.pointNo = correctedParts.pointNo;
        photo.isSection = correctedType.value === SECTION_PHOTO_TYPE.value;
        // v61: 編集後の新しい基本名に対して、対象写真自身を除外して再採番する。
        photo.fileName = generatePhotoFileName(photo.sampleNo, photo.pointNo, photo.statusCode, photo.id);
        photo.updatedAt = new Date().toISOString();

        const correctedPhotoSaved = await PhotoStore.savePhoto(photo);
        if (!correctedPhotoSaved) {
          throw new Error("看板修正後の写真を端末内へ保存できませんでした");
        }
        previewIndex = Math.max(0, getPreviewPhotos().findIndex((item) => item.id === photo.id));
        updatePhotoCount();
        showToast("看板を修正しました");
      } catch (error) {
        console.error(error);
        showErrorToast("看板修正に失敗しました");
      } finally {
        boardEditTargetPhotoId = null;
      }
    }

    async function applyCurrentBoardToPreviewPhoto() {
      startBoardCorrectionSelectMode();
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

    /**

     * 選択写真をIndexedDBとcapturedPhotosの両方から削除し、片方だけ残さない。

     */

    /**

     * Web Share対応端末では共有し、非対応時はダウンロードへフォールバックする。

     */

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
            await markPhotosAsSaved(photos);
            showToast("保存しました");
            renderPreview();
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
      await markPhotosAsSaved(photos);
      showToast("保存しました");
      renderPreview();
    }

    async function markPhotosAsSaved(photos) {
      const savedAt = new Date().toISOString();
      for (const photo of photos) {
        photo.savedLocal = true;
        photo.savedAt = savedAt;
        try {
          await PhotoStore.savePhoto(photo);
        } catch (error) {
          console.warn("保存済マークの更新に失敗しました", error);
        }
      }
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
        if (event.target && event.target.closest && event.target.closest("#previewThumbnails")) {
          previewTouchStartX = NaN;
          previewTouchStartY = NaN;
          return;
        }

        previewTouchStartX = event.touches[0].clientX;
        previewTouchStartY = event.touches[0].clientY;
      }, { passive: true });

      previewOverlay.addEventListener("touchend", (event) => {
        if (!event.changedTouches || event.changedTouches.length !== 1) return;
        if (isPreviewListMode || !Number.isFinite(previewTouchStartX)) return;

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
      let lastTapAt = 0;
      let singleTapTimer = null;
      let suppressClickUntil = 0;

      const openZoom = (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (isBoardCorrectionSelectMode || !previewImage.src) return;
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
        suppressClickUntil = Date.now() + 500;
        photoZoomImage.src = previewImage.src;
        photoZoomOverlay.classList.add("show");
      };

      previewImage.addEventListener("dblclick", openZoom);

      previewImage.addEventListener("pointerup", (event) => {
        if (event.pointerType === "mouse") return;
        const now = Date.now();
        if (now - lastTapAt <= 360) {
          lastTapAt = 0;
          openZoom(event);
          return;
        }
        lastTapAt = now;
      }, true);

      previewImage.addEventListener("click", async (event) => {
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (isBoardCorrectionSelectMode) return;
        event.preventDefault();
        event.stopPropagation();
        if (singleTapTimer) clearTimeout(singleTapTimer);
        singleTapTimer = setTimeout(async () => {
          singleTapTimer = null;
          await toggleCurrentPhotoSelected();
        }, 370);
      });

      const closeZoom = (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        photoZoomOverlay.classList.remove("show");
        window.setTimeout(() => {
          if (!photoZoomOverlay.classList.contains("show")) photoZoomImage.removeAttribute("src");
        }, 120);
      };

      photoZoomOverlay.addEventListener("click", closeZoom);
      photoZoomImage.addEventListener("click", closeZoom);
    }

