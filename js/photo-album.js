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
    const previewThumbnails = document.getElementById("previewThumbnails");
    const previewList = document.getElementById("previewList");
    const previewSortButton = document.getElementById("previewSortButton");
    const selectAllButton = document.getElementById("selectAllButton");

    let isPreviewListMode = false;
    let previewSortMode = "shooting";
    let selectedCaseSubject = "";

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

        if (photo.savedLocal) {
          const savedBadge = document.createElement("span");
          savedBadge.className = "saved-badge";
          savedBadge.textContent = "保存済";
          item.appendChild(savedBadge);
        }
        item.appendChild(img);
        item.appendChild(check);
        previewThumbnails.appendChild(item);
      });

      // v61: 手動スワイプ後に選択位置へ強制的に戻さない。
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
        if (photo.savedLocal) {
          const savedBadge = document.createElement("span");
          savedBadge.className = "saved-badge";
          savedBadge.textContent = "保存済";
          item.appendChild(savedBadge);
        }
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
      photo.selected = !photo.selected;
      await PhotoStore.savePhoto(photo);
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
        await PhotoStore.savePhoto(photo);
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
        await PhotoStore.deletePhoto(photo.id);
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

