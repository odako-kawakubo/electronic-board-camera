/*
 * ============================================================
 * onedrive-connection.js - OneDrive接続状態の正本
 * ============================================================
 * Microsoftログインとは別に、「03 サンプリング」を実際に使用できるか確認する。
 * v65.32では写真送信・フォルダ作成は行わない。
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
    root: null,
    rootSource: ""
  };

  function cloneState() {
    return { ...state, root: state.root ? { ...state.root } : null };
  }

  function publish(next) {
    state = { ...next, root: next.root ? { ...next.root } : null };
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

  function unavailableState(text = "未接続", error = "") {
    return { phase: "unconnected", connected: false, text, error, root: null, rootSource: "" };
  }

  function isExpectedRootName(name) {
    const expected = String(MicrosoftConfig.samplingRootName || "").trim();
    const actual = String(name || "").trim();
    return Boolean(expected && actual && (actual === expected || actual.includes(expected)));
  }

  async function verifyResolvedRoot(candidate) {
    const verified = await OneDriveClient.getDriveItem(candidate);
    if (!verified?.folder || !verified.driveId || !verified.itemId) {
      const error = new Error("03 サンプリングの実体へアクセスできませんでした。");
      error.code = "SAMPLING_ROOT_VERIFY_FAILED";
      throw error;
    }
    if (!isExpectedRootName(verified.name)) {
      const error = new Error(`接続先「${verified.name || "-"}」は「${MicrosoftConfig.samplingRootName}」ではありません。`);
      error.code = "SAMPLING_ROOT_NAME_MISMATCH";
      throw error;
    }

    // 実運用で子フォルダを読むため、childrenまで取得できることを接続条件にする。
    await OneDriveClient.listDriveChildren(verified);
    return { ...verified, rootSource: candidate.rootSource || "" };
  }

  async function getUsableSamplingRoot({ force = false } = {}) {
    if (navigator.onLine === false) {
      const error = new Error("圏外です。");
      error.code = "NETWORK_OFFLINE";
      throw error;
    }
    await GraphSession.initialize();
    if (!GraphSession.getState().account) {
      const error = new Error("Microsoft Graphへログインしていません。");
      error.code = "GRAPH_LOGIN_REQUIRED";
      throw error;
    }
    await GraphSession.getAccessToken({ allowInteractive: false });
    const candidate = await OneDriveRoot.getSamplingRoot({ force });
    return verifyResolvedRoot(candidate);
  }

  async function refresh({ force = false } = {}) {
    const currentGeneration = ++generation;

    if (navigator.onLine === false) {
      OneDriveRoot.clearSamplingRoot();
      publish(unavailableState("オフライン"));
      return cloneState();
    }

    await GraphSession.initialize().catch(() => null);
    const graph = GraphSession.getState();
    if (!graph.account) {
      OneDriveRoot.clearSamplingRoot();
      publish(unavailableState("未接続", graph.error || ""));
      return cloneState();
    }

    publish({
      phase: "checking",
      connected: false,
      text: "確認中",
      error: "",
      root: OneDriveRoot.getCachedSamplingRoot(),
      rootSource: OneDriveRoot.getCachedSamplingRoot()?.rootSource || ""
    });

    try {
      const root = await getUsableSamplingRoot({ force });
      if (currentGeneration !== generation) return cloneState();
      publish({
        phase: "connected",
        connected: true,
        text: "接続",
        error: "",
        root,
        rootSource: root.rootSource || ""
      });
    } catch (error) {
      if (currentGeneration !== generation) return cloneState();
      OneDriveRoot.clearSamplingRoot();
      publish({
        phase: "error",
        connected: false,
        text: "未接続",
        error: error?.message || "OneDriveへ接続できません。",
        root: null,
        rootSource: ""
      });
    }
    return cloneState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    GraphSession.subscribe(() => void refresh({ force: true }));
    window.addEventListener("online", () => void refresh({ force: true }));
    window.addEventListener("offline", () => void refresh());
    void refresh();
  }

  window.OneDriveConnection = Object.freeze({
    getState,
    subscribe,
    refresh,
    initialize,
    getUsableSamplingRoot
  });
})();
