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
// $PRINT's pool hook takes a flat 5% on every swap — factor this into any
// "you'll receive" estimate or it reads ~5% high vs what actually lands
// (confirmed against a real swap: shown estimate 4,010 PRINT, actual
// received 3,752 PRINT — the gap is this tax, not just price impact).
export const POOL_TAX_PCT = 5;
// PRINT_MIN_SLIPPAGE convention elsewhere in the codebase (e.g. PrintBot.tsx)
// — 7% default leaves headroom on top of the tax for real price impact.
export const DEFAULT_SLIPPAGE_PCT = 7;
// Preset slippage buttons — the last slot is an editable custom input
// (see components/PrintDirectSwap.tsx) defaulting to this value, not a
// fixed preset, so users can go above 15% if they want to.
export const SLIPPAGE_OPTIONS = [7, 10];
export const DEFAULT_CUSTOM_SLIPPAGE_PCT = 15;

// Universal Router commands: PAY_PORTION (0x06) then V4_SWAP (0x10), one tx.
// PAY_PORTION is Universal Router's own built-in affiliate-fee mechanism —
// skims `bips` of the router's current token balance to a recipient before
// the swap command runs, atomically, in the same signature. This is how
// aggregator frontends normally take a cut without a separate fee tx.
const BUY_COMMANDS = "0x0610";
// Sell adds PERMIT2_TRANSFER_FROM (0x02) first: pulls the full PRINT amount
// into the router's own balance, THEN PAY_PORTION skims our fee from that
// balance, THEN V4_SWAP settles using what the router already holds.
// This order matters — V4Router's settlement (_pay/payOrPermit2Transfer)
// only pulls fresh from the user via Permit2 if the router *doesn't*
// already hold the funds; since we pull everything up front, the swap's
// SETTLE_ALL uses the router's existing (fee-adjusted) balance instead of
// pulling from the user a second time. TAKE_ALL still pays the ETH output
// straight to the caller, same as buy — no separate sweep step needed.
const SELL_COMMANDS = "0x020610";
const ACTIONS = "0x060c0f"; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const routerIface = new ethers.Interface([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

// Canonical Permit2 (same address on every EVM chain via CREATE2) — verified
// deployed on Robinhood Chain (real bytecode at this address, not empty).
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const erc20Iface = new ethers.Interface([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export const permit2Iface = new ethers.Interface([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

// Verified live on Robinhood Chain's Blockscout (contract search for
// "StateView") — the real Uniswap v4-periphery lens, confirmed by calling
// getSlot0 with our poolId and getting real non-zero data back (a second
// contract tagged "StateView" returned all zeros — not this one, wrong one).
export const STATE_VIEW = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";
export const POOL_ID = "0xf19f1556acc8cabf39a9632002a92877852031148d4d1deb0144dffa4ee27075";
const stateViewIface = new ethers.Interface([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);
const readProvider = new ethers.JsonRpcProvider(siteConfig.chain.rpcUrl);

/**
 * Live price data for the correct pool. The PRINT/ETH rate is read directly
 * on-chain via StateView — DexScreener (a third-party indexer) was used here
 * originally but can lag behind the real chain state for a few seconds,
 * which is exactly wrong right after the user's own swap moves the price.
 * Reading StateView directly has no such lag: it's the literal current
 * state. `ethUsd` (only used for the ~$1 gas-reserve estimate, not
 * precision-critical) still comes from DexScreener in the same request.
 */
export async function fetchPrintPriceData(signal?: AbortSignal): Promise<{ rate: number; ethUsd: number }> {
  const stateView = new ethers.Contract(STATE_VIEW, stateViewIface, readProvider);
  const [sqrtPriceX96] = await stateView.getSlot0(POOL_ID);
  if (!sqrtPriceX96 || sqrtPriceX96 === 0n) throw new Error("Couldn't read a live price.");
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const rate = ratio * ratio; // PRINT per ETH — both tokens are 18 decimals, no adjustment needed

  let ethUsd = 0;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${POOL_ID}`, { signal });
    const json = await res.json();
    const pair = json?.pairs?.[0];
    const priceNative = Number(pair?.priceNative);
    const priceUsd = Number(pair?.priceUsd);
    if (priceNative && priceUsd) ethUsd = priceUsd / priceNative;
  } catch {
    /* ethUsd is a nice-to-have for the gas-reserve estimate, not critical */
  }

  return { rate, ethUsd };
}

const TRANSFER_TOPIC0 = ethers.id("Transfer(address,address,uint256)");

/** Reads the actual PRINT amount received by `recipient` from a swap's transaction receipt. */
export function parseReceivedPrint(receipt: ethers.TransactionReceipt, recipient: string): number | null {
  const paddedRecipient = ethers.zeroPadValue(recipient, 32).toLowerCase();
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === siteConfig.contractAddress.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC0 &&
      log.topics[2]?.toLowerCase() === paddedRecipient
    ) {
      return Number(ethers.formatUnits(log.data, 18));
    }
  }
  return null;
}

/**
 * Builds the single { to, data, value } transaction that both takes our
 * 0.85% fee (via PAY_PORTION, atomically) and swaps the remainder ETH ->
 * PRINT — one signature, no separate fee transaction. `totalWei` is the
 * FULL amount the user typed (fee + swap combined); `minAmountOutWei`
 * should already be computed against the post-fee swap amount.
 */
export function buildBuySwapTx(totalWei: bigint, minAmountOutWei: bigint) {
  const { swapWei } = splitFee(totalWei);

  const payPortionInput = abiCoder.encode(
    ["address", "address", "uint256"],
    [NATIVE_ETH, RELAY_FEE_RECIPIENT, APP_FEE_BPS]
  );

  const swapParams = abiCoder.encode(
    ["tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)"],
    [
      [
        [PRINT_POOL_KEY.currency0, PRINT_POOL_KEY.currency1, PRINT_POOL_KEY.fee, PRINT_POOL_KEY.tickSpacing, PRINT_POOL_KEY.hooks],
        true, // zeroForOne: currency0 (ETH) -> currency1 (PRINT)
        swapWei,
        minAmountOutWei,
        "0x",
      ],
    ]
  );
  const settleParams = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency0, swapWei]); // SETTLE_ALL
  const takeParams = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency1, minAmountOutWei]); // TAKE_ALL

  const swapInput = abiCoder.encode(["bytes", "bytes[]"], [ACTIONS, [swapParams, settleParams, takeParams]]);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const data = routerIface.encodeFunctionData("execute", [BUY_COMMANDS, [payPortionInput, swapInput], deadline]);

  return { to: UNIVERSAL_ROUTER, data, value: totalWei };
}

/**
 * Builds the single { to, data, value } transaction for PRINT -> ETH,
 * assuming Permit2 allowances are already in place (see
 * needsErc20Approval/needsPermit2Approval + the two approve helpers below —
 * the component checks these and prompts approvals before calling this).
 * `totalPrintWei` is the full PRINT amount the user typed; pulls it into
 * the router via PERMIT2_TRANSFER_FROM, skims 0.85% via PAY_PORTION, swaps
 * the remainder, and TAKE_ALL pays the ETH output straight to the caller.
 */
export function buildSellSwapTx(totalPrintWei: bigint, minAmountOutWei: bigint) {
  const { swapWei } = splitFee(totalPrintWei);

  const transferFromInput = abiCoder.encode(
    ["address", "address", "uint160"],
    [siteConfig.contractAddress, UNIVERSAL_ROUTER, totalPrintWei]
  );
  const payPortionInput = abiCoder.encode(
    ["address", "address", "uint256"],
    [siteConfig.contractAddress, RELAY_FEE_RECIPIENT, APP_FEE_BPS]
  );

  const swapParams = abiCoder.encode(
    ["tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,bytes)"],
    [
      [
        [PRINT_POOL_KEY.currency0, PRINT_POOL_KEY.currency1, PRINT_POOL_KEY.fee, PRINT_POOL_KEY.tickSpacing, PRINT_POOL_KEY.hooks],
        false, // zeroForOne: currency1 (PRINT) -> currency0 (ETH)
        swapWei,
        minAmountOutWei,
        "0x",
      ],
    ]
  );
  const settleParams = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency1, swapWei]); // SETTLE_ALL (PRINT)
  const takeParams = abiCoder.encode(["address", "uint256"], [PRINT_POOL_KEY.currency0, minAmountOutWei]); // TAKE_ALL (ETH)

  const swapInput = abiCoder.encode(["bytes", "bytes[]"], [ACTIONS, [swapParams, settleParams, takeParams]]);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const data = routerIface.encodeFunctionData("execute", [
    SELL_COMMANDS,
    [transferFromInput, payPortionInput, swapInput],
    deadline,
  ]);

  return { to: UNIVERSAL_ROUTER, data, value: 0n };
}

const MAX_UINT160 = (1n << 160n) - 1n;
const FAR_FUTURE_EXPIRATION = 4102444800; // Jan 1 2100 — Permit2 allowances need an expiration, not just an amount

/** True if PRINT hasn't approved Permit2 to move at least `amountWei` yet (standard ERC20 approve, one-time). */
export async function needsErc20Approval(owner: string, amountWei: bigint): Promise<boolean> {
  const token = new ethers.Contract(siteConfig.contractAddress, erc20Iface, readProvider);
  const allowance: bigint = await token.allowance(owner, PERMIT2);
  return allowance < amountWei;
}

/** True if Permit2's own stored allowance for (owner, PRINT, UNIVERSAL_ROUTER) is insufficient or expired. */
export async function needsPermit2Approval(owner: string, amountWei: bigint): Promise<boolean> {
  const permit2 = new ethers.Contract(PERMIT2, permit2Iface, readProvider);
  const [amount, expiration] = await permit2.allowance(owner, siteConfig.contractAddress, UNIVERSAL_ROUTER);
  const notExpired = Number(expiration) === 0 || Number(expiration) > Math.floor(Date.now() / 1000);
  return amount < amountWei || !notExpired;
}

export function buildErc20ApproveTx() {
  const data = erc20Iface.encodeFunctionData("approve", [PERMIT2, ethers.MaxUint256]);
  return { to: siteConfig.contractAddress, data, value: 0n };
}

export function buildPermit2ApproveTx() {
  const data = permit2Iface.encodeFunctionData("approve", [
    siteConfig.contractAddress,
    UNIVERSAL_ROUTER,
    MAX_UINT160,
    FAR_FUTURE_EXPIRATION,
  ]);
  return { to: PERMIT2, data, value: 0n };
}

/** Splits a total input amount into (platformFee, swapAmount) — fee taken off the top, 0.85%. */
export function splitFee(totalWei: bigint): { feeWei: bigint; swapWei: bigint } {
  const feeWei = (totalWei * APP_FEE_BPS) / 10000n;
  return { feeWei, swapWei: totalWei - feeWei };
}

export { RELAY_FEE_RECIPIENT as FEE_RECIPIENT };
