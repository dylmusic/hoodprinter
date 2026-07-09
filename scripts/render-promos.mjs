/**
 * Renders 5 X/Twitter promo graphics (1600x900) into public/brand/promo/.
 * Same visual language as the site: dark green, #00c805 accent, capped
 * printer icon, sparse layouts.
 *
 * Run: node scripts/render-promos.mjs
 */
import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = path.join(root, "public", "brand");
const out = path.join(brand, "promo");
await mkdir(out, { recursive: true });

const iconSvg = await readFile(path.join(brand, "logo-icon.svg"));
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const W = 1600;
const H = 900;

const GREEN = "#00c805";
const MUTED = "#8fa898";
const WHITE = "#ffffff";
const BORDER = "#1d2b22";
const CARD = "#101b14";

function backdrop() {
  return `
    <rect width="${W}" height="${H}" fill="#070b08"/>
    <ellipse cx="${W / 2}" cy="60" rx="900" ry="600" fill="${GREEN}" opacity="0.10"/>
    <ellipse cx="${W / 2}" cy="30" rx="500" ry="340" fill="${GREEN}" opacity="0.08"/>
  `;
}

function footer(y = 838) {
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="26" fill="#5f7266">@HOODPrinter · t.me/HOODPrint</text>`;
}

function wordmark(y, size = 44) {
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${size}" letter-spacing="-1">
    <tspan fill="${WHITE}">HOOD</tspan><tspan fill="${GREEN}">Printer</tspan>
  </text>`;
}

async function render(name, textSvg, icon) {
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${backdrop()}${textSvg}</svg>`
  );
  const composites = [];
  if (icon) {
    const png = await sharp(iconSvg, { density: 300 })
      .resize(icon.size, icon.size)
      .png()
      .toBuffer();
    composites.push({ input: png, left: icon.left, top: icon.top });
  }
  await sharp(bg).composite(composites).png().toFile(path.join(out, name));
  console.log("wrote public/brand/promo/" + name);
}

// 1 — hero: hold $PRINT, get paid ETH
await render(
  "promo-1-hero.png",
  `
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="96" letter-spacing="-2" xml:space="preserve"><tspan fill="${WHITE}">Hold </tspan><tspan fill="${GREEN}">$PRINT</tspan><tspan fill="${WHITE}">.</tspan></text>
  <text x="${W / 2}" y="608" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="96" letter-spacing="-2" xml:space="preserve"><tspan fill="${WHITE}">Get paid </tspan><tspan fill="${GREEN}">ETH</tspan><tspan fill="${WHITE}">.</tspan></text>
  <rect x="${W / 2 - 330}" y="668" width="660" height="62" rx="31" fill="#0c120e" stroke="${BORDER}" stroke-width="2"/>
  <text x="${W / 2}" y="709" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="${GREEN}">Now printing on Robinhood Chain · Chain ID 4663</text>
  ${footer()}
  `,
  { size: 280, left: W / 2 - 140, top: 90 }
);

// 2 — how it works: three steps
const steps = [
  { x: 340, n: "1", t: "Buy $PRINT", s: "on Robinhood Chain" },
  { x: 800, n: "2", t: "Hold", s: "no staking, no claiming" },
  { x: 1260, n: "3", t: "Get paid ETH", s: "straight to your wallet" },
];
await render(
  "promo-2-how-it-works.png",
  `
  ${wordmark(120)}
  <text x="${W / 2}" y="255" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="76" letter-spacing="-1.5" fill="${WHITE}">Three steps. Zero effort.</text>
  ${steps
    .map(
      (st) => `
    <circle cx="${st.x}" cy="440" r="52" fill="#063d15"/>
    <text x="${st.x}" y="458" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="48" fill="${GREEN}">${st.n}</text>
    <text x="${st.x}" y="580" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="42" fill="${WHITE}">${st.t}</text>
    <text x="${st.x}" y="630" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="27" fill="${MUTED}">${st.s}</text>
  `
    )
    .join("")}
  <text x="570" y="455" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="44" fill="${GREEN}">→</text>
  <text x="1030" y="455" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="44" fill="${GREEN}">→</text>
  ${footer()}
  `
);

// 3 — tokenomics stats
const stats = [
  { x: 360, v: "1B", l: "total supply — fixed" },
  { x: 800, v: "5%", l: "tax on every trade" },
  { x: 1240, v: "ETH", l: "rewards paid in — not tokens" },
];
await render(
  "promo-3-tokenomics.png",
  `
  ${wordmark(120)}
  <text x="${W / 2}" y="255" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="76" letter-spacing="-1.5" fill="${WHITE}">Simple enough to fit on a bill.</text>
  ${stats
    .map(
      (st) => `
    <rect x="${st.x - 190}" y="340" width="380" height="280" rx="24" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <text x="${st.x}" y="490" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="92" fill="${GREEN}">${st.v}</text>
    <text x="${st.x}" y="560" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="27" fill="${MUTED}">${st.l}</text>
  `
    )
    .join("")}
  <text x="${W / 2}" y="712" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${MUTED}">4% printed to holders as ETH · 1% liquidity</text>
  ${footer()}
  `
);

// 4 — BRRR
await render(
  "promo-4-brrr.png",
  `
  <text x="660" y="490" font-family="${FONT}" font-weight="800" font-size="210" letter-spacing="-4" fill="${GREEN}">BRRR.</text>
  <text x="668" y="580" font-family="${FONT}" font-weight="700" font-size="46" fill="${WHITE}">The printer never sleeps.</text>
  <text x="670" y="642" font-family="${FONT}" font-weight="500" font-size="30" fill="${MUTED}">$PRINT on Robinhood Chain</text>
  ${footer()}
  `,
  { size: 380, left: 180, top: 240 }
);

// 5 — community CTA
await render(
  "promo-5-join.png",
  `
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="92" letter-spacing="-2" xml:space="preserve"><tspan fill="${WHITE}">Join the </tspan><tspan fill="${GREEN}">print run</tspan><tspan fill="${WHITE}">.</tspan></text>
  <rect x="${W / 2 - 420}" y="560" width="400" height="70" rx="35" fill="#0c120e" stroke="${BORDER}" stroke-width="2"/>
  <text x="${W / 2 - 220}" y="606" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="30" fill="${GREEN}">@HOODPrinter</text>
  <rect x="${W / 2 + 20}" y="560" width="400" height="70" rx="35" fill="#0c120e" stroke="${BORDER}" stroke-width="2"/>
  <text x="${W / 2 + 220}" y="606" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="30" fill="${GREEN}">t.me/HOODPrint</text>
  <text x="${W / 2}" y="712" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="30" fill="${MUTED}">Hold $PRINT. Get paid ETH. Brrr.</text>
  `,
  { size: 260, left: W / 2 - 130, top: 130 }
);
