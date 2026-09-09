/*
 * ============================================================
 * microsoft-auth-ui.js - Microsoftログイン表示
 * ============================================================
 * 設定画面のログイン/アカウント表示だけを担当する。
 */
(function () {
  "use strict";

  const signinButton = document.getElementById("msAuthButton");
  const accountButton = document.getElementById("msAccountButton");
  const accountName = document.getElementById("msAccountName");
  const statusText = document.getElementById("msAuthStatusText");

  function displayAccountName(account) {
    return String(account?.name || account?.username || "Microsoftアカウント").trim();
  }

  function render(state) {
    if (!signinButton || !accountButton || !statusText) return;
    const loggedIn = Boolean(state?.account);
    signinButton.hidden = loggedIn;
    accountButton.hidden = !loggedIn;
    if (accountName) accountName.textContent = loggedIn ? displayAccountName(state.account) : "";

    if (!state?.initialized && state?.error) {
      statusText.textContent = navigator.onLine === false ? "オフライン（ログイン確認不可）" : "認証準備エラー";
    } else if (!loggedIn) {
      statusText.textContent = "未ログイン";
    } else if (state.tokenReady) {
      statusText.textContent = "ログイン済み・Graph接続可";
    } else if (navigator.onLine === false) {
      statusText.textContent = "ログイン済み（オフライン）";
    } else {
      statusText.textContent = "ログイン済み";
    }
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
  window.verifyMicrosoftGraphSession = verifyMicrosoftGraphSession;

  document.addEventListener("DOMContentLoaded", () => {
    GraphSession.subscribe(render);
    void verifyMicrosoftGraphSession();
  });

  window.addEventListener("online", () => void verifyMicrosoftGraphSession());
  window.addEventListener("offline", () => render(GraphSession.getState()));
})();
