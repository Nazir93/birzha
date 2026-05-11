/**
 * Генерация PNG для PWA и apple-touch-icon.
 *
 * Источник (первый найденный):
 *   1) public/pwa-icon-source.png — положите готовую квадратную иконку (512×512 или больше), её не затрёт git при смене только svg;
 *   2) иначе public/pwa-icon.svg — вектор, из него sharp собирает все размеры.
 *
 * Запуск: node scripts/generate-pwa-icons.mjs (из каталога apps/web)
 * Вызывается автоматически в prebuild перед vite build.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pub = join(root, "public");
const sourcePng = join(pub, "pwa-icon-source.png");
const svg = join(pub, "pwa-icon.svg");

async function main() {
  const input = existsSync(sourcePng) ? sourcePng : svg;
  if (!existsSync(input)) {
    throw new Error(`PWA: нет ни ${sourcePng}, ни ${svg}`);
  }
  console.log(
    existsSync(sourcePng)
      ? "PWA icons: источник public/pwa-icon-source.png"
      : "PWA icons: источник public/pwa-icon.svg",
  );

  await sharp(input).resize(192, 192).png().toFile(join(pub, "pwa-192.png"));
  await sharp(input).resize(512, 512).png().toFile(join(pub, "pwa-512.png"));
  await sharp(input).resize(512, 512).png().toFile(join(pub, "pwa-maskable-512.png"));
  await sharp(input).resize(180, 180).png().toFile(join(pub, "apple-touch-icon.png"));
  await sharp(input).resize(32, 32).png().toFile(join(pub, "favicon-32.png"));
  await sharp(input).resize(16, 16).png().toFile(join(pub, "favicon-16.png"));
  console.log(
    "PWA + favicon: pwa-192/512, maskable, apple-touch, favicon-32/16 (источник: pwa-icon-source.png или pwa-icon.svg)",
  );
}

await main();
