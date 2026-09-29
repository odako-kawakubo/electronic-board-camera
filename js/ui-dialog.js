/*
 * ============================================================
 * ui-dialog.js - 共通ダイアログ
 * ============================================================
 * 責務:
 * - ユーザー判断が必要な確認
 * - 作業を止める必要がある案内 / エラー
 * - 情報表示
 *
 * 軽微な成功・失敗通知は従来どおりtoastを使用する。
 * ============================================================
 */
(function () {
  "use strict";

  const overlay = document.getElementById("appDialogModal");
  const titleNode = document.getElementById("appDialogTitle");
  const messageNode = document.getElementById("appDialogMessage");
  const cancelButton = document.getElementById("appDialogCancelButton");
  const okButton = document.getElementById("appDialogOkButton");

  let resolver = null;

  function open(options = {}) {
    if (!overlay || !titleNode || !messageNode || !cancelButton || !okButton) {
      return Promise.resolve(options.kind === "confirm" ? false : true);
    }

    const kind = options.kind === "confirm" ? "confirm" : "notice";
    titleNode.textContent = String(options.title || (kind === "confirm" ? "確認" : "お知らせ"));
    messageNode.textContent = String(options.message || "");
    cancelButton.hidden = kind !== "confirm";
    cancelButton.textContent = String(options.cancelLabel || "キャンセル");
    okButton.textContent = String(options.okLabel || (kind === "confirm" ? "続ける" : "閉じる"));

    overlay.classList.add("show");

    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function close(result) {
    overlay?.classList.remove("show");
    const current = resolver;
    resolver = null;
    if (current) current(Boolean(result));
  }

  function confirm(options = {}) {
    return open({ ...options, kind: "confirm" });
  }

  async function notice(options = {}) {
    await open({ ...options, kind: "notice" });
  }

  window.AppDialog = Object.freeze({ confirm, notice });
  window.confirmAppDialog = () => close(true);
  window.cancelAppDialog = () => close(false);
})();
