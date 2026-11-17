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

    // 案件選択 / 写真保存は「03 サンプリング」の実フォルダIDを直接使用する。
    samplingRootName: "03 サンプリング",
    samplingRootDriveId: "b!MSzS2TMA302NtWmb6CsWi-ZydvjmVW9MukCoa5MoRTs6K64zl6ROS4iLribSuKHV",
    samplingRootItemId: "01FQHN4IP3VIRKTVB4QFGIUZSDRFSSLE4X",

    // 正式案件の住所補完は、しらべと同じ「04 調査」の実フォルダIDを直接使用する。
    surveyRootName: "04 調査",
    surveyRootDriveId: "b!MSzS2TMA302NtWmb6CsWi-ZydvjmVW9MukCoa5MoRTs6K64zl6ROS4iLribSuKHV",
    surveyRootItemId: "01FQHN4IP66KIOIN5MPBDJADZPVGCLXGQV"
  });
})();
