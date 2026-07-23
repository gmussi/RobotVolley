/**
 * Maps engine audio event types to SFX ids and playback parameters.
 */

const BALL_MAX_REF = 1150;

/**
 * @param {string} type
 * @param {Record<string, unknown>} data
 * @returns {{ id: string, pitch?: number, volume?: number }|null}
 */
export function mapEngineEvent(type, data) {
  switch (type) {
    case "ball_hit": {
      const speed = /** @type {number} */ (data.speed ?? 400);
      const pitch = 0.75 + (speed / BALL_MAX_REF) * 0.5;
      const volume = 0.5 + Math.min(0.5, speed / BALL_MAX_REF);
      return { id: "ball_hit", pitch, volume };
    }
    case "ball_net":
      return { id: "ball_net", pitch: 0.9 + Math.random() * 0.2, volume: 0.7 };
    case "ball_wall":
      return { id: "ball_wall", pitch: 0.85 + Math.random() * 0.3, volume: 0.65 };
    case "serve_launch": {
      const charge = /** @type {number} */ (data.charge ?? 0.5);
      return { id: "serve_launch", pitch: 0.8 + charge * 0.4, volume: 0.5 + charge * 0.4 };
    }
    case "point_score":
      return { id: "point_score", volume: 0.85 };
    case "match_win":
      return { id: "match_win", volume: 0.9 };
    case "smash":
      return { id: "smash", pitch: 0.95 + Math.random() * 0.1, volume: 0.9 };
    case "deflect":
      return { id: "deflect", pitch: 0.9 + Math.random() * 0.2, volume: 0.75 };
    case "attack_start":
      return { id: "attack_start", volume: 0.6 };
    case "lottery_land":
      return { id: "lottery_land", volume: 0.8 };
    case "magnet_catch":
      return { id: "magnet_catch", volume: 0.75 };
    case "magnet_release":
      return { id: "magnet_release", volume: 0.65 };
    case "rocket_flap":
      return { id: "rocket_flap", pitch: 0.9 + Math.random() * 0.2, volume: 0.55 };
    case "drill_shove":
      return { id: "drill_shove", volume: 0.7 };
    default:
      return null;
  }
}

export function uiNavigate() {
  return { id: "ui_navigate", pitch: 0.95 + Math.random() * 0.1, volume: 0.5 };
}

export function uiConfirm() {
  return { id: "ui_confirm", volume: 0.65 };
}

export function lotteryTick() {
  return { id: "lottery_tick", pitch: 0.85 + Math.random() * 0.3, volume: 0.45 };
}
