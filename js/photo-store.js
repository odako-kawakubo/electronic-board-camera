/*
 * ============================================================
 * photo-store.js - IndexedDB 永続保存層
 * ============================================================
 * 責務: 写真と既存写真取込セッションを端末内へ保存する唯一の層。UI判断は持たず保存・読込・削除だけを担当する。
 *
 * 保守上の注意:
 * - DBは electronic-board-camera-prototype / version 2。storesはphotosとimportSessions。構造変更時はマイグレーション必須。
 * ============================================================
 */

(function () {
  "use strict";

  const DB_NAME = "electronic-board-camera-prototype";
  const DB_VERSION = 2;
  const PHOTO_STORE_NAME = "photos";
  const IMPORT_SESSION_STORE_NAME = "importSessions";
  const ACTIVE_IMPORT_SESSION_ID = "active";

  let dbInstance = null;

  /**

   * IndexedDB接続を1つだけ保持し、DB更新時は次回アクセスで開き直す。

   */

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDBを利用できません"));
        return;
      }
      if (dbInstance) {
        resolve(dbInstance);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          db.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(IMPORT_SESSION_STORE_NAME)) {
          db.createObjectStore(IMPORT_SESSION_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        dbInstance = request.result;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };
      request.onerror = () => reject(request.error || new Error("IndexedDBを開けませんでした"));
    });
  }

  /**

   * 保存写真レコードを全件返す。UI反映や並び替えは呼び出し側の責務。

   */

  async function getAllPhotos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, "readonly");
      const req = tx.objectStore(PHOTO_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || new Error("写真読込を中断しました"));
    });
  }

  /**
   * 写真1件をID指定で読み返す。保存直後検証にも利用する。
   */
  async function getPhoto(photoId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, "readonly");
      const req = tx.objectStore(PHOTO_STORE_NAME).get(photoId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("写真読込を中断しました"));
    });
  }

  function estimatePhotoBytes(photo) {
    const dataUrlChars = String(photo && photo.dataUrl || "").length;
    const baseDataUrlChars = String(photo && photo.baseDataUrl || "").length;
    // Base64本体は概ね3/4。ヘッダやその他metadataを考慮して概算値として扱う。
    return Math.round((dataUrlChars + baseDataUrlChars) * 0.75);
  }

  function normalizeStorageError(error) {
    return {
      name: String(error && error.name || "Error"),
      message: String(error && error.message || error || "不明なエラー")
    };
  }

  /**
   * 写真1件を保存し、transaction完了後に同じIDをread-backして実在確認する。
   * 戻り値は { ok, errorName, errorMessage, estimatedBytes }。
   */
  async function savePhoto(photo) {
    const estimatedBytes = estimatePhotoBytes(photo);
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
        const req = tx.objectStore(PHOTO_STORE_NAME).put(photo);
        tx.oncomplete = () => resolve();
        req.onerror = () => reject(req.error || new Error("写真putに失敗しました"));
        tx.onerror = () => reject(tx.error || new Error("写真保存transactionでエラーが発生しました"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      });

      const stored = await getPhoto(photo.id);
      if (!stored) throw new Error("保存直後の読み返しで写真が見つかりません");
      if (stored.id !== photo.id) throw new Error("保存直後の読み返しで写真IDが一致しません");
      if (!stored.dataUrl) throw new Error("保存直後の読み返しで完成画像が不足しています");

      // 元画像はカメラ撮影では必須だが、既存写真への看板添付では仕様上保持しない。
      // 保存前のphotoがbaseDataUrlを持っていた場合だけ、read-backでも存在確認する。
      if (photo.baseDataUrl && !stored.baseDataUrl) {
        throw new Error("保存直後の読み返しで元画像が不足しています");
      }

      return { ok: true, errorName: "", errorMessage: "", estimatedBytes };
    } catch (error) {
      const detail = normalizeStorageError(error);
      console.error("写真の端末内保存に失敗しました", { ...detail, estimatedBytes, photoId: photo && photo.id });
      return { ok: false, errorName: detail.name, errorMessage: detail.message, estimatedBytes };
    }
  }

  /**

   * 写真1件をID指定で削除する。

   */

  async function deletePhoto(photoId) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
      const req = tx.objectStore(PHOTO_STORE_NAME).delete(photoId);
      tx.oncomplete = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("写真削除を中断しました"));
    });
  }

  /**

   * 既存写真取込の途中状態を保存し、アプリ再起動後の再開を可能にする。

   */

  async function saveImportSession(session) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMPORT_SESSION_STORE_NAME, "readwrite");
      tx.objectStore(IMPORT_SESSION_STORE_NAME).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("一時保存を中断しました"));
    });
  }

  /**

   * 中断中の取込セッションを読み込み、存在しない場合はnullを返す。

   */

  async function loadImportSession() {
    try {
      const db = await openDB();
      if (!db.objectStoreNames.contains(IMPORT_SESSION_STORE_NAME)) return null;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IMPORT_SESSION_STORE_NAME, "readonly");
        const req = tx.objectStore(IMPORT_SESSION_STORE_NAME).get(ACTIVE_IMPORT_SESSION_ID);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error || new Error("一時データ読込を中断しました"));
      });
    } catch (error) {
      console.error("編集中写真の読込に失敗しました", error);
      return null;
    }
  }

  async function deleteImportSession() {
    try {
      const db = await openDB();
      if (!db.objectStoreNames.contains(IMPORT_SESSION_STORE_NAME)) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IMPORT_SESSION_STORE_NAME, "readwrite");
        const req = tx.objectStore(IMPORT_SESSION_STORE_NAME).delete(ACTIVE_IMPORT_SESSION_ID);
        tx.oncomplete = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("一時データ削除を中断しました"));
      });
    } catch (error) {
      console.error("編集中写真の削除に失敗しました", error);
    }
  }

  window.PhotoStore = Object.freeze({
    getAllPhotos,
    getPhoto,
    savePhoto,
    deletePhoto,
    saveImportSession,
    loadImportSession,
    deleteImportSession
  });
})();
