/*
 * ============================================================
 * app.js - アプリ全体の起点 / 共通UI
 * ============================================================
 * 責務: 各機能モジュールをつなぐ起点。初期化順序、全体イベント、app専用UIだけを担当する。共有状態はshared-state.jsを正本とする。
 *
 * 保守上の注意:
 * - 新機能を安易にここへ追加しない。まず担当モジュールを決める。HTMLのinline onclickがあるためclassic scriptのグローバル関数を前提とする。
 * ============================================================
 */

    // ============================================================
    // app.js専用DOM・状態
    // 他モジュールから参照しないものだけをここに残す。
    // ============================================================
    const cameraScreen = document.getElementById("cameraScreen");
    const boardLayer = document.querySelector(".board-layer");
    const boardEditPhotoStage = document.getElementById("boardEditPhotoStage");
    const boardEditHost = document.getElementById("boardEditHost");
    const toast = document.getElementById("toast");
    let toastTimer = null;

    // ============================================================
    // アプリ起動・全体イベント
    // 初期化順序には依存があるため、順番変更時は実機確認必須。
    // ============================================================
    document.addEventListener("DOMContentLoaded", async () => {
      setupForcedLandscape();
      renderAppVersion();
      checkAppUpdate();
      initializeBoard();
      setupStatusButtons();
      setupBoardMode();
      setupDateEditTracking();
      setupBoardPersistence();
      setupSamplingNameHistory();
      setupBoardEditGesture();
      setBoardEditable(false);
      setupPreviewSwipe();
      setupPreviewImageTap();
      setupPhotoCountHiddenShoot();
      setupBoardTextareaAutoCenter();
      setupBoardEditHistoryTracking();
      setupBoardEditForm();
      setupReliableBoardEditControls();
      setupSettingsToggleButton();
      renderPhotoQualitySettings();
      renderBoardTextSize();
      applyBoardFieldTextSizes();

      await loadPhotosFromIndexedDB();
      setupImportPhotoInput();
      await refreshImportResumePanel();

      requestAnimationFrame(() => {
        setInitialBoardLayout();
        scheduleBoardPreviewRender();
      });
    });

    window.addEventListener("resize", () => {
      handleWindowResize();
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        handleWindowResize();
      }, 200);
    });

    /*
     * iPhone / iPad のホーム画面PWA対策
     * 画面復帰時にカメラが止まることがあるため復帰を試す
     */
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && currentStream && !previewOverlay.classList.contains("show")) {
        resumeCameraAfterPreview();
      }
    });

    window.addEventListener("pageshow", () => {
      if (currentStream && !previewOverlay.classList.contains("show")) {
        resumeCameraAfterPreview();
      }
    });

    /**
     * 横向き運用の表示状態と左右反転設定を復元する。
     */

    function setupForcedLandscape() {
      const savedFlip = localStorage.getItem("electronicBoardLandscapeFlip") === "1";
      document.body.classList.toggle("landscape-flipped", savedFlip);
      updateLandscapeFlipButton();
    }

    /**
     * 端末の持ち方に合わせて画面全体を180度反転し、次回起動用に保存する。
     */

    function toggleLandscapeFlip() {
      const flipped = document.body.classList.toggle("landscape-flipped");
      localStorage.setItem("electronicBoardLandscapeFlip", flipped ? "1" : "0");
      updateLandscapeFlipButton();
      setTimeout(handleWindowResize, 80);
    }

    function updateLandscapeFlipButton() {
      const button = document.getElementById("landscapeFlipButton");
      if (!button) return;
      button.setAttribute("aria-pressed", document.body.classList.contains("landscape-flipped") ? "true" : "false");
    }

    /**
     * 通常メッセージを短時間表示する共通トースト。
     */

    function showToast(message) {
      toast.textContent = message;
      toast.classList.remove("error");
      toast.classList.add("show");

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 1400);
    }

    /**
     * 保存失敗などのエラーを通常より長く表示する。
     */

    function showErrorToast(message) {
      toast.textContent = message;
      toast.classList.add("error");
      toast.classList.add("show");

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.remove("error");
      }, 2400);
    }
