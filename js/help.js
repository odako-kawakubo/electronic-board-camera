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
  const rootMenu = document.getElementById("helpRootMenu");
  const tutorialMenu = document.getElementById("tutorialMenu");
  const menu = document.getElementById("helpMenu");
  const pages = Array.from(document.querySelectorAll("[data-help-page]"));
  const panel = overlay?.querySelector(".help-panel");

  function hideAllMenus() {
    if (rootMenu) rootMenu.hidden = true;
    if (tutorialMenu) tutorialMenu.hidden = true;
    if (menu) menu.hidden = true;
    pages.forEach((page) => { page.hidden = true; });
  }

  function showRootMenu() {
    if (!overlay) return;
    hideAllMenus();
    if (rootMenu) rootMenu.hidden = false;
    panel?.classList.remove("show-page");
    if (panel) panel.scrollTop = 0;
  }

  function showTutorialMenu() {
    if (!overlay) return;
    hideAllMenus();
    if (tutorialMenu) tutorialMenu.hidden = false;
    panel?.classList.remove("show-page");
    if (panel) panel.scrollTop = 0;
  }

  function showMenu() {
    if (!overlay || !menu) return;
    hideAllMenus();
    menu.hidden = false;
    panel?.classList.remove("show-page");
    if (panel) panel.scrollTop = 0;
  }

  function openHelpPage(pageId) {
    if (!overlay || !menu) return;
    const target = pages.find((page) => page.dataset.helpPage === String(pageId || ""));
    if (!target) return;
    hideAllMenus();
    target.hidden = false;
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
    showRootMenu();
  }

  function closeHelp() {
    overlay?.classList.remove("show", "app-oriented-modal");
    showRootMenu();
  }

  window.openHelp = openHelp;
  window.closeHelp = closeHelp;
  window.openHelpPage = openHelpPage;
  window.showHelpRootMenu = showRootMenu;
  window.showTutorialMenu = showTutorialMenu;
  window.showHelpMenu = showMenu;
})();
