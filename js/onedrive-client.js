/*
 * ============================================================
 * onedrive-client.js - Microsoft Graph / OneDrive低レベルAPI
 * ============================================================
 * Graph認証はgraph-session、業務ルート解決はonedrive-rootが担当する。
 * この層ではGET/POSTなどGraph通信とdriveItemの正規化だけを扱う。
 */
(function () {
  "use strict";

  const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

  async function graphRequest(path, options = {}) {
    const token = await GraphSession.getAccessToken({ allowInteractive: false });
    const method = String(options.method || "GET").toUpperCase();
    const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
    let body = options.body;

    if (body && typeof body !== "string" && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      cache: "no-store"
    });

    if (!response.ok) {
      let detail = "";
      let graphCode = "";
      try {
        const payload = await response.json();
        detail = payload?.error?.message || "";
        graphCode = payload?.error?.code || "";
      } catch (error) {}
      const graphError = new Error(detail || `OneDrive通信に失敗しました (${response.status})`);
      graphError.status = response.status;
      graphError.graphCode = graphCode;
      graphError.code = response.status === 401 ? "GRAPH_UNAUTHORIZED"
        : response.status === 403 ? "GRAPH_FORBIDDEN"
          : response.status === 404 ? "GRAPH_NOT_FOUND"
            : response.status === 409 ? "GRAPH_CONFLICT"
              : "GRAPH_REQUEST_FAILED";
      throw graphError;
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function listPaged(path) {
    const items = [];
    let nextPath = path;
    while (nextPath) {
      const payload = await graphRequest(nextPath);
      items.push(...(payload?.value || []));
      const nextLink = payload?.["@odata.nextLink"] || "";
      nextPath = nextLink.startsWith(GRAPH_BASE) ? nextLink.slice(GRAPH_BASE.length) : "";
    }
    return items;
  }

  function base64UrlEncodeUtf8(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  function sharedLinkId(url) {
    return `u!${base64UrlEncodeUtf8(url)}`;
  }

  function refForItem(item, fallbackDriveId = "") {
    const remote = item?.remoteItem || null;
    const source = remote || item || {};
    return {
      driveId: String(source?.parentReference?.driveId || item?.parentReference?.driveId || fallbackDriveId || ""),
      itemId: String(source?.id || item?.id || ""),
      id: String(source?.id || item?.id || ""),
      name: String(source?.name || item?.name || ""),
      folder: source?.folder || item?.folder || null,
      file: source?.file || item?.file || null,
      parentReference: source?.parentReference || item?.parentReference || null,
      webUrl: source?.webUrl || item?.webUrl || "",
      remoteItem: remote
    };
  }

  function normalizeRef(value) {
    if (value && typeof value === "object") {
      return {
        driveId: String(value.driveId || ""),
        itemId: String(value.itemId || value.id || "")
      };
    }
    return { driveId: "", itemId: String(value || "") };
  }

  async function resolveSharedUrl(sharedUrl) {
    const url = String(sharedUrl || "").trim();
    if (!url) {
      const error = new Error("OneDrive共有URLが設定されていません。");
      error.code = "SHARED_URL_MISSING";
      throw error;
    }
    const shareId = sharedLinkId(url);
    const item = await graphRequest(`/shares/${encodeURIComponent(shareId)}/driveItem?$select=id,name,folder,webUrl,parentReference,remoteItem`);
    const ref = refForItem(item);
    if (!ref.driveId || !ref.itemId) {
      const error = new Error("共有URLからフォルダのdriveId/itemIdを取得できませんでした。");
      error.code = "SHARED_URL_RESOLVE_FAILED";
      throw error;
    }
    return ref;
  }

  async function searchDriveFolders(keyword) {
    const query = String(keyword || "").trim();
    if (!query) return [];
    const safe = query.replace(/'/g, "''");
    const items = await listPaged(`/me/drive/root/search(q='${encodeURIComponent(safe)}')?$select=id,name,folder,webUrl,parentReference,remoteItem`);
    return items
      .map((item) => refForItem(item))
      .filter((item) => (item.folder || item.remoteItem?.folder) && item.driveId && item.itemId);
  }

  async function getDriveItem(itemRef) {
    const ref = normalizeRef(itemRef);
    if (!ref.driveId || !ref.itemId) return null;
    const item = await graphRequest(`/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}?$select=id,name,folder,file,webUrl,parentReference,remoteItem`);
    return refForItem(item, ref.driveId);
  }

  async function listDriveChildren(parentRef) {
    const ref = normalizeRef(parentRef);
    if (!ref.driveId || !ref.itemId) throw new Error("OneDriveフォルダを特定できません。");
    const items = await listPaged(`/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/children?$select=id,name,folder,file,parentReference,webUrl,remoteItem&$top=200`);
    return items.map((item) => refForItem(item, ref.driveId));
  }

  async function findChildFolder(parentRef, folderName) {
    const expected = String(folderName || "").trim();
    if (!expected) return null;
    const children = await listDriveChildren(parentRef);
    return children.find((item) => item.folder && String(item.name || "").trim() === expected) || null;
  }

  async function createChildFolder(parentRef, folderName) {
    const ref = normalizeRef(parentRef);
    const name = String(folderName || "").trim();
    if (!ref.driveId || !ref.itemId) throw new Error("作成先のOneDriveフォルダを特定できません。");
    if (!name) throw new Error("作成するフォルダ名が空です。");

    const item = await graphRequest(
      `/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/children`,
      {
        method: "POST",
        body: {
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail"
        }
      }
    );
    return refForItem(item, ref.driveId);
  }

  async function ensureChildFolder(parentRef, folderName) {
    const existing = await findChildFolder(parentRef, folderName);
    if (existing) return { ...existing, created: false };

    try {
      const created = await createChildFolder(parentRef, folderName);
      return { ...created, created: true };
    } catch (error) {
      // 別端末が同名フォルダを先に作った競合は、再検索して同じフォルダへ合流する。
      if (error?.status === 409 || error?.code === "GRAPH_CONFLICT") {
        const raced = await findChildFolder(parentRef, folderName);
        if (raced) return { ...raced, created: false };
      }
      throw error;
    }
  }

  window.OneDriveClient = Object.freeze({
    resolveSharedUrl,
    searchDriveFolders,
    getDriveItem,
    listDriveChildren,
    findChildFolder,
    createChildFolder,
    ensureChildFolder
  });
})();
