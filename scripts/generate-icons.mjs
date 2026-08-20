/**
 * Rasterizes public/icon.svg into the PNG sizes a PWA install actually
 * needs. Run with `npm run icons` after editing the SVG; the generated
 * PNGs are committed so a normal build/deploy never needs sharp.
 *
 * Why PNGs at all when the SVG is right there: Android/Chrome will accept
 * an SVG manifest icon, but iOS Safari needs a raster `apple-touch-icon`
 * for "Add to Home Screen" — without one it screenshots the page instead,
 * which looks broken. iPad is a target for this app, so PNGs it is.
 *
 * The maskable variant composites the icon at 62% onto a full-bleed
 * background so Android's adaptive-icon mask can crop a circle, squircle,
 * or rounded square out of it without ever clipping the bars. Since the
 * backdrop is the same indigo as the SVG's own rounded rect, the result
 * reads as bars floating on indigo with generous safe-zone padding.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const BACKGROUND = { r: 0x4f, g: 0x46, b: 0xe5, alpha: 1 }; // matches icon.svg

const source = await readFile(join(publicDir, "icon.svg"));

/** Plain square renders — transparent outside the SVG's rounded corners. */
const PLAIN = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" },
];

await mkdir(publicDir, { recursive: true });

for (const { size, name } of PLAIN) {
  await sharp(source, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}

// Maskable: 62% inner art, centred on the full-bleed brand background.
const MASKABLE_SIZE = 512;
const inner = Math.round(MASKABLE_SIZE * 0.62);
const innerPng = await sharp(source, { density: 512 }).resize(inner, inner).png().toBuffer();

const maskable = await sharp({
  create: {
    width: MASKABLE_SIZE,
    height: MASKABLE_SIZE,
    channels: 4,
    background: BACKGROUND,
  },
})
  .composite([{ input: innerPng, gravity: "centre" }])
  .png()
  .toBuffer();

await writeFile(join(publicDir, "icon-maskable-512.png"), maskable);
console.log(`wrote public/icon-maskable-512.png (${MASKABLE_SIZE}x${MASKABLE_SIZE}, maskable)`);
