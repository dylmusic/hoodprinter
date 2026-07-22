/**
 * Renders 15 square (1080x1080) social promo graphics into public/brand/promo/.
 * Same visual language as the site: dark green, #00c805 accent, capped
 * printer icon — plus glow bloom, gradient type, ETH-bill confetti.
 * Promos 1–5 tell the core $PRINT story; 6–10 are the Buy Bot pack;
 * 11–15 are the RWA Pools pack.
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
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="#5f7266">@HOODPrinterxyz · t.me/HOODPrint</text>`;
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
  <text x="${W / 2}" y="827" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="${GREEN}">Now printing on Robinhood Chain · hoodprinter.xyz</text>
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
  <text x="${W / 2}" y="765" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="${GREEN}">@HOODPrinterxyz</text>
  <rect x="${W / 2 - 270}" y="812" width="540" height="76" rx="38" fill="#0c120e" stroke="${BORDER}" stroke-width="2"/>
  <text x="${W / 2}" y="861" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34" fill="${GREEN}">t.me/HOODPrint</text>
  <text x="${W / 2}" y="962" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="30" fill="${MUTED}">Hold $PRINT. Get paid ETH. Brrr.</text>
  `,
  { size: 300, left: W / 2 - 150, top: 130 }
);

/* ---------------------------------------------------------------- *
 *  Buy Bot pack (promos 6–10)                                       *
 * ---------------------------------------------------------------- */

/** gold BETA pill */
function betaBadge(cx, cy, scale = 1) {
  const w = 128 * scale;
  const h = 46 * scale;
  return `
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${GOLD}" opacity="0.12"/>
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.7"/>
    <text x="${cx}" y="${cy + 8.5 * scale}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${24 * scale}" fill="${GOLD}" letter-spacing="${3 * scale}">BETA</text>
  `;
}

/** green check mark drawn as a stroke (no font-dependent glyphs) */
function check(x, y, s = 1) {
  return `<path d="M${x},${y} l${9 * s},${10 * s} l${17 * s},${-20 * s}" fill="none" stroke="${GREEN}" stroke-width="${5 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** right arrow drawn as a path */
function arrow(x, y, len = 60, color = GREEN, sw = 5, op = 1) {
  return `<g opacity="${op}"><path d="M${x},${y} h${len}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="M${x + len - 14},${y - 11} L${x + len},${y} L${x + len - 14},${y + 11}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

const urlPill = (y, label, w = 560) => `
  <rect x="${W / 2 - w / 2}" y="${y}" width="${w}" height="70" rx="35" fill="#0c120e" stroke="${GREEN}" stroke-width="2" opacity="0.95"/>
  <text x="${W / 2}" y="${y + 46}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="31" fill="${GREEN}">${label}</text>
`;

// 6 — Buy Bot hero
await render(
  "promo-6-buybot.png",
  `
  ${confetti()}
  <ellipse cx="${W / 2}" cy="230" rx="240" ry="200" fill="${GREEN}" opacity="0.16" filter="url(#bigGlow)"/>
  ${betaBadge(W / 2 + 250, 150)}
  ${neon(560, 108, `<tspan fill="${WHITE}">Auto-buy </tspan><tspan fill="url(#greenGrad)">any token</tspan><tspan fill="${WHITE}">.</tspan>`, -3)}
  <text x="${W / 2}" y="650" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="34" fill="${MUTED}">One click. Nonstop. On Robinhood Chain.</text>
  ${urlPill(736, "hoodprinter.xyz/print", 620)}
  <text x="${W / 2}" y="912" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="29" fill="${MUTED}">Dedicated in-browser wallet · live stats · level-ups</text>
  ${footer(H - 58)}
  `,
  { size: 290, left: W / 2 - 145, top: 90 }
);

// 7 — spam mode: terminal feed of confirmed buys
const feedRows = [
  { t: "Buy confirmed", s: "0.0005 ETH · ARROW", ago: "2s" },
  { t: "Buy confirmed", s: "0.0005 ETH · CASHCAT", ago: "5s" },
  { t: "Buy confirmed", s: "0.0005 ETH · HOODRAT", ago: "8s" },
  { t: "Buy confirmed", s: "0.0005 ETH · JUGGERNAUT", ago: "11s" },
];
await render(
  "promo-7-spam.png",
  `
  ${confetti(false, [
    [200, 260, 1, 0.7],
    [885, 195, 0.8, 0.6],
    [860, 950, 0.9, 0.55],
  ])}
  ${wordmark(112)}
  ${neon(238, 92, `<tspan fill="${WHITE}">Set it. </tspan><tspan fill="url(#greenGrad)">Spam it.</tspan>`, -2)}
  <text x="${W / 2}" y="308" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="31" fill="${MUTED}">Fire-and-forget buys, every few seconds. Hands off.</text>

  <rect x="110" y="360" width="860" height="470" rx="28" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="110" y="360" width="860" height="58" rx="28" fill="#0c120e"/>
  <rect x="110" y="392" width="860" height="26" fill="#0c120e"/>
  <circle cx="152" cy="389" r="9" fill="#2a3f31"/>
  <circle cx="184" cy="389" r="9" fill="#2a3f31"/>
  <circle cx="216" cy="389" r="9" fill="${GREEN}"/>
  <text x="540" y="399" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="24" fill="${MUTED}" letter-spacing="2">LIVE — SPAM MODE</text>
  ${feedRows
    .map((r, i) => {
      const y = 470 + i * 78;
      return `
      <circle cx="176" cy="${y}" r="24" fill="#063d15" stroke="${GREEN}" stroke-width="2"/>
      ${check(164, y, 1)}
      <text x="228" y="${y + 10}" font-family="${FONT}" font-weight="700" font-size="30" fill="${WHITE}">${r.t}</text>
      <text x="490" y="${y + 10}" font-family="${FONT}" font-weight="500" font-size="27" fill="${MUTED}">${r.s}</text>
      <text x="908" y="${y + 10}" text-anchor="end" font-family="${FONT}" font-weight="500" font-size="25" fill="#5f7266">${r.ago}</text>
    `;
    })
    .join("")}
  <circle cx="176" cy="782" r="24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="6 7"/>
  <text x="228" y="792" font-family="${FONT}" font-weight="700" font-size="30" fill="${GOLD}">Buying…</text>
  <text x="908" y="792" text-anchor="end" font-family="${FONT}" font-weight="500" font-size="25" fill="#5f7266">now</text>

  <text x="${W / 2}" y="898" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="29" fill="${GREEN}">Your keys never leave the browser.</text>
  ${footer(H - 52)}
  `
);

// 8 — rank ladder: every buy levels you up
const TIERS = [
  { n: "Bronze", buys: "100 buys", c: "#cd8a4f" },
  { n: "Silver", buys: "1,000 buys", c: "#c9d2cc" },
  { n: "Gold", buys: "10,000 buys", c: "#f7c948" },
  { n: "Platinum", buys: "100,000 buys", c: "#e8f2ea" },
  { n: "Diamond", buys: "1,000,000 buys", c: "#7fd8ff" },
];
await render(
  "promo-8-levels.png",
  `
  ${confetti(false, [
    [210, 290, 1, 0.7],
    [880, 330, 0.8, 0.6],
  ])}
  ${wordmark(112)}
  ${neon(240, 88, `<tspan fill="${WHITE}">Every buy </tspan><tspan fill="url(#greenGrad)">levels you up.</tspan>`, -2)}
  ${TIERS.map((t, i) => {
    const y = 330 + i * 106;
    const w = 560 + i * 85;
    const x = (W - w) / 2;
    return `
    <rect x="${x}" y="${y}" width="${w}" height="86" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="8" height="86" rx="4" fill="${t.c}"/>
    <circle cx="${x + 52}" cy="${y + 43}" r="13" fill="${t.c}"/>
    <text x="${x + 92}" y="${y + 56}" font-family="${FONT}" font-weight="800" font-size="37" fill="${WHITE}">${t.n}</text>
    <text x="${x + w - 40}" y="${y + 55}" text-anchor="end" font-family="${FONT}" font-weight="600" font-size="29" fill="${MUTED}">${t.buys}</text>
  `;
  }).join("")}
  <text x="${W / 2}" y="920" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${GOLD}">Rank up before rewards go live.</text>
  <text x="${W / 2}" y="968" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="28" fill="${GREEN}">hoodprinter.xyz/print</text>
  `
);

// 9 — the $PRINT flywheel: reflections refuel the bot
const nodeW = 272;
const nodeH = 150;
const nodeY = 470;
const nodes = [
  { x: 84, big: "$PRINT", sub: "in your bot wallet" },
  { x: 404, big: "ETH", sub: "reflections roll in" },
  { x: 724, big: "BUYS", sub: "the bot spends it" },
];
await render(
  "promo-9-flywheel.png",
  `
  ${confetti(false, [
    [210, 270, 1, 0.7],
    [880, 310, 0.8, 0.6],
    [850, 900, 0.9, 0.55],
  ])}
  ${wordmark(112)}
  ${neon(250, 92, `<tspan fill="${WHITE}">The bag that</tspan>`, -2)}
  ${neon(350, 92, `<tspan fill="url(#greenGrad)">refuels itself.</tspan>`, -2)}
  ${nodes
    .map(
      (n) => `
    <rect x="${n.x}" y="${nodeY}" width="${nodeW}" height="${nodeH}" rx="26" fill="${CARD}" stroke="${GREEN}" stroke-width="2" opacity="0.95"/>
    <text x="${n.x + nodeW / 2}" y="${nodeY + 72}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="52" fill="url(#greenGrad)">${n.big}</text>
    <text x="${n.x + nodeW / 2}" y="${nodeY + 114}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="22" fill="${MUTED}">${n.sub}</text>
  `
    )
    .join("")}
  ${arrow(nodes[0].x + nodeW + 8, nodeY + nodeH / 2, 32)}
  ${arrow(nodes[1].x + nodeW + 8, nodeY + nodeH / 2, 32)}
  <path d="M${nodes[2].x + nodeW / 2},${nodeY + nodeH + 26}
           C ${nodes[2].x + nodeW / 2},${nodeY + nodeH + 110} ${nodes[0].x + nodeW / 2},${nodeY + nodeH + 110} ${nodes[0].x + nodeW / 2},${nodeY + nodeH + 34}"
        fill="none" stroke="${GOLD}" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
  <path d="M${nodes[0].x + nodeW / 2 - 12},${nodeY + nodeH + 52} L${nodes[0].x + nodeW / 2},${nodeY + nodeH + 30} L${nodes[0].x + nodeW / 2 + 12},${nodeY + nodeH + 52}"
        fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${W / 2}" y="${nodeY + nodeH + 150}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="${GOLD}" letter-spacing="3">AND REPEAT</text>
  <text x="${W / 2}" y="850" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="31" fill="${WHITE}">Hold $PRINT in the Buy Bot. Its 5% tax pays you ETH.</text>
  <text x="${W / 2}" y="896" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="31" fill="${WHITE}">The bot turns that ETH into more buys. Brrr.</text>
  ${footer(H - 52)}
  `
);

// 10 — beta CTA: the bot is live, buys count toward the airdrop
await render(
  "promo-10-beta.png",
  `
  ${confetti(true)}
  ${betaBadge(W / 2, 470, 1.15)}
  ${neon(590, 120, `<tspan fill="${WHITE}">The Buy Bot</tspan>`, -3)}
  ${neon(716, 120, `<tspan fill="url(#greenGrad)">is live.</tspan>`, -3)}
  ${urlPill(772, "hoodprinter.xyz/print", 620)}
  <text x="${W / 2}" y="912" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${GOLD}">Every buy counts toward the $PRINT airdrop.</text>
  ${footer(H - 52)}
  `,
  { size: 300, left: W / 2 - 150, top: 120 }
);

/* ---------------------------------------------------------------- *
 *  RWA Pools pack (promos 11–15)                                    *
 * ---------------------------------------------------------------- */

// accent colors, matching lib/rwaPools.ts + the live /rwa pool cards
const RWA_COLORS = {
  NVDA: GREEN,
  TSLA: "#ff4d4d",
  SPCX: "#4ac3ff",
  AAPL: "#c9cdd3",
  MSFT: "#4ae0c8",
};

/** small ticker card: colored ring + letter, symbol, "$PRINT pair" subtext */
function rwaCard(x, y, w, h, symbol) {
  const color = RWA_COLORS[symbol];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${CARD}" stroke="${color}" stroke-width="2" opacity="0.95"/>
    <circle cx="${x + 50}" cy="${y + h / 2}" r="24" fill="none" stroke="${color}" stroke-width="2.5"/>
    <text x="${x + 50}" y="${y + h / 2 + 9}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="24" fill="${color}">${symbol[0]}</text>
    <text x="${x + 100}" y="${y + h / 2 - 6}" font-family="${FONT}" font-weight="800" font-size="42" fill="${WHITE}">${symbol}</text>
    <text x="${x + 100}" y="${y + h / 2 + 32}" font-family="${FONT}" font-weight="500" font-size="21" fill="${MUTED}">$PRINT pair</text>
  `;
}

// 11 — RWA hero
await render(
  "promo-11-rwa-hero.png",
  `
  ${confetti()}
  <ellipse cx="${W / 2}" cy="240" rx="240" ry="200" fill="${GREEN}" opacity="0.16" filter="url(#bigGlow)"/>
  ${betaBadge(W / 2 + 300, 150)}
  ${neon(590, 112, `<tspan fill="${WHITE}">Real assets.</tspan>`, -3)}
  ${neon(716, 112, `<tspan fill="url(#greenGrad)">Real ETH.</tspan>`, -3)}
  <rect x="${W / 2 - 320}" y="784" width="640" height="66" rx="33" fill="#0c120e" stroke="${GREEN}" stroke-width="2" opacity="0.9"/>
  <text x="${W / 2}" y="827" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="27" fill="${GREEN}">$PRINT/RWA Pools · hoodprinter.xyz/rwa</text>
  ${footer(H - 62)}
  `,
  { size: 310, left: W / 2 - 155, top: 96 }
);

// 12 — how RWA Pools work: three steps, stacked (mirrors promo-2)
const rwaSteps = [
  { y: 480, n: "1", t: "5% tax", s: "on every $PRINT trade" },
  { y: 660, n: "2", t: "ETH reflections", s: "get deployed as liquidity" },
  { y: 840, n: "3", t: "RWA Pools grow", s: "holders earn real ETH" },
];
await render(
  "promo-12-how-it-works.png",
  `
  ${confetti(false, [
    [220, 300, 1, 0.7],
    [880, 340, 0.8, 0.6],
    [870, 640, 0.9, 0.6],
  ])}
  ${wordmark(120)}
  ${neon(244, 78, `<tspan fill="${WHITE}">From tax to</tspan>`, -2)}
  ${neon(338, 78, `<tspan fill="url(#greenGrad)">real assets.</tspan>`, -2)}
  <line x1="215" y1="536" x2="215" y2="784" stroke="${GREEN}" stroke-width="4" opacity="0.35"/>
  ${rwaSteps
    .map(
      (st) => `
    <circle cx="215" cy="${st.y}" r="56" fill="#063d15" stroke="${GREEN}" stroke-width="3"/>
    <text x="215" y="${st.y + 19}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="52" fill="${GREEN}">${st.n}</text>
    <text x="320" y="${st.y + 4}" font-family="${FONT}" font-weight="800" font-size="48" fill="${WHITE}">${st.t}</text>
    <text x="322" y="${st.y + 52}" font-family="${FONT}" font-weight="500" font-size="29" fill="${MUTED}">${st.s}</text>
  `
    )
    .join("")}
  <text x="${W / 2}" y="966" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${GREEN}">The printer prints off real-world assets.</text>
  ${footer(H - 52)}
  `
);

// 13 — five real assets, ticker showcase (3-over-2 grid)
await render(
  "promo-13-tickers.png",
  `
  ${confetti(false, [
    [200, 260, 1, 0.7],
    [885, 195, 0.8, 0.6],
    [860, 990, 0.9, 0.55],
  ])}
  ${wordmark(112)}
  ${neon(238, 84, `<tspan fill="${WHITE}">Five real assets.</tspan>`, -2)}
  ${neon(332, 84, `<tspan fill="url(#greenGrad)">One printer.</tspan>`, -2)}
  ${rwaCard(60, 420, 300, 170, "NVDA")}
  ${rwaCard(390, 420, 300, 170, "TSLA")}
  ${rwaCard(720, 420, 300, 170, "SPCX")}
  ${rwaCard(225, 620, 300, 170, "AAPL")}
  ${rwaCard(555, 620, 300, 170, "MSFT")}
  <text x="${W / 2}" y="884" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="30" fill="${MUTED}">$PRINT/RWA Pools — beta dashboard live</text>
  <text x="${W / 2}" y="928" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="29" fill="${GREEN}">hoodprinter.xyz/rwa</text>
  ${footer(H - 52)}
  `
);

// 14 — the RWA flywheel: reflections grow real assets (mirrors promo-9)
const rwaNodes = [
  { x: 84, big: "$PRINT", sub: "5% tax collected" },
  { x: 404, big: "ETH", sub: "reflections roll in" },
  { x: 724, big: "POOLS", sub: "RWA liquidity grows" },
];
await render(
  "promo-14-flywheel.png",
  `
  ${confetti(false, [
    [210, 270, 1, 0.7],
    [880, 310, 0.8, 0.6],
    [850, 900, 0.9, 0.55],
  ])}
  ${wordmark(112)}
  ${neon(250, 88, `<tspan fill="${WHITE}">Reflections that</tspan>`, -2)}
  ${neon(350, 88, `<tspan fill="url(#greenGrad)">grow real assets.</tspan>`, -2)}
  ${rwaNodes
    .map(
      (n) => `
    <rect x="${n.x}" y="${nodeY}" width="${nodeW}" height="${nodeH}" rx="26" fill="${CARD}" stroke="${GREEN}" stroke-width="2" opacity="0.95"/>
    <text x="${n.x + nodeW / 2}" y="${nodeY + 72}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="48" fill="url(#greenGrad)">${n.big}</text>
    <text x="${n.x + nodeW / 2}" y="${nodeY + 114}" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="22" fill="${MUTED}">${n.sub}</text>
  `
    )
    .join("")}
  ${arrow(rwaNodes[0].x + nodeW + 8, nodeY + nodeH / 2, 32)}
  ${arrow(rwaNodes[1].x + nodeW + 8, nodeY + nodeH / 2, 32)}
  <path d="M${rwaNodes[2].x + nodeW / 2},${nodeY + nodeH + 26}
           C ${rwaNodes[2].x + nodeW / 2},${nodeY + nodeH + 110} ${rwaNodes[0].x + nodeW / 2},${nodeY + nodeH + 110} ${rwaNodes[0].x + nodeW / 2},${nodeY + nodeH + 34}"
        fill="none" stroke="${GOLD}" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
  <path d="M${rwaNodes[0].x + nodeW / 2 - 12},${nodeY + nodeH + 52} L${rwaNodes[0].x + nodeW / 2},${nodeY + nodeH + 30} L${rwaNodes[0].x + nodeW / 2 + 12},${nodeY + nodeH + 52}"
        fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${W / 2}" y="${nodeY + nodeH + 150}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="26" fill="${GOLD}" letter-spacing="3">AND REPEAT</text>
  <text x="${W / 2}" y="850" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="31" fill="${WHITE}">Hold $PRINT. The 5% tax pays you ETH.</text>
  <text x="${W / 2}" y="896" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="31" fill="${WHITE}">The ETH grows the RWA pools. Brrr.</text>
  ${footer(H - 52)}
  `
);

// 15 — beta CTA: the dashboard is live, every number is real (mirrors promo-10)
await render(
  "promo-15-beta.png",
  `
  ${confetti(true)}
  ${betaBadge(W / 2, 470, 1.15)}
  ${neon(590, 112, `<tspan fill="${WHITE}">RWA Pools</tspan>`, -3)}
  ${neon(716, 112, `<tspan fill="url(#greenGrad)">dashboard live.</tspan>`, -3)}
  ${urlPill(772, "hoodprinter.xyz/rwa", 620)}
  <text x="${W / 2}" y="912" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="29" fill="${GOLD}">Tracking TVL and ETH rewards from day one.</text>
  ${footer(H - 52)}
  `,
  { size: 300, left: W / 2 - 150, top: 120 }
);
