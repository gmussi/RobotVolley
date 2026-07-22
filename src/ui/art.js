/**
 * Art asset loader. Prefers Gemini-painted WebPs when present; falls back to
 * procedural SVGs from tools/genart.py. Canvas drawImage uses the loaded URLs.
 */
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

export const arenaBgImage = loadImage(pickUrl(bgWebps, "arena"));
export const logoImage = loadImage(pickUrl(logoWebps, "logo"));
