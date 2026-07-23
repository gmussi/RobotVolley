/**
 * Asset preload + loading splash progress.
 */
import { stadiumBg, logoImage, arenaBgImage, stadiumLayersReady } from "./art.js";

const images = [
  logoImage,
  arenaBgImage,
  stadiumBg.sky,
  stadiumBg.stadium,
  stadiumBg.court,
  stadiumBg.master,
];

function imageLoaded(img) {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) {
      resolve();
      return;
    }
    if (!img.src) {
      resolve();
      return;
    }
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

export async function preloadAssets(onProgress) {
  let done = 0;
  const total = images.length;
  const tick = () => {
    done++;
    onProgress?.(done / total);
  };

  await Promise.all(images.map((img) => imageLoaded(img).then(tick)));
  return stadiumLayersReady();
}

export function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("fade-out");
  setTimeout(() => splash.remove(), 500);
}

export function setSplashProgress(p) {
  const fill = document.getElementById("splashFill");
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
}
