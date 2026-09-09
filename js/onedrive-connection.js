/*
 * ============================================================
 * onedrive-connection.js - OneDrive接続状態の正本
 * ============================================================
 * 責務:
 * - Microsoftログイン状態とは別に、Graph経由でOneDriveへ実アクセス可能か確認する
 * - トップUIへ公開する接続状態を一元管理する
 *
 * v65.31では写真送信・フォルダ生成は行わない。
 * ============================================================
 */
(function () {
  "use strict";

  const listeners = [];
  let generation = 0;
  let initialized = false;
  let state = {
    phase: "unconnected",
    connected: false,
    text: "未接続",
    error: "",
    driveId: ""
  };

  function cloneState() {
    return { ...state };
  }

  function publish(next) {
    state = { ...next };
    listeners.slice().forEach((callback) => callback(cloneState()));
  }

  function getState() {
    return cloneState();
  }

  function subscribe(callback) {
    listeners.push(callback);
    callback(cloneState());
    return () => {
      const index = listeners.indexOf(callback);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function disconnected(text = "未接続", error = "") {
    return { phase: "unconnected", connected: false, text, error, driveId: "" };
  }

  async function fetchDriveRoot(token) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType,webUrl", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error?.message || body?.error?.code || "";
      } catch (error) {}
      const graphError = new Error(detail || `OneDrive接続確認に失敗しました (${response.status})`);
      graphError.status = response.status;
      throw graphError;
    }
    const drive = await response.json();
    if (!drive?.id) throw new Error("OneDriveのdriveIdを確認できませんでした。");
    return drive;
  }

  async function refresh({ force = false } = {}) {
    const currentGeneration = ++generation;

    if (navigator.onLine === false) {
      publish(disconnected("オフライン"));
      return cloneState();
    }

    await GraphSession.initialize().catch(() => null);
    const graph = GraphSession.getState();
    if (!graph.account) {
      publish(disconnected("未接続"));
      return cloneState();
    }

    publish({ phase: "checking", connected: false, text: "確認中", error: "", driveId: "" });

    try {
      const token = await GraphSession.getAccessToken({ allowInteractive: false });
      if (!token) throw new Error("Graphアクセストークンを取得できませんでした。");
      const drive = await fetchDriveRoot(token);
      if (currentGeneration != generation) return cloneState();
      publish({
        phase: "connected",
        connected: true,
        text: "接続",
        error: "",
        driveId: String(drive.id || "")
      });
    } catch (error) {
      if (currentGeneration != generation) return cloneState();
      publish({
        phase: "error",
        connected: false,
        text: "エラー",
        error: error?.message || "OneDriveへ接続できません。",
        driveId: ""
      });
    }
    return cloneState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    GraphSession.subscribe(() => void refresh());
    window.addEventListener("online", () => void refresh({ force: true }));
    window.addEventListener("offline", () => void refresh());
    void refresh();
  }

  window.OneDriveConnection = Object.freeze({ getState, subscribe, refresh, initialize });
})();
