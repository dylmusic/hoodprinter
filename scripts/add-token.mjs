#!/usr/bin/env node
// Quick-add framework for new Robinhood Chain token CAs (Dylan: "this needs
// to be a framework for adding new CAs quick and easy... give you a CA to
// add any time"). Given a contract address, this script does everything the
// TRENDING_TOKENS entries in lib/robinhoodTokens.ts already document doing
// by hand: reads symbol/name/decimals on-chain, checks V2 (getPair) and V3
// (getPool across the 4 known fee tiers) pool venue against WETH so we know
// whether it qualifies for the no-Relay KNOWN_V2_TOKENS fast path in
// lib/curatedPoolSwap.ts, and pulls a real logo from Relay's own
// /currencies/v2 address lookup (same source every other curated token here
// uses). It does NOT edit files — it prints a ready-to-paste TRENDING_TOKENS
// line plus next-step guidance, so a human still reviews before it ships.
//
// Usage: node scripts/add-token.mjs <address>
//   (run with Node 20: export PATH="/usr/local/opt/node@20/bin:$PATH")

import { ethers } from "ethers";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = 4663;
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const V3_FEE_TIERS = [10000, 3000, 500, 100];

const address = process.argv[2];
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: node scripts/add-token.mjs <0x-address>");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC);

const erc20 = new ethers.Contract(
  address,
  [
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function decimals() view returns (uint8)",
  ],
  provider
);

const v2Factory = new ethers.Contract(V2_FACTORY, ["function getPair(address,address) view returns (address)"], provider);
const v3Factory = new ethers.Contract(V3_FACTORY, ["function getPool(address,address,uint24) view returns (address)"], provider);
const v2PairAbi = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"];

// Real incident (FRONG, 2026-08-05): getPair() found a V2 pair against WETH
// that existed on-chain but held ~$0.50 total — a dead/decoy pair — while
// the token's REAL liquidity ($649K) was sitting in a V4 pool this script
// never checks at all (no on-chain V4 pool-key enumeration; V4 pools aren't
// discoverable the way V2/V3 factories are). Shipped once already because
// "a pool exists" was treated as "this is the real venue" with no depth
// check — same mistake documented for $PRINT's own three-pool incident and
// CATSTR, just hitting this script instead of the swap router. Fixed with
// two checks that both must pass before trusting the V2 venue: real reserve
// depth on-chain, AND DexScreener's own aggregated pair list (which indexes
// V2/V3/V4 alike) agreeing the V2 pair isn't dwarfed by liquidity elsewhere.
const MIN_V2_WETH_RESERVE = ethers.parseEther("0.05"); // ~$90+ at typical ETH prices — well above a dust/decoy pair, well below any real launch

async function fetchRelayLogo() {
  try {
    const res = await fetch("https://api.relay.link/currencies/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainIds: [CHAIN_ID], address }),
    });
    const results = await res.json();
    return results?.[0]?.metadata?.logoURI;
  } catch {
    return undefined;
  }
}

async function fetchDexScreenerPairs() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const json = await res.json();
    const pairs = (json?.pairs ?? []).filter((p) => p.chainId === "robinhood");
    return pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  } catch {
    return [];
  }
}

async function v2ReserveWeth(pairAddress) {
  const pair = new ethers.Contract(pairAddress, v2PairAbi, provider);
  const [[r0, r1], token0] = await Promise.all([pair.getReserves(), pair.token0()]);
  return token0.toLowerCase() === WETH.toLowerCase() ? r0 : r1;
}

const [symbol, name, decimals, v2Pair, logo, dexPairs] = await Promise.all([
  erc20.symbol().catch(() => "?"),
  erc20.name().catch(() => "?"),
  erc20.decimals().catch(() => 18n),
  v2Factory.getPair(address, WETH),
  fetchRelayLogo(),
  fetchDexScreenerPairs(),
]);

let venue = "none found against WETH";
let v2 = false;
let v2WethReserve = 0n;
if (v2Pair !== ethers.ZeroAddress) {
  v2WethReserve = await v2ReserveWeth(v2Pair);
  if (v2WethReserve >= MIN_V2_WETH_RESERVE) {
    venue = `V2 (pair ${v2Pair}, ${ethers.formatEther(v2WethReserve)} WETH reserve)`;
    v2 = true;
  } else {
    venue = `V2 pair EXISTS (${v2Pair}) but only ${ethers.formatEther(v2WethReserve)} WETH reserve — treating as a decoy, NOT using it`;
  }
} else {
  for (const fee of V3_FEE_TIERS) {
    const pool = await v3Factory.getPool(address, WETH, fee);
    if (pool !== ethers.ZeroAddress) {
      venue = `V3 (pool ${pool}, fee ${fee})`;
      break;
    }
  }
}

const topDexPair = dexPairs[0];
const dexLiquidityUsd = topDexPair?.liquidity?.usd ?? 0;
const dexSaysV4 = topDexPair?.labels?.includes("v4");
// If DexScreener's real top pair is a V4 with meaningfully more liquidity
// than whatever this script found on-chain, trust DexScreener — this is
// exactly the FRONG failure mode (script found a live-but-dead V2 pair,
// DexScreener's aggregated view shows the real V4 pool that dwarfs it).
const dexOverridesV2 = v2 && dexSaysV4 && dexLiquidityUsd > 1000;
if (dexOverridesV2) v2 = false;

console.log(`\nToken: ${symbol} — ${name} (${decimals} decimals)`);
console.log(`Address: ${address}`);
console.log(`Pool venue vs WETH (on-chain V2/V3 check): ${venue}`);
if (topDexPair) {
  console.log(
    `DexScreener top pair (all venues): ${topDexPair.labels?.join("/") ?? topDexPair.dexId} — $${dexLiquidityUsd.toLocaleString()} liquidity${dexOverridesV2 ? "  ⚠ OVERRIDES the V2 pair above — that V2 pair is a decoy" : ""}`
  );
} else {
  console.log(`DexScreener: no pairs found (or request failed) — verify liquidity manually before shipping`);
}
console.log(`Logo: ${logo ?? "(none from Relay — check DexScreener manually)"}\n`);

const comment = v2 ? "V2" : venue.startsWith("V3") ? "V3" : "V4 / no direct WETH pool with real liquidity — routes via Relay only";
console.log("Paste into TRENDING_TOKENS in lib/robinhoodTokens.ts:");
console.log(
  `  { chainId: siteConfig.chain.chainId, address: "${address}", symbol: "${symbol}", name: "${name}", decimals: ${decimals}, logo: "${logo ?? ""}" }, // ${comment}`
);

if (v2) {
  console.log(`\nAlso add to KNOWN_V2_TOKENS in lib/curatedPoolSwap.ts:`);
  console.log(`    "${address.toLowerCase()}", // ${symbol}`);
} else {
  console.log(
    `\nNot using the self-routed V2 fast path${v2Pair !== ethers.ZeroAddress ? " (V2 pair exists but is a decoy — see above)" : ""}. Leave out of KNOWN_V2_TOKENS. Swaps touching $PRINT route via Relay (relay-to-print/print-to-relay), same as JUGGERNAUT/STONKBROKER/etc.`
  );
}
