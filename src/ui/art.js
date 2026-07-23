/**
 * Art asset loader. Prefers Gemini-painted WebPs when present; falls back to
 * procedural SVGs from tools/genart.py. Canvas drawImage uses the loaded URLs.
 */
import { W, H } from "../data/constants.js";

const bgWebps = import.meta.glob("../assets/bg/*.webp", { eager: true, import: "default" });
const logoWebps = import.meta.glob("../assets/logo.webp", { eager: true, import: "default" });

function pickUrl(glob, key) {
  for (const [path, url] of Object.entries(glob)) {
    if (path.includes(`/${key}.`)) return url;
  }
  return null;
}

function loadImage(url) {
  const img = new Image();
  if (url) img.src = url;
  return img;
}

export const stadiumBg = {
  sky: loadImage(pickUrl(bgWebps, "stadium-sky")),
  stadium: loadImage(pickUrl(bgWebps, "stadium-stadium")),
  court: loadImage(pickUrl(bgWebps, "stadium-court")),
  master: loadImage(pickUrl(bgWebps, "stadium-master")),
};

function imageReady(img) {
  return img?.complete && img.naturalWidth > 0;
}

export function stadiumLayersReady() {
  return imageReady(stadiumBg.sky)
    && imageReady(stadiumBg.stadium)
    && imageReady(stadiumBg.court);
}

export function stadiumBackdropReady() {
  return imageReady(stadiumBg.master) || stadiumLayersReady();
}

/** Pre-composited backdrop — one blit per frame instead of three alpha blends. */
let stadiumComposite = null;

export function rebuildStadiumComposite() {
  if (!stadiumBackdropReady()) {
    stadiumComposite = null;
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");

  // Prefer the opaque master — chroma-keyed layers often leave gaps when stacked.
  if (imageReady(stadiumBg.master)) {
    c.drawImage(stadiumBg.master, 0, 0, W, H);
  } else {
    c.fillStyle = "#060912";
    c.fillRect(0, 0, W, H);
    c.drawImage(stadiumBg.sky, 0, 0, W, H);
    c.drawImage(stadiumBg.stadium, 0, 0, W, H);
    c.drawImage(stadiumBg.court, 0, 0, W, H);
  }

  stadiumComposite = canvas;
  return stadiumComposite;
}

export function getStadiumComposite() {
  if (!stadiumComposite && stadiumBackdropReady()) rebuildStadiumComposite();
  return stadiumComposite;
}

export const arenaBgImage = loadImage(pickUrl(bgWebps, "arena"));
export const logoImage = loadImage(pickUrl(logoWebps, "logo"));

/** Wordmark centroid in logo.webp — used to center the readable title, not the full canvas. */
export const logoVisualAnchor = { x: 682.5 / 1181, y: 0.5 };
