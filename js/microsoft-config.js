/*
 * ============================================================
 * microsoft-config.js - Microsoft Graph / OneDrive設定
 * ============================================================
 * しらべと同じEntraアプリ登録を共用する。
 * ブラウザSPAなのでclient secretは持たない。
 */
(function () {
  "use strict";
  window.MicrosoftConfig = Object.freeze({
    graphClientId: "f7074fad-6ea0-467b-98db-e308f01950cc",
    tenantId: "538265b8-8d15-49ef-9d51-ca252954de1d",
    graphScopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"],

    // 看板カメラが使用するOneDrive業務ルート。
    samplingRootName: "03 サンプリング",
    samplingRootUrl: "https://odawarakoseki-my.sharepoint.com/:f:/g/personal/account_odawarakoseki_onmicrosoft_com/IgD7qiKp1DyBTIpmQ4llJZOXAUlxxtsP0TM0qPaXoD2MOjM?e=xh2BfU"
  });
})();
