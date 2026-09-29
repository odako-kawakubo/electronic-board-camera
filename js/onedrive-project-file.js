/*
 * ============================================================
 * onedrive-project-file.js - 正式案件Excelから案件情報を補完
 * ============================================================
 * 案件番号・案件名はOneDrive案件フォルダ名を正本とし、
 * Excelは住所等の補完だけに使用する。しらべ側と同じ選定規則。
 * ============================================================
 */
(function () {
  "use strict";

  function itemId(item) {
    return String(item?.itemId || item?.id || "");
  }

  function isExcelFile(item) {
    return Boolean(item?.file) && /\.(?:xlsx|xlsm)$/i.test(String(item?.name || ""));
  }

  function isInternalRequestFile(name) {
    return /^社内依頼用[\s　]/.test(String(name || "").trim());
  }

  function scoreCandidate(item, projectNo) {
    const name = String(item?.name || "").trim();
    if (!name.includes(projectNo)) return -1;
    return isInternalRequestFile(name) ? 1 : 2;
  }

  async function findProjectExcelFile(projectFolder, projectNo) {
    const no = String(projectNo || "").trim();
    if (!no) throw new Error("案件番号を確認できません。");

    const children = await OneDriveClient.listDriveChildren(projectFolder);
    const candidates = children
      .filter(isExcelFile)
      .map((item) => ({ item, score: scoreCandidate(item, no) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score || String(a.item.name || "").localeCompare(String(b.item.name || ""), "ja"));

    return candidates[0]?.item || null;
  }

  async function readProjectExcelInfo(projectFolder, projectNo) {
    const excel = await findProjectExcelFile(projectFolder, projectNo);
    if (!excel) {
      const error = new Error(`案件番号 ${projectNo} の案件Excelが見つかりません。`);
      error.code = "PROJECT_EXCEL_NOT_FOUND";
      throw error;
    }

    const blob = await OneDriveClient.downloadDriveFile({
      driveId: excel.driveId || projectFolder?.driveId || "",
      itemId: itemId(excel)
    });
    const file = await blob.arrayBuffer();
    const cells = await OpenXmlWorkbookReader.readCells(file, "入力", ["F2", "K2", "L2"]);

    return {
      projectNo: String(cells.F2 || "").trim(),
      projectName: String(cells.K2 || "").trim(),
      address: String(cells.L2 || "").trim(),
      excelFileId: itemId(excel),
      excelFileName: String(excel?.name || ""),
      excelFileWebUrl: String(excel?.webUrl || "")
    };
  }

  window.OneDriveProjectFile = Object.freeze({
    findProjectExcelFile,
    readProjectExcelInfo
  });
})();
