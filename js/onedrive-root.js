/*
 * ============================================================
 * onedrive-root.js - OneDrive業務ルート解決
 * ============================================================
 * 責務:
 * - 「03 サンプリング」を案件選択 / 写真保存の業務ルートとして解決する
 * - 「03 サンプリング / サンプリング写真」を仮案件写真ルートとして解決する
 * - 「04 調査」を正式案件Excel参照用の業務ルートとして解決する
 *
 * どちらのルートも、固定共有URLを第一経路とし、
 * 解決できない場合だけOneDrive検索へフォールバックする。
 * ============================================================
 */
(function () {
  "use strict";

  const PHOTO_ROOT_NAME = "サンプリング写真";
  const FORMAL_PROJECT_NAME_PATTERN = /^(\d{9})　(.+)$/;
  let samplingRootCache = null;
  let samplingPhotoRootCache = null;
  let surveyRootCache = null;

  function cloneRoot(root) {
    return root ? { ...root } : null;
  }

  async function resolveConfiguredRoot(expectedName, sharedUrl, errorCode) {
    const name = String(expectedName || "").trim();
    let sharedError = null;

    try {
      const root = await OneDriveClient.resolveSharedUrl(sharedUrl);
      return { ...root, rootSource: "fixed-share" };
    } catch (error) {
      sharedError = error;
      console.warn(`${name || "業務ルート"}共有URL解決失敗。OneDrive検索へフォールバックします`, error);
    }

    const keyword = name.replace(/^\d+\s*/, "").trim() || name;
    const found = await OneDriveClient.searchDriveFolders(keyword);
    const candidates = found.filter((item) => String(item?.name || "").includes(name));
    const candidate = candidates[0]
      || found.find((item) => String(item?.name || "").includes(keyword))
      || null;

    if (!candidate?.driveId || !candidate?.itemId) {
      const error = new Error(`${name || "共有フォルダ"}のdriveId/itemIdを取得できませんでした。`);
      error.code = errorCode;
      error.sharedUrlError = sharedError;
      throw error;
    }

    return { ...candidate, rootSource: "search-fallback" };
  }

  async function getSamplingRoot({ force = false } = {}) {
    if (!force && samplingRootCache?.driveId && samplingRootCache?.itemId) {
      return cloneRoot(samplingRootCache);
    }

    samplingRootCache = await resolveConfiguredRoot(
      MicrosoftConfig.samplingRootName,
      MicrosoftConfig.samplingRootUrl,
      "SAMPLING_ROOT_RESOLVE_FAILED"
    );
    samplingPhotoRootCache = null;
    return cloneRoot(samplingRootCache);
  }

  async function getSurveyRoot({ force = false } = {}) {
    if (!force && surveyRootCache?.driveId && surveyRootCache?.itemId) {
      return cloneRoot(surveyRootCache);
    }

    surveyRootCache = await resolveConfiguredRoot(
      MicrosoftConfig.surveyRootName,
      MicrosoftConfig.surveyRootUrl,
      "SURVEY_ROOT_RESOLVE_FAILED"
    );
    return cloneRoot(surveyRootCache);
  }

  async function getProjectRoot({ force = false } = {}) {
    // 案件選択と写真保存は「03 サンプリング」直下を正本とする。
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
    return children
      .filter((item) => item?.folder)
      .map((item) => {
        const name = String(item.name || "").trim();
        const match = name.match(FORMAL_PROJECT_NAME_PATTERN);
        if (!match) return null;
        return { ...item, projectNo: match[1], projectName: match[2].trim() };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.projectNo).localeCompare(String(a.projectNo), "ja"));
  }

  async function findSurveyProjectFolder(projectNo, { force = false } = {}) {
    const no = String(projectNo || "").trim();
    if (!/^\d{9}$/.test(no)) return null;

    const surveyRoot = await getSurveyRoot({ force });
    const children = await OneDriveClient.listDriveChildren(surveyRoot);
    return children.find((item) => {
      if (!item?.folder) return false;
      const name = String(item.name || "").trim();
      return name === no || name.startsWith(`${no} `) || name.startsWith(`${no}　`);
    }) || null;
  }

  function clearSamplingRoot() {
    samplingRootCache = null;
    samplingPhotoRootCache = null;
    surveyRootCache = null;
  }

  function clearSurveyRoot() {
    surveyRootCache = null;
  }

  function getCachedSamplingRoot() {
    return cloneRoot(samplingRootCache);
  }

  function getCachedSamplingPhotoRoot() {
    return cloneRoot(samplingPhotoRootCache);
  }

  function getCachedSurveyRoot() {
    return cloneRoot(surveyRootCache);
  }

  window.OneDriveRoot = Object.freeze({
    getSamplingRoot,
    getSurveyRoot,
    getProjectRoot,
    getSamplingPhotoRoot,
    listProjectFolders,
    findSurveyProjectFolder,
    clearSamplingRoot,
    clearSurveyRoot,
    getCachedSamplingRoot,
    getCachedSamplingPhotoRoot,
    getCachedSurveyRoot
  });
})();
