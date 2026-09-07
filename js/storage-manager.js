/*
 * ============================================================
 * storage-manager.js - 端末ストレージ状態 / 永続化要求
 * ============================================================
 * 責務:
 * - StorageManager APIが利用可能ならpersistent storageを要求する
 * - 現在の永続化状態と推定使用量を設定画面へ表示する
 *
 * 保守上の注意:
 * - 写真本体はここへ保存しない。正本はPhotoStore / IndexedDB。
 * - persist() がfalseでも保存失敗ではない。通常のIndexedDB保存は継続する。
 * - API非対応端末でもアプリ起動・撮影を止めない。
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
          renderStorageStatus({ supported: false, persistent: null, usage: null, quota: null });
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

        await refreshStorageStatusUI(persistent);
      } catch (error) {
        console.log("端末ストレージ状態の確認に失敗しました", error);
        renderStorageStatus({ supported: true, persistent: null, usage: null, quota: null });
      }
    }

    async function refreshStorageStatusUI(knownPersistent = null) {
      if (!navigator.storage) {
        renderStorageStatus({ supported: false, persistent: null, usage: null, quota: null });
        return;
      }

      let persistent = knownPersistent;
      if (persistent === null && typeof navigator.storage.persisted === "function") {
        try {
          persistent = await navigator.storage.persisted();
        } catch (error) {}
      }

      let usage = null;
      let quota = null;
      if (typeof navigator.storage.estimate === "function") {
        try {
          const estimate = await navigator.storage.estimate();
          usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
          quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
        } catch (error) {}
      }

      renderStorageStatus({ supported: true, persistent, usage, quota });
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

      if (storageUsageText) {
        if (status.usage === null) {
          storageUsageText.textContent = "使用量：確認不可";
        } else if (status.quota === null) {
          storageUsageText.textContent = `使用量：約${formatStorageBytes(status.usage)}`;
        } else {
          storageUsageText.textContent = `使用量：約${formatStorageBytes(status.usage)} / ${formatStorageBytes(status.quota)}`;
        }
      }
    }

    function formatStorageBytes(bytes) {
      const value = Math.max(0, Number(bytes) || 0);
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
