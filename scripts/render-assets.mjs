/**
 * Renders PNG social assets from the brand SVGs:
 *   public/brand/pfp.png     400x400   (from logo-icon.svg)
 *   public/brand/banner.png  1500x500  (X banner)
 *   public/brand/og.png      1200x630  (OpenGraph, wired into metadata)
 *   app/icon.png             64x64     (favicon, auto-served by Next)
 *
 * Run: npm run assets
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "public", "brand");

const iconSvg = await readFile(path.join(brand, "logo-icon.svg"));

const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

function backdrop(w, h) {
  return `
    <rect width="${w}" height="${h}" fill="#070b08"/>
    <ellipse cx="${w / 2}" cy="${h * 0.1}" rx="${w * 0.55}" ry="${h * 0.7}" fill="#00c805" opacity="0.10"/>
    <ellipse cx="${w / 2}" cy="${h * 0.05}" rx="${w * 0.3}" ry="${h * 0.4}" fill="#00c805" opacity="0.08"/>
  `;
}

async function iconPng(size) {
  return sharp(iconSvg, { density: 300 }).resize(size, size).png().toBuffer();
}

async function renderComposite({ w, h, textSvg, iconSize, iconPos, out }) {
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${backdrop(w, h)}${textSvg}</svg>`
  );
  const icon = await iconPng(iconSize);
  // no density option: render the SVG at its declared pixel size so the
  // canvas is exactly w x h and composite positions line up
  await sharp(bg)
    .composite([{ input: icon, left: iconPos.left, top: iconPos.top }])
    .png()
    .toFile(out);
  console.log("wrote", path.relative(root, out));
}

// --- pfp 400x400 ---
await sharp(iconSvg, { density: 300 })
  .resize(400, 400)
  .png()
  .toFile(path.join(brand, "pfp.png"));
console.log("wrote public/brand/pfp.png");

// --- OG image 1200x630: icon + name + $PRINT + tagline ---
await renderComposite({
  w: 1200,
  h: 630,
  iconSize: 240,
  iconPos: { left: 480, top: 72 },
  textSvg: `
    <text x="600" y="425" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="88" letter-spacing="-2">
      <tspan fill="#ffffff">HOOD</tspan><tspan fill="#00c805">Printer</tspan>
    </text>
    <text x="600" y="500" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="44" fill="#00c805" letter-spacing="6">$PRINT</text>
    <text x="600" y="560" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="30" fill="#8fa898">The printer that pays you in ETH — on Robinhood Chain.</text>
  `,
  out: path.join(brand, "og.png"),
});

// --- X banner 1500x500 ---
await renderComposite({
  w: 1500,
  h: 500,
  iconSize: 300,
  iconPos: { left: 170, top: 100 },
  textSvg: `
    <text x="540" y="255" font-family="${FONT}" font-weight="800" font-size="96" letter-spacing="-2">
      <tspan fill="#ffffff">HOOD</tspan><tspan fill="#00c805">Printer</tspan>
    </text>
    <text x="546" y="330" font-family="${FONT}" font-weight="600" font-size="38" fill="#8fa898">Hold <tspan fill="#00c805" font-weight="800">$PRINT</tspan>. Get paid <tspan fill="#ffffff" font-weight="800">ETH</tspan>. Brrr.</text>
  `,
  out: path.join(brand, "banner.png"),
});

// --- banner 900x200 (same layout scaled 0.4x, centered in the wider frame) ---
await renderComposite({
  w: 900,
  h: 200,
  iconSize: 120,
  iconPos: { left: 218, top: 40 },
  textSvg: `
    <text x="366" y="102" font-family="${FONT}" font-weight="800" font-size="38" letter-spacing="-0.8">
      <tspan fill="#ffffff">HOOD</tspan><tspan fill="#00c805">Printer</tspan>
    </text>
    <text x="368" y="132" font-family="${FONT}" font-weight="600" font-size="15" fill="#8fa898">Hold <tspan fill="#00c805" font-weight="800">$PRINT</tspan>. Get paid <tspan fill="#ffffff" font-weight="800">ETH</tspan>. Brrr.</text>
  `,
  out: path.join(brand, "banner-900x200.png"),
});

// --- favicon (Next serves app/icon.png automatically) ---
await sharp(await iconPng(64)).toFile(path.join(root, "app", "icon.png"));
console.log("wrote app/icon.png");

// --- apple touch icon (Next serves app/apple-icon.png automatically) ---
await sharp(await iconPng(180)).toFile(path.join(root, "app", "apple-icon.png"));
console.log("wrote app/apple-icon.png");
