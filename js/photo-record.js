/*
 * ============================================================
 * photo-record.js - 写真レコード生成
 * ============================================================
 * 責務:
 * - カメラ撮影 / 既存写真への看板添付で共通する写真レコード生成を1か所に集約する
 * - 撮影時点の案件セッション情報と同期初期値を固定する
 *
 * 保守上の注意:
 * - ここでは保存しない。保存正本はPhotoStore。
 * - UIや撮影処理を持たない。
 * - v65.26では既存プロパティのみ使用し、新しいプロパティは追加しない。
 * ============================================================
 */

(function () {
  "use strict";

  function create(options = {}) {
    const caseSession = window.CaseSession ? CaseSession.getCurrentSession() : null;
    const createdAt = options.createdAt instanceof Date
      ? options.createdAt.toISOString()
      : String(options.createdAt || new Date().toISOString());

    const photo = {
      id: options.id || `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      dataUrl: String(options.dataUrl || ""),
      baseDataUrl: String(options.baseDataUrl || ""),
      fileName: String(options.fileName || ""),
      status: String(options.status || ""),
      statusLabel: String(options.statusLabel || ""),
      statusCode: String(options.statusCode || ""),
      sampleNo: options.sampleNo,
      pointNo: options.pointNo,
      roomNo: String(options.roomNo || ""),
      subjectName: String(options.subjectName || ""),

      // 撮影時点の所属案件を固定する。件名変更で所属や保存先を変えない。
      caseId: caseSession ? caseSession.id : "",
      caseDate: caseSession ? caseSession.dateCode : "",
      caseBranch: caseSession ? caseSession.branch : null,
      deviceName: caseSession ? caseSession.deviceName : "",
      oneDriveFolderName: caseSession ? caseSession.folderName : "",

      uploadStatus: "pending",
      uploadedAt: "",
      oneDriveItemId: "",
      isSection: Boolean(options.isSection),
      selected: false,
      createdAt,
      savedLocal: false,
      savedAt: ""
    };

    // 既存写真への看板添付だけが従来から持つ既存プロパティ。
    if (options.source) photo.source = String(options.source);

    return photo;
  }

  window.PhotoRecord = Object.freeze({ create });
})();
