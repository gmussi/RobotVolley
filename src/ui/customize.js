/** Robot Lab — in-game customization panel (neon DOM UI). */
import { P1, P2, robots, applyItems } from "../engine/game.js";
import { COLOR_PRESETS } from "../data/theme.js";
import { ACCESSORIES, WEAPONS } from "../data/items.js";

function itemOptions(registry) {
  return Object.entries(registry).map(([id, t]) => ({ id, label: t.label }));
}

const PART_SECTIONS = [
  // Accessories can be cleared back to an all-standard body; a weapon cannot —
  // clearing one just means carrying the starter, which is itself an option.
  {
    key: "accessory",
    label: "Accessory",
    options: () => [{ id: "", label: "None" }].concat(itemOptions(ACCESSORIES)),
  },
  { key: "weapon", label: "Weapon", options: () => itemOptions(WEAPONS) },
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
  const current = robot[section.key] ?? "";
  return section.options().map((o) =>
    `<button type="button" class="part-tile${current === o.id ? " active" : ""}" data-player="${playerIdx}" data-slot="${section.key}" data-type="${o.id}">${o.label}</button>`,
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
      const robot = robots[Number(btn.dataset.player)];
      robot[btn.dataset.slot] = btn.dataset.type || null;
      applyItems(robot);
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
