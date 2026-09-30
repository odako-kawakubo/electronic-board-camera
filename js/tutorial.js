/*
 * ============================================================
 * tutorial.js - 実画面チュートリアル
 * ============================================================
 * 責務:
 * - 既存案件 / 新規案件の撮影ルートを独立して案内する
 * - 実画面の対象をハイライトし、画面構成に合わせて吹き出しを配置する
 * - OS権限 / 共通ダイアログ表示中はチュートリアルUIを退避する
 * - 中断位置を端末内に保持し、再開できるようにする
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
  const backButton = document.getElementById("tutorialBackButton");
  const nextButton = document.getElementById("tutorialNextButton");
  const stopButton = document.getElementById("tutorialStopButton");

  let state = loadState();
  let activeTarget = null;
  let cleanupAction = null;
  let renderTimer = null;
  let currentStep = null;
  let manualBubblePosition = null;
  let dragState = null;
  let dynamicTargetObserver = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "null") ||
        { active:false, paused:false, route:"", stepIndex:0 };
    } catch (_) {
      return { active:false, paused:false, route:"", stepIndex:0 };
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

  function shouldShowTutorialCase() {
    return isRunning() && state.route === "existing" && state.stepIndex === 1;
  }

  function shouldOpenTutorialCasePicker() {
    return isRunning() && state.route === "existing" && state.stepIndex === 0;
  }

  function getCommonTail() {
    return [
      {
        id:"room-controls",
        target:"#panelRoomButton",
        position:"top-center",
        noDim:true,
        title:"採取箇所",
        text:"「部屋」を押して開きます。「入力」から採取箇所名を入力できます。入力後は中央の対象を切り替え、上下で階数や方角などを変更できます。",
        action:"panel",
        panel:"#roomPanel",
        closePanelOnAdvance:true
      },
      {
        id:"sample-controls",
        target:"#panelSampleButton",
        position:"top-center",
        noDim:true,
        title:"試料No.・箇所No.",
        text:"「検体」を押して開きます。検体の上下で試料No.、箇所の上下で箇所No.を変更できます。",
        action:"panel",
        panel:"#samplePanel",
        closePanelOnAdvance:true
      },
      {
        id:"status-control",
        target:"#categoryToggleButton",
        position:"top-center",
        noDim:true,
        title:"撮影区分",
        text:"右側の緑ボタンで、施工前・施工中・施工後の撮影区分を切り替えます。ボタンを押して確認してください。",
        action:"click"
      },
      {
        id:"section-control",
        target:"#sectionButton",
        position:"top-center",
        noDim:true,
        title:"断面モード",
        text:"「断面」を押すと断面モードになり、看板を付けずに撮影できます。確認したら通常撮影に戻します。",
        action:"section-demo"
      },
      { id:"shoot", target:"#shootButton", position:"top-left", noDim:true, title:"撮影", text:"撮影画面と看板を確認して、実際に1枚撮影してみましょう。説明を閉じたあと「撮影」を押してください。", action:"practice", practiceLabel:"やってみる", waitFor:"#captureReviewOverlay.show" },
      { id:"review", target:".capture-review-ok", position:"top-left", noDim:true, title:"撮影確認", text:"撮影した写真を確認します。問題なければ「OK」、やり直す場合は「撮り直し」です。", action:"practice", practiceLabel:"確認する", waitForHidden:"#captureReviewOverlay.show" },
      { id:"saved", target:"#viewButton", position:"top-left", title:"アプリ内に保存", text:"OKにすると写真はまずアプリ内へ保存されます。「表示」を押して確認します。", action:"click", waitFor:"#previewOverlay.show" },
      { id:"list", target:"#previewImageWrap", position:"bottom-right", noDim:true, title:"写真一覧・プレビュー", text:"下の写真一覧から画像を選ぶと、選択した写真が上のプレビューに表示されます。上の写真をダブルタップすると拡大して確認できます。通常案件では一覧の●が緑になればOneDrive保存完了です。チュートリアル案件はOneDriveへ送信しません。", action:"next" }
    ];
  }

  function getSteps(route) {
    const boardSetupSteps = route === "new"
      ? [
          { id:"board", target:"#photoBoard", position:"top-center", noDim:true, title:"まず看板を設定", text:"看板をダブルタップして編集画面を開いてください。", action:"wait-board-edit" },
          { id:"subject", target:"#boardEditSubject", position:"top-right", title:"案件名", text:"案件名を入力してください。", action:"input" },
          { id:"address", target:"#boardEditAddress", position:"top-right", title:"住所", text:"調査場所の住所を入力してください。", action:"input" },
          { id:"done", target:"#boardEditDoneButton", position:"top-left", title:"看板編集を完了", text:"案件名と住所を確認したら「完了」を押します。", action:"click", waitForHidden:"#boardEditOverlay.show" }
        ]
      : [
          { id:"board", target:"#photoBoard", position:"top-center", noDim:true, title:"看板情報を確認", text:"看板をダブルタップして編集画面を開いてください。", action:"wait-board-edit" },
          { id:"subject", target:"#boardEditSubject", position:"top-right", title:"案件名", text:"既存案件では案件名が自動で入ります。通常は変更しません。", action:"next" },
          { id:"address", target:"#boardEditAddress", position:"top-right", title:"住所", text:"住所も案件情報から入ります。通常は変更しません。", action:"next" },
          { id:"done", target:"#boardEditDoneButton", position:"top-left", title:"看板編集を完了", text:"案件名と住所を確認したら「完了」を押します。", action:"click", waitForHidden:"#boardEditOverlay.show" }
        ];

    if (route === "new") {
      return [
        { id:"new", target:".launch-new-case-button", position:"top-left", title:"新規案件から撮影", text:"「新規案件」を押します。確認画面が出たら「新しい案件を開始」を選びます。", action:"external" },
        { id:"permission", target:"#captureFrame", position:"top-center", title:"カメラの使用を許可", text:"次に端末のカメラ使用確認が表示されます。「許可」を選んでください。", action:"permission" },
        ...boardSetupSteps,
        ...getCommonTail()
      ];
    }

    return [
      { id:"select", target:".launch-case-select-button", position:"top-left", title:"既存案件から撮影", text:"まず「案件選択」を押します。", action:"click", waitFor:"#casePickerOverlay.show" },
      { id:"tutorial-case", target:"#tutorialCaseButton", position:"top-right", dynamicTarget:true, title:"チュートリアル案件", text:"ログインしていなくても使える練習用案件です。選択してください。", action:"external" },
      { id:"permission", target:"#captureFrame", position:"top-center", title:"カメラの使用を許可", text:"次に端末のカメラ使用確認が表示されます。「許可」を選んでください。", action:"permission" },
      ...boardSetupSteps,
      ...getCommonTail()
    ];
  }

  function rememberPreviousCase() {
    const current = window.CaseSession?.getCurrentSession?.();
    if (!current || TUTORIAL_CASE_IDS.has(String(current.id || ""))) return;
    try { localStorage.setItem(PREVIOUS_CASE_KEY, JSON.stringify(current)); } catch (_) {}
  }

  function clearTutorialBoard(caseId) {
    try { localStorage.removeItem("electronic-board-camera-board-form-v2:" + caseId); } catch (_) {}
  }

  function configureTutorialBoard(route) {
    if (typeof boardMode !== "undefined") boardMode = "sampling";
    if (typeof selectedStatus !== "undefined") selectedStatus = "before";
    if (subjectText) subjectText.value = route === "existing" ? "チュートリアル案件" : "";
    if (addressText) addressText.value = route === "existing" ? "神奈川県小田原市○○町1-1" : "";
    if (roomNoInput) roomNoInput.value = "";
    if (sampleNoInput) sampleNoInput.value = POINT_DISPLAY_DEFAULT;
    if (typeof updateCurrentDate === "function") updateCurrentDate();
    if (typeof applyBoardMode === "function") applyBoardMode();
    if (typeof setStatus === "function") setStatus("before");
    if (typeof saveBoardForm === "function") saveBoardForm();
  }

  function activateTutorialCase(route, options = {}) {
    const session = CaseSession.activateTutorialSession(route);
    if (options.reset !== false) {
      clearTutorialBoard(session.id);
      if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
      configureTutorialBoard(route);
    } else if (typeof restoreActiveCaseBoard === "function") {
      restoreActiveCaseBoard();
    }
    return session;
  }

  function setStep(index) {
    state.stepIndex = Math.max(0, Number(index) || 0);
    saveState();
  }

  function showLayer() {
    layer?.classList.add("show");
  }

  function hideLayer() {
    layer?.classList.remove("show");
  }

  function selectExistingTutorialCase() {
    if (!isRunning() || state.route !== "existing" || currentStep?.id !== "tutorial-case") return;
    cleanupCurrent();
    hideLayer();
    activateTutorialCase("existing");
    if (typeof closeCasePicker === "function") closeCasePicker();
    setStep(2);
    if (typeof chooseCameraMode === "function") chooseCameraMode();
  }

  async function startTutorialNewCase(current) {
    if (!isRunning() || state.route !== "new" || currentStep?.id !== "new") return current;

    cleanupCurrent();
    hideLayer();
    const ok = await AppDialog.confirm({
      title: "新規案件",
      message: "現在の案件から切り替えて、新しい案件を開始しますか？",
      okLabel: "新しい案件を開始",
      cancelLabel: "キャンセル"
    });

    if (!ok) {
      window.setTimeout(render, 80);
      return current;
    }

    const session = activateTutorialCase("new");
    setStep(1);
    if (typeof chooseCameraMode === "function") chooseCameraMode();
    return session;
  }

  function onCameraModeEntered() {
    if (!isRunning()) return false;
    const step = getSteps(state.route)[state.stepIndex];
    if (!step || step.id !== "permission") return false;
    window.setTimeout(render, 100);
    return true;
  }

  async function requestTutorialCameraPermission() {
    if (!isRunning() || currentStep?.id !== "permission") return;
    cleanupCurrent();
    hideLayer();

    try {
      if (typeof startCamera === "function") await startCamera();
    } finally {
      waitForCameraReady();
    }
  }

  function waitForCameraReady() {
    let attempts = 0;
    const check = () => {
      if (!isRunning()) return;
      const shoot = document.querySelector("#shootButton:not(.hidden-control)");
      if (shoot) {
        advance();
        return;
      }
      attempts += 1;
      if (attempts >= 200) {
        window.setTimeout(render, 80);
        return;
      }
      window.setTimeout(check, 100);
    };
    window.setTimeout(check, 100);
  }

  function start(route) {
    if (!["existing","new"].includes(route)) return;
    rememberPreviousCase();
    state = { active:true, paused:false, route, stepIndex:0 };
    saveState();
    manualBubblePosition = null;
    if (typeof closeHelp === "function") closeHelp();
    if (typeof returnToTopScreen === "function") returnToTopScreen();
    window.setTimeout(render, 120);
  }

  function resume() {
    state = loadState();
    if ((!state.active && !state.paused) || !state.route) {
      if (typeof showToast === "function") showToast("再開できるチュートリアルはありません");
      return false;
    }

    state.active = true;
    state.paused = false;
    saveState();
    manualBubblePosition = null;
    if (typeof closeHelp === "function") closeHelp();

    const step = getSteps(state.route)[state.stepIndex];

    // 中断時に破棄した一時チュートリアル案件を、再開時だけメモリ上へ作り直す。
    if (!["select", "tutorial-case", "new"].includes(step?.id || "")) {
      activateTutorialCase(state.route, { reset:false });
    }

    if (step?.id === "permission") {
      if (typeof chooseCameraMode === "function") chooseCameraMode();
      return true;
    }

    render();
    return true;
  }

  function advance() {
    if (!isRunning()) return;

    if (currentStep?.closePanelOnAdvance && typeof closeSidePanel === "function") {
      closeSidePanel();
    }
    if (currentStep?.id === "section-control" && typeof setSectionMode === "function") {
      setSectionMode(false);
    }

    state.stepIndex += 1;
    saveState();
    manualBubblePosition = null;
    window.setTimeout(render, 140);
  }

  async function deleteLatestTutorialPhoto() {
    const photos = (window.PhotoState?.items || [])
      .filter((photo) => TUTORIAL_CASE_IDS.has(String(photo.caseId || "")))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (!photos.length || !window.PhotoState?.deleteMany) return;
    await PhotoState.deleteMany([photos[0]]);
  }

  async function restoreNormalBoardAfterTutorial() {
    window.CaseSession?.endTutorialSession?.();
    if (typeof restoreActiveCaseBoard === "function") restoreActiveCaseBoard();
    if (typeof setSectionMode === "function") setSectionMode(false);
    if (typeof closeSidePanel === "function") closeSidePanel();
  }

  async function goBack() {
    if (!isRunning() || state.stepIndex <= 0) return;

    const steps = getSteps(state.route);
    const current = steps[state.stepIndex];
    let nextIndex = state.stepIndex - 1;
    let previous = steps[nextIndex];

    cleanupCurrent();
    hideLayer();
    manualBubblePosition = null;

    // 撮影確認から戻る場合は「撮り直し」と同じ状態へ戻す。
    if (current?.id === "review" && document.querySelector("#captureReviewOverlay.show")) {
      if (typeof rejectCaptureReview === "function") rejectCaptureReview();
      nextIndex = steps.findIndex((step) => step.id === "shoot");
      previous = steps[nextIndex];
    }

    // OK後は同じ確認画面を再構成できないため、練習写真を取り消して撮影からやり直す。
    if (current?.id === "saved") {
      await deleteLatestTutorialPhoto();
      nextIndex = steps.findIndex((step) => step.id === "shoot");
      previous = steps[nextIndex];
    }

    // 写真一覧からは実際に一覧を閉じて「表示」操作へ戻す。
    if (current?.id === "list" && typeof closePreview === "function") {
      await closePreview();
      nextIndex = steps.findIndex((step) => step.id === "saved");
      previous = steps[nextIndex];
    }

    if (typeof setSectionMode === "function") setSectionMode(false);
    if (typeof closeSidePanel === "function") closeSidePanel();

    // 撮影画面から看板編集の「完了」へ戻る時は編集画面そのものを再度開く。
    if (previous?.id === "done" && !document.querySelector("#boardEditOverlay.show")) {
      if (typeof openBoardEditMode === "function") openBoardEditMode({ focusFirstField:false });
    }

    // 編集項目から看板ダブルタップへ戻る時は編集画面を閉じ、実操作をやり直せる状態にする。
    if (previous?.id === "board" && document.querySelector("#boardEditOverlay.show")) {
      if (typeof closeBoardEditMode === "function") {
        await closeBoardEditMode();
      }
    }

    // 案件選択へ戻る場合は一時案件とカメラを解除して、本当に案件選択画面へ戻す。
    if (previous?.id === "tutorial-case") {
      await restoreNormalBoardAfterTutorial();
      if (typeof returnToTopScreen === "function") await returnToTopScreen();
      state.stepIndex = nextIndex;
      saveState();
      window.setTimeout(() => {
        if (typeof openCasePickerFromTop === "function") openCasePickerFromTop();
        window.setTimeout(render, 120);
      }, 80);
      return;
    }

    if (previous?.id === "select" || previous?.id === "new") {
      await restoreNormalBoardAfterTutorial();
      if (typeof returnToTopScreen === "function") await returnToTopScreen();
    }

    state.stepIndex = nextIndex;
    saveState();
    window.setTimeout(render, 140);
  }

  function stop() {
    cleanupCurrent();
    hideLayer();
    state.active = false;
    state.paused = true;
    saveState();

    void restoreNormalBoardAfterTutorial();

    if (typeof returnToTopScreen === "function") returnToTopScreen();
    if (typeof showToast === "function") {
      window.setTimeout(() => {
        showToast("チュートリアルを中断しました。操作方法から続きから再開できます");
      }, 80);
    }
  }

  async function complete() {
    cleanupCurrent();
    hideLayer();

    const tutorialPhotos = (window.PhotoState?.items || [])
      .filter((photo) => TUTORIAL_CASE_IDS.has(String(photo.caseId || "")));
    if (tutorialPhotos.length && window.PhotoState?.deleteMany) {
      await PhotoState.deleteMany(tutorialPhotos);
    }

    clearTutorialBoard("TUTORIAL_EXISTING");
    clearTutorialBoard("TUTORIAL_NEW");

    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(PREVIOUS_CASE_KEY) || "null"); } catch (_) {}
    try { localStorage.removeItem(PREVIOUS_CASE_KEY); } catch (_) {}

    state = { active:false, paused:false, route:"", stepIndex:0, completed:true };
    saveState();
    await restoreNormalBoardAfterTutorial();

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
    if (dynamicTargetObserver) {
      dynamicTargetObserver.disconnect();
      dynamicTargetObserver = null;
    }
    document.body.classList.remove("tutorial-no-dim");
    clearTimeout(renderTimer);
    currentStep = null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getPresetPosition(position, width, height) {
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = margin;
    const bottom = Math.max(margin, vh - height - margin);
    const left = margin;
    const right = Math.max(margin, vw - width - margin);
    const centerX = Math.max(margin, (vw - width) / 2);
    const centerY = Math.max(margin, (vh - height) / 2);

    switch (position) {
      case "top-left": return { left, top };
      case "top-right": return { left:right, top };
      case "bottom-left": return { left, top:bottom };
      case "bottom-right": return { left:right, top:bottom };
      case "bottom-center": return { left:centerX, top:bottom };
      case "left-center": return { left, top:centerY };
      case "right-center": return { left:right, top:centerY };
      case "top-center":
      default: return { left:centerX, top };
    }
  }

  function placeBubble(step = currentStep) {
    if (!bubble) return;

    const width = Math.min(270, window.innerWidth - 20);
    bubble.style.width = width + "px";
    bubble.style.left = "10px";
    bubble.style.top = "10px";

    const rect = bubble.getBoundingClientRect();
    const height = Math.max(80, rect.height || 120);
    const preset = getPresetPosition(step?.position || "top-center", width, height);
    const desired = manualBubblePosition || preset;
    const maxLeft = Math.max(10, window.innerWidth - width - 10);
    const maxTop = Math.max(10, window.innerHeight - height - 10);

    bubble.style.left = clamp(desired.left, 10, maxLeft) + "px";
    bubble.style.top = clamp(desired.top, 10, maxTop) + "px";
  }

  function observeDynamicTarget(step) {
    if (!step?.dynamicTarget || !step?.target) return;

    dynamicTargetObserver?.disconnect();
    dynamicTargetObserver = new MutationObserver(() => {
      if (!isRunning() || currentStep?.id !== step.id) return;

      const freshTarget = document.querySelector(step.target);
      if (!freshTarget || freshTarget === activeTarget) return;

      if (activeTarget) activeTarget.classList.remove("tutorial-active-target");
      activeTarget = freshTarget;
      activeTarget.classList.add("tutorial-active-target");
      requestAnimationFrame(() => placeBubble(step));
    });

    dynamicTargetObserver.observe(document.body, { childList:true, subtree:true });
  }

  function waitForSelector(selector, callback, tries = 60) {
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

  function waitForConditionThenAdvance(step) {
    let attempts = 0;

    const check = () => {
      if (!isRunning()) return;

      if (step.waitFor && document.querySelector(step.waitFor)) {
        advance();
        return;
      }

      if (step.waitForHidden && !document.querySelector(step.waitForHidden)) {
        advance();
        return;
      }

      if (!step.waitFor && !step.waitForHidden) {
        advance();
        return;
      }

      attempts += 1;
      if (attempts < 100) window.setTimeout(check, 100);
    };

    window.setTimeout(check, 120);
  }

  function bindAction(step, target) {
    if (!target) return;

    nextButton.hidden = true;
    nextButton.textContent = "次へ";
    nextButton.onclick = null;

    if (step.action === "external") return;

    if (step.action === "next") {
      nextButton.hidden = false;
      nextButton.onclick = advance;
      return;
    }

    if (step.action === "permission") {
      nextButton.hidden = false;
      nextButton.textContent = "カメラを許可する";
      nextButton.onclick = requestTutorialCameraPermission;
      return;
    }

    if (step.action === "practice") {
      const handler = () => {
        target.removeEventListener("click", handler, true);
        cleanupAction = null;
        waitForConditionThenAdvance(step);
      };
      target.addEventListener("click", handler, true);
      cleanupAction = () => target.removeEventListener("click", handler, true);

      nextButton.hidden = false;
      nextButton.textContent = step.practiceLabel || "やってみる";
      nextButton.onclick = () => {
        if (activeTarget) {
          activeTarget.classList.remove("tutorial-active-target");
          activeTarget = null;
        }
        hideLayer();
      };
      return;
    }

    if (step.action === "panel") {
      const panel = document.querySelector(step.panel || "");
      let opened = panel?.classList.contains("show");

      const showPanelGuide = () => {
        opened = Boolean(panel?.classList.contains("show"));
        if (!opened) return;

        if (activeTarget) activeTarget.classList.remove("tutorial-active-target");
        activeTarget = panel;
        panel.classList.add("tutorial-active-target");
        nextButton.hidden = false;
        nextButton.textContent = "次へ";
        nextButton.onclick = advance;
        requestAnimationFrame(() => placeBubble(step));
      };

      const handler = () => window.setTimeout(showPanelGuide, 40);
      target.addEventListener("click", handler, true);

      if (opened) showPanelGuide();

      cleanupAction = () => target.removeEventListener("click", handler, true);
      return;
    }

    if (step.action === "section-demo") {
      const handler = () => {
        window.setTimeout(() => {
          if (!isRunning() || currentStep?.id !== "section-control") return;
          if (!isSectionMode) return;
          nextButton.hidden = false;
          nextButton.textContent = "通常撮影に戻す";
          nextButton.onclick = () => {
            if (typeof setSectionMode === "function") setSectionMode(false);
            advance();
          };
        }, 40);
      };
      target.addEventListener("click", handler, true);
      cleanupAction = () => target.removeEventListener("click", handler, true);
      return;
    }

    if (step.action === "wait-board-edit") {
      const overlay = document.getElementById("boardEditOverlay");
      let finished = false;

      const finishIfOpen = () => {
        if (finished || !isRunning() || currentStep?.id !== "board") return;
        if (!overlay?.classList.contains("show")) return;
        finished = true;
        observer?.disconnect();
        cleanupAction = null;
        advance();
      };

      const observer = overlay
        ? new MutationObserver(finishIfOpen)
        : null;

      if (observer && overlay) {
        observer.observe(overlay, { attributes:true, attributeFilter:["class"] });
      }

      const poll = window.setInterval(finishIfOpen, 80);
      finishIfOpen();

      cleanupAction = () => {
        finished = true;
        observer?.disconnect();
        window.clearInterval(poll);
      };
      return;
    }

    if (step.action === "input") {
      const handler = () => {
        if (!String(target.value || "").trim()) return;
        target.removeEventListener("change", handler);
        target.removeEventListener("blur", handler);
        advance();
      };
      target.addEventListener("change", handler);
      target.addEventListener("blur", handler);
      cleanupAction = () => {
        target.removeEventListener("change", handler);
        target.removeEventListener("blur", handler);
      };
      return;
    }

    const handler = () => {
      target.removeEventListener("click", handler, true);
      waitForConditionThenAdvance(step);
    };
    target.addEventListener("click", handler, true);
    cleanupAction = () => target.removeEventListener("click", handler, true);
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
    currentStep = step;

    waitForSelector(step.target, (target) => {
      if (!isRunning()) return;
      if (!target) {
        if (typeof showErrorToast === "function") showErrorToast("チュートリアルの対象を表示できませんでした");
        return;
      }

      activeTarget = target;
      target.classList.add("tutorial-active-target");
      target.scrollIntoView?.({ block:"nearest", inline:"nearest" });

      if (title) title.textContent = step.title;
      if (text) text.textContent = step.text;
      if (progress) progress.textContent = `${state.stepIndex + 1} / ${steps.length}`;
      if (backButton) {
        backButton.hidden = state.stepIndex <= 0;
        backButton.onclick = goBack;
      }
      if (stopButton) stopButton.onclick = stop;

      document.body.classList.toggle("tutorial-no-dim", Boolean(step.noDim));
      showLayer();
      requestAnimationFrame(() => placeBubble(step));
      observeDynamicTarget(step);
      bindAction(step, target);
    });
  }

  function beginBubbleDrag(event) {
    if (!bubble || !isRunning()) return;
    if (event.target.closest("button")) return;

    const rect = bubble.getBoundingClientRect();
    dragState = {
      pointerId:event.pointerId,
      offsetX:event.clientX - rect.left,
      offsetY:event.clientY - rect.top
    };
    bubble.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveBubbleDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId || !bubble) return;

    const rect = bubble.getBoundingClientRect();
    const left = clamp(
      event.clientX - dragState.offsetX,
      10,
      Math.max(10, window.innerWidth - rect.width - 10)
    );
    const top = clamp(
      event.clientY - dragState.offsetY,
      10,
      Math.max(10, window.innerHeight - rect.height - 10)
    );

    manualBubblePosition = { left, top };
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    event.preventDefault();
  }

  function endBubbleDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    bubble?.releasePointerCapture?.(event.pointerId);
    dragState = null;
  }

  bubble?.addEventListener("pointerdown", beginBubbleDrag);
  bubble?.addEventListener("pointermove", moveBubbleDrag);
  bubble?.addEventListener("pointerup", endBubbleDrag);
  bubble?.addEventListener("pointercancel", endBubbleDrag);

  document.addEventListener("DOMContentLoaded", () => {
    state = loadState();
    if (state.active) {
      window.setTimeout(() => {
        const step = getSteps(state.route)[state.stepIndex];
        if (!["select", "tutorial-case", "new"].includes(step?.id || "")) {
          activateTutorialCase(state.route, { reset:false });
        }

        if (step?.id === "permission") {
          if (typeof chooseCameraMode === "function") chooseCameraMode();
          return;
        }

        render();
      }, 300);
    }
  });

  window.addEventListener("resize", () => {
    if (isRunning() && currentStep) {
      manualBubblePosition = null;
      requestAnimationFrame(() => placeBubble(currentStep));
    }
  });

  window.Tutorial = Object.freeze({
    start,
    resume,
    stop,
    isRunning,
    shouldUseTutorialNewCase,
    startTutorialNewCase,
    selectExistingTutorialCase,
    shouldShowTutorialCase,
    shouldOpenTutorialCasePicker,
    onCameraModeEntered
  });
})();
