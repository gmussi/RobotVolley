/**
 * App entry — wires engine, renderer, and input. The only file that knows both sides.
 */
// Self-hosted fonts (bundled by Vite) so the desktop/Steam build runs offline.
// Latin subset only — the UI copy is English; skips the Devanagari payload.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "./styles/main.css";
import { CONTROL } from "./data/controls.js";
import {
  PHYSICS_STEP, state, menuOptions, menuIndex, lotteryTick, creditsLink,
  score, ball, audioEvents, gameMode, winner, onlineLocalSeat,
  startGame, toMenu, enterMenu, enterCredits, resetPositions,
  menuMove, menuSelect, setMenuIndex,
  pauseOptions, pauseIndex, pauseMove, pauseSelect, setPauseIndex,
  pauseGame, resumeFromPause, leaveSubmenu, canPause,
  handleServeKeyDown, handleServeKeyUp,
  readInput, tickServe, tickPhysics,
} from "./engine/game.js";
import { initRender, render, setRenderRemainder } from "./ui/render.js";
import { initViewport, eventToCanvas } from "./ui/viewport.js";
import { wireDomControls, syncRobotPartsToDom, openLab } from "./ui/customize.js";
import { initTouchControls } from "./ui/touchControls.js";
import { initGamepads, pollGamepads } from "./input/gamepad.js";
import { preloadAssets, hideSplash, setSplashProgress } from "./ui/preload.js";
import {
  initAudio, drainEvents, onStateChange, tickLotterySounds,
  tickMusicIntensity, playUiNavigate, playUiConfirm,
} from "./audio/manager.js";
import {
  resetSettingsFocus, handleSettingsKey, handleSettingsPointer,
} from "./ui/settings.js";
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
// on the web build, so the option isn't shown there.
if (isDesktop) {
  menuOptions.push({ mode: null, action: "quit", label: "QUIT", disabled: false, x: 0, y: 0, w: 0, h: 0 });
}

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
  enterMenu();
  playUiConfirm();
  return true;
}

window.addEventListener("keydown", (e) => {
  if (e.code in CONTROL || e.code === "Space") e.preventDefault();
  keys.add(e.code);

  if (state === "title") {
    if (!MODIFIER_CODES.has(e.code)) leaveTitleScreen();
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
    if (e.code === "ArrowUp" || e.code === "KeyW") { menuMove(-1); playUiNavigate(); }
    else if (e.code === "ArrowDown" || e.code === "KeyS") { menuMove(1); playUiNavigate(); }
    else if (e.code === "Enter" || e.code === "Space") {
      const o = menuOptions[menuIndex];
      if (o?.action === "settings") resetSettingsFocus();
      if (o?.action === "controls") resetControlsFocus();
      if (o?.action === "customize") { openLab(); playUiConfirm(); return; }
      if (o?.action === "online") { startOnlineFromMenu(); return; }
      if (o?.action === "quit") { playUiConfirm(); quitApp(); return; }
      if (menuSelect()) playUiConfirm();
      else if (o?.action === "settings" || o?.action === "controls") playUiConfirm();
    }
    else if (e.code === "Digit1" || e.code === "Numpad1") { startGame("1p"); playUiConfirm(); }
    else if (e.code === "Digit2" || e.code === "Numpad2") { startGame("2p"); playUiConfirm(); }
    else if (e.code === "KeyC") { enterCredits(); playUiConfirm(); }
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
  if (e.code === "Escape" && canPause()) {
    pauseGame();
    playUiConfirm();
    return;
  }
  if (state === "serve") handleServeKeyDown(e.code, CONTROL);
  if (e.code === "Space" && state === "over") {
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
  if (state === "settings" && settingsDragging) {
    handleSettingsPointer(mx, my, "move");
    return;
  }
  if (state === "pause") {
    pauseOptions.forEach((o, i) => {
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h && i !== pauseIndex) {
        setPauseIndex(i);
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
  if (state === "settings") {
    if (handleSettingsPointer(mx, my, "down")) {
      settingsDragging = true;
      playUiConfirm();
      return;
    }
    leaveSubmenuScreen();
    return;
  }
  if (state === "menu") {
    const c = creditsLink;
    if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
      enterCredits();
      playUiConfirm();
      return;
    }
    for (let i = 0; i < menuOptions.length; i++) {
      const o = menuOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        if (o.disabled) return;
        setMenuIndex(i);
        if (o.action === "settings") resetSettingsFocus();
        if (o.action === "controls") resetControlsFocus();
        if (o.action === "customize") { openLab(); playUiConfirm(); return; }
        if (o.action === "online") { startOnlineFromMenu(); return; }
        if (o.action === "quit") { playUiConfirm(); quitApp(); return; }
        if (menuSelect()) playUiConfirm();
        else if (o.action === "settings" || o.action === "controls") playUiConfirm();
        return;
      }
    }
  } else if (state === "controls") {
    if (handleControlsPointer(mx, my, "down")) playUiConfirm();
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
syncRobotPartsToDom();
initTouchControls(canvas, keys);
initGamepads();

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
  const ballSpeed = ball.live ? Math.hypot(ball.vx, ball.vy) : 0;
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
