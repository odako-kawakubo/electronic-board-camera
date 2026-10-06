/*
 * ============================================================
 * storage-manager.js - 端末ストレージ状態 / 永続化要求
 * ============================================================
 * 責務:
 * - StorageManager APIが利用可能ならpersistent storageを要求する
 * - IndexedDB内の写真データ量をアプリ自身で集計する
 * - PWA全体の推定使用量 / 推定空き容量 / 推定撮影可能枚数を設定画面へ表示する
 *
 * 保守上の注意:
 * - 写真本体はここへ保存しない。正本はPhotoStore / IndexedDB。
 * - persist() がfalseでも保存失敗ではない。通常のIndexedDB保存は継続する。
 * - navigator.storage.estimate() はブラウザ側の推定値。写真容量の実測表示とは分けて扱う。
 * ============================================================
 */

    const storagePersistenceText = document.getElementById("storagePersistenceText");
    const storageUsageText = document.getElementById("storageUsageText");

    document.addEventListener("DOMContentLoaded", async () => {
      await initializePersistentStorage();
    });

    async function initializePersistentStorage() {
      try {
        if (!navigator.storage) {
          await refreshStorageStatusUI(null, false);
          return;
        }

        let persistent = null;
        if (typeof navigator.storage.persisted === "function") {
          persistent = await navigator.storage.persisted();
        }

        if (persistent === false && typeof navigator.storage.persist === "function") {
          try {
            persistent = await navigator.storage.persist();
          } catch (error) {
            console.log("永続ストレージ要求を利用できませんでした", error);
          }
        }

        await refreshStorageStatusUI(persistent, true);
      } catch (error) {
        console.log("端末ストレージ状態の確認に失敗しました", error);
        renderStorageStatus({
          supported: Boolean(navigator.storage),
          persistent: null,
          usage: null,
          quota: null,
          photoCount: null,
          photoBytes: null,
          averagePhotoBytes: null,
          remainingPhotos: null
        });
      }
    }

    async function getPhotoStorageMetrics() {
      try {
        if (!window.PhotoStore || typeof PhotoStore.getAllPhotos !== "function") {
          return { photoCount: null, photoBytes: null, averagePhotoBytes: null };
        }

        const photos = await PhotoStore.getAllPhotos();
        let photoBytes = 0;

        for (const photo of photos) {
          const completedChars = String(photo && photo.dataUrl || "").length;
          const originalChars = String(photo && photo.baseDataUrl || "").length;
          // data URLのBase64部分は概ね文字数×3/4。metadataは小さいため概算から除外する。
          photoBytes += Math.round((completedChars + originalChars) * 0.75);
        }

        return {
          photoCount: photos.length,
          photoBytes,
          averagePhotoBytes: photos.length ? photoBytes / photos.length : null
        };
      } catch (error) {
        console.log("写真データ容量の集計に失敗しました", error);
        return { photoCount: null, photoBytes: null, averagePhotoBytes: null };
      }
    }

    async function refreshStorageStatusUI(knownPersistent = null, storageSupported = Boolean(navigator.storage)) {
      let persistent = knownPersistent;
      let usage = null;
      let quota = null;

      if (storageSupported && navigator.storage) {
        if (persistent === null && typeof navigator.storage.persisted === "function") {
          try {
            persistent = await navigator.storage.persisted();
          } catch (error) {}
        }

        if (typeof navigator.storage.estimate === "function") {
          try {
            const estimate = await navigator.storage.estimate();
            usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
            quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
          } catch (error) {}
        }
      }

      const photoMetrics = await getPhotoStorageMetrics();
      const estimatedFreeBytes = usage !== null && quota !== null ? Math.max(0, quota - usage) : null;
      let remainingPhotos = null;

      if (estimatedFreeBytes !== null && photoMetrics.averagePhotoBytes && photoMetrics.averagePhotoBytes > 0) {
        // quota/usage自体が推定値なので、残り枚数も整数の概算として扱う。
        remainingPhotos = Math.max(0, Math.floor(estimatedFreeBytes / photoMetrics.averagePhotoBytes));
      }

      renderStorageStatus({
        supported: storageSupported,
        persistent,
        usage,
        quota,
        ...photoMetrics,
        remainingPhotos
      });
    }

    function renderStorageStatus(status) {
      if (storagePersistenceText) {
        if (!status.supported) {
          storagePersistenceText.textContent = "通常保存（永続化API非対応）";
        } else if (status.persistent === true) {
          storagePersistenceText.textContent = "永続化済み";
        } else if (status.persistent === false) {
          storagePersistenceText.textContent = "通常保存";
        } else {
          storagePersistenceText.textContent = "状態確認不可";
        }
      }

      if (!storageUsageText) return;

      const lines = [];
      if (status.photoCount === null || status.photoBytes === null) {
        lines.push("写真データ：確認不可");
      } else {
        lines.push(`写真：${status.photoCount}枚 / 約${formatStorageBytes(status.photoBytes)}`);
      }

      if (status.usage === null) {
        lines.push("PWA全体：推定使用量を確認できません");
      } else if (status.quota === null) {
        lines.push(`PWA全体：推定 ${formatStorageBytes(status.usage)}`);
      } else {
        const free = Math.max(0, status.quota - status.usage);
        lines.push(`PWA全体：推定 ${formatStorageBytes(status.usage)} / ${formatStorageBytes(status.quota)}`);
        lines.push(`推定空き容量：約${formatStorageBytes(free)}`);
      }

      if (status.remainingPhotos === null) {
        lines.push(status.photoCount === 0 ? "推定撮影可能枚数：1枚撮影後に算出" : "推定撮影可能枚数：算出不可");
      } else {
        lines.push(`推定撮影可能枚数：約${formatPhotoCount(status.remainingPhotos)}枚`);
      }

      storageUsageText.innerHTML = lines.join("<br>");
    }

    function formatPhotoCount(count) {
      const value = Math.max(0, Math.floor(Number(count) || 0));
      if (value >= 10000) return `${Math.floor(value / 1000) * 1000}+`;
      if (value >= 1000) return `${Math.floor(value / 100) * 100}`;
      if (value >= 100) return `${Math.floor(value / 10) * 10}`;
      return String(value);
    }

    function formatStorageBytes(bytes) {
      const value = Math.max(0, Number(bytes) || 0);
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
