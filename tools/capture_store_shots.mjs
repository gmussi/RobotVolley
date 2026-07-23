#!/usr/bin/env node
/**
 * Capture store screenshots from a running dev/preview server.
 *
 * Usage:
 *   npm run dev &
 *   node tools/capture_store_shots.mjs http://localhost:5173
 *
 * Requires: npm install -D playwright && npx playwright install chromium
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "store-shots");
const url = process.argv[2] || "http://localhost:5173";

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Install playwright: npm install -D playwright && npx playwright install chromium");
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const shots = [
    { name: "01-title-menu", wait: 500 },
    { name: "02-gameplay", keys: ["Digit1", "Enter"], wait: 1500 },
  ];

  for (const shot of shots) {
    if (shot.keys) {
      for (const k of shot.keys) await page.keyboard.press(k);
    }
    await page.waitForTimeout(shot.wait || 800);
    const canvas = await page.$("#game");
    const target = canvas || page;
    await target.screenshot({ path: join(OUT, `${shot.name}.png`) });
    console.log(`  wrote ${shot.name}.png`);
  }

  await browser.close();
  await writeFile(join(OUT, "README.txt"), `Captured from ${url}\n`);
  console.log(`Done → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
