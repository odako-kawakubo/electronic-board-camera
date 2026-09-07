/*
 * ============================================================
 * settings.js - 表示・撮影設定
 * ============================================================
 * 責務: 画質、看板文字サイズ、設定画面を担当する。app.jsの初期状態生成で使うためshared-state.jsより先に読む。
 *
 * 保守上の注意:
 * - localStorageのキー名変更は既存利用者の設定消失につながる。PWA更新処理はpwa-controller.jsが担当する。
 * ============================================================
 */

    // v65.13: このモジュールだけが所有する定数・DOM参照・実行状態。
    const PHOTO_QUALITY_STORAGE_KEY = "electronic-board-camera-photo-quality";
    const BOARD_TEXT_SIZE_STORAGE_KEY = "electronic-board-camera-board-text-size";
    const BOARD_FIELD_TEXT_SIZE_STORAGE_KEY = "electronic-board-camera-board-field-text-size-v1";
    const settingsOverlay = document.getElementById("settingsOverlay");
    const qualityStandardButton = document.getElementById("qualityStandardButton");
    const qualityHighButton = document.getElementById("qualityHighButton");


    /**

     * 保存済み画質設定を読み込み、不正値ならstandardへ戻す。

     */

    function loadPhotoQuality() {
      try {
        const saved = localStorage.getItem(PHOTO_QUALITY_STORAGE_KEY);
        if (saved && PHOTO_QUALITY_SETTINGS[saved]) return saved;
      } catch (error) {}

      return "standard";
    }

    /**

     * 撮影画質を保存して設定UIへ即時反映する。

     */

    function setPhotoQuality(value) {
      if (!PHOTO_QUALITY_SETTINGS[value]) return;

      photoQuality = value;

      try {
        localStorage.setItem(PHOTO_QUALITY_STORAGE_KEY, value);
      } catch (error) {}

      renderPhotoQualitySettings();
      const setting = PHOTO_QUALITY_SETTINGS[photoQuality];
      showToast(`${setting.label}（${setting.width}×${setting.height}）にしました`);
    }

    function renderPhotoQualitySettings() {
      if (!qualityStandardButton || !qualityHighButton) return;

      qualityStandardButton.classList.toggle("active", photoQuality === "standard");
      qualityHighButton.classList.toggle("active", photoQuality === "high");
    }

    /**

     * 看板各項目の個別文字サイズを復元し、安全な範囲へ制限する。

     */

    function loadBoardFieldTextSizes() {
      const defaults = { subject: 18, address: 17, room: 24, sample: 24, date: 24 };
      try {
        const raw = localStorage.getItem(BOARD_FIELD_TEXT_SIZE_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === "object") {
          return {
            subject: clamp(Number(saved.subject) || defaults.subject, 12, 32),
            address: clamp(Number(saved.address) || defaults.address, 12, 32),
            room: clamp(Number(saved.room) || defaults.room, 12, 36),
            sample: clamp(Number(saved.sample) || defaults.sample, 12, 36),
            date: clamp(Number(saved.date) || defaults.date, 14, 34)
          };
        }
      } catch (error) {}
      return defaults;
    }

    function saveBoardFieldTextSizes() {
      try {
        localStorage.setItem(BOARD_FIELD_TEXT_SIZE_STORAGE_KEY, JSON.stringify(boardFieldTextSize));
      } catch (error) {}
    }

    function applyBoardFieldTextSizes() {
      if (subjectText) subjectText.style.fontSize = `${boardFieldTextSize.subject}px`;
      if (addressText) addressText.style.fontSize = `${boardFieldTextSize.address}px`;
      if (roomNoInput) roomNoInput.style.fontSize = `${boardFieldTextSize.room}px`;
      if (sampleNoInput) sampleNoInput.style.fontSize = `${boardFieldTextSize.sample}px`;
      if (dateText) dateText.style.fontSize = `${boardFieldTextSize.date}px`;
      syncBoardTextAreaVerticalCenter();
      scheduleBoardPreviewRender();
    }

    function loadBoardTextSize() {
      try {
        const saved = localStorage.getItem(BOARD_TEXT_SIZE_STORAGE_KEY);
        if (saved && BOARD_TEXT_SIZE_MULTIPLIERS[saved]) return saved;
      } catch (error) {}

      return "normal";
    }

    function renderBoardTextSize() {
      if (!boardWrap) return;

      boardWrap.classList.toggle("text-small", boardTextSize === "small");
      boardWrap.classList.toggle("text-large", boardTextSize === "large");

      scheduleBoardPreviewRender();
    }

    function setupSettingsToggleButton() {
      const button = document.getElementById("settingsButton");
      if (!button || button.dataset.toggleBound === "1") return;
      button.dataset.toggleBound = "1";
      let lastToggle = 0;
      const toggle = (event) => {
        const now = Date.now();
        if (now - lastToggle < 350) return;
        lastToggle = now;
        event.preventDefault();
        event.stopPropagation();
        toggleSettings();
      };
      button.addEventListener("pointerup", toggle, { passive: false });
      button.addEventListener("touchend", toggle, { passive: false });
      button.addEventListener("click", toggle, false);
    }

    function toggleSettings() {
      if (settingsOverlay.classList.contains("show")) {
        closeSettings();
      } else {
        openSettings();
      }
    }

    function openSettings() {
      renderPhotoQualitySettings();
      settingsOverlay.classList.add("show");
      if (typeof refreshStorageStatusUI === "function") {
        refreshStorageStatusUI();
      }
    }

    function closeSettings() {
      settingsOverlay.classList.remove("show");
    }

    // 写真0枚でも更新不能にならないよう、起動画面にも設定入口を常設する。
    document.addEventListener("DOMContentLoaded", () => {
      const actions = document.querySelector(".launch-mode-actions");
      if (!actions || document.getElementById("launchSettingsButton")) return;

      const button = document.createElement("button");
      button.id = "launchSettingsButton";
      button.type = "button";
      button.className = "launch-mode-button launch-settings-button";
      button.textContent = "⚙ 設定・更新";
      button.addEventListener("click", openSettings);
      actions.appendChild(button);
    });
