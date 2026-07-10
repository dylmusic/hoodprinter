/**
 * Renders 5 square (1080x1080) social promo graphics into public/brand/promo/.
 * Same visual language as the site: dark green, #00c805 accent, capped
 * printer icon — plus glow bloom, gradient type, ETH-bill confetti.
 *
 * Run: node scripts/render-promos.mjs   (needs node >= 18.17 for sharp)
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
const W = 1080;
const H = 1080;

const GREEN = "#00c805";
const MUTED = "#8fa898";
const WHITE = "#ffffff";
const BORDER = "#1d2b22";
const CARD = "#101b14";
const GOLD = "#f7c948";

const DEFS = `
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.38" r="0.9">
      <stop offset="0" stop-color="#0d2414"/>
      <stop offset="0.55" stop-color="#081209"/>
      <stop offset="1" stop-color="#040704"/>
    </radialGradient>
    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5bff63"/>
      <stop offset="1" stop-color="#00c805"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe071"/>
      <stop offset="1" stop-color="#f7c948"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="bigGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>
`;

/** faint diagonal money-stripes texture */
function stripes() {
  let lines = "";
  for (let i = -H; i < W + H; i += 96) {
    lines += `<line x1="${i}" y1="0" x2="${i + H}" y2="${H}" stroke="${GREEN}" stroke-width="2" opacity="0.05"/>`;
  }
  return lines;
}

/** little ETH bill, rotated — confetti */
function bill(x, y, rot, scale = 1, opacity = 0.18) {
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})" opacity="${opacity}">
    <rect x="-60" y="-36" width="120" height="72" rx="10" fill="#dffbe5"/>
    <rect x="-48" y="-25" width="96" height="50" rx="6" fill="none" stroke="#7fce97" stroke-width="3" stroke-dasharray="5 5"/>
    <polygon points="0,-18 12,-2 0,5 -12,-2" fill="#0b4d1e"/>
    <polygon points="-12,2 0,9 12,2 0,20" fill="#177a34"/>
  </g>`;
}

/** 4-point gold sparkle */
function spark(x, y, s = 1, opacity = 0.8) {
  return `<path transform="translate(${x},${y}) scale(${s})" opacity="${opacity}" fill="url(#goldGrad)"
    d="M0,-14 L3.5,-3.5 L14,0 L3.5,3.5 L0,14 L-3.5,3.5 L-14,0 L-3.5,-3.5 Z"/>`;
}

function backdrop(extra = "") {
  return `
    ${DEFS}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${stripes()}
    <ellipse cx="${W / 2}" cy="150" rx="700" ry="420" fill="${GREEN}" opacity="0.10"/>
    ${extra}
    <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="44" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.28"/>
    <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="38" fill="none" stroke="${BORDER}" stroke-width="2"/>
  `;
}

/** headline text drawn twice: blurred green bloom underneath, crisp on top */
function neon(y, size, inner, ls = -2) {
  const t = (extra) =>
    `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${size}" letter-spacing="${ls}" xml:space="preserve" ${extra}>${inner}</text>`;
  return t(`filter="url(#glow)" opacity="0.75"`) + t("");
}

function footer(y = H - 58) {
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="#5f7266">@HOODPrinter · t.me/HOODPrint</text>`;
}

function wordmark(y, size = 42) {
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${size}" letter-spacing="-1">
    <tspan fill="${WHITE}">HOOD</tspan><tspan fill="${GREEN}">Printer</tspan>
  </text>`;
}

const SPARKS_DEFAULT = [
  [220, 320, 1, 0.7],
  [880, 380, 0.8, 0.6],
  [310, 820, 0.7, 0.55],
  [830, 760, 1.1, 0.7],
];

const confetti = (heavy = false, sparks = SPARKS_DEFAULT) => `
  ${bill(120, 170, -24, 0.9)}
  ${bill(960, 210, 18, 1.05)}
  ${bill(150, 900, 14, 1.0)}
  ${bill(940, 880, -18, 0.9)}
  ${heavy ? bill(540, 120, 8, 0.8, 0.14) + bill(80, 540, -40, 0.7, 0.14) + bill(1000, 560, 34, 0.75, 0.14) : ""}
  ${sparks.map(([x, y, s, o]) => spark(x, y, s, o)).join("")}
`;

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
  ${confetti()}
  <ellipse cx="${W / 2}" cy="240" rx="240" ry="200" fill="${GREEN}" opacity="0.16" filter="url(#bigGlow)"/>
  ${neon(590, 116, `<tspan fill="${WHITE}">Hold </tspan><tspan fill="url(#greenGrad)">$PRINT</tspan><tspan fill="${WHITE}">.</tspan>`, -3)}
  ${neon(716, 116, `<tspan fill="${WHITE}">Get paid </tspan><tspan fill="url(#greenGrad)">ETH</tspan><tspan fill="${WHITE}">.</tspan>`, -3)}
  <rect x="${W / 2 - 360}" y="784" width="720" height="66" rx="33" fill="#0c120e" stroke="${GREEN}" stroke-width="2" opacity="0.9"/>
  <text x="${W / 2}" y="827" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="${GREEN}">Now printing on Robinhood Chain · Chain ID 4663</text>
  ${footer(H - 62)}
  `,
  { size: 310, left: W / 2 - 155, top: 96 }
);

// 2 — how it works: three steps, stacked
const steps = [
  { y: 480, n: "1", t: "Buy $PRINT", s: "on Robinhood Chain" },
  { y: 660, n: "2", t: "Hold", s: "no staking, no claiming" },
  { y: 840, n: "3", t: "Get paid ETH", s: "straight to your wallet" },
];
await render(
  "promo-2-how-it-works.png",
  `
  ${confetti(false, [
    [220, 300, 1, 0.7],
    [880, 340, 0.8, 0.6],
    [870, 640, 0.9, 0.6],
  ])}
  ${wordmark(120)}
  ${neon(244, 84, `<tspan fill="${WHITE}">Three steps.</tspan>`, -2)}
  ${neon(338, 84, `<tspan fill="url(#greenGrad)">Zero effort.</tspan>`, -2)}
  <line x1="215" y1="536" x2="215" y2="784" stroke="${GREEN}" stroke-width="4" opacity="0.35"/>
  ${steps
    .map(
      (st) => `
    <circle cx="215" cy="${st.y}" r="56" fill="#063d15" stroke="${GREEN}" stroke-width="3"/>
    <text x="215" y="${st.y + 19}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="52" fill="${GREEN}">${st.n}</text>
    <text x="320" y="${st.y + 4}" font-family="${FONT}" font-weight="800" font-size="54" fill="${WHITE}">${st.t}</text>
    <text x="322" y="${st.y + 52}" font-family="${FONT}" font-weight="500" font-size="30" fill="${MUTED}">${st.s}</text>
  `
    )
    .join("")}
  <text x="${W / 2}" y="966" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${GREEN}">The printer does the rest. Brrr.</text>
  ${footer(H - 52)}
  `
);

// 3 — tokenomics stats, stacked rows
const stats = [
  { y: 330, v: "1B", l: "total supply — fixed forever" },
  { y: 540, v: "5%", l: "tax on every trade feeds the printer" },
  { y: 750, v: "ETH", l: "rewards paid in — never tokens" },
];
await render(
  "promo-3-tokenomics.png",
  `
  ${confetti()}
  ${wordmark(120)}
  ${neon(232, 72, `<tspan fill="${WHITE}">Simple enough to </tspan><tspan fill="url(#greenGrad)">fit on a bill.</tspan>`, -1.5)}
  ${stats
    .map(
      (st) => `
    <rect x="90" y="${st.y - 60}" width="900" height="170" rx="26" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <rect x="90" y="${st.y - 60}" width="8" height="170" rx="4" fill="${GREEN}"/>
    <text x="270" y="${st.y + 62}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="104" fill="url(#greenGrad)">${st.v}</text>
    <text x="440" y="${st.y + 40}" font-family="${FONT}" font-weight="600" font-size="33" fill="${WHITE}">${st.l}</text>
  `
    )
    .join("")}
  <text x="${W / 2}" y="962" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${MUTED}">4% printed to holders as ETH · 1% liquidity</text>
  ${footer()}
  `
);

// 4 — BRRR, motion-trail echo
await render(
  "promo-4-brrr.png",
  `
  ${confetti()}
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="270" letter-spacing="-6" fill="${GREEN}" opacity="0.10">BRRR.</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="270" letter-spacing="-6" fill="${GREEN}" opacity="0.25">BRRR.</text>
  ${neon(450, 270, `<tspan fill="url(#greenGrad)">BRRR.</tspan>`, -6)}
  <text x="${W / 2}" y="556" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="52" fill="${WHITE}">The printer never sleeps.</text>
  <text x="${W / 2}" y="618" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="31" fill="${MUTED}">$PRINT on Robinhood Chain</text>
  ${footer()}
  `,
  { size: 330, left: W / 2 - 165, top: 660 }
);

// 5 — community CTA
await render(
  "promo-5-join.png",
  `
  ${confetti(true)}
  ${neon(520, 128, `<tspan fill="${WHITE}">Join the</tspan>`, -3)}
  ${neon(650, 128, `<tspan fill="url(#greenGrad)">print run.</tspan>`, -3)}
  <rect x="${W / 2 - 270}" y="716" width="540" height="76" rx="38" fill="#0c120e" stroke="${GREEN}" stroke-width="2"/>
  <text x="${W / 2}" y="765" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="${GREEN}">@HOODPrinter</text>
  <rect x="${W / 2 - 270}" y="812" width="540" height="76" rx="38" fill="#0c120e" stroke="${BORDER}" stroke-width="2"/>
  <text x="${W / 2}" y="861" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="${GREEN}">t.me/HOODPrint</text>
  <text x="${W / 2}" y="962" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="30" fill="${MUTED}">Hold $PRINT. Get paid ETH. Brrr.</text>
  `,
  { size: 300, left: W / 2 - 150, top: 130 }
);
