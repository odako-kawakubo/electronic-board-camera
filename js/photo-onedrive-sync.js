/*
 * ============================================================
 * photo-onedrive-sync.js - 写真本体のOneDrive送信
 * ============================================================
 * - 現在案件のpendingだけを1件ずつ直列送信する
 * - originalは「元画像」、completedは案件フォルダ直下へ保存する
 * - yellow(uploading/verifying)はメモリ上だけ。DBはpending/uploadedを保持する
 * - upload後にitemIdで実在確認してからuploadedへ進める
 * - original/completed両方確認後、端末内の元画像(baseDataUrl)だけ解放する
 * - 完成画像の新しい版はOneDrive上の既存名を見て枝番を決定し、上書きしない
 * - 案件切替 / 写真保存 / 接続復帰 / online復帰で現在案件を再判定する
 * ============================================================
 */
(function () {
  "use strict";

  let initialized = false;
  let running = false;
  let rerunRequested = false;
  let scheduleTimer = null;
  const liveStates = new Map();

  function liveKey(photoId, variant) {
    return `${String(photoId || "")}:${variant}`;
  }

  function getLiveState(photoId, variant = "") {
    if (variant) return liveStates.get(liveKey(photoId, variant)) || "";
    const original = liveStates.get(liveKey(photoId, "original")) || "";
    const completed = liveStates.get(liveKey(photoId, "completed")) || "";
    return original || completed;
  }

  function setLiveState(photoId, variant, state = "") {
    const key = liveKey(photoId, variant);
    if (state) liveStates.set(key, state);
    else liveStates.delete(key);
    window.dispatchEvent(new CustomEvent("photo-upload-state-changed", {
      detail: { photoId: String(photoId || "") }
    }));
  }

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

  function persistedStatus(photo, variant) {
    const raw = variant === "original"
      ? String(photo.originalUploadStatus || (photo.originalRequired ? "pending" : "not-applicable"))
      : String(photo.completedUploadStatus || "pending");
    return raw === "uploaded" || raw === "not-applicable" ? raw : "pending";
  }

  function aggregatePatch(photo, patch = {}) {
    const next = { ...photo, ...patch };
    const originalDone = next.originalRequired === false
      ? true
      : persistedStatus(next, "original") === "uploaded";
    const completedDone = persistedStatus(next, "completed") === "uploaded";
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
    window.dispatchEvent(new CustomEvent("photo-upload-state-changed", {
      detail: { photoId: photo.id }
    }));
  }

  function baseFileParts(fileName) {
    const value = String(fileName || "").trim() || "photo.jpg";
    const dot = value.lastIndexOf(".");
    const ext = dot >= 0 ? value.slice(dot) : ".jpg";
    const stem = dot >= 0 ? value.slice(0, dot) : value;
    return { stem: stem.replace(/_\d{2,}$/, ""), ext };
  }

  async function nextRemoteFileName(folder, desiredFileName) {
    const desired = String(desiredFileName || "").trim() || "photo.jpg";
    const children = await OneDriveClient.listDriveChildren(folder);
    const names = new Set(
      children.filter((item) => item?.file).map((item) => String(item.name || "").trim())
    );
    if (!names.has(desired)) return desired;

    const parts = baseFileParts(desired);
    let index = 2;
    let candidate = "";
    do {
      candidate = `${parts.stem}_${String(index).padStart(2, "0")}${parts.ext}`;
      index += 1;
    } while (names.has(candidate));
    return candidate;
  }

  function variantFields(variant) {
    const prefix = variant === "original" ? "original" : "completed";
    return {
      statusField: `${prefix}UploadStatus`,
      uploadedAtField: `${prefix}UploadedAt`,
      itemIdField: `${prefix}ItemId`,
      pathField: `${prefix}Path`,
      errorField: `${prefix}UploadError`,
      pendingFileNameField: `${prefix}PendingFileName`,
      pendingItemIdField: `${prefix}PendingItemId`,
      fileNameField: `${prefix}FileName`
    };
  }

  function buildVariantPlan(photo, folders) {
    const plans = [];
    const originalRequired = photo.originalRequired !== false;

    if (originalRequired && persistedStatus(photo, "original") !== "uploaded" && photo.baseDataUrl) {
      plans.push({
        variant: "original",
        dataUrl: photo.baseDataUrl,
        folder: folders.original,
        desiredFileName: photo.originalFileName || photo.fileName,
        ...variantFields("original")
      });
    }

    if (persistedStatus(photo, "completed") !== "uploaded" && photo.dataUrl) {
      plans.push({
        variant: "completed",
        dataUrl: photo.dataUrl,
        folder: folders.completed,
        desiredFileName: photo.fileName,
        ...variantFields("completed")
      });
    }
    return plans;
  }

  async function finalizeVerifiedVariant(photo, plan, verified) {
    const now = new Date().toISOString();
    const patch = {
      oneDriveDriveId: verified.driveId || photo.oneDriveDriveId || "",
      [plan.statusField]: "uploaded",
      [plan.uploadedAtField]: now,
      [plan.itemIdField]: verified.itemId,
      [plan.pathField]: verified.webUrl || "",
      [plan.errorField]: "",
      [plan.pendingFileNameField]: "",
      [plan.pendingItemIdField]: "",
      [plan.fileNameField]: verified.name || photo[plan.fileNameField] || plan.desiredFileName
    };
    if (plan.variant === "completed" && verified.name) patch.fileName = verified.name;
    await saveUploadPatch(photo, patch);
  }

  async function recoverPendingUploadedItem(photo, plan) {
    const itemId = String(photo[plan.pendingItemIdField] || "");
    if (!itemId) return false;
    try {
      setLiveState(photo.id, plan.variant, "verifying");
      const verified = await OneDriveClient.getDriveItem({
        driveId: photo.oneDriveDriveId || plan.folder?.driveId || "",
        itemId
      });
      if (verified?.file && verified?.itemId) {
        await finalizeVerifiedVariant(photo, plan, verified);
        return true;
      }
    } catch (error) {
      if (error?.status !== 404 && error?.code !== "GRAPH_NOT_FOUND") throw error;
    }
    await saveUploadPatch(photo, {
      [plan.pendingItemIdField]: "",
      [plan.pendingFileNameField]: ""
    });
    return false;
  }

  async function uploadVariant(photo, plan, sessionId) {
    if (CaseSession.getCurrentSession().id !== sessionId) return { ok:false, reason:"case-changed" };

    try {
      if (await recoverPendingUploadedItem(photo, plan)) {
        setLiveState(photo.id, plan.variant, "");
        return { ok:true, uploaded:true };
      }

      const blob = dataUrlToBlob(plan.dataUrl);
      let candidate = String(photo[plan.pendingFileNameField] || "");
      let attempt = 0;

      while (attempt < 8) {
        attempt += 1;
        if (CaseSession.getCurrentSession().id !== sessionId) return { ok:false, reason:"case-changed" };
        if (!candidate) candidate = await nextRemoteFileName(plan.folder, plan.desiredFileName);

        await saveUploadPatch(photo, {
          [plan.pendingFileNameField]: candidate,
          [plan.errorField]: ""
        });

        setLiveState(photo.id, plan.variant, "uploading");

        let uploaded;
        try {
          uploaded = await OneDriveClient.uploadDriveFile(
            plan.folder,
            candidate,
            blob,
            blob.type || "image/jpeg",
            { conflictBehavior: "fail" }
          );
        } catch (error) {
          if (error?.status === 409 || error?.code === "GRAPH_CONFLICT") {
            candidate = "";
            await saveUploadPatch(photo, { [plan.pendingFileNameField]: "" });
            continue;
          }
          throw error;
        }

        const uploadedRef = {
          driveId: String(uploaded?.driveId || plan.folder?.driveId || ""),
          itemId: String(uploaded?.itemId || uploaded?.id || "")
        };
        if (!uploadedRef.driveId || !uploadedRef.itemId) {
          throw new Error("OneDrive保存後のitemIdを確認できませんでした。");
        }

        await saveUploadPatch(photo, {
          oneDriveDriveId: uploadedRef.driveId,
          [plan.pendingItemIdField]: uploadedRef.itemId
        });

        setLiveState(photo.id, plan.variant, "verifying");
        const verified = await OneDriveClient.getDriveItem(uploadedRef);
        if (!verified?.file || !verified?.itemId) {
          throw new Error("OneDrive保存後のファイル実在確認に失敗しました。");
        }

        await finalizeVerifiedVariant(photo, plan, verified);
        setLiveState(photo.id, plan.variant, "");
        return { ok:true, uploaded:true };
      }

      throw new Error("OneDrive上の空きファイル名を確保できませんでした。");
    } catch (error) {
      setLiveState(photo.id, plan.variant, "");
      try {
        await saveUploadPatch(photo, {
          [plan.statusField]: "pending",
          [plan.errorField]: error?.message || String(error)
        });
      } catch (metadataError) {
        console.warn("写真送信エラー情報の保存にも失敗しました", metadataError);
      }
      console.warn(`OneDrive ${plan.variant} 送信失敗`, {
        photoId: photo.id,
        fileName: plan.desiredFileName,
        error
      });
      return { ok:false, error };
    }
  }

  async function releaseLocalOriginalIfSafe(photo) {
    const originalDone = photo.originalRequired === false || persistedStatus(photo, "original") === "uploaded";
    const completedDone = persistedStatus(photo, "completed") === "uploaded";
    if (!originalDone || !completedDone || !photo.baseDataUrl) return;

    const result = await PhotoState.patchById(photo.id, { baseDataUrl: "" }, { notify: false });
    if (result?.ok) photo.baseDataUrl = "";
    else console.warn("OneDrive確認済み元画像の端末解放に失敗しました", result);
  }

  async function normalizeLegacyTransientStates() {
    const photos = await PhotoStore.getAllPhotos();
    for (const photo of photos) {
      const patch = {};
      if (["uploading", "verifying"].includes(String(photo.originalUploadStatus || ""))) patch.originalUploadStatus = "pending";
      if (["uploading", "verifying"].includes(String(photo.completedUploadStatus || ""))) patch.completedUploadStatus = "pending";
      if (photo.originalRequired === undefined) {
        patch.originalRequired = Boolean(photo.baseDataUrl || photo.originalItemId || photo.originalUploadStatus === "uploaded");
      }
      if (Object.keys(patch).length) await PhotoState.patchById(photo.id, patch, { notify: false });
    }
  }

  async function runCurrentCaseSync() {
    if (navigator.onLine === false) return { ok:false, reason:"offline", uploaded:0 };
    const connection = OneDriveConnection.getState();
    if (!connection?.connected) return { ok:false, reason:"onedrive-unavailable", uploaded:0 };

    const session = CaseSession.getCurrentSession();
    if (!session?.id || session.kind !== "temporary") return { ok:false, reason:"no-temporary-case", uploaded:0 };

    const sessionFolder = await CaseSession.ensureCurrentSessionFolder();
    if (!sessionFolder?.driveId || !sessionFolder?.itemId || !sessionFolder?.originalFolder?.itemId) {
      return { ok:false, reason:"case-folder-unavailable", uploaded:0 };
    }

    const photos = (await PhotoStore.getAllPhotos())
      .filter((photo) => String(photo.caseId || "") === String(session.id))
      .sort((a,b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    const folders = {
      completed: { driveId: sessionFolder.driveId, itemId: sessionFolder.itemId },
      original: {
        driveId: sessionFolder.originalFolder.driveId || sessionFolder.driveId,
        itemId: sessionFolder.originalFolder.itemId
      }
    };

    let uploaded = 0;
    for (const photo of photos) {
      if (CaseSession.getCurrentSession().id !== session.id) break;

      for (const plan of buildVariantPlan(photo, folders)) {
        if (CaseSession.getCurrentSession().id !== session.id) break;
        const result = await uploadVariant(photo, plan, session.id);
        if (result?.uploaded) uploaded += 1;
      }

      await releaseLocalOriginalIfSafe(photo);
    }

    return { ok:true, uploaded };
  }

  async function drain() {
    if (running) {
      rerunRequested = true;
      return { ok:true, reason:"already-running", uploaded:0 };
    }

    running = true;
    let lastResult = { ok:true, uploaded:0 };
    try {
      do {
        rerunRequested = false;
        lastResult = await runCurrentCaseSync();
      } while (rerunRequested);
      return lastResult;
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

  async function initialize() {
    if (initialized) return;
    initialized = true;
    await normalizeLegacyTransientStates().catch((error) => {
      console.warn("旧送信状態の正規化に失敗しました", error);
    });
    PhotoState.subscribe(requestSync);
    CaseSession.subscribe(requestSync);
    OneDriveConnection.subscribe((state) => {
      if (state?.connected) requestSync();
    });
    window.addEventListener("online", requestSync);
    requestSync();
  }

  document.addEventListener("DOMContentLoaded", () => void initialize());

  window.PhotoOneDriveSync = Object.freeze({
    initialize,
    requestSync,
    syncCurrentCaseNow: drain,
    getLiveState
  });
})();
