/*
 * ============================================================
 * onedrive-root.js - OneDrive業務ルート解決
 * ============================================================
 * 責務:
 * - 「03 サンプリング」を案件選択 / 写真保存の業務ルートとして固定IDで解決する
 * - 「03 サンプリング / サンプリング写真」を仮案件写真ルートとして解決する
 * - 「04 調査」を正式案件Excel参照用の業務ルートとして固定IDで解決する
 *
 * 共有URL変換やフォルダ名検索には依存せず、設定済みdriveId/itemIdを正本とする。
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

  function configuredRoot(name, driveIdValue, itemIdValue, errorCode) {
    const driveId = String(driveIdValue || "").trim();
    const itemId = String(itemIdValue || "").trim();
    if (!driveId || !itemId) {
      const error = new Error(`${name || "OneDrive業務ルート"}の接続先IDが設定されていません。`);
      error.code = errorCode;
      throw error;
    }
    return {
      driveId,
      itemId,
      id: itemId,
      name: String(name || "").trim(),
      rootSource: "configured-id"
    };
  }

  async function getSamplingRoot({ force = false } = {}) {
    if (force || !samplingRootCache?.driveId || !samplingRootCache?.itemId) {
      samplingRootCache = configuredRoot(
        MicrosoftConfig.samplingRootName,
        MicrosoftConfig.samplingRootDriveId,
        MicrosoftConfig.samplingRootItemId,
        "SAMPLING_ROOT_ID_MISSING"
      );
      samplingPhotoRootCache = null;
    }
    return cloneRoot(samplingRootCache);
  }

  async function getSurveyRoot({ force = false } = {}) {
    if (force || !surveyRootCache?.driveId || !surveyRootCache?.itemId) {
      surveyRootCache = configuredRoot(
        MicrosoftConfig.surveyRootName,
        MicrosoftConfig.surveyRootDriveId,
        MicrosoftConfig.surveyRootItemId,
        "SURVEY_ROOT_ID_MISSING"
      );
    }
    return cloneRoot(surveyRootCache);
  }

  async function getProjectRoot({ force = false } = {}) {
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
