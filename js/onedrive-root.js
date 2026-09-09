/*
 * ============================================================
 * onedrive-root.js - 「03 サンプリング」業務ルートの解決
 * ============================================================
 * しらべの「04 調査」と同じ解決順序:
 * 1. 固定共有URLをGraph /sharesで解決
 * 2. 失敗した場合だけOneDrive検索へフォールバック
 * 3. 表示名から「03 サンプリング」を選ぶ
 * ============================================================
 */
(function () {
  "use strict";

  let samplingRootCache = null;

  function cloneRoot(root) {
    return root ? { ...root } : null;
  }

  async function resolveSamplingRoot() {
    const expectedName = String(MicrosoftConfig.samplingRootName || "").trim();
    let sharedError = null;

    try {
      const root = await OneDriveClient.resolveSharedUrl(MicrosoftConfig.samplingRootUrl);
      return { ...root, rootSource: "fixed-share" };
    } catch (error) {
      sharedError = error;
      console.warn("03 サンプリング共有URL解決失敗。OneDrive検索へフォールバックします", error);
    }

    const keyword = expectedName.replace(/^\d+\s*/, "").trim() || expectedName;
    const found = await OneDriveClient.searchDriveFolders(keyword);
    const candidates = found.filter((item) => String(item?.name || "").includes(expectedName));
    const candidate = candidates[0]
      || found.find((item) => String(item?.name || "").includes(keyword))
      || null;

    if (!candidate?.driveId || !candidate?.itemId) {
      const error = new Error(`${expectedName || "共有フォルダ"}のdriveId/itemIdを取得できませんでした。`);
      error.code = "SAMPLING_ROOT_RESOLVE_FAILED";
      error.sharedUrlError = sharedError;
      throw error;
    }

    return { ...candidate, rootSource: "legacy-search" };
  }

  async function getSamplingRoot({ force = false } = {}) {
    if (!force && samplingRootCache?.driveId && samplingRootCache?.itemId) {
      return cloneRoot(samplingRootCache);
    }
    samplingRootCache = await resolveSamplingRoot();
    return cloneRoot(samplingRootCache);
  }

  function clearSamplingRoot() {
    samplingRootCache = null;
  }

  function getCachedSamplingRoot() {
    return cloneRoot(samplingRootCache);
  }

  window.OneDriveRoot = Object.freeze({ getSamplingRoot, clearSamplingRoot, getCachedSamplingRoot });
})();
