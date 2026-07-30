/**
 * App entry — wires engine, renderer, and input. The only file that knows both sides.
 */
// Self-hosted fonts (bundled by Vite) so the desktop/Steam build runs offline.
// Latin + latin-ext (PL/DE/…) + Cyrillic (RU). CJK falls back to system fonts.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-ext-500.css";
import "@fontsource/inter/latin-ext-600.css";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/cyrillic-500.css";
import "@fontsource/inter/cyrillic-600.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/rajdhani/latin-ext-600.css";
import "@fontsource/rajdhani/latin-ext-700.css";
import "./i18n/index.js";
import "./styles/main.css";
import { CONTROL } from "./data/controls.js";
import {
  PHYSICS_STEP, state, menuOptions, menuIndex, menuMode, lotteryTick, creditsLink,
  modeOptions, modeIndex,
  score, ball, audioEvents, gameMode, winner, onlineLocalSeat,
  startGame, toMenu, enterModeSelect, enterCredits, resetPositions, startAttract,
  attractActive,
  menuMove, menuSelect, setMenuIndex,
  modeMove, modeSelectChoose, setModeIndex, backToModeSelect, setQuitEnabled,
  pauseOptions, pauseIndex, pauseMove, pauseSelect, setPauseIndex,
  pauseGame, resumeFromPause, leaveSubmenu, canPause,
  onlineOverlay, openOnlineOverlay, closeOnlineOverlay, setOnlineOverlay,
  handleServeKeyDown, handleServeKeyUp,
  readInput, tickServe, tickPhysics,
} from "./engine/game.js";
import { initRender, render, setRenderRemainder } from "./ui/render.js";
import { hasLaunchUnlock, dismissLaunchUnlock } from "./ui/unlockReveal.js";
import { initViewport, eventToCanvas } from "./ui/viewport.js";
import { wireDomControls, syncRobotPartsToDom, openLab } from "./ui/customize.js";
import { initTouchControls } from "./ui/touchControls.js";
import { initGamepads, pollGamepads } from "./input/gamepad.js";
import { initInputDevice } from "./input/device.js";
import { preloadAssets, hideSplash, setSplashProgress } from "./ui/preload.js";
import {
  initAudio, drainEvents, onStateChange, tickLotterySounds,
  tickMusicIntensity, playUiNavigate, playUiConfirm,
} from "./audio/manager.js";
import {
  resetSettingsFocus, handleSettingsKey, handleSettingsPointer,
} from "./ui/settings.js";
import {
  resetProfileFocus, handleProfileKey, handleProfilePointer, isEditingName,
} from "./ui/profileScreen.js";
import {
  resetLeaderboard, handleLeaderboardKey, handleLeaderboardPointer,
} from "./ui/leaderboardScreen.js";
import { syncProfile } from "./progress/profile.js";

/** Menu actions that open a submenu rather than starting something. */
const SUBMENU_ACTIONS = ["settings", "controls", "profile", "leaderboard"];
import {
  resetControlsFocus, handleControlsKey, handleControlsPointer,
} from "./ui/controlsScreen.js";
import { onMatchEnd } from "./platform/achievements.js";
import { isDesktop, quitApp } from "./platform/host.js";
import {
  beginOnlineMatchmaking, cancelOnline, tickOnline, isOnlineActive,
} from "./net/session.js";

const canvas = document.getElementById("game");
const stage = document.getElementById("stage");
initRender(canvas);
initViewport(canvas, stage);

// Quitting the app only makes sense on desktop — there's no window to close
// on the web build, so the option isn't shown there. Applies to both the
// online and offline menu, whichever is currently built.
setQuitEnabled(isDesktop);

// Pull the account as early as possible. The home screen renders from the
// cached profile immediately and swaps in the server's copy when this lands, so
// coming back on a different machine looks like a refresh, not a loading screen.
// It is fire-and-forget on purpose: a failed sync leaves the cache in place and
// the game entirely playable offline.
void syncProfile();

const keys = new Set();

let prevState = state;
let lastLotteryTick = 0;
let last = performance.now();
let acc = 0;
let settingsDragging = false;

function leaveSubmenuScreen() {
  leaveSubmenu();
  playUiConfirm();
}

function startOnlineFromMenu() {
  beginOnlineMatchmaking();
  playUiConfirm();
}

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock",
]);

function leaveTitleScreen() {
  if (state !== "title") return false;
  enterModeSelect();
  playUiConfirm();
  return true;
}

window.addEventListener("keydown", (e) => {
  if (e.code in CONTROL || e.code === "Space") e.preventDefault();
  keys.add(e.code);

  // The launch-time unlock reveal is modal over whatever screen is showing, so
  // it consumes the first real keypress before anything else reacts to it.
  if (hasLaunchUnlock()) {
    if (!MODIFIER_CODES.has(e.code)) {
      dismissLaunchUnlock();
      playUiConfirm();
    }
    return;
  }

  if (state === "title") {
    if (!MODIFIER_CODES.has(e.code)) leaveTitleScreen();
    return;
  }

  if (state === "modeSelect") {
    if (e.code === "ArrowUp" || e.code === "KeyW") { modeMove(-1); playUiNavigate(); }
    else if (e.code === "ArrowDown" || e.code === "KeyS") { modeMove(1); playUiNavigate(); }
    else if (e.code === "Enter" || e.code === "Space") {
      if (modeSelectChoose()) playUiConfirm();
    }
    else if (e.code === "KeyC") { enterCredits(); playUiConfirm(); }
    return;
  }

  if (state === "searching") {
    if (e.code === "Escape" || e.code === "Space" || e.code === "Backspace") {
      cancelOnline();
      playUiConfirm();
    }
    return;
  }

  if (state === "disconnect") {
    if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
      toMenu();
      playUiConfirm();
    }
    return;
  }

  if (state === "pause") {
    if (e.code === "Escape") { resumeFromPause(); playUiConfirm(); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { pauseMove(-1); playUiNavigate(); return; }
    if (e.code === "ArrowDown" || e.code === "KeyS") { pauseMove(1); playUiNavigate(); return; }
    if (e.code === "Enter" || e.code === "Space") {
      const o = pauseOptions[pauseIndex];
      if (o?.action === "settings") resetSettingsFocus();
      if (o?.action === "controls") resetControlsFocus();
      pauseSelect();
      playUiConfirm();
      if (o?.action === "quit" && isOnlineActive()) cancelOnline();
      return;
    }
    return;
  }
  if (state === "menu") {
    if (e.code === "Escape" || e.code === "Backspace") { backToModeSelect(); playUiConfirm(); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { menuMove(-1); playUiNavigate(); }
    else if (e.code === "ArrowDown" || e.code === "KeyS") { menuMove(1); playUiNavigate(); }
    else if (e.code === "Enter" || e.code === "Space") {
      const o = menuOptions[menuIndex];
      if (o?.action === "settings") resetSettingsFocus();
      if (o?.action === "controls") resetControlsFocus();
      if (o?.action === "profile") resetProfileFocus();
      if (o?.action === "leaderboard") resetLeaderboard();
      if (o?.action === "customize") { openLab(); playUiConfirm(); return; }
      if (o?.action === "online") { startOnlineFromMenu(); return; }
      if (o?.action === "quit") { playUiConfirm(); quitApp(); return; }
      if (menuSelect()) playUiConfirm();
      else if (SUBMENU_ACTIONS.includes(o?.action)) playUiConfirm();
    }
    else if (menuMode === "offline" && (e.code === "Digit1" || e.code === "Numpad1")) { startGame("1p"); playUiConfirm(); }
    else if (menuMode === "offline" && (e.code === "Digit2" || e.code === "Numpad2")) { startGame("2p"); playUiConfirm(); }
    return;
  }
  if (state === "credits") {
    if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) leaveSubmenuScreen();
    return;
  }
  if (state === "settings") {
    if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) {
      leaveSubmenuScreen();
      return;
    }
    if (handleSettingsKey(e.code)) {
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) playUiNavigate();
      else playUiConfirm();
    }
    return;
  }
  if (state === "controls") {
    const res = handleControlsKey(e.code, e.isTrusted);
    if (res === "leave") leaveSubmenuScreen();
    else if (res === "nav") playUiNavigate();
    else if (res === "capture" || res === "bound" || res === "reset" || res === "cancel") playUiConfirm();
    return;
  }
  if (state === "profile") {
    // While the name field is open every key belongs to it — including Escape,
    // which cancels the edit rather than leaving the screen.
    if (!isEditingName() && ["Escape", "Backspace"].includes(e.code)) {
      leaveSubmenuScreen();
      return;
    }
    if (handleProfileKey(e.code, e.key)) {
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) playUiNavigate();
      else playUiConfirm();
    }
    return;
  }
  if (state === "leaderboard") {
    if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) {
      leaveSubmenuScreen();
      return;
    }
    if (handleLeaderboardKey(e.code)) playUiNavigate();
    return;
  }
  if (onlineOverlay != null) {
    if (onlineOverlay === "settings") {
      if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) {
        setOnlineOverlay("pause");
        playUiConfirm();
        return;
      }
      if (handleSettingsKey(e.code)) {
        if (["ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(e.code)) playUiNavigate();
        else playUiConfirm();
      }
      return;
    }
    if (onlineOverlay === "controls") {
      const res = handleControlsKey(e.code, e.isTrusted);
      if (res === "leave") { setOnlineOverlay("pause"); playUiConfirm(); }
      else if (res === "nav") playUiNavigate();
      else if (["capture", "bound", "reset", "cancel"].includes(res)) playUiConfirm();
      return;
    }
    // onlineOverlay === "pause"
    if (e.code === "Escape") { closeOnlineOverlay(); playUiConfirm(); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { pauseMove(-1); playUiNavigate(); return; }
    if (e.code === "ArrowDown" || e.code === "KeyS") { pauseMove(1); playUiNavigate(); return; }
    if (e.code === "Enter" || e.code === "Space") {
      const o = pauseOptions[pauseIndex];
      if (o?.action === "resume") closeOnlineOverlay();
      else if (o?.action === "settings") { resetSettingsFocus(); setOnlineOverlay("settings"); }
      else if (o?.action === "controls") { resetControlsFocus(); setOnlineOverlay("controls"); }
      else if (o?.action === "quit") { closeOnlineOverlay(); cancelOnline(); }
      playUiConfirm();
      return;
    }
    return;
  }
  if (e.code === "Escape" && canPause()) {
    pauseGame();
    playUiConfirm();
    return;
  }
  if (
    e.code === "Escape" && gameMode === "online" && isOnlineActive() &&
    (state === "play" || state === "serve" || state === "point")
  ) {
    openOnlineOverlay();
    playUiConfirm();
    return;
  }
  if (state === "serve") handleServeKeyDown(e.code, CONTROL);
  // Enter as well as Space: a controller's confirm button emits Enter, and this
  // is the one screen a pad player would otherwise be stranded on.
  if ((e.code === "Space" || e.code === "Enter") && state === "over") {
    if (isOnlineActive()) cancelOnline();
    else toMenu();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  handleServeKeyUp(e.code, CONTROL);
});

canvas.addEventListener("mousemove", (e) => {
  const { mx, my } = eventToCanvas(canvas, e);
  if ((state === "settings" || onlineOverlay === "settings") && settingsDragging) {
    handleSettingsPointer(mx, my, "move");
    return;
  }
  if (state === "pause" || onlineOverlay === "pause") {
    pauseOptions.forEach((o, i) => {
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h && i !== pauseIndex) {
        setPauseIndex(i);
        playUiNavigate();
      }
    });
    return;
  }
  if (onlineOverlay != null) return;
  if (state === "modeSelect") {
    modeOptions.forEach((o, i) => {
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h && i !== modeIndex) {
        setModeIndex(i);
        playUiNavigate();
      }
    });
    return;
  }
  if (state !== "menu") return;
  menuOptions.forEach((o, i) => {
    if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
      if (i !== menuIndex) {
        setMenuIndex(i);
        playUiNavigate();
      }
    }
  });
});

window.addEventListener("mouseup", () => {
  if (settingsDragging) {
    handleSettingsPointer(0, 0, "up");
    settingsDragging = false;
  }
});

canvas.addEventListener("mousedown", (e) => {
  const { mx, my } = eventToCanvas(canvas, e);
  if (leaveTitleScreen()) return;
  if (state === "searching") {
    cancelOnline();
    playUiConfirm();
    return;
  }
  if (state === "disconnect") {
    toMenu();
    playUiConfirm();
    return;
  }
  if (state === "pause") {
    for (let i = 0; i < pauseOptions.length; i++) {
      const o = pauseOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        setPauseIndex(i);
        if (o.action === "settings") resetSettingsFocus();
        if (o.action === "controls") resetControlsFocus();
        pauseSelect();
        playUiConfirm();
        if (o.action === "quit" && isOnlineActive()) cancelOnline();
        return;
      }
    }
    return;
  }
  if (onlineOverlay === "pause") {
    for (let i = 0; i < pauseOptions.length; i++) {
      const o = pauseOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        setPauseIndex(i);
        if (o.action === "resume") closeOnlineOverlay();
        else if (o.action === "settings") { resetSettingsFocus(); setOnlineOverlay("settings"); }
        else if (o.action === "controls") { resetControlsFocus(); setOnlineOverlay("controls"); }
        else if (o.action === "quit") { closeOnlineOverlay(); cancelOnline(); }
        playUiConfirm();
        return;
      }
    }
    return;
  }
  if (onlineOverlay === "settings") {
    if (handleSettingsPointer(mx, my, "down")) {
      settingsDragging = true;
      playUiConfirm();
      return;
    }
    setOnlineOverlay("pause");
    playUiConfirm();
    return;
  }
  if (onlineOverlay === "controls") {
    if (handleControlsPointer(mx, my, "down")) playUiConfirm();
    else { setOnlineOverlay("pause"); playUiConfirm(); }
    return;
  }
  if (state === "settings") {
    if (handleSettingsPointer(mx, my, "down")) {
      settingsDragging = true;
      playUiConfirm();
      return;
    }
    leaveSubmenuScreen();
    return;
  }
  if (state === "modeSelect") {
    const c = creditsLink;
    if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
      enterCredits();
      playUiConfirm();
      return;
    }
    for (let i = 0; i < modeOptions.length; i++) {
      const o = modeOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        if (o.disabled) return;
        setModeIndex(i);
        if (modeSelectChoose()) playUiConfirm();
        return;
      }
    }
    return;
  }
  if (state === "menu") {
    for (let i = 0; i < menuOptions.length; i++) {
      const o = menuOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        if (o.disabled) return;
        setMenuIndex(i);
        if (o.action === "settings") resetSettingsFocus();
        if (o.action === "controls") resetControlsFocus();
        if (o.action === "profile") resetProfileFocus();
        if (o.action === "leaderboard") resetLeaderboard();
        if (o.action === "customize") { openLab(); playUiConfirm(); return; }
        if (o.action === "online") { startOnlineFromMenu(); return; }
        if (o.action === "quit") { playUiConfirm(); quitApp(); return; }
        if (menuSelect()) playUiConfirm();
        else if (SUBMENU_ACTIONS.includes(o.action)) playUiConfirm();
        return;
      }
    }
  } else if (state === "controls") {
    if (handleControlsPointer(mx, my, "down")) playUiConfirm();
    else leaveSubmenuScreen();
  } else if (state === "profile") {
    if (handleProfilePointer(mx, my, "down")) playUiConfirm();
    else if (!isEditingName()) leaveSubmenuScreen();
  } else if (state === "leaderboard") {
    if (handleLeaderboardPointer(mx, my, "down")) playUiConfirm();
    else leaveSubmenuScreen();
  } else if (state === "credits") {
    leaveSubmenuScreen();
  } else if (state === "over") {
    if (isOnlineActive()) cancelOnline();
    else toMenu();
  }
});

wireDomControls();
resetPositions();
// The title screen opens onto a CPU-vs-CPU rally running behind the UI.
startAttract();
syncRobotPartsToDom();
initTouchControls(canvas, keys);
initGamepads();
initInputDevice();

preloadAssets(setSplashProgress).then(() => {
  hideSplash();
  requestAnimationFrame(frame);
});

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  // Controllers feed the same input path as the keyboard (synthetic key events),
  // so this must run before readInput drains the key state for this frame.
  pollGamepads(now);

  readInput(keys, CONTROL);

  const uiBlocked = state === "searching" || state === "disconnect";
  const online = gameMode === "online" || isOnlineActive();
  const { runSim } = online
    ? tickOnline(now, keys, dt)
    : { runSim: !uiBlocked };

  if (runSim) {
    tickServe(dt);
  }

  if (state !== prevState) {
    onStateChange(prevState, state);
    if (state === "over") {
      onMatchEnd({ mode: gameMode, winner, scores: score, localSeat: onlineLocalSeat });
    }
    prevState = state;
  }

  drainEvents(audioEvents);
  tickLotterySounds(state);

  const maxScore = Math.max(score[0], score[1]);
  // The menu demo's rally must not drive the music — that tracks real matches.
  const ballSpeed = ball.live && !attractActive ? Math.hypot(ball.vx, ball.vy) : 0;
  tickMusicIntensity(maxScore, ballSpeed);

  if (lotteryTick !== lastLotteryTick) {
    lastLotteryTick = lotteryTick;
    syncRobotPartsToDom();
  }

  if (runSim) {
    acc += dt;
    while (acc >= PHYSICS_STEP) {
      tickPhysics();
      acc -= PHYSICS_STEP;
    }
  } else {
    acc = 0;
  }

  setRenderRemainder(acc);
  render();
  requestAnimationFrame(frame);
}

initAudio();
