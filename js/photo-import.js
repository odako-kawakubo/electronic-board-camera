/*
 * v65.6 Photo Import
 * 既存写真の複数選択、編集セッション、再開/破棄、1枚ずつの看板付与を担当。
 */

    /* =========================================================
     * v62: 既存写真へ看板を付ける機能
     * - 初期画面でカメラ / 写真読み込みを選択
     * - 複数写真を選択し、1枚ずつ既存の看板編集UIで編集
     * - 前の写真の看板内容を次の写真へ引き継ぐ
     * - 元画像は編集中のみIndexedDBへ一時保存し、全件完了後に破棄
     * ========================================================= */

    function chooseCameraMode() {
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      startCamera();
    }

    function chooseImportMode() {
      if (!importPhotoInput) return;
      if (launchResumePanel && launchResumePanel.classList.contains("show")) {
        window.alert("編集中の写真があります。\n\n先に「編集を続ける」または「破棄する」を選択してください。");
        return;
      }
      importPhotoInput.value = "";
      importPhotoInput.click();
    }

    function setupImportPhotoInput() {
      if (!importPhotoInput || importPhotoInput.dataset.bound === "1") return;
      importPhotoInput.dataset.bound = "1";
      importPhotoInput.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files || []).filter(file => file && String(file.type || "").startsWith("image/"));
        if (!files.length) return;
        try {
          await startImportSession(files);
        } catch (error) {
          console.error("写真読み込み開始に失敗しました", error);
          showErrorToast("写真の読み込みに失敗しました");
        }
      });
    }

    async function startImportSession(files) {
      const now = new Date().toISOString();
      activeImportSession = {
        id: ACTIVE_IMPORT_SESSION_ID,
        currentIndex: 0,
        createdAt: now,
        updatedAt: now,
        items: files.map((file, index) => ({
          id: `import_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`,
          blob: file,
          originalName: file.name || `image_${index + 1}`,
          type: file.type || "image/jpeg"
        }))
      };
      await saveImportSession(activeImportSession);
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      await openCurrentImportedPhoto();
    }

    async function resumeImportSession() {
      const session = await loadImportSession();
      if (!session || !session.items || session.currentIndex >= session.items.length) {
        await discardImportSession();
        return;
      }
      activeImportSession = session;
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      await openCurrentImportedPhoto();
    }

    async function discardImportSession() {
      await deleteImportSession();
      activeImportSession = null;
      activeImportBaseDataUrl = "";
      isImportBoardEdit = false;
      if (launchResumePanel) launchResumePanel.classList.remove("show");
      if (importProgressBadge) importProgressBadge.classList.remove("show");
      showToast("編集中データを破棄しました");
    }

    async function refreshImportResumePanel() {
      const session = await loadImportSession();
      const valid = Boolean(session && Array.isArray(session.items) && session.items.length && session.currentIndex < session.items.length);
      if (!launchResumePanel || !launchResumeMeta) return;
      launchResumePanel.classList.toggle("show", valid);
      if (valid) {
        const done = Math.max(0, Number(session.currentIndex) || 0);
        launchResumeMeta.textContent = `${done} / ${session.items.length} 枚まで完了。次の写真から再開できます。`;
      } else {
        launchResumeMeta.textContent = "";
      }
    }

    async function openCurrentImportedPhoto() {
      if (!activeImportSession) activeImportSession = await loadImportSession();
      const session = activeImportSession;
      if (!session || !session.items || session.currentIndex >= session.items.length) {
        await completeImportSession();
        return;
      }

      const item = session.items[session.currentIndex];
      activeImportBaseDataUrl = await normalizeImportedImageToDataUrl(item.blob);
      isImportBoardEdit = true;
      boardEditTargetPhotoId = null;

      // 初回だけ「今日」を初期値にする。2枚目以降は前の編集内容をそのまま引き継ぐ。
      if (session.currentIndex === 0 && !isDateManuallyEdited) {
        updateCurrentDate();
      }

      if (boardEditPhotoBackdrop) {
        boardEditPhotoBackdrop.src = activeImportBaseDataUrl;
        boardEditPhotoBackdrop.onload = () => scheduleBoardEditCanvasRender();
      }
      if (boardEditDoneButton) boardEditDoneButton.textContent = session.currentIndex + 1 < session.items.length ? "保存\n次へ" : "保存\n完了";
      if (importProgressBadge) {
        importProgressBadge.textContent = `${session.currentIndex + 1} / ${session.items.length}`;
        importProgressBadge.classList.add("show");
      }
      updateImportBoardPositionLabel();
      boardEditOverlay.classList.add("photo-board-correction", "import-board-edit");
      openBoardEditMode({ focusFirstField: false });
      showToast(`${session.currentIndex + 1} / ${session.items.length} 枚目を編集中`);
    }

    async function finishImportedPhotoBoardEdit() {
      const session = activeImportSession;
      if (!session || !activeImportBaseDataUrl) {
        isImportBoardEdit = false;
        return;
      }

      try {
        saveBoardForm();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        let canvas;
        let dataUrl;
        try {
          canvas = await composeBoardOnBaseImage(activeImportBaseDataUrl, { useImageRelativeBoardLayout: true, sourceData: getCurrentBoardData() });
          dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        } catch (error) {
          console.warn("読み込み写真への看板合成を旧Canvas描画で再試行します", error);
          canvas = await composeBoardOnBaseImage(activeImportBaseDataUrl, { useImageRelativeBoardLayout: true, sourceData: getCurrentBoardData(), forceLegacyBoard: true });
          dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        }

        const photoType = getCurrentPhotoType();
        const sampleParts = parseSampleAndPoint(sampleNoInput.value);
        const createdAt = new Date();
        const photo = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          dataUrl,
          // 読み込み元はカメラロールに残るため、完成後の元画像は保持しない。
          baseDataUrl: "",
          fileName: generatePhotoFileName(sampleParts.sampleNo, sampleParts.pointNo, photoType.code),
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo: sampleParts.sampleNo,
          pointNo: sampleParts.pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          selected: false,
          createdAt: createdAt.toISOString(),
          savedLocal: false,
          savedAt: "",
          source: "import"
        };

        const importedPhotoSaved = await savePhotoToIndexedDB(photo);
        if (!importedPhotoSaved) {
          throw new Error("読み込み写真を端末内へ保存できませんでした");
        }
        capturedPhotos.push(photo);
        previewIndex = capturedPhotos.length - 1;
        updatePhotoCount();

        session.currentIndex += 1;
        session.updatedAt = new Date().toISOString();
        activeImportBaseDataUrl = "";

        if (session.currentIndex >= session.items.length) {
          await completeImportSession();
          return;
        }

        await saveImportSession(session);
        // closeBoardEditMode が一度編集モードを閉じているため、次の1枚を即座に開ける。
        window.setTimeout(() => openCurrentImportedPhoto(), 40);
      } catch (error) {
        console.error("読み込み写真の保存に失敗しました", error);
        showErrorToast("看板付き写真の保存に失敗しました");
        // セッションは消さない。再起動後も同じ写真から再開できる。
        await saveImportSession(session);
      }
    }

    async function completeImportSession() {
      await deleteImportSession();
      activeImportSession = null;
      activeImportBaseDataUrl = "";
      isImportBoardEdit = false;
      boardEditOverlay.classList.remove("import-board-edit", "photo-board-correction");
      if (boardEditPhotoBackdrop) boardEditPhotoBackdrop.removeAttribute("src");
      if (importProgressBadge) importProgressBadge.classList.remove("show");
      if (boardEditDoneButton) boardEditDoneButton.textContent = "完了";
      showToast("選択した写真の看板追加が完了しました");
      previewOverlay.classList.add("show");
      renderPreview();
    }

    async function normalizeImportedImageToDataUrl(blob) {
      if (!blob) throw new Error("画像データがありません");
      let bitmap = null;
      try {
        if (typeof createImageBitmap === "function") {
          try {
            bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
          } catch (_) {
            bitmap = await createImageBitmap(blob);
          }
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          if (bitmap.close) bitmap.close();
          return canvas.toDataURL("image/jpeg", 0.92);
        }
      } catch (error) {
        console.warn("createImageBitmapでの画像正規化に失敗しました", error);
        if (bitmap && bitmap.close) bitmap.close();
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImage(objectUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.92);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    function cycleImportBoardPosition() {
      cycleBoardPosition();
      updateImportBoardPositionLabel();
      scheduleBoardEditCanvasRender();
    }

    function increaseImportBoardSize() {
      increaseBoardSize();
      updateImportBoardPositionLabel();
      scheduleBoardEditCanvasRender();
    }

    function decreaseImportBoardSize() {
      decreaseBoardSize();
      updateImportBoardPositionLabel();
      scheduleBoardEditCanvasRender();
    }

    function updateImportBoardPositionLabel() {
      if (!importBoardPositionLabel) return;
      const label = BOARD_POSITION_LABELS[boardState.position] || "左下";
      importBoardPositionLabel.textContent = `${label} ${Math.round(boardState.sizeRatio * 100)}%`;
    }

