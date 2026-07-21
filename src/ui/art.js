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

export const arenaBgImage = loadImage(pickUrl(bgWebps, "arena"));
export const logoImage = loadImage(pickUrl(logoWebps, "logo"));
