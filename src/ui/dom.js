/** DOM panels outside the canvas — color pickers, leg types, hint text. */
import { P1, P2, robots, gameMode } from "../engine/game.js";

export function wireDomControls() {
  [P1, P2].forEach((r, i) => {
    const prefix = i === 0 ? "p1" : "p2";
    for (const part of ["head", "torso", "arms", "legs"]) {
      const input = document.getElementById(`${prefix}-${part}`);
      if (!input) continue;
      input.value = r.colors[part];
      input.addEventListener("input", () => { r.colors[part] = input.value; });
    }
  });

  document.querySelectorAll(".legGroup").forEach((group) => {
    const r = robots[Number(group.dataset.player)];
    group.querySelectorAll(".legBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        r.legType = btn.dataset.type;
        group.querySelectorAll(".legBtn").forEach((b) =>
          b.classList.toggle("active", b === btn));
      });
    });
  });

  document.querySelectorAll(".headGroup").forEach((group) => {
    const r = robots[Number(group.dataset.player)];
    group.querySelectorAll(".headBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        r.headType = btn.dataset.type;
        group.querySelectorAll(".headBtn").forEach((b) =>
          b.classList.toggle("active", b === btn));
      });
    });
  });
}

export function updateHint() {
  const p2 = document.getElementById("p2hint");
  if (!p2) return;
  if (gameMode === "1p") {
    p2.innerHTML = '<span class="tag-p2"><b>PLAYER 2</b></span> &nbsp; <b style="color:#29b6f6">CPU</b> &mdash; computer controlled';
  } else {
    p2.innerHTML = '<span class="tag-p2"><b>PLAYER 2</b></span> &nbsp; <span class="kbd">&larr;</span><span class="kbd">&rarr;</span> move &nbsp; <span class="kbd">&uarr;</span> jump &nbsp; hold <span class="kbd">&darr;</span> serve';
  }
}
