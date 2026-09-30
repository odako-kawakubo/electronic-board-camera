/*
 * ============================================================
 * tutorial.js - 実画面チュートリアル
 * ============================================================
 * 責務:
 * - 実際の画面要素をハイライトし、撮影操作を順番に案内する
 * - 既存案件 / 新規案件の2ルートを管理する
 * - チュートリアル専用案件をOneDriveへ送らず、途中位置を端末内に保持する
 * ============================================================
 */
(function () {
  "use strict";

  const STATE_KEY = "electronic-board-camera-tutorial-state-v1";
  const PREVIOUS_CASE_KEY = "electronic-board-camera-tutorial-previous-case-v1";
  const TUTORIAL_CASE_IDS = new Set(["TUTORIAL_EXISTING", "TUTORIAL_NEW"]);

  const layer = document.getElementById("tutorialLayer");
  const bubble = document.getElementById("tutorialBubble");
  const title = document.getElementById("tutorialTitle");
  const text = document.getElementById("tutorialText");
  const progress = document.getElementById("tutorialProgress");
  const nextButton = document.getElementById("tutorialNextButton");
  const stopButton = document.getElementById("tutorialStopButton");

  let state = loadState();
  let activeTarget = null;
  let cleanupAction = null;
  let renderTimer = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "null") || { active:false, route:"", stepIndex:0 };
    } catch (_) {
      return { active:false, route:"", stepIndex:0 };
    }
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function isRunning() {
    return Boolean(state.active);
  }

  function shouldUseTutorialNewCase() {
    return isRunning() && state.route === "new" && state.stepIndex === 0;
  }

  function getSteps(route) {
    const commonTail = [
      { id:"done", target:"#boardEditDoneButton", title:"看板編集を完了", text:"入力内容を確認したら「完了」を押します。", action:"click" },
      { id:"camera", target:"#startButton", title:"カメラを起動", text:"「カメラ起動」を押して撮影を始めます。", action:"click", waitFor:"#shootButton:not(.hidden-control)" },
      { id:"shoot", target:"#shootButton", title:"撮影", text:"構図と看板を確認して「撮影」を押します。", action:"click", waitFor:"#captureReviewOverlay.show" },
      { id:"review", target:".capture-review-ok", title:"撮影確認", text:"問題なければ「OK」。撮り直したい場合は左の「撮り直し」を使います。", action:"click", waitFor:"#viewButton:not(.hidden-control)" },
      { id:"saved", target:"#viewButton", title:"アプリ内に保存", text:"OKにすると写真はまずこのアプリ内へ保存されます。「表示」を押して確認します。", action:"click", waitFor:"#previewOverlay.show" },
      { id:"list", target:"#previewImageWrap", title:"写真一覧", text:"撮影した写真を確認できます。チュートリアル案件はOneDriveへ送信しません。通常案件では緑の●がOneDrive保存完了です。", action:"next" }
    ];

    if (route === "new") {
      return [
        { id:"new", target:".launch-new-case-button", title:"新規案件から撮影", text:"「新規案件」を押します。チュートリアル中は実案件ではなく練習用の新規案件を作ります。", action:"click" },
        { id:"board", target:"#photoBoard", title:"まず看板を設定", text:"新規案件では案件名・住所から設定します。看板をダブルタップしてください。", action:"double", waitFor:"#boardEditOverlay.show" },
        { id:"subject", target:"#boardEditSubject", title:"案件名", text:"練習用の案件名を入力してください。", action:"input" },
        { id:"address", target:"#boardEditAddress", title:"住所", text:"調査場所の住所を入力してください。", action:"input" },
        { id:"room", target:"#boardEditRoom", title:"採取箇所", text:"採取する場所を入力してください。例：1階 廊下 壁", action:"input" },
        { id:"sample", target:"#boardEditSample", title:"試料No.", text:"試料No.を確認します。必要に応じて変更できます。", action:"next" },
        { id:"mode", target:"#editBoardModeButton", title:"サンプリングモード", text:"採取写真ではサンプリングを使います。初期状態もサンプリングです。", action:"next" },
        { id:"status", target:"#boardEditStatus", title:"写真区分", text:"施工前・施工中・施工後から撮影する区分を選びます。", action:"next" },
        ...commonTail
      ];
    }

    return [
      { id:"select", target:".launch-case-select-button", title:"既存案件から撮影", text:"まず「案件選択」を押します。", action:"click" },
      { id:"tutorial-case", target:"#tutorialCaseButton", title:"チュートリアル案件", text:"ログインしていなくても使える練習用案件です。これを選択してください。", action:"click" },
      { id:"board", target:"#photoBoard", title:"看板情報を設定", text:"既存案件では案件名と住所は入っています。採取箇所を設定するため、看板をダブルタップしてください。", action:"double", waitFor:"#boardEditOverlay.show" },
      { id:"subject", target:"#boardEditSubject", title:"案件名", text:"既存案件では案件名が自動で入ります。通常は変更しません。", action:"next" },
      { id:"address", target:"#boardEditAddress", title:"住所", text:"住所も案件情報から入ります。通常は変更しません。", action:"next" },
      { id:"room", target:"#boardEditRoom", title:"採取箇所", text:"実際に採取する場所を入力してください。例：1階 廊下 壁", action:"input" },
      { id:"sample", target:"#boardEditSample", title:"試料No.", text:"試料No.を確認します。必要に応じて変更できます。", action:"next" },
      { id:"mode", target:"#editBoardModeButton", title:"サンプリングモード", text:"採取写真ではサンプリングを使います。", action:"next" },
      { id:"status", target:"#boardEditStatus", title:"写真区分", text:"施工前・施工中・施工後から撮影する区分を選びます。", action:"next" },
      ...commonTail
    ];
  }

  function rememberPreviousCase() {
    const current = window.CaseSession?.getCurrentSession?.();
    if (!current || TUTORIAL_CASE_IDS.has(String(current.id || ""))) return;
    try { localStorage.setItem(PREVIOUS_CASE_KEY, JSON.stringify(current)); } catch (_) {}
  }

  function clearTutorialBoard(caseId) {
    try {
      localStorage.removeItem("electronic-board-camera-board-form-v2:" + caseId);
    } catch (_) {}
  }

  function configureTutorialBoard(route) {
    if (typeof boardMode !== "undefined") boardMode = "sampling";
    if (typeof selectedStatus !== "undefined") selectedStatus = "before";
    if (subjectText) subjectText.value = route === "existing" ? "チュートリアル案件" : "";
    if (addressText) addressText.value = route === "existing" ? "神奈川県小田原市○○町1-1" : "";
    if (roomNoInput) roomNoInput.value = "";
    if (sampleNoInput) sampleNoInput.value = "1";
    if (typeof updateCurrentDate === "function") updateCurrentDate();
    if (typeof applyBoardMode === "function") applyBoardMode();
    if (typeof setStatus === "function") setStatus("before");
    if (typeof saveBoardForm === "function") saveBoardForm();
  }

  function activateTutorialCase(route) {
    const session = CaseSession.activateTutorialSession(route);
    clearTutorialBoard(session.id);
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    configureTutorialBoard(route);
    return session;
  }

  function selectExistingTutorialCase() {
    if (!isRunning() || state.route !== "existing") return;
    activateTutorialCase("existing");
    if (typeof closeCasePicker === "function") closeCasePicker();
    if (typeof chooseCameraMode === "function") chooseCameraMode();
    advance();
  }

  async function startTutorialNewCase(current) {
    const ok = await AppDialog.confirm({
      title: "新規案件",
      message: "現在の案件から切り替えて、新しい案件を開始しますか？",
      okLabel: "新しい案件を開始",
      cancelLabel: "キャンセル"
    });
    if (!ok) return current;
    const session = activateTutorialCase("new");
    if (typeof chooseCameraMode === "function") chooseCameraMode();
    advance();
    return session;
  }

  function start(route) {
    if (!["existing","new"].includes(route)) return;
    rememberPreviousCase();
    state = { active:true, route, stepIndex:0 };
    saveState();
    if (typeof closeHelp === "function") closeHelp();
    if (typeof returnToTopScreen === "function") returnToTopScreen();
    window.setTimeout(render, 120);
  }

  function resume() {
    state = loadState();
    if (!state.active || !state.route) return false;
    if (typeof closeHelp === "function") closeHelp();
    render();
    return true;
  }

  function advance() {
    if (!isRunning()) return;
    state.stepIndex += 1;
    saveState();
    window.setTimeout(render, 140);
  }

  function stop() {
    cleanupCurrent();
    if (layer) layer.classList.remove("show");
    state.active = false;
    saveState();
    showToast("チュートリアルを中断しました。操作方法から続きから再開できます");
  }

  async function complete() {
    cleanupCurrent();
    if (layer) layer.classList.remove("show");
    const tutorialPhotos = (window.PhotoState?.items || []).filter((photo) => TUTORIAL_CASE_IDS.has(String(photo.caseId || "")));
    if (tutorialPhotos.length && window.PhotoState?.deleteMany) {
      await PhotoState.deleteMany(tutorialPhotos);
    }
    clearTutorialBoard("TUTORIAL_EXISTING");
    clearTutorialBoard("TUTORIAL_NEW");

    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(PREVIOUS_CASE_KEY) || "null"); } catch (_) {}
    try { localStorage.removeItem(PREVIOUS_CASE_KEY); } catch (_) {}
    state = { active:false, route:"", stepIndex:0, completed:true };
    saveState();

    await AppDialog.notice({
      title: "チュートリアル完了",
      message: "撮影チュートリアルを完了しました。\n操作方法からいつでももう一度確認できます。"
    });

    if (typeof returnToTopScreen === "function") returnToTopScreen();
    if (previous?.id && window.CaseSession?.activateSession) {
      CaseSession.activateSession(previous.id, previous.projectName || "");
    }
  }

  function cleanupCurrent() {
    if (cleanupAction) {
      cleanupAction();
      cleanupAction = null;
    }
    if (activeTarget) {
      activeTarget.classList.remove("tutorial-active-target");
      activeTarget = null;
    }
    clearTimeout(renderTimer);
  }

  function placeBubble(target) {
    if (!bubble) return;
    const rect = target?.getBoundingClientRect?.();
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - 20);
    bubble.style.width = width + "px";

    let left = rect ? Math.max(10, Math.min(vw - width - 10, rect.left + rect.width / 2 - width / 2)) : Math.max(10, (vw - width) / 2);
    let top = rect ? rect.bottom + margin : Math.max(10, vh * 0.2);

    const estimatedHeight = 190;
    if (top + estimatedHeight > vh - 10 && rect) {
      top = Math.max(10, rect.top - estimatedHeight - margin);
    }
    bubble.style.left = Math.round(left) + "px";
    bubble.style.top = Math.round(top) + "px";
  }

  function waitForSelector(selector, callback, tries = 50) {
    const found = document.querySelector(selector);
    if (found) {
      callback(found);
      return;
    }
    if (tries <= 0) {
      callback(null);
      return;
    }
    renderTimer = window.setTimeout(() => waitForSelector(selector, callback, tries - 1), 100);
  }

  function bindAction(step, target) {
    if (!target) return;
    if (step.action === "next") {
      nextButton.hidden = false;
      nextButton.onclick = advance;
      return;
    }

    nextButton.hidden = true;

    if (step.action === "input") {
      const handler = () => {
        if (String(target.value || "").trim()) {
          target.removeEventListener("change", handler);
          target.removeEventListener("blur", handler);
          advance();
        }
      };
      target.addEventListener("change", handler);
      target.addEventListener("blur", handler);
      cleanupAction = () => {
        target.removeEventListener("change", handler);
        target.removeEventListener("blur", handler);
      };
      return;
    }

    if (step.action === "double") {
      let last = 0;
      const handler = () => {
        const now = Date.now();
        if (now - last < 420) {
          target.removeEventListener("pointerup", handler, true);
          waitForConditionThenAdvance(step);
        }
        last = now;
      };
      target.addEventListener("pointerup", handler, true);
      cleanupAction = () => target.removeEventListener("pointerup", handler, true);
      return;
    }

    const handler = () => {
      target.removeEventListener("click", handler, true);
      waitForConditionThenAdvance(step);
    };
    target.addEventListener("click", handler, true);
    cleanupAction = () => target.removeEventListener("click", handler, true);
  }

  function waitForConditionThenAdvance(step) {
    if (!step.waitFor) {
      window.setTimeout(advance, 180);
      return;
    }
    let attempts = 0;
    const check = () => {
      if (document.querySelector(step.waitFor)) {
        advance();
        return;
      }
      attempts += 1;
      if (attempts < 80) window.setTimeout(check, 100);
    };
    window.setTimeout(check, 120);
  }

  function render() {
    cleanupCurrent();
    if (!isRunning()) return;

    const steps = getSteps(state.route);
    if (state.stepIndex >= steps.length) {
      void complete();
      return;
    }
    const step = steps[state.stepIndex];

    waitForSelector(step.target, (target) => {
      if (!isRunning()) return;
      if (!target) {
        showErrorToast("チュートリアルの対象を表示できませんでした");
        return;
      }

      activeTarget = target;
      target.classList.add("tutorial-active-target");
      target.scrollIntoView?.({ block:"nearest", inline:"nearest" });

      if (title) title.textContent = step.title;
      if (text) text.textContent = step.text;
      if (progress) progress.textContent = `${state.stepIndex + 1} / ${steps.length}`;
      if (stopButton) stopButton.onclick = stop;
      if (layer) layer.classList.add("show");

      placeBubble(target);
      bindAction(step, target);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    state = loadState();
    if (state.active) {
      window.setTimeout(() => {
        const session = window.CaseSession?.getCurrentSession?.();
        const expectedId = state.route === "new" ? "TUTORIAL_NEW" : "TUTORIAL_EXISTING";
        if (session?.id === expectedId || state.stepIndex < 2) render();
      }, 300);
    }
  });

  window.addEventListener("resize", () => {
    if (isRunning() && activeTarget) placeBubble(activeTarget);
  });

  window.Tutorial = Object.freeze({
    start,
    resume,
    stop,
    isRunning,
    shouldUseTutorialNewCase,
    startTutorialNewCase,
    selectExistingTutorialCase
  });
})();
