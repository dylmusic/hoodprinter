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

const [symbol, name, decimals, v2Pair, logo] = await Promise.all([
  erc20.symbol().catch(() => "?"),
  erc20.name().catch(() => "?"),
  erc20.decimals().catch(() => 18n),
  v2Factory.getPair(address, WETH),
  fetchRelayLogo(),
]);

let venue = "none found against WETH";
let v2 = false;
if (v2Pair !== ethers.ZeroAddress) {
  venue = `V2 (pair ${v2Pair})`;
  v2 = true;
} else {
  for (const fee of V3_FEE_TIERS) {
    const pool = await v3Factory.getPool(address, WETH, fee);
    if (pool !== ethers.ZeroAddress) {
      venue = `V3 (pool ${pool}, fee ${fee})`;
      break;
    }
  }
}

console.log(`\nToken: ${symbol} — ${name} (${decimals} decimals)`);
console.log(`Address: ${address}`);
console.log(`Pool venue vs WETH: ${venue}`);
console.log(`Logo: ${logo ?? "(none from Relay — check DexScreener manually)"}\n`);

const comment = v2 ? "V2" : venue.startsWith("V3") ? "V3" : "V4 / no direct WETH pool — routes via Relay only";
console.log("Paste into TRENDING_TOKENS in lib/robinhoodTokens.ts:");
console.log(
  `  { chainId: siteConfig.chain.chainId, address: "${address}", symbol: "${symbol}", name: "${name}", decimals: ${decimals}, logo: "${logo ?? ""}" }, // ${comment}`
);

if (v2) {
  console.log(`\nAlso add to KNOWN_V2_TOKENS in lib/curatedPoolSwap.ts:`);
  console.log(`    "${address.toLowerCase()}", // ${symbol}`);
} else {
  console.log(
    `\nNot V2 — leave out of KNOWN_V2_TOKENS. Swaps touching $PRINT route via Relay (relay-to-print/print-to-relay), same as JUGGERNAUT/STONKBROKER/etc.`
  );
}
