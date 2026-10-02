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
    const importModeOverlay = document.getElementById("importModeOverlay");
    let pendingImportTarget = null;
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
      pendingImportTarget = null;
      importModeOverlay?.classList.add("show");
    }

    function closeImportModePicker() {
      importModeOverlay?.classList.remove("show");
      pendingImportTarget = null;
    }

    function openImportPhotoPicker() {
      if (!pendingImportTarget || !importPhotoInput) return;
      importModeOverlay?.classList.remove("show");
      importPhotoInput.value = "";
      importPhotoInput.click();
    }

    function chooseExistingBoardImport() {
      importModeOverlay?.classList.remove("show");
      if (typeof openCasePickerForImport !== "function") {
        showErrorToast("案件選択を開けませんでした");
        return;
      }
      openCasePickerForImport({
        onSelect: (target) => {
          pendingImportTarget = {
            mode: "existing",
            targetCaseId: String(target?.caseId || ""),
            targetCaseSubject: String(target?.caseSubject || ""),
            targetAddress: String(target?.address || "")
          };
          openImportPhotoPicker();
        },
        onCancel: () => {
          pendingImportTarget = null;
          importModeOverlay?.classList.add("show");
        }
      });
    }

    function chooseFreeBoardImport() {
      const session = window.CaseSession?.createTemporaryImportSession?.();
      if (!session?.id) {
        showErrorToast("フリー看板の保存先を作成できませんでした");
        return;
      }
      pendingImportTarget = {
        mode: "free",
        targetCaseId: String(session.id),
        targetCaseSubject: APP_DATA.subject,
        targetAddress: APP_DATA.address
      };
      openImportPhotoPicker();
    }

    function getImportTargetCaseId() {
      return String(activeImportSession?.targetCaseId || pendingImportTarget?.targetCaseId || "");
    }

    function applyImportBoardData(data = {}) {
      subjectText.value = String(data.subject ?? "");
      addressText.value = String(data.address ?? "");
      roomNoInput.value = String(data.roomNo ?? "");
      sampleNoInput.value = String(data.sampleNo || POINT_DISPLAY_DEFAULT);
      boardMode = data.boardMode === "survey" ? "survey" : "sampling";
      selectedStatus = data.status || (boardMode === "sampling" ? "before" : "visual");
      isDateManuallyEdited = Boolean(data.isDateManuallyEdited);
      if (data.date && isDateManuallyEdited) dateText.textContent = String(data.date);
      else {
        isDateManuallyEdited = false;
        updateCurrentDate();
      }
      setSectionMode(false);
      applyBoardMode();
      setStatus(selectedStatus);
      syncBoardTextareas();
      placeBoardByFixedPosition();
      scheduleBoardPreviewRender();
    }

    function applyInitialImportBoard(session) {
      applyImportBoardData({
        subject: session.mode === "existing" ? session.targetCaseSubject : APP_DATA.subject,
        address: session.mode === "existing" ? session.targetAddress : APP_DATA.address,
        roomNo: "",
        sampleNo: POINT_DISPLAY_DEFAULT,
        boardMode: "sampling",
        status: "before",
        date: "",
        isDateManuallyEdited: false
      });
    }

    async function cancelImportEditing() {
      if (!activeImportSession) return;
      const ok = await AppDialog.confirm({
        title: "看板添付を中止",
        message: "編集中の看板添付を中止して、途中データを破棄しますか？",
        okLabel: "中止する",
        cancelLabel: "編集を続ける"
      });
      if (!ok) return;

      boardEditOverlay?.classList.remove("show", "import-board-edit", "photo-board-correction");
      if (boardEditPhotoBackdrop) boardEditPhotoBackdrop.removeAttribute("src");
      document.body.classList.remove("board-editing");
      isBoardEditMode = false;
      boardEditDraft = null;
      await discardImportSession();
      launchModeOverlay?.classList.remove("hidden");
    }


    /**

     * 既存写真選択inputを監視し    /**

     * 既存写真選択inputを監視し、複数写真の取込セッション開始につなげる。

     */

    function setupImportPhotoInput() {
      if (!importPhotoInput || importPhotoInput.dataset.bound === "1") return;
      importPhotoInput.dataset.bound = "1";
      importPhotoInput.addEventListener("cancel", () => {
        pendingImportTarget = null;
        launchModeOverlay?.classList.remove("hidden");
      });
      importPhotoInput.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files || []).filter(file => file && String(file.type || "").startsWith("image/"));
        if (!files.length) {
          pendingImportTarget = null;
          launchModeOverlay?.classList.remove("hidden");
          return;
        }
        try {
          await startImportSession(files);
        } catch (error) {
          console.error("写真読み込み開始に失敗しました", error);
          showErrorToast("写真の読み込みに失敗しました");
        }
      });
    }

    async function startImportSession(files) {
      if (!pendingImportTarget?.targetCaseId) {
        throw new Error("看板添付の保存先案件が決まっていません");
      }

      const now = new Date().toISOString();
      activeImportSession = {
        mode: pendingImportTarget.mode === "existing" ? "existing" : "free",
        targetCaseId: String(pendingImportTarget.targetCaseId || ""),
        targetCaseSubject: String(pendingImportTarget.targetCaseSubject || ""),
        targetAddress: String(pendingImportTarget.targetAddress || ""),
        currentIndex: 0,
        createdAt: now,
        updatedAt: now,
        lastBoardData: null,
        items: files.map((file, index) => ({
          id: `import_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`,
          blob: file,
          originalName: file.name || `image_${index + 1}`,
          type: file.type || "image/jpeg"
        }))
      };

      pendingImportTarget = null;
      applyInitialImportBoard(activeImportSession);
      await PhotoStore.saveImportSession(activeImportSession);
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      await openCurrentImportedPhoto();
    }

    /**

     * 保存済み取込セッションを復元し    /**

     * 保存済み取込セッションを復元し、中断した写真位置から編集を再開する。

     */

    async function resumeImportSession() {    async function resumeImportSession() {
      const session = await PhotoStore.loadImportSession();
      if (!session || !session.items || session.currentIndex >= session.items.length) {
        await discardImportSession();
        return;
      }
      activeImportSession = session;
      if (session.lastBoardData) applyImportBoardData(session.lastBoardData);
      else if (session.currentIndex === 0) applyInitialImportBoard(session);
      if (launchModeOverlay) launchModeOverlay.classList.add("hidden");
      await openCurrentImportedPhoto();
    }

    async function discardImportSession() {
      await PhotoStore.deleteImportSession();
      activeImportSession = null;
      activeImportBaseDataUrl = "";
      isImportBoardEdit = false;
      pendingImportTarget = null;
      boardEditOverlay?.classList.remove("show", "import-board-edit", "photo-board-correction");
      document.body.classList.remove("board-editing");
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

      if (session.lastBoardData) applyImportBoardData(session.lastBoardData);
      else if (session.currentIndex === 0) applyInitialImportBoard(session);

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
        const targetSession = window.CaseSession?.getSessionById?.(session.targetCaseId);
        if (!targetSession?.id) throw new Error("添付先案件情報を復元できませんでした");

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
          caseSession: targetSession,
          dataUrl,
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

        session.lastBoardData = {
          ...getCurrentBoardData(),
          isDateManuallyEdited
        };
        session.currentIndex += 1;
        session.updatedAt = new Date().toISOString();
        activeImportBaseDataUrl = "";

        if (session.currentIndex >= session.items.length) {
          await completeImportSession();
          return;
        }

        await PhotoStore.saveImportSession(session);
        window.setTimeout(() => openCurrentImportedPhoto(), 40);
      } catch (error) {
        console.error("読み込み写真の保存に失敗しました", error);
        showErrorToast("看板付き写真の保存に失敗しました");
        await PhotoStore.saveImportSession(session);
      }
    }

    async function completeImportSession() {
      const targetCaseId = String(activeImportSession?.targetCaseId || "");
      await PhotoStore.deleteImportSession();
      activeImportSession = null;
      activeImportBaseDataUrl = "";
      isImportBoardEdit = false;
      boardEditOverlay.classList.remove("show", "import-board-edit", "photo-board-correction");
      if (boardEditPhotoBackdrop) boardEditPhotoBackdrop.removeAttribute("src");
      if (importProgressBadge) importProgressBadge.classList.remove("show");
      if (boardEditDoneButton) boardEditDoneButton.textContent = "完了";
      document.body.classList.remove("board-editing");
      showToast("選択した写真の看板追加が完了しました");

      if (targetCaseId && window.PhotoOneDriveSync?.syncCaseNow) {
        void PhotoOneDriveSync.syncCaseNow(targetCaseId);
      }
      if (targetCaseId && typeof showCaseInPreview === "function") {
        showCaseInPreview(targetCaseId);
      } else {
        previewOverlay.classList.add("show");
        renderPreview();
      }
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


    window.chooseExistingBoardImport = chooseExistingBoardImport;
    window.chooseFreeBoardImport = chooseFreeBoardImport;
    window.closeImportModePicker = closeImportModePicker;
    window.cancelImportEditing = cancelImportEditing;
    window.getImportTargetCaseId = getImportTargetCaseId;
