(function () {
  "use strict";

  const DB_NAME = "electronic-board-camera-prototype";
  const DB_VERSION = 2;
  const PHOTO_STORE_NAME = "photos";
  const IMPORT_SESSION_STORE_NAME = "importSessions";
  const ACTIVE_IMPORT_SESSION_ID = "active";

  let dbInstance = null;

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

  async function savePhoto(photo) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
        const req = tx.objectStore(PHOTO_STORE_NAME).put(photo);
        tx.oncomplete = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      });
      return true;
    } catch (error) {
      console.error("写真の端末内保存に失敗しました", error);
      return false;
    }
  }

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
    savePhoto,
    deletePhoto,
    saveImportSession,
    loadImportSession,
    deleteImportSession
  });
})();
