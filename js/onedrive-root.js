/*
 * ============================================================
 * onedrive-root.js - 「03 サンプリング」配下の業務ルート解決
 * ============================================================
 * しらべの「04 調査」と同じ解決順序で「03 サンプリング」を解決する。
 * その直下にある「サンプリング写真」を写真保存ルートとして保持する。
 * 正式案件を探す projectRoot は samplingRoot と同じ実体を使う。
 * ============================================================
 */
(function () {
  "use strict";

  const PHOTO_ROOT_NAME = "サンプリング写真";
  let samplingRootCache = null;
  let samplingPhotoRootCache = null;

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
    samplingPhotoRootCache = null;
    return cloneRoot(samplingRootCache);
  }

  async function getProjectRoot({ force = false } = {}) {
    // 正式案件は「03 サンプリング」直下に並ぶため、別ルートを持たず同じ実体を返す。
    return getSamplingRoot({ force });
  }

  async function getSamplingPhotoRoot({ force = false } = {}) {
    if (!force && samplingPhotoRootCache?.driveId && samplingPhotoRootCache?.itemId) {
      return cloneRoot(samplingPhotoRootCache);
    }

    const root = await getSamplingRoot({ force });
    const photoRoot = await OneDriveClient.findChildFolder(root, PHOTO_ROOT_NAME);
    if (!photoRoot?.driveId || !photoRoot?.itemId || !photoRoot?.folder) {
      const error = new Error(`「03 サンプリング」直下に「${PHOTO_ROOT_NAME}」フォルダが見つかりません。`);
      error.code = "SAMPLING_PHOTO_ROOT_NOT_FOUND";
      throw error;
    }

    samplingPhotoRootCache = { ...photoRoot, rootSource: "sampling-child" };
    return cloneRoot(samplingPhotoRootCache);
  }

  async function listProjectFolders({ force = false } = {}) {
    const projectRoot = await getProjectRoot({ force });
    const children = await OneDriveClient.listDriveChildren(projectRoot);
    return children.filter((item) => {
      if (!item?.folder) return false;
      return String(item.name || "").trim() !== PHOTO_ROOT_NAME;
    });
  }

  function clearSamplingRoot() {
    samplingRootCache = null;
    samplingPhotoRootCache = null;
  }

  function getCachedSamplingRoot() {
    return cloneRoot(samplingRootCache);
  }

  function getCachedSamplingPhotoRoot() {
    return cloneRoot(samplingPhotoRootCache);
  }

  window.OneDriveRoot = Object.freeze({
    getSamplingRoot,
    getProjectRoot,
    getSamplingPhotoRoot,
    listProjectFolders,
    clearSamplingRoot,
    getCachedSamplingRoot,
    getCachedSamplingPhotoRoot
  });
})();
