/*
 * ============================================================
 * photo-album.js - ローカル写真アルバム / 一覧管理
 * ============================================================
 * 責務:
 * - IndexedDBから復元されたcapturedPhotosを案件単位で整理して見せる
 * - 撮影順/検体順の並び替え、サムネイル、一覧表示
 * - 写真の選択/全選択、削除、撮影不足確認
 *
 * 保守上の注意:
 * - 写真本体の保存正本はPhotoStore。album側で別DBや一時保存を作らない。
 * - 削除は必ずPhotoStore.deletePhoto()を通し、capturedPhotosだけ消さない。
 * - 共有・外部保存、看板修正はphoto-viewer.jsの責務。
 * ============================================================
 */

    const caseSelectButton = document.getElementById("caseSelectButton");
    const casePickerOverlay = document.getElementById("casePickerOverlay");
    const casePickerList = document.getElementById("casePickerList");
    const casePickerCloudArea = document.getElementById("casePickerCloudArea");
    const casePickerSearchInput = document.getElementById("casePickerSearchInput");
    const casePickerCloudStatus = document.getElementById("casePickerCloudStatus");
    const casePickerRemoteList = document.getElementById("casePickerRemoteList");
    const casePickerLocalTitle = document.getElementById("casePickerLocalTitle");
    const casePickerLoading = document.getElementById("casePickerLoading");
    const casePickerLoadingProject = document.getElementById("casePickerLoadingProject");
    const previewThumbnails = document.getElementById("previewThumbnails");
    const previewList = document.getElementById("previewList");
    const previewSortButton = document.getElementById("previewSortButton");
    const selectAllButton = document.getElementById("selectAllButton");

    let isPreviewListMode = false;
    let previewSortMode = "shooting";
    let selectedCaseKey = "";
    let casePickerOpenedFromTop = false;
    let formalProjects = [];
    let formalProjectsLoading = false;
    let formalProjectsError = "";
    let casePickerTutorialMode = false;
    let casePickerPurpose = "normal";
    let casePickerImportHandlers = null;
    let formalProjectSelection = null;
    let formalProjectSelectionSerial = 0;

    function getPhotoSubject(photo) {
      return String(photo.subjectName || photo.subject || APP_DATA.subject || "無題案件").trim() || "無題案件";
    }

    // v65.22以降は案件番号(caseId)を写真所属の正本とする。
    // 旧版写真にはcaseIdがないため、その写真だけ従来の件名グループへ退避する。
    function getPhotoCaseKey(photo) {
      const caseId = String(photo.caseId || "").trim();
      return caseId ? `case:${caseId}` : `legacy:${getPhotoSubject(photo)}`;
    }

    function getPhotoCaseId(photo) {
      return String(photo.caseId || "").trim();
    }

    function isTutorialCaseId(caseId) {
      return ["TUTORIAL_EXISTING", "TUTORIAL_NEW"].includes(String(caseId || ""));
    }

    function tutorialIsRunning() {
      return Boolean(window.Tutorial?.isRunning?.());
    }

    function getCaseSummaries() {
      const map = new Map();

      capturedPhotos.forEach((photo) => {
        const caseId = getPhotoCaseId(photo);
        if (isTutorialCaseId(caseId)) return;

        const key = getPhotoCaseKey(photo);
        const subject = getPhotoSubject(photo);
        const photoTime = new Date(photo.createdAt || 0).getTime();
        const current = map.get(key) || { key, caseId, subject, count: 0, latest: 0 };
        current.count += 1;
        // 件名は識別キーに使わず、その案件で最も新しい写真の看板件名を表示名に使う。
        if (photoTime >= current.latest) {
          current.latest = photoTime;
          current.subject = subject;
        }
        map.set(key, current);
      });

      if (window.CaseSession) {
        const active = CaseSession.getCurrentSession();
        if (active && active.id && !isTutorialCaseId(active.id) && active.kind !== "tutorial") {
          const key = `case:${active.id}`;
          if (!map.has(key)) {
            const currentSubject = typeof getCurrentSubjectName === "function" ? getCurrentSubjectName() : "無題案件";
            map.set(key, { key, caseId: active.id, subject: currentSubject, count: 0, latest: new Date(active.createdAt || 0).getTime() });
          }
        }
      }

      return Array.from(map.values()).sort((a, b) => b.latest - a.latest);
    }

    function getCaseDisplayName(item) {
      if (!item) return "案件なし";
      return item.caseId ? `${item.caseId}_${item.subject}` : item.subject;
    }

    function getLatestCaseKey() {
      const cases = getCaseSummaries();
      return cases.length ? cases[0].key : "";
    }

    function getSelectedCaseSummary() {
      const cases = getCaseSummaries();
      return cases.find((item) => item.key === selectedCaseKey) || cases[0] || null;
    }

    function getPreviewPhotos() {
      const activeSession = window.CaseSession?.getCurrentSession?.() || null;
      let photos = capturedPhotos.slice();

      if (tutorialIsRunning() && activeSession?.kind === "tutorial") {
        photos = photos.filter((photo) => getPhotoCaseId(photo) === activeSession.id);
      } else {
        photos = photos.filter((photo) => !isTutorialCaseId(getPhotoCaseId(photo)));
        if (selectedCaseKey) {
          photos = photos.filter((photo) => getPhotoCaseKey(photo) === selectedCaseKey);
        }
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
        const summary = getSelectedCaseSummary();
        const title = getCaseDisplayName(summary);
        const count = getPreviewPhotos().length;
        caseSelectButton.textContent = `${title}　${count}枚 ▼`;
      }

      if (previewSortButton) {
        previewSortButton.textContent = previewSortMode === "sample" ? "検体順" : "撮影順";
      }
    }

    function openCasePicker() {
      // アルバム側はappOrientationShellと同じ強制横向きで表示する。
      casePickerOpenedFromTop = false;
      casePickerOverlay.classList.add("app-oriented-modal");
      renderCasePicker();
      casePickerOverlay.classList.add("show");
    }

    function openCasePickerFromTop() {
      casePickerPurpose = "normal";
      casePickerImportHandlers = null;
      casePickerOpenedFromTop = true;
      casePickerTutorialMode = Boolean(window.Tutorial?.shouldOpenTutorialCasePicker?.());
      casePickerOverlay.classList.remove("app-oriented-modal");
      if (casePickerSearchInput) casePickerSearchInput.value = "";
      renderCasePicker();
      casePickerOverlay.classList.add("show");
      void loadFormalProjects();
    }

    function openCasePickerForImport(handlers = {}) {
      casePickerPurpose = "import";
      casePickerImportHandlers = {
        onSelect: typeof handlers.onSelect === "function" ? handlers.onSelect : null,
        onCancel: typeof handlers.onCancel === "function" ? handlers.onCancel : null
      };
      casePickerOpenedFromTop = true;
      casePickerTutorialMode = false;
      casePickerOverlay.classList.remove("app-oriented-modal");
      if (casePickerSearchInput) casePickerSearchInput.value = "";
      renderCasePicker();
      casePickerOverlay.classList.add("show");
      void loadFormalProjects();
    }

    function finishImportTargetSelection(result) {
      const handlers = casePickerImportHandlers;
      casePickerPurpose = "normal";
      casePickerImportHandlers = null;
      casePickerOpenedFromTop = false;
      casePickerTutorialMode = false;
      casePickerOverlay.classList.remove("show", "app-oriented-modal");
      handlers?.onSelect?.(result);
    }

    function closeCasePicker() {
      if (formalProjectSelection) {
        cancelFormalProjectSelection();
        return;
      }
      const handlers = casePickerPurpose === "import" ? casePickerImportHandlers : null;
      casePickerOverlay.classList.remove("show", "app-oriented-modal");
      casePickerOpenedFromTop = false;
      casePickerTutorialMode = false;
      casePickerPurpose = "normal";
      casePickerImportHandlers = null;
      handlers?.onCancel?.();
    }

    function setFormalProjectSelectionLoading(project, visible) {
      if (!casePickerLoading) return;
      casePickerLoading.classList.toggle("show", Boolean(visible));
      if (casePickerLoadingProject) {
        const projectNo = String(project?.projectNo || "").trim();
        const projectName = String(project?.projectName || "").trim();
        casePickerLoadingProject.textContent = visible
          ? [projectNo, projectName].filter(Boolean).join("　")
          : "";
      }
    }

    function restoreSelectionSession(previousSession) {
      if (!previousSession?.id || !window.CaseSession) return;
      CaseSession.activateSession(
        previousSession.id,
        previousSession.projectName || ""
      );
    }

    function cancelFormalProjectSelection() {
      const selection = formalProjectSelection;
      if (!selection) return;

      selection.cancelled = true;
      formalProjectSelection = null;
      setFormalProjectSelectionLoading(null, false);
      restoreSelectionSession(selection.previousSession);
      renderCasePicker();

      if (typeof showToast === "function") {
        showToast("案件の読み込みをキャンセルしました");
      }
    }

    function projectMatchesSearch(item, query) {
      if (!query) return true;
      const haystack = `${item.projectNo || ""} ${item.projectName || ""} ${item.name || ""}`.toLocaleLowerCase("ja");
      return haystack.includes(query.toLocaleLowerCase("ja"));
    }

    async function loadFormalProjects() {
      if (!casePickerOpenedFromTop || formalProjectsLoading) return;
      formalProjectsLoading = true;
      formalProjectsError = "";
      renderCasePicker();
      try {
        if (!window.OneDriveConnection?.getState?.().connected) {
          await OneDriveConnection.refresh({ force: true });
        }
        if (!OneDriveConnection.getState().connected) {
          throw new Error(OneDriveConnection.getState().error || "OneDriveへ接続できません。");
        }
        formalProjects = await OneDriveRoot.listProjectFolders({ force: false });
      } catch (error) {
        formalProjects = [];
        formalProjectsError = error?.message || "OneDrive案件を取得できませんでした。";
      } finally {
        formalProjectsLoading = false;
        if (casePickerOpenedFromTop) renderCasePicker();
      }
    }

    async function selectFormalProject(project) {
      if (formalProjectSelection) return;

      // 通常案件選択へ入る時点で、残っているチュートリアル一時セッションを必ず解除する。
      window.CaseSession?.endTutorialSession?.();
      const previousSession = window.CaseSession?.getCurrentSession?.() || null;
      const selection = {
        id: ++formalProjectSelectionSerial,
        cancelled: false,
        previousSession
      };
      formalProjectSelection = selection;
      setFormalProjectSelectionLoading(project, true);

      try {
        const openedFromTop = casePickerOpenedFromTop;
        const isImportTarget = casePickerPurpose === "import";

        if (isImportTarget) {
          const resolved = await CaseSession.resolveFormalProject(project, {
            isCancelled: () => selection.cancelled || formalProjectSelection !== selection
          });
          if (selection.cancelled || formalProjectSelection !== selection || !resolved) return;

          formalProjectSelection = null;
          setFormalProjectSelectionLoading(null, false);
          finishImportTargetSelection({
            caseId: resolved.session.id,
            caseSubject: resolved.session.projectName || project.projectName || "",
            address: String(resolved.address || ""),
            session: resolved.session
          });
          return;
        }

        await CaseSession.activateFormalProject(project, {
          isCancelled: () => selection.cancelled || formalProjectSelection !== selection
        });

        if (selection.cancelled || formalProjectSelection !== selection) return;

        selectedCaseKey = `case:${project.projectNo}`;
        previewIndex = 0;

        // 成功時だけロックを外して案件選択を閉じ、カメラ起動は1回だけ行う。
        formalProjectSelection = null;
        setFormalProjectSelectionLoading(null, false);
        casePickerOverlay.classList.remove("show", "app-oriented-modal");
        casePickerOpenedFromTop = false;
        casePickerTutorialMode = false;

        if (openedFromTop && typeof chooseCameraMode === "function") {
          chooseCameraMode();
        }
      } catch (error) {
        if (selection.cancelled || formalProjectSelection !== selection) return;

        console.error("正式案件の選択に失敗しました", error);
        formalProjectSelection = null;
        setFormalProjectSelectionLoading(null, false);
        restoreSelectionSession(previousSession);
        renderCasePicker();
        showErrorToast("案件を選択できませんでした");
      }
    }

    function renderCasePicker() {
      casePickerList.innerHTML = "";
      const query = String(casePickerSearchInput?.value || "").trim();
      if (casePickerCloudArea) casePickerCloudArea.hidden = !casePickerOpenedFromTop;

      if (casePickerOpenedFromTop && casePickerRemoteList && casePickerCloudStatus) {
        casePickerRemoteList.innerHTML = "";
        if (formalProjectsLoading) {
          casePickerCloudStatus.textContent = "OneDrive案件を確認しています...";
        } else if (formalProjectsError) {
          casePickerCloudStatus.textContent = formalProjectsError;
        } else {
          const visibleProjects = formalProjects.filter((item) => projectMatchesSearch(item, query));
          casePickerCloudStatus.textContent = formalProjects.length
            ? `OneDrive案件 ${visibleProjects.length} / ${formalProjects.length}件`
            : "条件に一致する正式案件はありません";

          visibleProjects.forEach((project) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "case-item case-item-remote";
            button.onclick = () => void selectFormalProject(project);
            const name = document.createElement("div");
            name.className = "case-name";
            name.textContent = project.projectName;
            const number = document.createElement("div");
            number.className = "case-count";
            number.textContent = project.projectNo;
            button.appendChild(name);
            button.appendChild(number);
            casePickerRemoteList.appendChild(button);
          });
        }
      }

      if (casePickerOpenedFromTop && casePickerTutorialMode) {
        const tutorialButton = document.createElement("button");
        tutorialButton.id = "tutorialCaseButton";
        tutorialButton.type = "button";
        tutorialButton.className = "case-item tutorial-case-item";
        tutorialButton.onclick = () => {
          if (window.Tutorial?.selectExistingTutorialCase) {
            Tutorial.selectExistingTutorialCase();
          }
        };
        const tutorialName = document.createElement("div");
        tutorialName.className = "case-name";
        tutorialName.textContent = "チュートリアル案件";
        const tutorialMeta = document.createElement("div");
        tutorialMeta.className = "case-count";
        tutorialMeta.textContent = "練習用";
        tutorialButton.appendChild(tutorialName);
        tutorialButton.appendChild(tutorialMeta);
        casePickerList.appendChild(tutorialButton);
      }

      const localCases = getCaseSummaries().filter((item) => {
        if (!query || !casePickerOpenedFromTop) return true;
        return projectMatchesSearch({ projectNo:item.caseId, projectName:item.subject }, query);
      });
      if (casePickerLocalTitle) casePickerLocalTitle.hidden = !casePickerOpenedFromTop;

      localCases.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "case-item";
        button.classList.toggle("active", item.key === selectedCaseKey);
        button.onclick = () => {
          if (formalProjectSelection) return;
          selectedCaseKey = item.key;
          previewIndex = 0;
          const openedFromTop = casePickerOpenedFromTop;

          if (casePickerPurpose === "import" && item.caseId && window.CaseSession) {
            const session = CaseSession.getSessionById?.(item.caseId);
            if (!session) {
              showErrorToast("案件情報を復元できませんでした");
              return;
            }
            const savedBoard = window.BoardPersistence?.loadBoardFormForCase?.(item.caseId) || {};
            finishImportTargetSelection({
              caseId: item.caseId,
              caseSubject: session.projectName || item.subject || "",
              address: String(savedBoard.address || "") === APP_DATA.address ? "" : String(savedBoard.address || ""),
              session
            });
            return;
          }

          casePickerOpenedFromTop = false;
          closeCasePicker();

          if (openedFromTop && item.caseId && window.CaseSession) {
            CaseSession.endTutorialSession?.();
            CaseSession.activateSession(item.caseId, item.subject);
            if (typeof chooseCameraMode === "function") chooseCameraMode();
            return;
          }
          renderPreview();
        };

        const name = document.createElement("div");
        name.className = "case-name";
        name.textContent = getCaseDisplayName(item);

        const count = document.createElement("div");
        count.className = "case-count";
        count.textContent = `${item.count}枚`;

        button.appendChild(name);
        button.appendChild(count);
        casePickerList.appendChild(button);
      });
    }

    if (casePickerSearchInput && casePickerSearchInput.dataset.bound !== "1") {
      casePickerSearchInput.dataset.bound = "1";
      casePickerSearchInput.addEventListener("input", () => {
        if (casePickerOpenedFromTop) renderCasePicker();
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
        void AppDialog.notice({
          title: "撮影チェック",
          message: "撮影不足はありません。"
        });
        return;
      }

      void AppDialog.notice({
        title: "撮影不足",
        message: missingLines.join("\n")
      });
    }

    function formatSamplePointLabel(key) {
      const [sample, point] = String(key).split("-");
      return `${sample || "1"}-${numberToCircle(Number(point || 1))}`;
    }

    function numberToCircle(num) {
      const circles = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
      return circles[num] || String(num);
    }


    function createOneDrivePhotoDot(photo) {
      const dot = document.createElement("span");
      dot.className = `onedrive-photo-dot ${getPhotoOneDriveIndicatorState(photo)}`;
      dot.dataset.photoId = String(photo.id || "");
      dot.setAttribute("aria-label", "OneDrive送信状態");
      return dot;
    }

    function refreshOneDrivePhotoDots(photoId) {
      const id = String(photoId || "");
      if (!id) return;
      const photo = capturedPhotos.find((item) => String(item.id || "") === id);
      if (!photo) return;
      const state = getPhotoOneDriveIndicatorState(photo);

      document.querySelectorAll(".onedrive-photo-dot").forEach((dot) => {
        if (dot.dataset.photoId !== id) return;
        dot.classList.remove("uploaded", "working", "pending");
        dot.classList.add(state);
      });
    }

    function renderThumbnails() {
      previewThumbnails.innerHTML = "";

      getPreviewPhotos().forEach((photo, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "thumb-item";
        item.classList.toggle("current", index === previewIndex);
        item.classList.toggle("selected", Boolean(photo.selected));
        let thumbPointerStartX = 0;
        let thumbPointerStartY = 0;
        let thumbPointerMoved = false;
        item.addEventListener("pointerdown", (event) => {
          thumbPointerStartX = event.clientX;
          thumbPointerStartY = event.clientY;
          thumbPointerMoved = false;
        });
        item.addEventListener("pointermove", (event) => {
          if (Math.abs(event.clientX - thumbPointerStartX) > 8 || Math.abs(event.clientY - thumbPointerStartY) > 8) {
            thumbPointerMoved = true;
          }
        });
        item.addEventListener("click", (event) => {
          if (thumbPointerMoved) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (isBoardCorrectionSelectMode) {
            selectPhotoForBoardCorrection(index);
            return;
          }
          previewIndex = index;
          renderPreview();
        });

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

        item.appendChild(createOneDrivePhotoDot(photo));
        item.appendChild(img);
        item.appendChild(check);
        previewThumbnails.appendChild(item);
      });

      // 手動スワイプ後は、ユーザーが移動した位置を優先して強制的に元位置へ戻さない。
      // サムネ一覧はユーザーが動かした位置を維持する。
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
          if (isBoardCorrectionSelectMode) {
            selectPhotoForBoardCorrection(index);
            return;
          }
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
        item.appendChild(createOneDrivePhotoDot(photo));
        item.appendChild(img);
        item.appendChild(check);
        item.appendChild(info);
        previewList.appendChild(item);
      });
    }

    function setPreviewListMode(value) {
      isPreviewListMode = Boolean(value);
      previewOverlay.classList.toggle("list-mode", isPreviewListMode);
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

      const nextSelected = !Boolean(photo.selected);
      const result = await PhotoState.update(photo, (draft) => {
        draft.selected = nextSelected;
      });
      if (!result || !result.ok) showErrorToast("写真の選択状態を保存できませんでした");

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
      let failedCount = 0;

      for (const photo of photos) {
        const result = await PhotoState.update(photo, (draft) => {
          draft.selected = nextSelected;
        });
        if (!result || !result.ok) failedCount += 1;
      }

      updatePhotoCount();
      renderPreview();
      if (failedCount) {
        showErrorToast(`選択状態の保存に失敗：${failedCount}枚`);
      } else {
        showToast(nextSelected ? "表示中の写真を全選択しました" : "表示中の写真を全解除しました");
      }
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

      const hasUploaded = selectedPhotos.some((photo) =>
        String(photo.originalUploadStatus || "") === "uploaded" ||
        String(photo.completedUploadStatus || "") === "uploaded"
      );
      const message = hasUploaded
        ? `選択した画像 ${selectedPhotos.length}枚を端末内から削除しますか？\n\nOneDriveに保存済みの写真は削除されません。`
        : `選択した画像 ${selectedPhotos.length}枚を削除しますか？`;
      const ok = await AppDialog.confirm({
        title: "写真を削除",
        message,
        okLabel: "削除",
        cancelLabel: "キャンセル"
      });
      if (!ok) return;

      const deleteResult = await PhotoState.deleteMany(selectedPhotos);
      if (!deleteResult.ok) {
        showErrorToast(`削除失敗：${deleteResult.failed.length}枚`);
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
      if (deleteResult.ok) showToast("削除しました");
    }


    // OneDrive送信側の状態変更通知で、表示済みの●だけを更新する。
    window.addEventListener("photo-upload-state-changed", (event) => {
      refreshOneDrivePhotoDots(event?.detail?.photoId);
    });


    window.cancelFormalProjectSelection = cancelFormalProjectSelection;

    window.openCasePickerForImport = openCasePickerForImport;
    window.showCaseInPreview = function(caseId) {
      selectedCaseKey = caseId ? `case:${caseId}` : "";
      previewIndex = 0;
      previewOverlay.classList.add("show");
      renderPreview();
    };
