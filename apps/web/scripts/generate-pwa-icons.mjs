/**
 * Растеризация public/pwa-icon.svg → PNG для манифеста PWA и apple-touch-icon.
 * Запуск: node scripts/generate-pwa-icons.mjs (из каталога apps/web)
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = join(root, "public", "pwa-icon.svg");

async function main() {
  await sharp(svg).resize(192, 192).png().toFile(join(root, "public", "pwa-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(join(root, "public", "pwa-512.png"));
  await sharp(svg).resize(512, 512).png().toFile(join(root, "public", "pwa-maskable-512.png"));
  await sharp(svg).resize(180, 180).png().toFile(join(root, "public", "apple-touch-icon.png"));
  console.log("PWA icons generated: pwa-192.png, pwa-512.png, pwa-maskable-512.png, apple-touch-icon.png");
}

await main();
