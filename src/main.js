/**
 * App entry — wires engine, renderer, and input. The only file that knows both sides.
 */
import "./styles/main.css";
import { CONTROL } from "./data/controls.js";
import {
  W, PHYSICS_STEP, state, menuOptions, lotteryTick,
  startGame, toMenu, resetPositions,
  menuMove, menuSelect, setMenuIndex,
  handleServeKeyDown, handleServeKeyUp,
  readInput, tickServe, tickPhysics,
} from "./engine/game.js";
import { initRender, render, setRenderRemainder } from "./ui/render.js";
import { initViewport, eventToCanvas } from "./ui/viewport.js";
import { wireDomControls, updateHint, syncRobotPartsToDom } from "./ui/dom.js";

const canvas = document.getElementById("game");
const stage = document.getElementById("stage");
const fsBtn = document.getElementById("fsBtn");
initRender(canvas);
initViewport(canvas, stage, fsBtn);

const keys = new Set();

window.addEventListener("keydown", (e) => {
  if (e.code in CONTROL || e.code === "Space") e.preventDefault();
  keys.add(e.code);
  if (state === "menu") {
    if (e.code === "ArrowUp" || e.code === "KeyW") menuMove(-1);
    else if (e.code === "ArrowDown" || e.code === "KeyS") menuMove(1);
    else if (e.code === "Enter" || e.code === "Space") { if (menuSelect()) updateHint(); }
    else if (e.code === "Digit1" || e.code === "Numpad1") { startGame("1p"); updateHint(); }
    else if (e.code === "Digit2" || e.code === "Numpad2") { startGame("2p"); updateHint(); }
    return;
  }
  if (state === "controls") {
    if (["Enter", "Space", "Escape", "Backspace"].includes(e.code)) toMenu();
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
  if (state !== "menu") return;
  const { mx, my } = eventToCanvas(canvas, e);
  menuOptions.forEach((o, i) => {
    if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) setMenuIndex(i);
  });
});

canvas.addEventListener("mousedown", (e) => {
  const { mx, my } = eventToCanvas(canvas, e);
  if (state === "menu") {
    for (let i = 0; i < menuOptions.length; i++) {
      const o = menuOptions[i];
      if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
        if (o.disabled) return;
        setMenuIndex(i);
        if (menuSelect()) updateHint();
        return;
      }
    }
  } else if (state === "controls" || state === "over") {
    toMenu();
  }
});

wireDomControls();
resetPositions();
syncRobotPartsToDom();

let lastLotteryTick = 0;
let last = performance.now();
let acc = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  readInput(keys, CONTROL);
  tickServe(dt);
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

requestAnimationFrame(frame);
