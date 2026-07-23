/** Keyboard bindings. Pure data. */

export const CONTROL = {
  KeyA: { player: 0, act: "left" },
  KeyD: { player: 0, act: "right" },
  KeyW: { player: 0, act: "jump" },
  KeyS: { player: 0, act: "serve" },
  KeyF: { player: 0, act: "attack" },
  ArrowLeft: { player: 1, act: "left" },
  ArrowRight: { player: 1, act: "right" },
  ArrowUp: { player: 1, act: "jump" },
  ArrowDown: { player: 1, act: "serve" },
  Slash: { player: 1, act: "attack" },
};

export function codeFor(player, act) {
  for (const [code, c] of Object.entries(CONTROL))
    if (c.player === player && c.act === act) return code;
  return null;
}
