#!/usr/bin/env node
/**
 * Build desktop app icons (build/icon.icns, build/icon.ico) from public/icon-512.png.
 * electron-builder picks these up automatically from the `build/` directory.
 *
 * .icns uses macOS's built-in `sips`/`iconutil` (this repo is developed on macOS,
 * matching the existing `tools/encode_match_music.sh` precedent of shelling out to
 * a system tool rather than adding a build dependency).
 * .ico is packed by hand — a Windows ICO can embed raw PNG data per entry
 * (supported since Vista), so no image library is needed.
 *
 * Run: node tools/build_desktop_icons.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public", "icon-512.png");
const BUILD_DIR = join(ROOT, "build");

function sipsResize(src, size, out) {
  execFileSync("sips", ["-z", String(size), String(size), src, "--out", out], { stdio: "pipe" });
}

function buildIcns(tmpDir) {
  if (process.platform !== "darwin") {
    console.log("  skip icon.icns (requires macOS sips/iconutil)");
    return;
  }
  const iconset = join(tmpDir, "icon.iconset");
  mkdirSync(iconset, { recursive: true });
  // Apple's required iconset naming: base size + "@2x" for the double-density variant.
  const bases = [16, 32, 128, 256, 512];
  for (const size of bases) {
    sipsResize(SRC, size, join(iconset, `icon_${size}x${size}.png`));
    sipsResize(SRC, size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
  }
  const out = join(BUILD_DIR, "icon.icns");
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", out], { stdio: "pipe" });
  console.log(`  wrote build/icon.icns`);
}

/** Pack same-format PNGs into a valid multi-size ICO (PNG-compressed entries). */
function packIco(pngEntries, outPath) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const dataChunks = [];
  let offset = 6 + count * 16;

  for (const { size, data } of pngEntries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256 per the ICO spec
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    dataChunks.push(data);
    offset += data.length;
  }

  writeFileSync(outPath, Buffer.concat([header, ...dirEntries, ...dataChunks]));
}

function buildIco(tmpDir) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = sizes.map((size) => {
    const out = join(tmpDir, `ico_${size}.png`);
    sipsResize(SRC, size, out);
    return { size, data: readFileSync(out) };
  });
  const outPath = join(BUILD_DIR, "icon.ico");
  packIco(entries, outPath);
  console.log(`  wrote build/icon.ico`);
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing ${SRC} — run "npm run genart:icons" first.`);
    process.exit(1);
  }
  mkdirSync(BUILD_DIR, { recursive: true });
  const tmpDir = join(BUILD_DIR, ".icon-tmp");
  mkdirSync(tmpDir, { recursive: true });

  console.log("Building desktop icons…");
  try {
    buildIcns(tmpDir);
    buildIco(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("Done.");
}

main();
