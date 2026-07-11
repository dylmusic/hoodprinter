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

// --- OG image 1200x630 for /airdrop ---
await renderComposite({
  w: 1200,
  h: 630,
  iconSize: 200,
  iconPos: { left: 500, top: 60 },
  textSvg: `
    <text x="600" y="390" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="84" letter-spacing="-2">
      <tspan fill="#ffffff">$PRINT</tspan><tspan fill="#00c805" dx="22">AIRDROP</tspan>
    </text>
    <text x="600" y="460" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="#f5c518">BIG drop — first 100 Telegram users</text>
    <text x="600" y="510" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="28" fill="#8fa898">Small drop — first 1,000. First come, first served.</text>
    <text x="600" y="575" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="#00c805">hoodprinter.xyz/airdrop</text>
  `,
  out: path.join(brand, "og-airdrop.png"),
});

// --- OG image 1200x630 for /roadmap ---
await renderComposite({
  w: 1200,
  h: 630,
  iconSize: 200,
  iconPos: { left: 500, top: 60 },
  textSvg: `
    <text x="600" y="390" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="80" letter-spacing="-2">
      <tspan fill="#ffffff">THE</tspan><tspan fill="#00c805" dx="22">MASTER PLAN</tspan>
    </text>
    <text x="600" y="460" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="32" fill="#8fa898">Presale → LP locked → DAO → <tspan fill="#f5c518" font-weight="800">$1,000,000 printed</tspan></text>
    <text x="600" y="530" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="#00c805">hoodprinter.xyz/roadmap</text>
  `,
  out: path.join(brand, "og-roadmap.png"),
});

// --- OG image 1200x630 for /print (the buy bot) ---
// Bespoke, left-aligned layout (not the shared centered template) so the buy
// bot reads as its own product: wordmark top-left, BETA badge, big headline,
// and feature chips for the real hooks (volume, leveling, airdrop).
{
  const chip = (x, w, label, color = "#ffffff") => `
    <rect x="${x}" y="452" width="${w}" height="62" rx="31" fill="#00c805" opacity="0.08"/>
    <rect x="${x}" y="452" width="${w}" height="62" rx="31" fill="none" stroke="#00c805" stroke-width="2" opacity="0.45"/>
    <text x="${x + w / 2}" y="491" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="27" fill="${color}">${label}</text>
  `;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      ${backdrop(1200, 630)}
      <!-- wordmark (icon composited separately, top-left) -->
      <text x="212" y="116" font-family="${FONT}" font-weight="800" font-size="44" letter-spacing="-1">
        <tspan fill="#ffffff">HOOD</tspan><tspan fill="#00c805">Printer</tspan>
      </text>
      <text x="214" y="150" font-family="${FONT}" font-weight="700" font-size="17" fill="#8fa898" letter-spacing="4">ROBINHOOD CHAIN BUY BOT</text>
      <!-- BETA badge, top-right -->
      <rect x="1002" y="66" width="128" height="46" rx="23" fill="#f5c518" opacity="0.12"/>
      <rect x="1002" y="66" width="128" height="46" rx="23" fill="none" stroke="#f5c518" stroke-width="2" opacity="0.65"/>
      <text x="1066" y="97" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="24" fill="#f5c518" letter-spacing="3">BETA</text>
      <!-- headline -->
      <text x="70" y="322" font-family="${FONT}" font-weight="800" font-size="104" letter-spacing="-3">
        <tspan fill="#ffffff">Auto-Buy </tspan><tspan fill="#00c805">Bot</tspan>
      </text>
      <!-- subhead -->
      <text x="74" y="388" font-family="${FONT}" font-weight="700" font-size="35" fill="#f5c518">Auto-buy any Robinhood Chain token in one click.</text>
      <!-- feature chips -->
      ${chip(70, 268, "Real buy volume")}
      ${chip(358, 168, "Level up")}
      ${chip(546, 328, "Earn $PRINT airdrop", "#f5c518")}
      <!-- url -->
      <text x="74" y="586" font-family="${FONT}" font-weight="700" font-size="28" fill="#00c805">hoodprinter.xyz/print</text>
    </svg>`
  );
  const icon = await iconPng(120);
  await sharp(bg)
    .composite([{ input: icon, left: 70, top: 52 }])
    .png()
    .toFile(path.join(brand, "og-print.png"));
  console.log("wrote public/brand/og-print.png");
}

// --- OG image 1200x630 for /media (the media kit) ---
await renderComposite({
  w: 1200,
  h: 630,
  iconSize: 200,
  iconPos: { left: 500, top: 60 },
  textSvg: `
    <text x="600" y="390" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="84" letter-spacing="-2">
      <tspan fill="#ffffff">MEDIA</tspan><tspan fill="#00c805" dx="22">KIT</tspan>
    </text>
    <text x="600" y="460" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="31" fill="#8fa898">Logos · banners · memes · ready-to-post tweets</text>
    <text x="600" y="530" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="#00c805">hoodprinter.xyz/media</text>
  `,
  out: path.join(brand, "og-media.png"),
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
