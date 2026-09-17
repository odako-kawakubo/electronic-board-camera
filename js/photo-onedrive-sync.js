/*
 * ============================================================
 * photo-onedrive-sync.js - 写真本体のOneDrive送信
 * ============================================================
 * - 現在の仮案件に属するpending写真だけを1件ずつ直列送信する
 * - originalは「元画像」、completedは仮案件フォルダ直下へ保存する
 * - upload後にitemIdで実在確認してからuploadedへ進める
 * - 失敗はpendingのまま残し、このモジュール自身では連続自動再試行しない
 * - v65.34では端末側の元画像削除はまだ行わない
 * ============================================================
 */
(function () {
  "use strict";

  let initialized = false;
  let running = false;
  let rerunRequested = false;
  let scheduleTimer = null;

  function dataUrlToBlob(dataUrl) {
    const value = String(dataUrl || "");
    const commaIndex = value.indexOf(",");
    if (!value.startsWith("data:") || commaIndex < 0) throw new Error("写真データ形式を確認できません。");
    const header = value.slice(0, commaIndex);
    const payload = value.slice(commaIndex + 1);
    const mimeMatch = header.match(/^data:([^;,]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = header.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  function statusFor(photo, variant) {
    if (variant === "original") {
      if (!photo.baseDataUrl) return "not-applicable";
      return String(photo.originalUploadStatus || "pending");
    }
    if (photo.completedUploadStatus) return String(photo.completedUploadStatus);
    if (photo.uploadStatus === "uploaded" && photo.oneDriveItemId) return "uploaded";
    return "pending";
  }

  function aggregatePatch(photo, patch = {}) {
    const next = { ...photo, ...patch };
    const originalDone = statusFor(next, "original") === "uploaded" || statusFor(next, "original") === "not-applicable";
    const completedDone = statusFor(next, "completed") === "uploaded";
    const allDone = originalDone && completedDone;
    return {
      ...patch,
      uploadStatus: allDone ? "uploaded" : "pending",
      uploadedAt: allDone ? (next.completedUploadedAt || next.originalUploadedAt || new Date().toISOString()) : "",
      oneDriveItemId: next.completedItemId || next.oneDriveItemId || ""
    };
  }

  async function saveUploadPatch(photo, patch) {
    const merged = aggregatePatch(photo, patch);
    const result = await PhotoState.patchById(photo.id, merged, { notify: false });
    if (!result?.ok) {
      const error = new Error(result?.errorMessage || "OneDrive送信結果を端末へ保存できませんでした。");
      error.code = "UPLOAD_METADATA_SAVE_FAILED";
      throw error;
    }
    Object.assign(photo, merged);
  }

  function buildVariantPlan(photo, folders) {
    const plans = [];
    if (photo.baseDataUrl && statusFor(photo, "original") !== "uploaded") {
      plans.push({variant:"original",dataUrl:photo.baseDataUrl,folder:folders.original,statusField:"originalUploadStatus",uploadedAtField:"originalUploadedAt",itemIdField:"originalItemId",pathField:"originalPath",errorField:"originalUploadError"});
    }
    if (photo.dataUrl && statusFor(photo, "completed") !== "uploaded") {
      plans.push({variant:"completed",dataUrl:photo.dataUrl,folder:folders.completed,statusField:"completedUploadStatus",uploadedAtField:"completedUploadedAt",itemIdField:"completedItemId",pathField:"completedPath",errorField:"completedUploadError"});
    }
    return plans;
  }

  async function uploadVariant(photo, plan, sessionId) {
    if (CaseSession.getCurrentSession().id !== sessionId) return { ok:false, reason:"case-changed" };
    const fileName = String(photo.fileName || "").trim();
    if (!fileName) return { ok:false, reason:"filename-missing" };

    try {
      const blob = dataUrlToBlob(plan.dataUrl);
      const uploaded = await OneDriveClient.uploadDriveFile(plan.folder, fileName, blob, blob.type || "image/jpeg");
      const uploadedRef = {driveId:String(uploaded?.driveId || plan.folder?.driveId || ""),itemId:String(uploaded?.itemId || uploaded?.id || "")};
      if (!uploadedRef.driveId || !uploadedRef.itemId) throw new Error("OneDrive保存後のitemIdを確認できませんでした。");
      const verified = await OneDriveClient.getDriveItem(uploadedRef);
      if (!verified?.file || !verified?.itemId) throw new Error("OneDrive保存後のファイル実在確認に失敗しました。");

      const now = new Date().toISOString();
      await saveUploadPatch(photo, {
        oneDriveDriveId: verified.driveId || uploadedRef.driveId,
        [plan.statusField]: "uploaded",
        [plan.uploadedAtField]: now,
        [plan.itemIdField]: verified.itemId,
        [plan.pathField]: verified.webUrl || "",
        [plan.errorField]: ""
      });
      return { ok:true, uploaded:true };
    } catch (error) {
      try {
        await saveUploadPatch(photo, {[plan.statusField]:"pending",[plan.errorField]:error?.message || String(error)});
      } catch (metadataError) {
        console.warn("写真送信エラー情報の保存にも失敗しました", metadataError);
      }
      console.warn(`OneDrive ${plan.variant} 送信失敗`, { photoId:photo.id, fileName, error });
      return { ok:false, error };
    }
  }

  async function runCurrentCaseSync() {
    if (navigator.onLine === false) return { ok:false, reason:"offline" };
    const connection = OneDriveConnection.getState();
    if (!connection?.connected) return { ok:false, reason:"onedrive-unavailable" };

    const session = CaseSession.getCurrentSession();
    if (!session?.id || session.kind !== "temporary") return { ok:false, reason:"no-temporary-case" };

    const sessionFolder = await CaseSession.ensureCurrentSessionFolder();
    if (!sessionFolder?.driveId || !sessionFolder?.itemId || !sessionFolder?.originalFolder?.itemId) {
      return { ok:false, reason:"case-folder-unavailable" };
    }

    const photos = (await PhotoStore.getAllPhotos())
      .filter((photo) => String(photo.caseId || "") === String(session.id))
      .sort((a,b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    const folders = {
      completed:{driveId:sessionFolder.driveId,itemId:sessionFolder.itemId},
      original:{driveId:sessionFolder.originalFolder.driveId || sessionFolder.driveId,itemId:sessionFolder.originalFolder.itemId}
    };

    let uploaded = 0;
    for (const photo of photos) {
      if (CaseSession.getCurrentSession().id !== session.id) break;
      for (const plan of buildVariantPlan(photo, folders)) {
        if (CaseSession.getCurrentSession().id !== session.id) break;
        const result = await uploadVariant(photo, plan, session.id);
        if (result?.uploaded) uploaded += 1;
      }
    }
    return { ok:true, uploaded };
  }

  async function drain() {
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    try {
      do {
        rerunRequested = false;
        await runCurrentCaseSync();
      } while (rerunRequested);
    } finally {
      running = false;
    }
  }

  function requestSync() {
    if (scheduleTimer) return;
    scheduleTimer = window.setTimeout(() => {
      scheduleTimer = null;
      void drain();
    }, 0);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    PhotoState.subscribe(requestSync);
    OneDriveConnection.subscribe((state) => { if (state?.connected) requestSync(); });
    window.addEventListener("online", requestSync);
    requestSync();
  }

  document.addEventListener("DOMContentLoaded", initialize);

  window.PhotoOneDriveSync = Object.freeze({
    initialize,
    requestSync,
    syncCurrentCaseNow: drain
  });
})();
