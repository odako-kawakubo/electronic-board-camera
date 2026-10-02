/*
 * ============================================================
 * microsoft-auth-ui.js - Microsoftログイン表示
 * ============================================================
 * トップ画面のログイン/アカウント表示だけを担当する。
 */
(function () {
  "use strict";

  const signinButton = document.getElementById("msAuthButton");
  const accountButton = document.getElementById("msAccountButton");
  const accountName = document.getElementById("msAccountName");

  function displayAccountName(account) {
    return String(account?.name || account?.username || "Microsoftアカウント").trim();
  }

  function render(state) {
    if (!signinButton || !accountButton) return;
    const loggedIn = Boolean(state?.account);
    signinButton.hidden = loggedIn;
    accountButton.hidden = !loggedIn;
    if (accountName) accountName.textContent = loggedIn ? displayAccountName(state.account) : "";

  }


  async function loginMicrosoftGraph() {
    try {
      await GraphSession.login();
    } catch (error) {
      console.error("Microsoftログイン開始失敗", error);
      showErrorToast("Microsoftログインを開始できませんでした");
    }
  }

  async function logoutMicrosoftGraph() {
    const state = GraphSession.getState();
    if (!state.account) return;
    const ok = window.confirm(`${displayAccountName(state.account)}\n\nMicrosoftからログアウトしますか？`);
    if (!ok) return;
    try {
      await GraphSession.logout();
    } catch (error) {
      console.error("Microsoftログアウト失敗", error);
      showErrorToast("Microsoftログアウトに失敗しました");
    }
  }

  async function reconnectMicrosoftOneDrive() {
    const button = document.getElementById("topReconnectButton");
    if (button) {
      button.disabled = true;
      button.textContent = "接続中";
    }

    try {
      if (navigator.onLine === false) throw new Error("オフラインです。");

      await GraphSession.initialize();
      const state = GraphSession.getState();

      // アカウント自体が無い場合はMSALログインへ。redirect後に接続確認を続ける。
      if (!state.account) {
        await GraphSession.login();
        return;
      }

      // 既存セッションのtokenを取り直し、その後03 サンプリングまで実アクセス確認する。
      await GraphSession.getAccessToken({ allowInteractive: true });
      await OneDriveConnection.refresh({ force: true });

      const connected = OneDriveConnection.getState().connected;
      if (!connected) throw new Error(OneDriveConnection.getState().error || "OneDriveへ接続できませんでした。");

      if (window.PhotoOneDriveSync?.requestSync) PhotoOneDriveSync.requestSync();
      if (typeof showToast === "function") showToast("Microsoft / OneDriveへ再接続しました");
    } catch (error) {
      console.error("Microsoft / OneDrive再接続失敗", error);
      if (typeof showErrorToast === "function") showErrorToast("再接続できませんでした");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "再接続";
      }
    }
  }

  async function verifyMicrosoftGraphSession() {
    try {
      await GraphSession.initialize();
      const state = GraphSession.getState();
      if (state.account && navigator.onLine !== false) {
        await GraphSession.getAccessToken().catch(() => null);
      }
    } catch (error) {
      // 認証が使えない状態でも、カメラPWA本体の起動は止めない。
      console.log("Microsoft認証初期化をスキップ", error);
    }
    render(GraphSession.getState());
  }

  window.loginMicrosoftGraph = loginMicrosoftGraph;
  window.logoutMicrosoftGraph = logoutMicrosoftGraph;
  window.reconnectMicrosoftOneDrive = reconnectMicrosoftOneDrive;
  window.verifyMicrosoftGraphSession = verifyMicrosoftGraphSession;

  document.addEventListener("DOMContentLoaded", () => {
    GraphSession.subscribe(render);
    void verifyMicrosoftGraphSession();
  });

  window.addEventListener("online", () => void verifyMicrosoftGraphSession());
  window.addEventListener("offline", () => render(GraphSession.getState()));
})();
