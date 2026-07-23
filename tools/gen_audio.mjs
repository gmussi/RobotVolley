#!/usr/bin/env node
/**
 * Export procedural SFX/music buffers as WAV files for src/assets/audio/.
 * Run: node tools/gen_audio.mjs
 *
 * Requires a browser AudioContext — uses offline rendering via web-audio-api
 * is not available in Node without deps. This script writes WAV from inline
 * PCM generators mirroring src/audio/procedural.js durations.
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../src/assets/audio");

mkdirSync(OUT, { recursive: true });

const SAMPLE_RATE = 44100;

function writeWav(name, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buffer);
}

function render(duration, fn) {
  const n = Math.ceil(duration * SAMPLE_RATE);
  const data = new Float32Array(n);
  fn(data, SAMPLE_RATE, n);
  return data;
}

function env(sampleRate, attack, decay, sustain, release, totalDur) {
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

function tone(data, sr, freq, start, dur, gain, type = "sine") {
  const startI = Math.floor(start * sr);
  const endI = Math.min(data.length, startI + Math.floor(dur * sr));
  const e = env(sr, 0.005, 0.05, 0.6, 0.08, dur);
  for (let i = startI; i < endI; i++) {
    const t = (i - startI) / sr;
    const ph = 2 * Math.PI * freq * t;
    let v;
    if (type === "sine") v = Math.sin(ph);
    else if (type === "square") v = Math.sign(Math.sin(ph));
    else if (type === "triangle") v = 2 * Math.abs(2 * (freq * t % 1) - 1) - 1;
    else v = 2 * (freq * t % 1) - 1;
    data[i] += v * gain * e(i - startI);
  }
}

function noise(data, sr, start, dur, gain, filter = 0.3) {
  const startI = Math.floor(start * sr);
  const endI = Math.min(data.length, startI + Math.floor(dur * sr));
  const e = env(sr, 0.002, 0.04, 0.4, 0.06, dur);
  let prev = 0;
  for (let i = startI; i < endI; i++) {
    const raw = Math.random() * 2 - 1;
    prev = prev * (1 - filter) + raw * filter;
    data[i] += prev * gain * e(i - startI);
  }
}

const exports = {
  "sfx_ui_navigate.wav": () => render(0.08, (d, sr) => {
    tone(d, sr, 880, 0, 0.07, 0.18, "square");
    tone(d, sr, 1320, 0.02, 0.05, 0.1, "sine");
  }),
  "sfx_ui_confirm.wav": () => render(0.15, (d, sr) => {
    tone(d, sr, 523, 0, 0.08, 0.2, "square");
    tone(d, sr, 784, 0.06, 0.09, 0.22, "square");
  }),
  "sfx_ball_hit.wav": () => render(0.12, (d, sr) => {
    noise(d, sr, 0, 0.06, 0.35, 0.5);
    tone(d, sr, 180, 0, 0.1, 0.25, "sine");
  }),
  "sfx_ball_net.wav": () => render(0.1, (d, sr) => {
    tone(d, sr, 620, 0, 0.04, 0.2, "triangle");
    tone(d, sr, 930, 0.02, 0.06, 0.15, "sine");
  }),
  "sfx_ball_wall.wav": () => render(0.09, (d, sr) => {
    tone(d, sr, 320, 0, 0.07, 0.22, "sine");
  }),
  "sfx_serve_launch.wav": () => render(0.2, (d, sr) => {
    noise(d, sr, 0, 0.12, 0.2, 0.4);
    tone(d, sr, 220, 0.1, 0.08, 0.2, "sine");
  }),
  "sfx_point_score.wav": () => render(0.45, (d, sr) => {
    tone(d, sr, 440, 0, 0.12, 0.2, "square");
    tone(d, sr, 554, 0.1, 0.12, 0.2, "square");
    tone(d, sr, 659, 0.2, 0.2, 0.25, "square");
  }),
  "sfx_match_win.wav": () => render(0.7, (d, sr) => {
    tone(d, sr, 523, 0, 0.15, 0.22, "square");
    tone(d, sr, 659, 0.12, 0.15, 0.22, "square");
    tone(d, sr, 784, 0.24, 0.15, 0.22, "square");
    tone(d, sr, 1047, 0.36, 0.3, 0.28, "square");
  }),
  "sfx_smash.wav": () => render(0.18, (d, sr) => {
    noise(d, sr, 0, 0.08, 0.45, 0.35);
    tone(d, sr, 80, 0, 0.14, 0.35, "sine");
  }),
  "sfx_deflect.wav": () => render(0.1, (d, sr) => {
    tone(d, sr, 1200, 0, 0.05, 0.22, "triangle");
  }),
  "sfx_attack_start.wav": () => render(0.14, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] += Math.sin(2 * Math.PI * (200 + t * 600) * t) * 0.15 * (1 - t / 0.14);
    }
  }),
  "sfx_lottery_tick.wav": () => render(0.05, (d, sr) => {
    tone(d, sr, 1400, 0, 0.04, 0.18, "square");
  }),
  "sfx_lottery_land.wav": () => render(0.25, (d, sr) => {
    tone(d, sr, 330, 0, 0.08, 0.25, "sine");
    tone(d, sr, 660, 0.12, 0.12, 0.2, "sine");
  }),
  "sfx_magnet_catch.wav": () => render(0.12, (d, sr) => {
    tone(d, sr, 600, 0, 0.06, 0.2, "sine");
    tone(d, sr, 900, 0.04, 0.06, 0.18, "triangle");
  }),
  "sfx_magnet_release.wav": () => render(0.1, (d, sr) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] += Math.sin(2 * Math.PI * (800 - t * 500) * t) * 0.15 * (1 - t / 0.1);
    }
  }),
  "sfx_rocket_flap.wav": () => render(0.08, (d, sr) => {
    noise(d, sr, 0, 0.06, 0.25, 0.45);
    tone(d, sr, 150, 0, 0.06, 0.2, "sine");
  }),
  "sfx_drill_shove.wav": () => render(0.1, (d, sr) => {
    noise(d, sr, 0, 0.08, 0.2, 0.25);
    tone(d, sr, 120, 0, 0.08, 0.25, "saw");
  }),
  "music_menu_loop.wav": () => {
    const beat = 60 / 100;
    const dur = beat * 16;
    return render(dur, (d, sr) => {
      const notes = [262, 330, 392, 523, 392, 330, 294, 330];
      for (let b = 0; b < 16; b++) {
        tone(d, sr, notes[b % notes.length], b * beat * 0.5, beat * 0.4, 0.08, "square");
        tone(d, sr, notes[b % notes.length] / 2, b * beat * 0.5, beat * 0.45, 0.06, "triangle");
      }
      for (let b = 0; b < 8; b++) tone(d, sr, 65, b * beat, beat * 0.8, 0.1, "sine");
    });
  },
  // music_match_loop — hand-placed MP3 in src/assets/audio/ (not generated)
  "music_victory_stinger.wav": () => render(3.5, (d, sr) => {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    melody.forEach((f, i) => {
      tone(d, sr, f, i * 0.35, 0.3, 0.18, "square");
      tone(d, sr, f / 2, i * 0.35, 0.32, 0.1, "sine");
    });
  }),
};

for (const [name, gen] of Object.entries(exports)) {
  writeWav(name, gen());
  console.log("wrote", name);
}

console.log(`Done — ${Object.keys(exports).length} files in ${OUT}`);
