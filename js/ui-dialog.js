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
  const inputWrap = document.getElementById("appDialogInputWrap");
  const inputNode = document.getElementById("appDialogInput");

  let resolver = null;
  let activeKind = "notice";

  function open(options = {}) {
    if (!overlay || !titleNode || !messageNode || !cancelButton || !okButton) {
      return Promise.resolve(options.kind === "confirm" ? false : true);
    }

    const kind = options.kind === "input" ? "input" : (options.kind === "confirm" ? "confirm" : "notice");
    activeKind = kind;
    titleNode.textContent = String(options.title || (kind === "input" ? "入力" : (kind === "confirm" ? "確認" : "お知らせ")));
    messageNode.textContent = String(options.message || "");
    cancelButton.hidden = kind === "notice";
    cancelButton.textContent = String(options.cancelLabel || "キャンセル");
    okButton.textContent = String(options.okLabel || (kind === "input" ? "決定" : (kind === "confirm" ? "続ける" : "閉じる")));

    if (inputWrap && inputNode) {
      inputWrap.hidden = kind !== "input";
      inputNode.value = kind === "input" ? String(options.value ?? "") : "";
      inputNode.placeholder = kind === "input" ? String(options.placeholder || "") : "";
    }

    overlay.classList.add("show");
    if (kind === "input") {
      window.setTimeout(() => {
        inputNode?.focus();
        inputNode?.select();
      }, 0);
    }

    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function close(result) {
    overlay?.classList.remove("show");
    const current = resolver;
    resolver = null;
    const kind = activeKind;
    activeKind = "notice";
    if (!current) return;
    if (kind === "input") current(result === true ? String(inputNode?.value ?? "") : null);
    else current(Boolean(result));
  }

  function confirm(options = {}) {
    return open({ ...options, kind: "confirm" });
  }

  async function notice(options = {}) {
    await open({ ...options, kind: "notice" });
  }

  function input(options = {}) {
    return open({ ...options, kind: "input" });
  }

  inputNode?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && activeKind === "input") {
      event.preventDefault();
      close(true);
    }
    if (event.key === "Escape" && activeKind === "input") {
      event.preventDefault();
      close(false);
    }
  });

  window.AppDialog = Object.freeze({ confirm, notice, input });
  window.confirmAppDialog = () => close(true);
  window.cancelAppDialog = () => close(false);
})();
