/*
 * ============================================================
 * onedrive-status-ui.js - トップのOneDrive接続表示
 * ============================================================
 */
(function () {
  "use strict";

  const badge = document.getElementById("oneDriveStatusBadge");
  const dot = document.getElementById("oneDriveStatusDot");
  const text = document.getElementById("oneDriveStatusText");

  function render(state) {
    if (!badge || !dot || !text) return;
    const phase = String(state?.phase || "unconnected");
    badge.dataset.phase = phase;
    dot.className = `onedrive-status-dot ${phase}`;
    text.textContent = state?.text || "未接続";
    badge.title = state?.error ? `OneDrive：${state.error}` : `OneDrive：${text.textContent}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    OneDriveConnection.subscribe(render);
    OneDriveConnection.initialize();
  });
})();
