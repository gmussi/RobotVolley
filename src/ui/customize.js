/** Robot Lab — in-game customization panel (neon DOM UI). */
import { P1, P2, robots, gameMode } from "../engine/game.js";
import { COLOR_PRESETS } from "../data/theme.js";
import { HEAD_TYPES } from "../data/heads.js";
import { TORSO_TYPES } from "../data/torsos.js";
import { ARM_TYPES } from "../data/arms.js";

const LEG_TYPES = [
  { id: "normal", label: "Robot" },
  { id: "power", label: "Power" },
  { id: "rocket", label: "Rocket" },
];

const PART_SECTIONS = [
  { key: "headType", label: "Head", options: () => Object.entries(HEAD_TYPES).map(([id, t]) => ({ id, label: t.label })) },
  { key: "torsoType", label: "Torso", options: () => Object.entries(TORSO_TYPES).map(([id, t]) => ({ id, label: t.label })) },
  { key: "armType", label: "Arms", options: () => Object.entries(ARM_TYPES).map(([id, t]) => ({ id, label: t.label })) },
  { key: "legType", label: "Legs", options: () => LEG_TYPES },
];

const COLOR_PARTS = ["head", "torso", "arms", "legs"];

let panelOpen = false;

export function isLabOpen() {
  return panelOpen;
}

export function openLab() {
  panelOpen = true;
  document.getElementById("customizePanel")?.classList.remove("hidden");
  renderLab();
}

export function closeLab() {
  panelOpen = false;
  document.getElementById("customizePanel")?.classList.add("hidden");
}

export function toggleLab() {
  if (panelOpen) closeLab();
  else openLab();
}

function swatchGrid(robot, playerIdx, part) {
  const current = robot.colors[part];
  return COLOR_PRESETS.map((hex) =>
    `<button type="button" class="swatch${current === hex ? " active" : ""}" data-player="${playerIdx}" data-part="${part}" data-color="${hex}" style="background:${hex}" aria-label="${part} color"></button>`,
  ).join("");
}

function partButtons(robot, playerIdx, section) {
  return section.options().map((o) =>
    `<button type="button" class="part-tile${robot[section.key] === o.id ? " active" : ""}" data-player="${playerIdx}" data-slot="${section.key}" data-type="${o.id}">${o.label}</button>`,
  ).join("");
}

function playerBlock(robot, playerIdx) {
  const tag = playerIdx === 0 ? "P1" : "P2";
  const tagClass = playerIdx === 0 ? "tag-p1" : "tag-p2";
  const colors = COLOR_PARTS.map((part) => `
    <div class="lab-row">
      <span class="lab-label">${part}</span>
      <div class="swatch-row">${swatchGrid(robot, playerIdx, part)}</div>
    </div>`).join("");
  const parts = PART_SECTIONS.map((sec) => `
    <div class="lab-row">
      <span class="lab-label">${sec.label}</span>
      <div class="part-row">${partButtons(robot, playerIdx, sec)}</div>
    </div>`).join("");
  return `
    <div class="lab-player">
      <div class="lab-player-title"><span class="${tagClass}"><b>${tag}</b></span> ROBOT</div>
      ${colors}${parts}
    </div>`;
}

function renderLab() {
  const el = document.getElementById("labContent");
  if (!el) return;
  el.innerHTML = playerBlock(P1, 0) + playerBlock(P2, 1);
  el.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      robots[Number(btn.dataset.player)].colors[btn.dataset.part] = btn.dataset.color;
      renderLab();
    });
  });
  el.querySelectorAll(".part-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      robots[Number(btn.dataset.player)][btn.dataset.slot] = btn.dataset.type;
      renderLab();
    });
  });
}

export function wireCustomizePanel() {
  document.getElementById("labClose")?.addEventListener("click", closeLab);
  renderLab();
}

export function syncRobotPartsToDom() {
  if (panelOpen) renderLab();
}

export function wireDomControls() {
  wireCustomizePanel();
}

export function updateHint() {
  const p2 = document.getElementById("p2hint");
  if (!p2) return;
  if (gameMode === "1p") {
    p2.innerHTML = '<span class="tag-p2"><b>PLAYER 2</b></span> &nbsp; <b style="color:#29b6f6">CPU</b> — computer controlled';
  } else if (gameMode === "online") {
    p2.innerHTML = '<span class="tag-p2"><b>ONLINE</b></span> &nbsp; you use <span class="kbd">A</span><span class="kbd">D</span><span class="kbd">W</span><span class="kbd">S</span><span class="kbd">F</span> — opponent is remote';
  } else {
    p2.innerHTML = '<span class="tag-p2"><b>PLAYER 2</b></span> &nbsp; <span class="kbd">&larr;</span><span class="kbd">&rarr;</span> move &nbsp; <span class="kbd">&uarr;</span> jump &nbsp; hold <span class="kbd">&darr;</span> serve &nbsp; <span class="kbd">/</span> attack';
  }
}
