/*
 * ============================================================
 * help.js - アプリ内操作ガイド
 * ============================================================
 * 責務:
 * - トップ / 設定から操作ガイドを開閉する
 * - 起点画面に応じて端末向きへ合わせる
 * ============================================================
 */
(function () {
  "use strict";

  const overlay = document.getElementById("helpOverlay");

  function openHelp() {
    if (!overlay) return;

    const settingsOverlay = document.getElementById("settingsOverlay");
    if (settingsOverlay?.classList.contains("show")) {
      settingsOverlay.classList.remove("show", "app-oriented-modal");
    }

    const topVisible = Boolean(
      typeof launchModeOverlay !== "undefined" &&
      launchModeOverlay &&
      !launchModeOverlay.classList.contains("hidden")
    );

    overlay.classList.toggle("app-oriented-modal", !topVisible);
    overlay.classList.add("show");
  }

  function closeHelp() {
    overlay?.classList.remove("show", "app-oriented-modal");
  }

  window.openHelp = openHelp;
  window.closeHelp = closeHelp;
})();
