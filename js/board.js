/*
 * ============================================================
 * board.js - 電子看板の表示 / 編集 / Canvas描画
 * ============================================================
 * 責務: 看板初期化、入力、調査/サンプリング切替、位置/サイズ、編集履歴、Canvas描画まで看板仕様を担当する。
 *
 * 保守上の注意:
 * - 画面上の看板と写真へ焼き込むCanvas看板は見た目を一致させる。iPhone/Safari対策を単純化して消さない。
 * ============================================================
 */

    /**

     * 保存済み看板内容を復元し、日付・区分・履歴・写真枚数を初期同期する。

     */

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

    function setupBoardMode() {
      applyBoardMode();
    }

    /**

     * 調査/サンプリングの違いをUIと看板へ反映し、サンプリングでは目視を使わない。

     */

    function applyBoardMode() {
      const isSampling = boardMode === "sampling";
      document.body.classList.toggle("sampling-mode", isSampling);
      if (isSampling) updateSamplingLocationTargetButton();

      if (editBoardModeButton) {
        editBoardModeButton.textContent = isSampling ? "サンプリング" : "調査";
        editBoardModeButton.classList.toggle("mode-survey", !isSampling);
        editBoardModeButton.classList.toggle("mode-sampling", isSampling);
      }
      if (boardEditModeBadge && !isBoardEditMode) {
        boardEditModeBadge.textContent = isSampling ? "サンプリング" : "調査";
        boardEditModeBadge.classList.toggle("mode-survey", !isSampling);
        boardEditModeBadge.classList.toggle("mode-sampling", isSampling);
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
      scheduleBoardPreviewRender();
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

    let samplingLocationTargetIndex = 0;

    function promptRoomNo() {
      const label = boardMode === "sampling" ? "採取箇所" : "部屋No.";
      const next = window.prompt(`${label}を入力してください`, roomNoInput.value || "");
      if (next === null) return;
      roomNoInput.value = next.trim();
      samplingLocationTargetIndex = 0;
      updateSamplingLocationTargetButton();
      saveBoardForm();
      if (boardMode === "sampling") saveSamplingNameHistoryForCurrentCase(roomNoInput.value);
      showToast(`${label}を変更しました`);
    }

    function getSamplingLocationTargets(value) {
      const text = String(value || "");
      const targets = [];
      const occupied = [];

      const overlaps = (start, end) => occupied.some((range) => start < range.end && end > range.start);
      const reserve = (start, end) => occupied.push({ start, end });

      // 連続範囲は1つの対象として扱う。例: 1-2階 => 2-3階 => 3-4階。
      for (const match of text.matchAll(/(\d+)\s*[-ー－〜~]\s*(\d+)/g)) {
        const raw = match[0];
        const start = match.index;
        const end = start + raw.length;
        if (overlaps(start, end)) continue;
        reserve(start, end);
        targets.push({
          kind: "range",
          start,
          end,
          raw,
          first: Number(match[1]),
          second: Number(match[2]),
          separator: raw.match(/[-ー－〜~]/)?.[0] || "-",
          label: `範囲${match[1]}-${match[2]}`
        });
      }

      // 3桁以上の部屋番号は「階 + 号室」に分ける。例: 101 => 1階 / 01号室。
      for (const match of text.matchAll(/\d{3,}/g)) {
        const raw = match[0];
        const start = match.index;
        const end = start + raw.length;
        if (overlaps(start, end)) continue;
        reserve(start, end);
        targets.push({
          kind: "room-floor",
          start,
          end,
          raw,
          label: `階${Number(raw.slice(0, -2))}`
        });
        targets.push({
          kind: "room-number",
          start,
          end,
          raw,
          label: `部屋${raw.slice(-2)}`
        });
      }

      // 通常の数値。複数ある場合は、それぞれ別の対象として扱う。
      for (const match of text.matchAll(/\d+/g)) {
        const raw = match[0];
        const start = match.index;
        const end = start + raw.length;
        if (overlaps(start, end)) continue;
        reserve(start, end);
        const prefix = text.slice(Math.max(0, start - 1), start);
        const suffix = text.slice(end, end + 2);
        let label = raw;
        if (prefix === "第") label = `第${raw}`;
        else if (suffix.startsWith("階")) label = `${raw}階`;
        targets.push({ kind: "number", start, end, raw, label });
      }

      // アルファベットは1文字ずつA→B→Cの順で動かす。
      for (const match of text.matchAll(/[A-Za-z]/g)) {
        const start = match.index;
        const end = start + 1;
        if (overlaps(start, end)) continue;
        reserve(start, end);
        targets.push({ kind: "letter", start, end, raw: match[0], label: match[0].toUpperCase() });
      }

      // 方角は 東→西→南→北→中央 の順で循環。
      for (const match of text.matchAll(/中央|東|西|南|北/g)) {
        const start = match.index;
        const end = start + match[0].length;
        if (overlaps(start, end)) continue;
        reserve(start, end);
        targets.push({ kind: "direction", start, end, raw: match[0], label: match[0] });
      }

      return targets.sort((a, b) => a.start - b.start || targetKindOrder(a.kind) - targetKindOrder(b.kind));
    }

    function targetKindOrder(kind) {
      if (kind === "range") return 0;
      if (kind === "room-floor") return 1;
      if (kind === "room-number") return 2;
      return 3;
    }

    function updateSamplingLocationTargetButton() {
      const button = document.getElementById("samplingLocationTargetButton");
      if (!button) return;
      const targets = getSamplingLocationTargets(roomNoInput ? roomNoInput.value : "");
      if (!targets.length) {
        samplingLocationTargetIndex = 0;
        button.textContent = "入力";
        button.disabled = false;
        return;
      }
      samplingLocationTargetIndex = ((samplingLocationTargetIndex % targets.length) + targets.length) % targets.length;
      button.textContent = targets[samplingLocationTargetIndex].label || "箇所";
      button.title = targets.length > 1 ? "タップして変更対象を切替" : "タップして採取箇所を入力";
    }

    function cycleSamplingLocationTarget() {
      const targets = getSamplingLocationTargets(roomNoInput ? roomNoInput.value : "");
      if (!targets.length) {
        promptRoomNo();
        return;
      }
      if (targets.length === 1) {
        promptRoomNo();
        return;
      }
      samplingLocationTargetIndex = (samplingLocationTargetIndex + 1) % targets.length;
      updateSamplingLocationTargetButton();
      showToast(`変更対象：${targets[samplingLocationTargetIndex].label}`);
    }

    function changeSamplingLocation(delta) {
      const original = String(roomNoInput ? roomNoInput.value : "");
      const targets = getSamplingLocationTargets(original);
      if (!targets.length) {
        promptRoomNo();
        return;
      }

      samplingLocationTargetIndex = ((samplingLocationTargetIndex % targets.length) + targets.length) % targets.length;
      const target = targets[samplingLocationTargetIndex];
      let replacement = target.raw;

      if (target.kind === "range") {
        // 範囲は幅を保ったまま両端を同時に増減する。下限は先頭1。
        const minDelta = 1 - target.first;
        const appliedDelta = Math.max(delta, minDelta);
        const first = target.first + appliedDelta;
        const second = target.second + appliedDelta;
        replacement = `${first}${target.separator}${second}`;
      } else if (target.kind === "number") {
        const width = target.raw.length;
        const next = Math.max(0, Number(target.raw) + delta);
        replacement = width > 1 && target.raw.startsWith("0") ? String(next).padStart(width, "0") : String(next);
      } else if (target.kind === "room-floor" || target.kind === "room-number") {
        const floorRaw = target.raw.slice(0, -2);
        const roomRaw = target.raw.slice(-2);
        const floor = Math.max(0, Number(floorRaw) + (target.kind === "room-floor" ? delta : 0));
        const room = Math.max(0, Number(roomRaw) + (target.kind === "room-number" ? delta : 0));
        replacement = `${floor}${String(room).padStart(2, "0")}`;
      } else if (target.kind === "letter") {
        const upper = target.raw === target.raw.toUpperCase();
        const code = target.raw.toUpperCase().charCodeAt(0);
        const nextCode = Math.min(90, Math.max(65, code + delta));
        const letter = String.fromCharCode(nextCode);
        replacement = upper ? letter : letter.toLowerCase();
      } else if (target.kind === "direction") {
        const directions = ["東", "西", "南", "北", "中央"];
        const current = directions.indexOf(target.raw);
        const index = current < 0 ? 0 : (current + delta + directions.length) % directions.length;
        replacement = directions[index];
      }

      roomNoInput.value = original.slice(0, target.start) + replacement + original.slice(target.end);
      saveBoardForm();
      saveSamplingNameHistoryForCurrentCase(roomNoInput.value);
      updateSamplingLocationTargetButton();
      showToast(`採取箇所：${roomNoInput.value || "未入力"}`);
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
      sampleNoInput.value = formatSampleDisplayValue(parts.sampleNo, parts.pointNo, parts.hasPoint);
      saveBoardForm();
      showToast("検体No.を変更しました");
    }

    function changePointNo(delta) {
      const parts = parseSampleDisplayValue(sampleNoInput.value);

      if (!parts.hasPoint) {
        // 箇所なしの状態では、上で「-①」を付け、下はそのまま。
        if (delta > 0) {
          parts.hasPoint = true;
          parts.pointNo = 1;
        }
      } else if (delta < 0 && parts.pointNo <= 1) {
        // 「-①」から下げると箇所表記自体を消す。
        parts.hasPoint = false;
        parts.pointNo = 1;
      } else {
        parts.pointNo = Math.max(1, parts.pointNo + delta);
      }

      sampleNoInput.value = formatSampleDisplayValue(parts.sampleNo, parts.pointNo, parts.hasPoint);
      saveBoardForm();
      showToast(parts.hasPoint ? "箇所No.を変更しました" : "箇所No.を外しました");
    }

    function parseSampleDisplayValue(value) {
      const raw = normalizeFullWidthText(String(value || "").trim())
        .replace(/[−ー―‐]/g, "-")
        .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, (char) => String("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".indexOf(char) + 1));
      const match = raw.match(/^(\d+)(?:-(\d+))?$/);
      return {
        sampleNo: match ? Math.max(1, Number(match[1]) || 1) : 1,
        pointNo: match && match[2] ? Math.max(1, Number(match[2]) || 1) : 1,
        hasPoint: Boolean(match && match[2])
      };
    }

    function formatSampleDisplayValue(sampleNo, pointNo, hasPoint = true) {
      return hasPoint ? `${sampleNo}-${toCircledNumber(pointNo)}` : String(sampleNo);
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
      scheduleBoardPreviewRender();
      pushBoardEditHistoryDebounced();
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
      scheduleBoardPreviewRender();
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

      const handleBoardTap = (event) => {
        if (isBoardEditMode) return;
        if (isSectionMode) return;

        const now = Date.now();
        if (now - lastTapAt < 380) {
          event.preventDefault();
          event.stopPropagation();
          openBoardEditMode();
          lastTapAt = 0;
          return;
        }
        lastTapAt = now;
      };

      if (photoBoard) photoBoard.addEventListener("pointerup", handleBoardTap, true);
      if (boardCanvasPreview) boardCanvasPreview.addEventListener("pointerup", handleBoardTap, true);
    }

    function setBoardEditable(enabled) {
      subjectText.readOnly = !enabled;
      addressText.readOnly = !enabled;
      roomNoInput.readOnly = !enabled;
      sampleNoInput.readOnly = !enabled;
      dateText.contentEditable = enabled ? "true" : "false";
      boardWrap.classList.toggle("board-readonly", !enabled);
    }

    function getCurrentBoardData() {
      return {
        subject: subjectText ? subjectText.value || "" : "",
        address: addressText ? addressText.value || "" : "",
        roomNo: roomNoInput ? roomNoInput.value || "" : "",
        sampleNo: sampleNoInput ? sampleNoInput.value || "" : "",
        date: dateText ? dateText.textContent || "" : "",
        status: selectedStatus,
        boardMode,
        fieldTextSize: { ...boardFieldTextSize }
      };
    }

    function populateBoardEditForm(data) {
      if (!data) return;
      boardEditSubject.value = data.subject || "";
      boardEditAddress.value = data.address || "";
      boardEditRoom.value = data.roomNo || "";
      boardEditSample.value = data.sampleNo || "";
      boardEditDate.value = data.date || "";
      boardEditModeSelect.value = data.boardMode === "sampling" ? "sampling" : "survey";
      renderBoardEditStatusOptions(data.status);
      updateBoardEditModeLabels();
    }

    function readBoardEditForm() {
      if (!boardEditDraft) boardEditDraft = getCurrentBoardData();
      boardEditDraft.subject = boardEditSubject.value || "";
      boardEditDraft.address = boardEditAddress.value || "";
      boardEditDraft.roomNo = boardEditRoom.value || "";
      boardEditDraft.sampleNo = boardEditSample.value || "";
      boardEditDraft.date = boardEditDate.value || "";
      boardEditDraft.status = boardEditStatus.value || "visual";
      boardEditDraft.boardMode = boardEditModeSelect.value === "sampling" ? "sampling" : "survey";
      return boardEditDraft;
    }

    function renderBoardEditStatusOptions(value) {
      const mode = boardEditModeSelect && boardEditModeSelect.value === "sampling" ? "sampling" : "survey";
      const list = mode === "sampling" ? [STATUS_LIST[1], STATUS_LIST[2], STATUS_LIST[3]] : STATUS_LIST;
      boardEditStatus.innerHTML = list.map(item => `<option value="${item.value}">${item.label}</option>`).join("");
      const next = list.some(item => item.value === value) ? value : list[0].value;
      boardEditStatus.value = next;
      if (boardEditDraft) boardEditDraft.status = next;
    }

    function updateBoardEditModeLabels() {
      const sampling = boardEditModeSelect.value === "sampling";
      const label = sampling ? "サンプリング" : "調査";
      boardEditRoomLabel.textContent = sampling ? "採取箇所名（改行可）" : "部屋No.（改行可）";

      if (editBoardModeButton) {
        editBoardModeButton.textContent = label;
        editBoardModeButton.classList.toggle("mode-survey", !sampling);
        editBoardModeButton.classList.toggle("mode-sampling", sampling);
      }

      if (boardEditModeBadge) {
        boardEditModeBadge.textContent = label;
        boardEditModeBadge.classList.toggle("mode-survey", !sampling);
        boardEditModeBadge.classList.toggle("mode-sampling", sampling);
      }
    }

    function selectBoardEditField(field) {
      const labels = { subject: "件名", address: "住所", room: boardEditModeSelect.value === "sampling" ? "採取箇所" : "部屋No.", sample: "試料No.", date: "日付" };
      boardEditSelectedField = field;
      document.querySelectorAll(".board-form-field[data-board-field]").forEach(el => el.classList.toggle("active", el.dataset.boardField === field));
      if (boardEditSelectedFieldLabel) boardEditSelectedFieldLabel.textContent = labels[field] || field;
    }

    function scheduleBoardEditCanvasRender() {
      if (!isBoardEditMode || boardEditRenderQueued) return;
      boardEditRenderQueued = true;
      requestAnimationFrame(() => {
        boardEditRenderQueued = false;
        renderBoardEditCanvas();
      });
    }

    // v63: 写真編集時は「看板だけ」ではなく、実写真 + 看板を同じCanvasに描画する。
    // 読み込み写真・撮影済み写真の看板修正どちらでも、保存結果に近い状態を常時確認できる。
    async function renderBoardEditCanvas() {
      if (!boardEditCanvas || !boardEditDraft) return;
      const renderToken = ++boardEditRenderToken;
      const wrap = boardEditCanvas.parentElement;
      const cssWidth = Math.max(1, Math.round(wrap.clientWidth || 780));
      const cssHeight = Math.max(1, Math.round(wrap.clientHeight || cssWidth * 242 / 390));
      const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      boardEditCanvas.width = Math.round(cssWidth * ratio);
      boardEditCanvas.height = Math.round(cssHeight * ratio);
      boardEditCanvas.style.width = `${cssWidth}px`;
      boardEditCanvas.style.height = `${cssHeight}px`;
      const ctx = boardEditCanvas.getContext("2d");
      ctx.clearRect(0, 0, boardEditCanvas.width, boardEditCanvas.height);

      const data = structuredCloneBoardData(readBoardEditForm());
      const isPhotoPreview = boardEditOverlay.classList.contains("photo-board-correction") ||
        boardEditOverlay.classList.contains("import-board-edit");
      const photoSrc = boardEditPhotoBackdrop && boardEditPhotoBackdrop.getAttribute("src");

      if (isPhotoPreview && photoSrc) {
        try {
          const img = await loadImage(photoSrc);
          if (renderToken !== boardEditRenderToken || !isBoardEditMode) return;

          // 編集Canvas内には写真全体をcontain表示する。縦横写真のどちらでも欠けない。
          const imageRect = getContainedImageRect(
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            boardEditCanvas.width,
            boardEditCanvas.height
          );
          ctx.fillStyle = "#111";
          ctx.fillRect(0, 0, boardEditCanvas.width, boardEditCanvas.height);
          ctx.drawImage(img, imageRect.x, imageRect.y, imageRect.w, imageRect.h);

          // 保存時と同じ4隅・同じサイズ比率で看板を描く。
          const boardRect = getFixedBoardRectForImageRect(imageRect);
          drawBoardOnCanvas(ctx, boardRect.x, boardRect.y, boardRect.w, boardRect.h, data);
          return;
        } catch (error) {
          console.warn("写真付き看板プレビューの描画に失敗しました", error);
        }
      }

      // 通常の看板編集は従来どおり看板単体を表示する。
      drawBoardOnCanvas(ctx, 0, 0, boardEditCanvas.width, boardEditCanvas.height, data);
    }

    function getContainedImageRect(srcW, srcH, dstW, dstH) {
      const safeSrcW = Math.max(1, Number(srcW) || 1);
      const safeSrcH = Math.max(1, Number(srcH) || 1);
      const scale = Math.min(dstW / safeSrcW, dstH / safeSrcH);
      const w = safeSrcW * scale;
      const h = safeSrcH * scale;
      return {
        x: (dstW - w) / 2,
        y: (dstH - h) / 2,
        w,
        h
      };
    }

    // 写真の実寸に依存せず、看板の大きさを「写真幅に対する比率」で統一する。
    // boardState.sizeRatio と4か所固定位置を、編集プレビューと保存処理で共用する。
    function getFixedBoardRectForImageRect(imageRect) {
      const margin = Math.max(2, imageRect.w * 0.012);
      let w = imageRect.w * clamp(boardState.sizeRatio, boardState.minSizeRatio, boardState.maxSizeRatio);
      let h = w * (242 / 390);
      const maxW = Math.max(1, imageRect.w - margin * 2);
      const maxH = Math.max(1, imageRect.h - margin * 2);
      if (w > maxW) {
        const scale = maxW / w;
        w *= scale;
        h *= scale;
      }
      if (h > maxH) {
        const scale = maxH / h;
        w *= scale;
        h *= scale;
      }

      const left = imageRect.x + margin;
      const right = imageRect.x + imageRect.w - margin - w;
      const top = imageRect.y + margin;
      const bottom = imageRect.y + imageRect.h - margin - h;
      let x = left;
      let y = bottom;
      if (boardState.position === "bottom-right") { x = right; y = bottom; }
      if (boardState.position === "top-right") { x = right; y = top; }
      if (boardState.position === "top-left") { x = left; y = top; }
      return { x, y, w, h };
    }

    function setupBoardEditForm() {
      const controls = [boardEditSubject, boardEditAddress, boardEditRoom, boardEditSample, boardEditDate, boardEditStatus, boardEditModeSelect].filter(Boolean);
      controls.forEach(control => {
        const syncDraftFromControl = () => {
          readBoardEditForm();
          if (control === boardEditModeSelect) {
            // v63: 調査 / サンプリング切替を下書きへ即反映してから再描画する。
            boardEditDraft.boardMode = boardEditModeSelect.value === "sampling" ? "sampling" : "survey";
            renderBoardEditStatusOptions(boardEditDraft.status);
            updateBoardEditModeLabels();
            selectBoardEditField(boardEditSelectedField);
          }
          scheduleBoardEditCanvasRender();
          pushBoardEditHistoryDebounced();
        };

        control.addEventListener("compositionstart", () => {
          boardEditIsComposing = true;
        });
        control.addEventListener("compositionend", () => {
          boardEditIsComposing = false;
          syncDraftFromControl();
          if (boardEditFinishRequested) requestBoardEditFinish();
        });
        control.addEventListener("input", syncDraftFromControl);
        control.addEventListener("change", syncDraftFromControl);
        control.addEventListener("blur", syncDraftFromControl);
        control.addEventListener("focus", () => {
          const holder = control.closest("[data-board-field]");
          if (holder) selectBoardEditField(holder.dataset.boardField);
        });
      });
      window.addEventListener("resize", scheduleBoardEditCanvasRender);
    }

    function adjustSelectedBoardEditTextSize(delta) {
      if (!boardEditDraft || !boardEditDraft.fieldTextSize) return;
      const field = boardEditSelectedField;
      const max = (field === "room" || field === "sample") ? 36 : (field === "date" ? 34 : 32);
      const min = field === "date" ? 14 : 12;
      boardEditDraft.fieldTextSize[field] = clamp((Number(boardEditDraft.fieldTextSize[field]) || 18) + delta, min, max);
      scheduleBoardEditCanvasRender();
      pushBoardEditHistoryDebounced();
    }

    function resetSelectedBoardEditTextSize() {
      if (!boardEditDraft || !boardEditDraft.fieldTextSize) return;
      const defaults = { subject: 18, address: 17, room: 24, sample: 24, date: 24 };
      const field = boardEditSelectedField;
      if (!(field in defaults)) return;
      boardEditDraft.fieldTextSize[field] = defaults[field];
      scheduleBoardEditCanvasRender();
      pushBoardEditHistoryDebounced();
      const label = boardEditSelectedFieldLabel ? boardEditSelectedFieldLabel.textContent : "選択項目";
      showToast(`${label}の文字サイズを初期値に戻しました`);
    }

    function toggleBoardEditModeFromForm() {
      boardEditModeSelect.value = boardEditModeSelect.value === "sampling" ? "survey" : "sampling";
      boardEditModeSelect.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function setupReliableBoardEditControls() {
      const bindTap = (element, handler) => {
        if (!element || element.dataset.tapBound === "1") return;
        element.dataset.tapBound = "1";
        let lastRun = 0;
        const run = (event) => {
          const now = Date.now();
          if (now - lastRun < 350) return;
          lastRun = now;
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          if (document.activeElement && typeof document.activeElement.blur === "function") {
            document.activeElement.blur();
          }
          handler();
        };
        element.addEventListener("pointerup", run, { passive: false });
        element.addEventListener("touchend", run, { passive: false });
        element.addEventListener("click", run, false);
      };

      bindTap(document.getElementById("boardEditUndoButton"), undoBoardEdit);
      bindTap(document.getElementById("boardEditRedoButton"), redoBoardEdit);
      bindTap(document.getElementById("boardEditResetButton"), resetBoardEdit);
      bindTap(document.getElementById("boardEditSizeDownButton"), () => adjustSelectedBoardEditTextSize(-1));
      bindTap(document.getElementById("boardEditSizeUpButton"), () => adjustSelectedBoardEditTextSize(1));
      bindTap(document.getElementById("boardEditSizeResetButton"), resetSelectedBoardEditTextSize);
      bindTap(document.getElementById("editBoardModeButton"), toggleBoardEditModeFromForm);
      const doneButton = document.getElementById("boardEditDoneButton");
      if (doneButton) {
        doneButton.dataset.doneBound = "1";
      }
    }


    let boardEditFinishRunning = false;

    async function forceFinishBoardEdit(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      try {
        const active = document.activeElement;
        if (active && typeof active.blur === "function") active.blur();

        boardEditIsComposing = false;
        boardEditFinishRequested = false;
        boardEditFinishRunning = false;

        const latestData = {
          subject: boardEditSubject ? boardEditSubject.value || "" : "",
          address: boardEditAddress ? boardEditAddress.value || "" : "",
          roomNo: boardEditRoom ? boardEditRoom.value || "" : "",
          sampleNo: boardEditSample ? boardEditSample.value || "" : "",
          date: boardEditDate ? boardEditDate.value || "" : "",
          status: boardEditStatus ? boardEditStatus.value || "visual" : "visual",
          boardMode: boardEditModeSelect && boardEditModeSelect.value === "sampling" ? "sampling" : "survey",
          fieldTextSize: { ...((boardEditDraft && boardEditDraft.fieldTextSize) || boardFieldTextSize) }
        };

        boardEditDraft = structuredCloneBoardData(latestData);

        // 状態フラグに依存せず、編集画面が見えている場合は必ず完了処理を通す。
        if (!isBoardEditMode) isBoardEditMode = true;
        await closeBoardEditMode({ data: boardEditDraft });
      } catch (error) {
        console.error("強制完了処理に失敗しました", error);
        window.alert(`完了処理エラー: ${error && error.message ? error.message : error}`);
      }

      return false;
    }

    function requestBoardEditFinish(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!isBoardEditMode || boardEditFinishRunning) return false;

      boardEditFinishRequested = true;

      // 先にフォーカスを外し、日本語入力を確定させる。
      const active = document.activeElement;
      if (active && typeof active.blur === "function") active.blur();

      // compositionendの有無に依存せず、DOMの現在値を直接下書きへ取り込む。
      window.setTimeout(() => {
        if (!isBoardEditMode || boardEditFinishRunning) return;
        boardEditIsComposing = false;
        readBoardEditForm();
        finishBoardEditFromDraft();
      }, 80);

      return false;
    }

    async function finishBoardEditFromDraft() {
      if (!isBoardEditMode || boardEditFinishRunning) return;
      boardEditFinishRunning = true;
      boardEditFinishRequested = false;

      try {
        // 完了直前のフォーム値を必ず取り込み、その値を通常看板へ反映する。
        const latestData = structuredCloneBoardData(readBoardEditForm());
        flushBoardEditHistory();
        await closeBoardEditMode({ data: latestData });
      } catch (error) {
        console.error("看板編集の完了処理に失敗しました", error);
        showToast("編集内容の反映に失敗しました");
      } finally {
        window.setTimeout(() => { boardEditFinishRunning = false; }, 250);
      }
    }

    function structuredCloneBoardData(data) {
      if (!data) return getCurrentBoardData();
      return {
        ...data,
        fieldTextSize: { ...(data.fieldTextSize || boardFieldTextSize) }
      };
    }

    /**

     * 保存済み写真のbaseDataUrlを使って看板修正画面を開き、確定前は元写真を壊さない。

     */

    function openBoardEditMode(options = {}) {
      if (isBoardEditMode) return;
      if (isSectionMode) {
        showToast("断面モード中は看板を編集できません");
        return;
      }
      isBoardEditMode = true;
      document.body.classList.add("board-editing");
      boardEditDraft = getCurrentBoardData();
      populateBoardEditForm(boardEditDraft);
      initBoardEditHistory();
      boardEditOverlay.classList.add("show");
      selectBoardEditField("subject");
      scheduleBoardEditCanvasRender();
      setTimeout(() => {
        scheduleBoardEditCanvasRender();
        if (options.focusFirstField !== false) boardEditSubject.focus();
      }, 80);
    }

    async function closeBoardEditMode(options = {}) {
      if (!isBoardEditMode) return;

      const shouldFinishPhotoCorrection = Boolean(boardEditTargetPhotoId);
      const data = options.data || structuredCloneBoardData(boardEditDraft);

      // まず編集値だけを確実に本体へ反映する。
      // 位置調整や再描画などの補助処理で例外が出ても、保存失敗にはしない。
      subjectText.value = data.subject || "";
      addressText.value = data.address || "";
      roomNoInput.value = data.roomNo || "";
      sampleNoInput.value = data.sampleNo || "";
      dateText.textContent = data.date || "";
      Object.assign(boardFieldTextSize, data.fieldTextSize || {});
      boardMode = data.boardMode === "sampling" ? "sampling" : "survey";
      selectedStatus = data.status || "visual";

      if (!options.overlayAlreadyClosed) boardEditOverlay.classList.remove("show");
      boardEditOverlay.classList.remove("photo-board-correction");
      if (boardEditPhotoBackdrop) boardEditPhotoBackdrop.removeAttribute("src");
      if (boardEditDoneButton) boardEditDoneButton.textContent = "完了";
      document.body.classList.remove("board-editing");
      isBoardEditMode = false;
      boardEditDraft = null;

      const safely = (label, fn) => {
        try {
          fn();
        } catch (error) {
          console.warn(label, error);
        }
      };

      safely("文字サイズ保存に失敗", saveBoardFieldTextSizes);
      safely("看板モード反映に失敗", applyBoardMode);
      safely("状態反映に失敗", () => setStatus(selectedStatus));
      safely("文字サイズ反映に失敗", applyBoardFieldTextSizes);
      safely("入力欄調整に失敗", syncBoardTextareas);
      safely("編集解除に失敗", () => setBoardEditable(false));
      safely("看板位置調整に失敗", placeBoardByFixedPosition);
      safely("看板フォーム保存に失敗", saveBoardForm);
      safely("看板再描画予約に失敗", scheduleBoardPreviewRender);

      if (boardMode === "sampling") {
        safely("採取箇所履歴保存に失敗", () => saveSamplingNameHistoryForCurrentCase(roomNoInput.value));
      }

      if (isImportBoardEdit) {
        await finishImportedPhotoBoardEdit();
        return;
      }

      if (shouldFinishPhotoCorrection) {
        await finishPhotoBoardCorrection();
        previewOverlay.classList.add("show");
        renderPreview();
        return;
      }

      showToast("看板編集を完了しました");
    }

    function syncBoardTextareas() {
      const targets = [subjectText, addressText, samplingLocationInput].filter(Boolean);

      targets.forEach((textarea) => {
        if (!textarea || textarea.tagName !== "TEXTAREA") return;

        textarea.style.paddingTop = "0px";
        textarea.style.paddingBottom = "0px";
        textarea.style.height = "auto";

        const parent = textarea.parentElement;
        const boxHeight = parent ? parent.clientHeight : textarea.clientHeight;
        const scrollHeight = textarea.scrollHeight;

        if (document.body.classList.contains("board-editing")) {
          const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
          const manualLines = String(textarea.value || "").split(/\n/).length;
          const estimatedLines = Math.max(1, Math.min(2, manualLines, Math.ceil(scrollHeight / Math.max(1, lineHeight))));
          const contentHeight = Math.min(boxHeight, Math.ceil(lineHeight * estimatedLines + 4));
          textarea.style.height = `${contentHeight}px`;
          textarea.style.transform = "translateY(3px)";
          return;
        }

        textarea.style.transform = "";

        textarea.style.height = "100%";
        const top = Math.max(0, (boxHeight - scrollHeight) / 2);
        textarea.style.paddingTop = `${top}px`;
      });
    }

    function setupBoardTextareaAutoCenter() {
      [subjectText, addressText, samplingLocationInput].filter(Boolean).forEach((textarea) => {
        if (!textarea || textarea.tagName !== "TEXTAREA") return;
        textarea.addEventListener("input", () => {
          syncBoardTextareas();
          scheduleBoardPreviewRender();
        });
      });

      requestAnimationFrame(syncBoardTextareas);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function getBoardEditSnapshot() {
      const data = isBoardEditMode && boardEditDraft ? readBoardEditForm() : getCurrentBoardData();
      return {
        subject: data.subject || "",
        address: data.address || "",
        roomNo: data.roomNo || "",
        sampleNo: data.sampleNo || "",
        date: data.date || "",
        selectedStatus: data.status,
        boardMode: data.boardMode,
        fieldTextSize: { ...(data.fieldTextSize || boardFieldTextSize) }
      };
    }

    function applyBoardEditSnapshot(snapshot) {
      if (!snapshot) return;
      isApplyingBoardHistory = true;
      boardEditDraft = {
        subject: snapshot.subject || "",
        address: snapshot.address || "",
        roomNo: snapshot.roomNo || "",
        sampleNo: snapshot.sampleNo || "",
        date: snapshot.date || "",
        status: snapshot.selectedStatus || "visual",
        boardMode: snapshot.boardMode === "sampling" ? "sampling" : "survey",
        fieldTextSize: { ...(snapshot.fieldTextSize || boardFieldTextSize) }
      };
      populateBoardEditForm(boardEditDraft);
      scheduleBoardEditCanvasRender();
      isApplyingBoardHistory = false;
    }

    function initBoardEditHistory() {
      boardEditHistory = [getBoardEditSnapshot()];
      boardEditHistoryIndex = 0;
    }

    function pushBoardEditHistoryDebounced() {
      if (!isBoardEditMode || isApplyingBoardHistory) return;
      clearTimeout(boardEditHistoryTimer);
      boardEditHistoryTimer = setTimeout(pushBoardEditHistory, 180);
    }

    function pushBoardEditHistory() {
      if (!isBoardEditMode || isApplyingBoardHistory) return;
      const snapshot = getBoardEditSnapshot();
      const prev = boardEditHistory[boardEditHistoryIndex];
      if (prev && JSON.stringify(prev) === JSON.stringify(snapshot)) return;
      boardEditHistory = boardEditHistory.slice(0, boardEditHistoryIndex + 1);
      boardEditHistory.push(snapshot);
      boardEditHistoryIndex = boardEditHistory.length - 1;
    }

    function flushBoardEditHistory() {
      if (boardEditHistoryTimer) {
        clearTimeout(boardEditHistoryTimer);
        boardEditHistoryTimer = null;
        pushBoardEditHistory();
      }
    }

    function undoBoardEdit() {
      flushBoardEditHistory();
      if (!isBoardEditMode || boardEditHistoryIndex <= 0) {
        showToast("これ以上戻せません");
        return;
      }
      boardEditHistoryIndex -= 1;
      applyBoardEditSnapshot(boardEditHistory[boardEditHistoryIndex]);
    }

    function redoBoardEdit() {
      flushBoardEditHistory();
      if (!isBoardEditMode || boardEditHistoryIndex >= boardEditHistory.length - 1) {
        showToast("これ以上進めません");
        return;
      }
      boardEditHistoryIndex += 1;
      applyBoardEditSnapshot(boardEditHistory[boardEditHistoryIndex]);
    }

    function resetBoardEdit() {
      flushBoardEditHistory();
      if (!isBoardEditMode || !boardEditHistory.length) return;
      applyBoardEditSnapshot(boardEditHistory[0]);
      boardEditHistory = [getBoardEditSnapshot()];
      boardEditHistoryIndex = 0;
      showToast("最初の状態に戻しました");
    }

    function setupBoardEditHistoryTracking() {
      [subjectText, addressText, roomNoInput, sampleNoInput, dateText].forEach((element) => {
        if (!element) return;
        element.addEventListener("input", () => {
          syncBoardTextareas();
          pushBoardEditHistoryDebounced();
        });
      });
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

    function setupBoardPersistence() {
      [subjectText, addressText, roomNoInput, sampleNoInput].forEach((element) => {
        if (!element) return;
        element.addEventListener("input", () => {
          saveBoardForm();
          scheduleBoardPreviewRender();
          if (element === subjectText) updateSamplingNameHistoryList();
          if (element === roomNoInput && boardMode === "sampling") {
            samplingLocationTargetIndex = 0;
            updateSamplingLocationTargetButton();
          }
        });
        element.addEventListener("change", () => {
          saveBoardForm();
          scheduleBoardPreviewRender();
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

    /**

     * 現在の看板入力をlocalStorageへ保存し、次回起動や次写真へ引き継ぐ。

     */

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
        if (typeof scheduleBoardPreviewRender === "function") {
          scheduleBoardPreviewRender();
        }
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

    let boardPreviewRenderQueued = false;

    /**

     * 連続再描画をrequestAnimationFrameで1回へまとめ、入力中の負荷を抑える。

     */

    function scheduleBoardPreviewRender() {
      if (boardPreviewRenderQueued) return;
      boardPreviewRenderQueued = true;
      requestAnimationFrame(() => {
        boardPreviewRenderQueued = false;
        renderBoardPreviewCanvas();
      });
    }

    function renderBoardPreviewCanvas() {
      if (!boardCanvasPreview || !photoBoard) return;

      const cssWidth = Math.max(1, Math.round(photoBoard.offsetWidth || 390));
      const cssHeight = Math.max(1, Math.round(photoBoard.offsetHeight || 242));
      const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const pixelWidth = Math.round(cssWidth * ratio);
      const pixelHeight = Math.round(cssHeight * ratio);

      if (boardCanvasPreview.width !== pixelWidth) boardCanvasPreview.width = pixelWidth;
      if (boardCanvasPreview.height !== pixelHeight) boardCanvasPreview.height = pixelHeight;
      boardCanvasPreview.style.width = `${cssWidth}px`;
      boardCanvasPreview.style.height = `${cssHeight}px`;

      const ctx = boardCanvasPreview.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pixelWidth, pixelHeight);
      drawBoardOnCanvas(ctx, 0, 0, pixelWidth, pixelHeight);
    }

    /* キャンバス上に看板を描画 */
    /**
     * 写真へ焼き込む電子看板をCanvasで描く最重要関数。画面表示と同じ二重枠・文字配置を再現する。
     */
    function drawBoardOnCanvas(ctx, x, y, w, h, sourceData = null) {
      const source = sourceData || getCurrentBoardData();
      const activeBoardMode = source.boardMode === "sampling" ? "sampling" : "survey";
      const activeTextSizes = source.fieldTextSize || boardFieldTextSize;
      const data = {
        subject: source.subject || "",
        address: source.address || "",
        roomNo: String(source.roomNo || "").trim(),
        sampleNo: String(source.sampleNo || "").trim(),
        date: source.date || "",
        status: source.status || selectedStatus,
        roomLabel: activeBoardMode === "sampling" ? "" : "　部屋No."
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
      const roomRowH = h * (34 / 230);
      const sampleRowH = h * (34 / 230);
      const statusRowH = h * (30 / 230);
      const row3H = roomRowH + sampleRowH + statusRowH;
      const row4H = h * (40 / 230);

      const contentY = y + row1H + row2H;
      const contentH = row3H;

      // 確定設定：No.セル「少し広」+ 値位置「右」。
      // テストHTMLの 120px + 48px を、右側幅416px基準の比率でCanvasへ反映する。
      const innerLabelW = rightW * 0.404;

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
      const subjectMultiplier = (activeTextSizes.subject || 18) / 18;
      const addressMultiplier = (activeTextSizes.address || 17) / 17;
      const roomMultiplier = (activeTextSizes.room || 24) / 24;
      const sampleMultiplier = (activeTextSizes.sample || 24) / 24;
      const dateMultiplier = (activeTextSizes.date || 24) / 24;
      const labelFont = Math.max(10, w * 0.046);
      const titleFont = Math.max(10, w * 0.047 * textMultiplier * subjectMultiplier);
      const addressFont = Math.max(10, w * 0.044 * textMultiplier * addressMultiplier);
      const innerLabelFont = Math.max(9, w * 0.043);
      const innerValueFont = Math.max(11, w * 0.055 * textMultiplier * roomMultiplier);
      const sampleValueFont = Math.max(11, w * 0.055 * textMultiplier * sampleMultiplier);
      const statusFont = Math.max(10, w * 0.043);
      const dateFont = Math.max(12, w * 0.055 * dateMultiplier);

      drawCenteredText(ctx, "件名", x, y, leftColW, row1H, labelFont);
      drawCenteredText(ctx, "採取場所", x, y + row1H, leftColW, row2H, labelFont);
      drawCenteredText(ctx, "内容", x, contentY, leftColW, contentH, labelFont);
      drawCenteredText(ctx, "日付", x, y + row1H + row2H + row3H, leftColW, row4H, labelFont);

      drawWrappedCenterText(ctx, data.subject, x + leftColW + 6, y, rightW - 12, row1H, titleFont, 1.25, 2);
      drawWrappedCenterText(ctx, data.address, x + leftColW + 6, y + row1H, rightW - 12, row2H, addressFont, 1.2, 2);

      if (activeBoardMode === "sampling") {
        drawCenteredText(ctx, data.roomNo, x + leftColW + 10, contentY, rightW - 20, roomRowH, innerValueFont);
      } else {
        drawLeftMiddleText(ctx, data.roomLabel, x + leftColW + 8, contentY, innerLabelW - 8, roomRowH, innerLabelFont);
        drawLeftMiddleText(ctx, data.roomNo, x + leftColW + innerLabelW, contentY, rightW - innerLabelW, roomRowH, innerValueFont);
      }

      drawLeftMiddleText(ctx, "　試料No.", x + leftColW + 8, contentY + roomRowH, innerLabelW - 8, sampleRowH, innerLabelFont);
      drawLeftMiddleText(ctx, data.sampleNo, x + leftColW + innerLabelW, contentY + roomRowH, rightW - innerLabelW, sampleRowH, sampleValueFont);

      const statusStartX = x + leftColW + 3;
      const statusWidth = rightW - 6;
      const activeStatusList = activeBoardMode === "sampling"
        ? STATUS_LIST.filter((item) => item.value !== "visual")
        : STATUS_LIST;
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

    function drawWrappedCenterText(ctx, text, x, y, w, h, fontSize, lineRate, maxLines) {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.font = `900 ${fontSize}px "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = getWrappedLines(ctx, text || "", w).slice(0, maxLines);
      const lineHeight = fontSize * lineRate;
      const totalHeight = lines.length * lineHeight;
      let currentY = y + h / 2 - totalHeight / 2 + lineHeight / 2 + Math.max(1, fontSize * 0.05);

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

    function syncBoardTextAreaVerticalCenter() {
      [subjectText, addressText].forEach((element) => {
        if (!element) return;
        element.style.paddingTop = "0px";
        element.style.paddingBottom = "0px";

        const visibleHeight = element.clientHeight;
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 20;
        const rawLines = String(element.value || "").split(/\n/);
        const estimatedLines = Math.max(1, rawLines.length);
        const contentHeight = Math.min(element.scrollHeight, Math.ceil(lineHeight * estimatedLines + 2));
        const padding = Math.max(0, Math.floor((visibleHeight - contentHeight) / 2));

        element.style.paddingTop = `${padding}px`;
        element.style.paddingBottom = "0px";
      });
    }

