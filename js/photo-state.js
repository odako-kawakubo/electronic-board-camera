/*
 * ============================================================
 * photo-state.js - 画面側写真状態 / PhotoStore更新窓口
 * ============================================================
 * 責務:
 * - capturedPhotosを所有する
 * - 新規追加、更新、削除、DB再読込をPhotoStore成功後だけ画面状態へ確定する
 *
 * 保守上の注意:
 * - 永続正本はPhotoStore / IndexedDB。
 * - 他モジュールはcapturedPhotosを参照してよいが、push/splice/プロパティ変更はPhotoState経由にする。
 * ============================================================
 */

const capturedPhotos = [];

(function () {
  "use strict";

  function restoreObject(target, snapshot) {
    Object.keys(target).forEach((key) => {
      if (!(key in snapshot)) delete target[key];
    });
    Object.assign(target, snapshot);
  }

  async function reload() {
    const photos = await PhotoStore.getAllPhotos();
    photos.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    capturedPhotos.splice(0, capturedPhotos.length, ...photos);
    return capturedPhotos;
  }

  async function addNew(photo) {
    const result = await PhotoStore.savePhoto(photo);
    if (!result || !result.ok) return result || { ok: false, errorName: "UnknownError", errorMessage: "保存できませんでした" };
    capturedPhotos.push(photo);
    return result;
  }

  async function update(photo, mutator) {
    if (!photo || typeof mutator !== "function") {
      return { ok: false, errorName: "InvalidPhotoUpdate", errorMessage: "更新対象が不正です" };
    }
    const previous = { ...photo };
    mutator(photo);
    const result = await PhotoStore.savePhoto(photo);
    if (!result || !result.ok) {
      restoreObject(photo, previous);
      return result || { ok: false, errorName: "UnknownError", errorMessage: "保存できませんでした" };
    }
    return result;
  }

  async function deleteMany(photos) {
    const targets = Array.from(photos || []).filter(Boolean);
    const deletedIds = new Set();
    const failed = [];

    for (const photo of targets) {
      try {
        await PhotoStore.deletePhoto(photo.id);
        deletedIds.add(photo.id);
      } catch (error) {
        failed.push({ photo, error });
      }
    }

    if (deletedIds.size) {
      for (let i = capturedPhotos.length - 1; i >= 0; i--) {
        if (deletedIds.has(capturedPhotos[i].id)) capturedPhotos.splice(i, 1);
      }
    }

    return { ok: failed.length === 0, deletedIds, failed };
  }

  window.PhotoState = Object.freeze({
    items: capturedPhotos,
    reload,
    addNew,
    update,
    deleteMany
  });
})();
