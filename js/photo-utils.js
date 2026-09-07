/*
 * v65.10 Photo Utilities
 * 写真件数、撮影区分、試料No.解析、ファイル名生成、保存写真読込を担当。
 */

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


