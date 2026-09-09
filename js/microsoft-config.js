/*
 * ============================================================
 * microsoft-config.js - Microsoft Graph認証設定
 * ============================================================
 * しらべと同じEntraアプリ登録を共用する。
 * ブラウザSPAなのでclient secretは持たない。
 */
(function () {
  "use strict";
  window.MicrosoftConfig = Object.freeze({
    graphClientId: "f7074fad-6ea0-467b-98db-e308f01950cc",
    tenantId: "538265b8-8d15-49ef-9d51-ca252954de1d",
    graphScopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
  });
})();
