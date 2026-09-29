/*
 * ============================================================
 * help.js - アプリ内操作ガイド
 * ============================================================
 * 責務:
 * - トップ / 設定から操作ガイドを開閉する
 * - スマホ向けメニューと各ガイドページを切り替える
 * - 起点画面に応じて端末向きへ合わせる
 * ============================================================
 */
(function () {
  "use strict";

  const overlay = document.getElementById("helpOverlay");
  const menu = document.getElementById("helpMenu");
  const pages = Array.from(document.querySelectorAll("[data-help-page]"));
  const panel = overlay?.querySelector(".help-panel");

  function showMenu() {
    if (!overlay || !menu) return;
    menu.hidden = false;
    pages.forEach((page) => { page.hidden = true; });
    panel?.classList.remove("show-page");
    if (panel) panel.scrollTop = 0;
  }

  function openHelpPage(pageId) {
    if (!overlay || !menu) return;
    const target = pages.find((page) => page.dataset.helpPage === String(pageId || ""));
    if (!target) return;
    menu.hidden = true;
    pages.forEach((page) => { page.hidden = page !== target; });
    panel?.classList.add("show-page");
    if (panel) panel.scrollTop = 0;
  }

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
    showMenu();
  }

  function closeHelp() {
    overlay?.classList.remove("show", "app-oriented-modal");
    showMenu();
  }

  window.openHelp = openHelp;
  window.closeHelp = closeHelp;
  window.openHelpPage = openHelpPage;
  window.showHelpMenu = showMenu;
})();
