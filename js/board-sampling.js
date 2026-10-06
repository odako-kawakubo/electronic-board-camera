/*
 * ============================================================
 * board-sampling.js - 採取箇所文字列の解析 / 増減操作
 * ============================================================
 * 責務:
 * - 「1-2階」「101」「東」など採取箇所文字列の操作対象解析
 * - 採取箇所の対象切替と増減
 *
 * 保守上の注意:
 * - 看板フォーム保存はboard-persistence.js。
 * - 通常の看板表示・編集はboard.js。
 * ============================================================
 */

    let samplingLocationTargetIndex = 0;

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

