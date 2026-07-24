import { ethers } from "ethers";
import { siteConfig, RELAY_FEE_RECIPIENT } from "@/site.config";

/**
 * Direct swap for ETH -> $PRINT on Robinhood Chain, bypassing Relay entirely.
 *
 * Why this exists: Relay's routing is picking the wrong on-chain pool for
 * $PRINT. There are THREE ETH/PRINT Uniswap V4 pools on Robinhood Chain
 * (confirmed via PoolManager Initialize events, PoolManager address
 * 0x8366a39CC670B4001A1121B8F6A443A643e40951) — only ONE has our tax hook
 * attached and real liquidity (0xf19f1556...); the other two are hookless
 * decoy pools with near-zero depth. Relay's quotes were landing on a decoy
 * (~1.29M PRINT/ETH vs the real pool's ~83M+ PRINT/ETH per DexScreener) —
 * confirmed via direct on-chain reads, not just Relay's UI. Relay's public
 * API has no pool-level pinning (`includedSwapSources`/`excludedSwapSources`
 * only filter by DEX name — "uniswap" covers all three pools identically;
 * tested empirically, including a "no routes found" result when forcing
 * that source, meaning same-chain quotes here don't even go through that
 * filter). So this hand-builds a Universal Router V4Router swap against the
 * KNOWN-correct pool instead of trusting Relay's pool selection for this
 * one pair. See CLAUDE.md "Swap" section for the full incident writeup.
 */

export const UNIVERSAL_ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

// Verified on-chain via the pool's Initialize event (topic0
// Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)).
export const PRINT_POOL_KEY = {
  currency0: NATIVE_ETH,
  currency1: siteConfig.contractAddress,
  fee: 8388608, // Uniswap V4 DYNAMIC_FEE_FLAG (0x800000) — hook sets the real fee (the 5% tax) at swap time
  tickSpacing: 200,
  hooks: "0x9c274C45083cf90A92e1DFB5041F094c3A8D90Cc",
} as const;

export const APP_FEE_BPS = 85n; // 0.85%, matches the Relay-embedded widget's fee
export const MIN_SLIPPAGE_PCT = 15; // generous — $PRINT is thin and volatile

const V4_SWAP_COMMAND = "0x10";
const ACTIONS = "0x060c0f"; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const routerIface = new ethers.Interface([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

/** Live PRINT-per-ETH price for the correct pool, read from DexScreener (indexes this exact pool). */
export async function fetchPrintEthRate(signal?: AbortSignal): Promise<number> {
  const res = await fetch(
    "https://api.dexscreener.com/latest/dex/pairs/robinhood/0xf19f1556acc8cabf39a9632002a92877852031148d4d1deb0144dffa4ee27075",
    { signal }
  );
  const json = await res.json();
  const priceNative = Number(json?.pairs?.[0]?.priceNative); // ETH per PRINT
  if (!priceNative || !Number.isFinite(priceNative)) throw new Error("Couldn't read a live price.");
  return 1 / priceNative; // PRINT per ETH
}

/** Builds the { to, data, value } for swapping `swapAmountWei` ETH -> PRINT via the correct pool. */
export function buildDirectSwapTx(swapAmountWei: bigint, minAmountOutWei: bigint) {
  const params0 = abiCoder.encode(
    ["tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)"],
    [
      [
        [PRINT_POOL_KEY.currency0, PRINT_POOL_KEY.currency1, PRINT_POOL_KEY.fee, PRINT_POOL_KEY.tickSpacing, PRINT_POOL_KEY.hooks],
        true, // zeroForOne: currency0 (ETH) -> currency1 (PRINT)
        swapAmountWei,
        minAmountOutWei,
        "0x",
      ],
    ]
  );
  const params1 = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency0, swapAmountWei]); // SETTLE_ALL
  const params2 = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency1, minAmountOutWei]); // TAKE_ALL

  const input0 = abiCoder.encode(["bytes", "bytes[]"], [ACTIONS, [params0, params1, params2]]);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const data = routerIface.encodeFunctionData("execute", [V4_SWAP_COMMAND, [input0], deadline]);

  return { to: UNIVERSAL_ROUTER, data, value: swapAmountWei };
}

/** Splits a total input amount into (platformFee, swapAmount) — fee taken off the top, 0.85%. */
export function splitFee(totalWei: bigint): { feeWei: bigint; swapWei: bigint } {
  const feeWei = (totalWei * APP_FEE_BPS) / 10000n;
  return { feeWei, swapWei: totalWei - feeWei };
}

export { RELAY_FEE_RECIPIENT as FEE_RECIPIENT };
