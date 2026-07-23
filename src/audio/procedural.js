/**
 * Procedural SFX and music buffer generation via Web Audio API.
 * Used as fallback when no file assets are present; also the source of truth
 * for tools/gen_audio.mjs when exporting WAV files.
 */

function renderBuffer(ctx, duration, sampleRate, fn) {
  const length = Math.ceil(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  fn(data, sampleRate, length);
  return buffer;
}

function env(data, sampleRate, attack, decay, sustain, release, totalDur) {
  const a = Math.floor(attack * sampleRate);
  const d = Math.floor(decay * sampleRate);
  const r = Math.floor(release * sampleRate);
  const sustainStart = a + d;
  const releaseStart = Math.floor(totalDur * sampleRate) - r;
  return (i) => {
    if (i < a) return i / Math.max(1, a);
    if (i < sustainStart) return 1 - (1 - sustain) * ((i - a) / Math.max(1, d));
    if (i < releaseStart) return sustain;
    return sustain * (1 - (i - releaseStart) / Math.max(1, r));
  };
}

function tone(data, sampleRate, freq, start, dur, gain, type = "sine") {
  const startI = Math.floor(start * sampleRate);
  const endI = Math.min(data.length, startI + Math.floor(dur * sampleRate));
  const e = env(data, sampleRate, 0.005, 0.05, 0.6, 0.08, dur);
  for (let i = startI; i < endI; i++) {
    const t = (i - startI) / sampleRate;
    let v;
    const ph = 2 * Math.PI * freq * t;
    if (type === "sine") v = Math.sin(ph);
    else if (type === "square") v = Math.sign(Math.sin(ph));
    else if (type === "triangle") v = 2 * Math.abs(2 * (freq * t % 1) - 1) - 1;
    else if (type === "saw") v = 2 * (freq * t % 1) - 1;
    else v = Math.sin(ph) + 0.3 * Math.sin(ph * 2);
    data[i] += v * gain * e(i - startI);
  }
}

function noise(data, sampleRate, start, dur, gain, filter = 0.3) {
  const startI = Math.floor(start * sampleRate);
  const endI = Math.min(data.length, startI + Math.floor(dur * sampleRate));
  const e = env(data, sampleRate, 0.002, 0.04, 0.4, 0.06, dur);
  let prev = 0;
  for (let i = startI; i < endI; i++) {
    const raw = Math.random() * 2 - 1;
    prev = prev * (1 - filter) + raw * filter;
    data[i] += prev * gain * e(i - startI);
  }
}

export function makeUiNavigate(ctx) {
  return renderBuffer(ctx, 0.08, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 880, 0, 0.07, 0.18, "square");
    tone(data, sr, 1320, 0.02, 0.05, 0.1, "sine");
  });
}

export function makeUiConfirm(ctx) {
  return renderBuffer(ctx, 0.15, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 523, 0, 0.08, 0.2, "square");
    tone(data, sr, 784, 0.06, 0.09, 0.22, "square");
  });
}

export function makeBallHit(ctx) {
  return renderBuffer(ctx, 0.12, ctx.sampleRate, (data, sr) => {
    noise(data, sr, 0, 0.06, 0.35, 0.5);
    tone(data, sr, 180, 0, 0.1, 0.25, "sine");
    tone(data, sr, 90, 0.01, 0.08, 0.15, "triangle");
  });
}

export function makeBallNet(ctx) {
  return renderBuffer(ctx, 0.1, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 620, 0, 0.04, 0.2, "triangle");
    tone(data, sr, 930, 0.02, 0.06, 0.15, "sine");
    noise(data, sr, 0, 0.03, 0.08, 0.6);
  });
}

export function makeBallWall(ctx) {
  return renderBuffer(ctx, 0.09, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 320, 0, 0.07, 0.22, "sine");
    tone(data, sr, 480, 0.01, 0.05, 0.12, "triangle");
  });
}

export function makeServeLaunch(ctx) {
  return renderBuffer(ctx, 0.2, ctx.sampleRate, (data, sr) => {
    noise(data, sr, 0, 0.12, 0.2, 0.4);
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const f = 400 + t * 800;
      data[i] += Math.sin(2 * Math.PI * f * t) * 0.12 * (1 - t / 0.2);
    }
    tone(data, sr, 220, 0.1, 0.08, 0.2, "sine");
  });
}

export function makePointScore(ctx) {
  return renderBuffer(ctx, 0.45, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 440, 0, 0.12, 0.2, "square");
    tone(data, sr, 554, 0.1, 0.12, 0.2, "square");
    tone(data, sr, 659, 0.2, 0.2, 0.25, "square");
    noise(data, sr, 0.05, 0.35, 0.12, 0.2);
  });
}

export function makeMatchWin(ctx) {
  return renderBuffer(ctx, 0.7, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 523, 0, 0.15, 0.22, "square");
    tone(data, sr, 659, 0.12, 0.15, 0.22, "square");
    tone(data, sr, 784, 0.24, 0.15, 0.22, "square");
    tone(data, sr, 1047, 0.36, 0.3, 0.28, "square");
    noise(data, sr, 0.1, 0.55, 0.15, 0.15);
  });
}

export function makeSmash(ctx) {
  return renderBuffer(ctx, 0.18, ctx.sampleRate, (data, sr) => {
    noise(data, sr, 0, 0.08, 0.45, 0.35);
    tone(data, sr, 80, 0, 0.14, 0.35, "sine");
    tone(data, sr, 160, 0.02, 0.1, 0.2, "triangle");
  });
}

export function makeDeflect(ctx) {
  return renderBuffer(ctx, 0.1, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 1200, 0, 0.05, 0.22, "triangle");
    tone(data, sr, 1800, 0.03, 0.05, 0.15, "sine");
    noise(data, sr, 0, 0.04, 0.06, 0.7);
  });
}

export function makeAttackStart(ctx) {
  return renderBuffer(ctx, 0.14, ctx.sampleRate, (data, sr) => {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const f = 200 + t * 600;
      data[i] += Math.sin(2 * Math.PI * f * t) * 0.15 * (1 - t / 0.14);
    }
  });
}

export function makeLotteryTick(ctx) {
  return renderBuffer(ctx, 0.05, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 1400, 0, 0.04, 0.18, "square");
  });
}

export function makeLotteryLand(ctx) {
  return renderBuffer(ctx, 0.25, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 330, 0, 0.08, 0.25, "sine");
    tone(data, sr, 440, 0.06, 0.1, 0.22, "square");
    tone(data, sr, 660, 0.12, 0.12, 0.2, "sine");
    noise(data, sr, 0, 0.06, 0.15, 0.4);
  });
}

export function makeMagnetCatch(ctx) {
  return renderBuffer(ctx, 0.12, ctx.sampleRate, (data, sr) => {
    tone(data, sr, 600, 0, 0.06, 0.2, "sine");
    tone(data, sr, 900, 0.04, 0.06, 0.18, "triangle");
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      data[i] += Math.sin(2 * Math.PI * (400 + t * 400) * t) * 0.1 * (1 - t / 0.12);
    }
  });
}

export function makeMagnetRelease(ctx) {
  return renderBuffer(ctx, 0.1, ctx.sampleRate, (data, sr) => {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const f = 800 - t * 500;
      data[i] += Math.sin(2 * Math.PI * f * t) * 0.15 * (1 - t / 0.1);
    }
  });
}

export function makeRocketFlap(ctx) {
  return renderBuffer(ctx, 0.08, ctx.sampleRate, (data, sr) => {
    noise(data, sr, 0, 0.06, 0.25, 0.45);
    tone(data, sr, 150, 0, 0.06, 0.2, "sine");
  });
}

export function makeDrillShove(ctx) {
  return renderBuffer(ctx, 0.1, ctx.sampleRate, (data, sr) => {
    noise(data, sr, 0, 0.08, 0.2, 0.25);
    tone(data, sr, 120, 0, 0.08, 0.25, "saw");
    tone(data, sr, 240, 0.02, 0.06, 0.15, "square");
  });
}

/** @param {AudioContext} ctx */
export function makeAllSfxBuffers(ctx) {
  return {
    ui_navigate: makeUiNavigate(ctx),
    ui_confirm: makeUiConfirm(ctx),
    ball_hit: makeBallHit(ctx),
    ball_net: makeBallNet(ctx),
    ball_wall: makeBallWall(ctx),
    serve_launch: makeServeLaunch(ctx),
    point_score: makePointScore(ctx),
    match_win: makeMatchWin(ctx),
    smash: makeSmash(ctx),
    deflect: makeDeflect(ctx),
    attack_start: makeAttackStart(ctx),
    lottery_tick: makeLotteryTick(ctx),
    lottery_land: makeLotteryLand(ctx),
    magnet_catch: makeMagnetCatch(ctx),
    magnet_release: makeMagnetRelease(ctx),
    rocket_flap: makeRocketFlap(ctx),
    drill_shove: makeDrillShove(ctx),
  };
}

/** Simple 4-bar loop renderer for menu / match music. */
function renderMusicLoop(ctx, bpm, bars, patternFn) {
  const beatDur = 60 / bpm;
  const duration = beatDur * 4 * bars;
  return renderBuffer(ctx, duration, ctx.sampleRate, (data, sr) => {
    patternFn(data, sr, beatDur, duration);
  });
}

export function makeMenuLoop(ctx) {
  const notes = [262, 330, 392, 523, 392, 330, 294, 330];
  return renderMusicLoop(ctx, 100, 4, (data, sr, beat, dur) => {
    for (let b = 0; b < 16; b++) {
      const t = b * beat * 0.5;
      if (t >= dur) break;
      tone(data, sr, notes[b % notes.length], t, beat * 0.4, 0.08, "square");
      tone(data, sr, notes[b % notes.length] / 2, t, beat * 0.45, 0.06, "triangle");
    }
    for (let b = 0; b < 8; b++) {
      const t = b * beat;
      tone(data, sr, 65, t, beat * 0.8, 0.1, "sine");
    }
  });
}

export function makeMatchLoop(ctx) {
  const arp = [392, 494, 587, 784, 587, 494];
  return renderMusicLoop(ctx, 125, 4, (data, sr, beat, dur) => {
    for (let b = 0; b < 32; b++) {
      const t = b * beat * 0.25;
      if (t >= dur) break;
      tone(data, sr, arp[b % arp.length], t, beat * 0.2, 0.06, "square");
    }
    for (let b = 0; b < 16; b++) {
      const t = b * beat * 0.5;
      if (b % 2 === 0) noise(data, sr, t, 0.04, 0.08, 0.5);
      tone(data, sr, 55, t, beat * 0.45, 0.12, "sine");
    }
    for (let b = 0; b < 8; b++) {
      const t = b * beat;
      tone(data, sr, 110, t, beat * 0.9, 0.07, "triangle");
    }
  });
}

export function makeVictoryStinger(ctx) {
  return renderBuffer(ctx, 3.5, ctx.sampleRate, (data, sr) => {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    melody.forEach((f, i) => {
      tone(data, sr, f, i * 0.35, 0.3, 0.18, "square");
      tone(data, sr, f / 2, i * 0.35, 0.32, 0.1, "sine");
    });
    noise(data, sr, 0.2, 2.5, 0.08, 0.15);
  });
}

export function makeAllMusicBuffers(ctx) {
  return {
    menu_loop: makeMenuLoop(ctx),
    match_loop: makeMatchLoop(ctx),
    victory_stinger: makeVictoryStinger(ctx),
  };
}
