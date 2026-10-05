/*
 * ============================================================
 * onedrive-connection.js - OneDrive接続状態の正本
 * ============================================================
 * Microsoftログインとは別に、看板カメラが必要とするOneDrive業務ルートを確認する。
 * 接続条件:
 * - 「03 サンプリング」を解決・検証できる
 * - そのchildrenを読める
 * - 直下の「サンプリング写真」を解決・検証できる
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
    errorCode: "",
    root: null,
    projectRoot: null,
    photoRoot: null,
    rootSource: ""
  };

  function cloneRef(ref) {
    return ref ? { ...ref } : null;
  }

  function cloneState() {
    return {
      ...state,
      root: cloneRef(state.root),
      projectRoot: cloneRef(state.projectRoot),
      photoRoot: cloneRef(state.photoRoot)
    };
  }

  function publish(next) {
    state = {
      ...next,
      root: cloneRef(next.root),
      projectRoot: cloneRef(next.projectRoot),
      photoRoot: cloneRef(next.photoRoot)
    };
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

  function unavailableState(text = "未接続", error = "", errorCode = "") {
    return {
      phase: "unconnected",
      connected: false,
      text,
      error,
      errorCode,
      root: null,
      projectRoot: null,
      photoRoot: null,
      rootSource: ""
    };
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

    // 正式案件一覧を読む起点でもあるためchildrenまで取得できることを条件にする。
    await OneDriveClient.listDriveChildren(verified);
    return { ...verified, rootSource: candidate.rootSource || "" };
  }

  async function verifyPhotoRoot(candidate) {
    const verified = await OneDriveClient.getDriveItem(candidate);
    if (!verified?.folder || !verified.driveId || !verified.itemId) {
      const error = new Error("サンプリング写真フォルダへアクセスできませんでした。");
      error.code = "SAMPLING_PHOTO_ROOT_VERIFY_FAILED";
      throw error;
    }
    if (String(verified.name || "").trim() !== "サンプリング写真") {
      const error = new Error(`写真保存先「${verified.name || "-"}」が想定と一致しません。`);
      error.code = "SAMPLING_PHOTO_ROOT_NAME_MISMATCH";
      throw error;
    }
    await OneDriveClient.listDriveChildren(verified);
    return verified;
  }

  async function getUsableSamplingContext({ force = false } = {}) {
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
    const root = await verifyResolvedRoot(candidate);
    const photoCandidate = await OneDriveRoot.getSamplingPhotoRoot({ force: false });
    const photoRoot = await verifyPhotoRoot(photoCandidate);

    return {
      root,
      projectRoot: { ...root },
      photoRoot,
      rootSource: root.rootSource || ""
    };
  }

  async function getUsableSamplingRoot({ force = false } = {}) {
    const context = await getUsableSamplingContext({ force });
    return context.root;
  }

  async function refresh({ force = false } = {}) {
    const currentGeneration = ++generation;

    if (navigator.onLine === false) {
      OneDriveRoot.clearSamplingRoot();
      publish({
        ...unavailableState("オフライン", "", "NETWORK_OFFLINE"),
        phase: "offline"
      });
      return cloneState();
    }

    await GraphSession.initialize().catch(() => null);
    const graph = GraphSession.getState();
    if (!graph.account) {
      OneDriveRoot.clearSamplingRoot();
      publish(unavailableState("未接続", graph.error || "", "GRAPH_LOGIN_REQUIRED"));
      return cloneState();
    }

    publish({
      phase: "checking",
      connected: false,
      text: "確認中",
      error: "",
      errorCode: "",
      root: OneDriveRoot.getCachedSamplingRoot(),
      projectRoot: OneDriveRoot.getCachedSamplingRoot(),
      photoRoot: OneDriveRoot.getCachedSamplingPhotoRoot(),
      rootSource: OneDriveRoot.getCachedSamplingRoot()?.rootSource || ""
    });

    try {
      const context = await getUsableSamplingContext({ force });
      if (currentGeneration !== generation) return cloneState();
      publish({
        phase: "connected",
        connected: true,
        text: "接続",
        error: "",
        errorCode: "",
        root: context.root,
        projectRoot: context.projectRoot,
        photoRoot: context.photoRoot,
        rootSource: context.rootSource
      });
    } catch (error) {
      if (currentGeneration !== generation) return cloneState();
      OneDriveRoot.clearSamplingRoot();
      const errorCode = String(error?.code || error?.graphCode || "");
      const authRequired = errorCode === "GRAPH_TOKEN_ACQUIRE_FAILED";
      const offline = errorCode === "NETWORK_OFFLINE";
      publish({
        phase: offline ? "offline" : (authRequired ? "auth-required" : "error"),
        connected: false,
        text: offline ? "オフライン" : (authRequired ? "再接続必要" : "接続エラー"),
        error: error?.message || "OneDriveへ接続できません。",
        errorCode,
        root: null,
        projectRoot: null,
        photoRoot: null,
        rootSource: ""
      });
    }
    return cloneState();
  }

  function setReconnectRequiredForTest() {
    publish({
      phase: "auth-required",
      connected: false,
      text: "再接続必要",
      error: "テスト用に再接続必要状態へ切り替えました。",
      errorCode: "TEST_AUTH_REQUIRED",
      root: null,
      projectRoot: null,
      photoRoot: null,
      rootSource: ""
    });
    return cloneState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    GraphSession.subscribe(() => void refresh({ force: true }));
    window.addEventListener("online", () => void refresh({ force: true }));
    window.addEventListener("offline", () => void refresh());

    // iPhone/iPadなどで長時間バックグラウンド後にGraphトークンが
    // 失効している場合があるため、PWA復帰時に実接続を再確認する。
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void refresh();
    });
    window.addEventListener("pageshow", () => void refresh());

    void refresh();
  }

  window.OneDriveConnection = Object.freeze({
    getState,
    subscribe,
    refresh,
    initialize,
    getUsableSamplingRoot,
    getUsableSamplingContext,
    setReconnectRequiredForTest
  });
})();
