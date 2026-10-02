/*
 * ============================================================
 * graph-session.js - Microsoft Graph専用セッション
 * ============================================================
 * しらべと同じ MSAL browser / redirect / localStorage 構成。
 * OneDrive送信処理はここへ入れない。
 */
(function () {
  "use strict";

  const PRIMARY_MSAL = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js";
  const FALLBACK_MSAL = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js";
  const listeners = [];
  let msalClient = null;
  let initPromise = null;
  let state = { initialized: false, account: null, tokenReady: false, error: "" };

  function cloneState() {
    return { ...state, account: state.account ? { ...state.account } : null };
  }

  function accountKey(account) {
    return [account?.homeAccountId || "", account?.username || "", account?.name || ""].join("|");
  }

  function publish(patch = {}) {
    const next = { ...state, ...patch };
    const changed = next.initialized !== state.initialized
      || next.tokenReady !== state.tokenReady
      || next.error !== state.error
      || accountKey(next.account) !== accountKey(state.account);
    state = next;
    if (!changed) return;
    listeners.slice().forEach((callback) => callback(cloneState()));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.msal) return resolve();
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`MSALライブラリを読み込めませんでした: ${src}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`MSALライブラリを読み込めませんでした: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureMsalLibrary() {
    if (window.msal) return;
    try {
      await loadScript(PRIMARY_MSAL);
    } catch (error) {
      await loadScript(FALLBACK_MSAL);
    }
    if (!window.msal) throw new Error("MSALライブラリを読み込めませんでした。");
  }

  function activeAccount() {
    if (!msalClient) return null;
    const active = msalClient.getActiveAccount?.();
    if (active) return active;
    const account = msalClient.getAllAccounts?.()?.[0] || null;
    if (account) msalClient.setActiveAccount(account);
    return account;
  }

  async function initialize() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        await ensureMsalLibrary();
        const config = window.MicrosoftConfig;
        if (!config?.graphClientId || !config?.tenantId) throw new Error("Microsoft認証設定がありません。");

        msalClient = new window.msal.PublicClientApplication({
          auth: {
            clientId: config.graphClientId,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
            redirectUri: window.location.origin + window.location.pathname
          },
          cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false }
        });

        try {
          const redirectResult = await msalClient.handleRedirectPromise();
          if (redirectResult?.account) msalClient.setActiveAccount(redirectResult.account);
        } catch (error) {
          publish({ error: error?.message || "Microsoftログイン結果を処理できませんでした。" });
        }

        const account = activeAccount();
        publish({ initialized: true, account, tokenReady: false });
        return cloneState();
      } catch (error) {
        publish({ initialized: false, account: null, tokenReady: false, error: error?.message || "Graphセッションを初期化できませんでした。" });
        initPromise = null;
        throw error;
      }
    })();
    return initPromise;
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

  async function login() {
    await initialize();
    const account = activeAccount();
    if (account) {
      publish({ account, error: "" });
      return account;
    }
    await msalClient.loginRedirect({
      scopes: window.MicrosoftConfig.graphScopes,
      prompt: "select_account"
    });
    return null;
  }

  async function getAccessToken({ allowInteractive = false } = {}) {
    await initialize();
    const account = activeAccount();
    if (!account) {
      publish({ account: null, tokenReady: false });
      const error = new Error("Microsoft Graphへログインしていません。");
      error.code = "GRAPH_LOGIN_REQUIRED";
      throw error;
    }

    try {
      const result = await msalClient.acquireTokenSilent({
        scopes: window.MicrosoftConfig.graphScopes,
        account
      });
      const token = result?.accessToken || "";
      if (!token) throw new Error("Graphアクセストークンが空です。");
      publish({ account, tokenReady: true, error: "" });
      return token;
    } catch (error) {
      publish({ account, tokenReady: false, error: error?.message || "Graphトークンを取得できませんでした。" });
      if (allowInteractive) {
        await msalClient.acquireTokenRedirect({
          scopes: window.MicrosoftConfig.graphScopes,
          account
        });
        return "";
      }
      const wrapped = new Error("Microsoft Graphトークンを取得できませんでした。再接続してください。");
      wrapped.code = "GRAPH_TOKEN_ACQUIRE_FAILED";
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async function logout() {
    await initialize();
    const account = activeAccount();
    publish({ account: null, tokenReady: false, error: "" });
    if (!account) return;
    await msalClient.logoutRedirect({
      account,
      postLogoutRedirectUri: window.location.origin + window.location.pathname
    });
  }

  window.GraphSession = Object.freeze({ initialize, getState, subscribe, login, getAccessToken, logout });
})();
