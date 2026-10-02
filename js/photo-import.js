/*
 * ============================================================
 * photo-import.js - 既存写真への看板付与
 * ============================================================
 * 責務: 複数写真を読み込み1枚ずつ看板編集して保存する。途中状態をimportSessionsへ保存し再開できる。
 *
 * 保守上の注意:
 * - 前写真の看板値を次へ引き継ぐ。
 * - 元写真は取込セッション中に保持し、完成写真保存後はphotoRecordのbaseDataUrlとしてOneDrive実在確認まで保持する。
 * - OneDriveで元画像/完成画像の両方を確認後、写真同期側が端末内元画像だけ解放する。
 * ============================================================
 */

    // このモジュール専用の定数・DOM参照・実行状態。
    const launchModeOverlay = document.getElementById("launchModeOverlay");
    const launchResumePanel = document.getElementById("launchResumePanel");
    const launchResumeMeta = document.getElementById("launchResumeMeta");
    const importPhotoInput = document.getElementById("importPhotoInput");
    const importProgressBadge = document.getElementById("importProgressBadge");
    const importBoardPositionLabel = document.getElementById("importBoardPositionLabel");
    const importLoadingOverlay = document.getElementById("importLoadingOverlay");
    const importLoadingMessage = document.getElementById("importLoadingMessage");
    let activeImportSession = null;
    let activeImportBaseDataUrl = "";
    let isImportBoardEdit = false;


    /* =========================================================
     * v62: 既存写真へ看板を付ける機能
     * - 初期画面でカメラ / 写真読み込みを選択
     * - 複数写真を選択し、1枚ずつ既存の看板編集UIで編集
     * - 前の写真の看板内容を次の写真へ引き継ぐ
     * - 元画像は編集中のみIndexedDBへ一時保存し、全件完了後に破棄
     * ========================================================= */

    function chooseCameraMode() {
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");

      // チュートリアル中は、撮影画面を先に見せてから
      // カメラ権限の説明を行う。通常利用時だけ従来どおり即起動する。
      if (window.Tutorial?.onCameraModeEntered?.()) return;

      startCamera();
    }

    async function chooseImportMode() {
      if (!importPhotoInput) return;
      if (launchResumePanel && launchResumePanel.classList.contains("show")) {
        await AppDialog.notice({
          title: "編集中の写真があります",
          message: "先に「編集を続ける」または「破棄する」を選択してください。"
        });
        return;
      }
      importPhotoInput.value = "";
      importPhotoInput.click();
    }

    /**

     * 既存写真選択inputを監視し、複数写真の取込セッション開始につなげる。

     */

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

    function showImportLoading(message = "写真を読み込み中…") {
      if (importLoadingMessage) importLoadingMessage.textContent = message;
      if (importLoadingOverlay) importLoadingOverlay.classList.add("show");
    }

    function hideImportLoading() {
      if (importLoadingOverlay) importLoadingOverlay.classList.remove("show");
    }

    async function startImportSession(files) {
      const now = new Date().toISOString();
      const caseSession = window.CaseSession?.getCurrentSession?.() || null;
      activeImportSession = {
        id: ACTIVE_IMPORT_SESSION_ID,
        caseId: String(caseSession?.id || ""),
        caseSubject: typeof getCurrentSubjectName === "function" ? getCurrentSubjectName() : "",
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
      await PhotoStore.saveImportSession(activeImportSession);
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      showImportLoading("写真を読み込み中…");
      try {
        await openCurrentImportedPhoto();
      } catch (error) {
        hideImportLoading();
        throw error;
      }
    }

    /**

     * 保存済み取込セッションを復元し、中断した写真位置から編集を再開する。

     */

    async function ensureImportSessionCase(session) {
      if (!session) return;
      const current = window.CaseSession?.getCurrentSession?.() || null;

      // v65.42以前の途中セッションは、初回再開時の案件へ固定して以後の誤所属を防ぐ。
      if (!session.caseId) {
        session.caseId = String(current?.id || "");
        session.caseSubject = typeof getCurrentSubjectName === "function" ? getCurrentSubjectName() : "";
        session.updatedAt = new Date().toISOString();
        await PhotoStore.saveImportSession(session);
        return;
      }

      if (current?.id !== session.caseId && window.CaseSession?.activateSession) {
        CaseSession.activateSession(session.caseId, session.caseSubject || "");
      }
    }

    async function resumeImportSession() {
      const session = await PhotoStore.loadImportSession();
      if (!session || !session.items || session.currentIndex >= session.items.length) {
        await discardImportSession();
        return;
      }
      await ensureImportSessionCase(session);
      activeImportSession = session;
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      showImportLoading("写真を読み込み中…");
      try {
        await openCurrentImportedPhoto();
      } catch (error) {
        hideImportLoading();
        throw error;
      }
    }

    async function discardImportSession() {
      await PhotoStore.deleteImportSession();
      activeImportSession = null;
      activeImportBaseDataUrl = "";
      isImportBoardEdit = false;
      if (launchResumePanel) launchResumePanel.classList.remove("show");
      if (importProgressBadge) importProgressBadge.classList.remove("show");
      showToast("編集中データを破棄しました");
    }

    /**

     * IndexedDBの中断セッション有無を確認し、起動画面へ再開UIを出す。

     */

    async function refreshImportResumePanel() {
      const session = await PhotoStore.loadImportSession();
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
      if (!activeImportSession) activeImportSession = await PhotoStore.loadImportSession();
      const session = activeImportSession;
      if (!session || !session.items || session.currentIndex >= session.items.length) {
        await completeImportSession();
        return;
      }

      const item = session.items[session.currentIndex];
      showImportLoading(`写真を読み込み中…（${session.currentIndex + 1} / ${session.items.length}）`);
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
      hideImportLoading();
      showToast(`${session.currentIndex + 1} / ${session.items.length} 枚目を編集中`);
    }

    async function finishImportedPhotoBoardEdit() {
      const session = activeImportSession;
      if (!session || !activeImportBaseDataUrl) {
        isImportBoardEdit = false;
        return;
      }

      try {
        await ensureImportSessionCase(session);
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
        const photo = PhotoRecord.create({
          dataUrl,
          // OneDriveへ元画像/完成画像の両方を送るため、送信確認までは元画像も保持する。
          baseDataUrl: activeImportBaseDataUrl,
          fileName: generatePhotoFileName(sampleParts.sampleNo, sampleParts.pointNo, photoType.code),
          status: photoType.value,
          statusLabel: photoType.label,
          statusCode: photoType.code,
          sampleNo: sampleParts.sampleNo,
          pointNo: sampleParts.pointNo,
          roomNo: roomNoInput.value.trim(),
          subjectName: getCurrentSubjectName(),
          isSection: photoType.value === SECTION_PHOTO_TYPE.value,
          source: "import"
        });

        const importedPhotoSaved = await PhotoState.addNew(photo);
        if (!importedPhotoSaved || !importedPhotoSaved.ok) {
          const errorName = importedPhotoSaved && importedPhotoSaved.errorName ? importedPhotoSaved.errorName : "UnknownError";
          const detail = importedPhotoSaved && importedPhotoSaved.errorMessage ? importedPhotoSaved.errorMessage : "保存できませんでした";
          throw new Error(`読み込み写真を端末内へ保存できませんでした: ${errorName}: ${detail}`);
        }
        previewIndex = capturedPhotos.length - 1;
        updatePhotoCount();

        session.currentIndex += 1;
        session.updatedAt = new Date().toISOString();
        activeImportBaseDataUrl = "";

        if (session.currentIndex >= session.items.length) {
          await completeImportSession();
          return;
        }

        await PhotoStore.saveImportSession(session);
        // closeBoardEditMode が一度編集モードを閉じているため、次の1枚を即座に開ける。
        window.setTimeout(() => openCurrentImportedPhoto(), 40);
      } catch (error) {
        console.error("読み込み写真の保存に失敗しました", error);
        showErrorToast("看板付き写真の保存に失敗しました");
        // セッションは消さない。再起動後も同じ写真から再開できる。
        await PhotoStore.saveImportSession(session);
      }
    }

    async function completeImportSession() {
      await PhotoStore.deleteImportSession();
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

    function withImportTimeout(promise, ms, message) {
      let timer = null;
      return Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error(message)), ms);
        })
      ]).finally(() => {
        if (timer) window.clearTimeout(timer);
      });
    }

    function importedImageTargetSize(width, height) {
      const quality = PHOTO_QUALITY_SETTINGS[photoQuality] || PHOTO_QUALITY_SETTINGS.standard;
      const landscape = width >= height;
      const maxWidth = landscape ? quality.width : quality.height;
      const maxHeight = landscape ? quality.height : quality.width;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
      };
    }

    function importedSourceToDataUrl(source, width, height) {
      const target = importedImageTargetSize(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("画像変換用Canvasを作成できません");
      ctx.drawImage(source, 0, 0, target.width, target.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    }

    async function normalizeImportedImageToDataUrl(blob) {
      if (!blob) throw new Error("画像データがありません");

      let bitmap = null;
      if (typeof createImageBitmap === "function") {
        try {
          bitmap = await withImportTimeout(
            createImageBitmap(blob, { imageOrientation: "from-image" }),
            8000,
            "画像の読み込みに時間がかかっています"
          );
          const dataUrl = importedSourceToDataUrl(bitmap, bitmap.width, bitmap.height);
          if (bitmap.close) bitmap.close();
          return dataUrl;
        } catch (error) {
          console.warn("createImageBitmapでの画像読込をImage方式で再試行します", error);
          if (bitmap && bitmap.close) bitmap.close();
          bitmap = null;
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await withImportTimeout(
          loadImage(objectUrl),
          10000,
          "画像を読み込めませんでした"
        );
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) throw new Error("画像サイズを確認できません");
        return importedSourceToDataUrl(img, width, height);
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

