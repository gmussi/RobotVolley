/**
 * App entry — wires engine, renderer, and input. The only file that knows both sides.
 */
import "./styles/main.css";
import { CONTROL } from "./data/controls.js";
import {
  PHYSICS_STEP, state, menuOptions, menuIndex, lotteryTick,
  score, ball, audioEvents,
  startGame, toMenu, resetPositions,
  menuMove, menuSelect, setMenuIndex,
  pauseOptions, pauseIndex, pauseMove, pauseSelect, setPauseIndex,
  pauseGame, resumeFromPause, leaveSubmenu, canPause,
  handleServeKeyDown, handleServeKeyUp,
  readInput, tickServe, tickPhysics,
} from "./engine/game.js";
import { initRender, render, setRenderRemainder } from "./ui/render.js";
import { initViewport, eventToCanvas } from "./ui/viewport.js";
import { wireDomControls, updateHint, syncRobotPartsToDom, openLab } from "./ui/customize.js";
import { initTouchControls, drawTouchControls } from "./ui/touchControls.js";
import { preloadAssets, hideSplash, setSplashProgress } from "./ui/preload.js";
import {
  initAudio, drainEvents, onStateChange, tickLotterySounds,
  tickMusicIntensity, playUiNavigate, playUiConfirm,
} from "./audio/manager.js";
import {
  resetSettingsFocus, handleSettingsKey, handleSettingsPointer,
} from "./ui/settings.js";

const canvas = document.getElementById("game");
const stage = document.getElementById("stage");
const fsBtn = document.getElementById("fsBtn");
initRender(canvas);
initViewport(canvas, stage, fsBtn);

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

window.addEventListener("keydown", (e) => {
  if (e.code in CONTROL || e.code === "Space") e.preventDefault();
  keys.add(e.code);
  if (state === "pause") {
    if (e.code === "Escape") { resumeFromPause(); playUiConfirm(); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { pauseMove(-1); playUiNavigate(); return; }
    if (e.code === "ArrowDown" || e.code === "KeyS") { pauseMove(1); playUiNavigate(); return; }
    if (e.code === "Enter" || e.code === "Space") {
      const o = pauseOptions[pauseIndex];
      if (o?.action === "settings") resetSettingsFocus();
      pauseSelect();
      playUiConfirm();
      if (o?.action === "quit") updateHint();
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
      if (o?.action === "customize") { openLab(); playUiConfirm(); return; }
      if (menuSelect()) { playUiConfirm(); updateHint(); }
      else if (o?.action === "settings" || o?.action === "controls") playUiConfirm();
    }
    else if (e.code === "Digit1" || e.code === "Numpad1") { startGame("1p"); playUiConfirm(); updateHint(); }
    else if (e.code === "Digit2" || e.code === "Numpad2") { startGame("2p"); playUiConfirm(); updateHint(); }
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
    if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) {
      leaveSubmenuScreen();
    }
    return;
  }
  if (e.code === "Escape" && canPause()) {
    pauseGame();
    playUiConfirm();
    return;
  }
  if (state === "serve") handleServeKeyDown(e.code, CONTROL);
  if (e.code === "Space" && state === "over") toMenu();
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
  if (state === "pause") {
    for (let i = 0; i < pauseOptions.length; i++) {
      const o = pauseOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        setPauseIndex(i);
        if (o.action === "settings") resetSettingsFocus();
        pauseSelect();
        playUiConfirm();
        if (o.action === "quit") updateHint();
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
    for (let i = 0; i < menuOptions.length; i++) {
      const o = menuOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        if (o.disabled) return;
        setMenuIndex(i);
        if (o.action === "settings") resetSettingsFocus();
        if (o.action === "customize") { openLab(); playUiConfirm(); return; }
        if (menuSelect()) { playUiConfirm(); updateHint(); }
        else if (o.action === "settings" || o.action === "controls") playUiConfirm();
        return;
      }
    }
  } else if (state === "controls") {
    leaveSubmenuScreen();
  } else if (state === "over") {
    toMenu();
  }
});

wireDomControls();
resetPositions();
syncRobotPartsToDom();
initTouchControls(canvas, keys);

preloadAssets(setSplashProgress).then(() => {
  hideSplash();
  requestAnimationFrame(frame);
});

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  readInput(keys, CONTROL);
  tickServe(dt);

  if (state !== prevState) {
    onStateChange(prevState, state);
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

  acc += dt;
  while (acc >= PHYSICS_STEP) {
    tickPhysics();
    acc -= PHYSICS_STEP;
  }

  setRenderRemainder(acc);
  render();
  requestAnimationFrame(frame);
}

initAudio();
