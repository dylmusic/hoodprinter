import { ethers } from "ethers";
import { siteConfig } from "@/site.config";
import { UNIVERSAL_ROUTER, PERMIT2, erc20Iface, permit2Iface } from "@/lib/printDirectSwap";

/**
 * Self-routed swaps for our own curated Robinhood Chain tokens that trade
 * on a plain Uniswap V2 pair against WETH (CASHCAT/ARROW/HOODRAT — same
 * addresses/venue PrintBot.tsx already routes through, "verified against
 * developers.uniswap.org"). Built after a real CASHCAT->$PRINT attempt
 * (routed via Relay for the CASHCAT->ETH leg) needed 3 signatures instead
 * of the promised 2 (Relay's own quote for an ERC20 origin splits into an
 * approve step + a swap step before our leg even runs) and then failed
 * with "Unable to find chain" (see lib/relayLeg.ts). For tokens whose pool
 * we already know, there's no reason to depend on Relay at all: this file
 * builds the CASHCAT<->ETH leg ourselves via the Universal Router, the
 * same way PrintBot.tsx's buildV2Calldata does for ETH->token, just
 * reversed. Paired with our own ETH<->PRINT leg (lib/printDirectSwap.ts),
 * the whole swap is 2 signatures, both of them OUR transactions — no
 * third-party routing service in the loop for these tokens at all.
 *
 * Deliberately NOT a single atomic transaction: the V2 leg's real output
 * amount isn't known exactly until it executes on-chain (only a guaranteed
 * *minimum*, via slippage). Hardcoding an assumed exact amount into a
 * chained V4_SWAP step in the same tx risks stranding the difference in
 * the router if the real fill is better than quoted — a real fund-loss
 * class of bug, not just a revert. Two signatures with the real delivered
 * amount read from an on-chain balance delta between them (same technique
 * already used for the Relay-based legs) has no such risk. This also
 * means we never pay a SECOND 0.85% fee to Relay's own appFees mechanism
 * on top of our own PAY_PORTION — self-routing removes Relay from the
 * loop entirely for these tokens, so the fee is exactly what it's always
 * been: 0.85%, taken once, on the leg that touches $PRINT.
 *
 * V3 tokens (JUGGERNAUT) and everything without a known pool here still
 * route through Relay (lib/relayLeg.ts) — this file has no verified V3
 * quoter contract on this chain to compute a safe minOut against, so it's
 * out of scope for now rather than guessing.
 */

// Same addresses/venue as components/PrintBot.tsx ("verified against
// developers.uniswap.org, Jul 2026") and CLAUDE.md's on-chain section.
const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const DEFAULT_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba"; // classic V2 router, quoting only
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002"; // Universal Router: keep funds in the router
const WETH_ADDR = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

// V2-pool tokens (confirmed via V2_FACTORY.getPair against WETH, verified
// live) — the original 3 PrintBot/MultiSender already curate (CASHCAT/
// ARROW/HOODRAT), plus 6 of Robinhood Chain's top tokens by real liquidity/
// volume (lib/robinhoodTokens.ts TRENDING_TOKENS, sourced from Relay's own
// `defaultList` ranking, cross-checked on DexScreener). JUGGERNAUT and the
// 5 V3 trending tokens (STONKBROKER/INDEX/DIH/YOLO/HMM) are NOT included —
// no verified V3 quoter on this chain yet to compute a safe minOut against,
// so those route through Relay when paired with $PRINT instead.
export const KNOWN_V2_TOKENS = new Set(
  [
    "0x020bfC650A365f8BB26819deAAbF3E21291018b4", // CASHCAT
    "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03", // ARROW
    "0x8e62f281f282686fca6dcb39288069a93fc23f1c", // HOODRAT
    "0x92d176ccbeeffecd8089e841d09ea17b6c22d969", // VLAD
    "0xc6911796042b15d7fa4f6cde69e245ddcd3d9c31", // VIRTUAL
    "0x39dbed3a2bd333467115de45665cc57f813c4571", // PONS
    "0x45242320dbb855eea8fd36804c6487e10e97fcf9", // TENDIES
    "0xdb87393727b666c43f5aecb03d8b419ba54d9b03", // SWOGE
    "0xf8bc08092c06db6148114dcf82af881f1085f92b", // WOOD
  ].map((a) => a.toLowerCase())
);

export function isKnownV2Token(address: string): boolean {
  return KNOWN_V2_TOKENS.has(address.toLowerCase());
}

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const routerIface = new ethers.Interface([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const v2RouterIface = new ethers.Interface([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
]);
const v2FactoryIface = new ethers.Interface(["function getPair(address,address) view returns (address)"]);

const readProvider = new ethers.JsonRpcProvider(siteConfig.chain.rpcUrl);

/** Confirms a V2 pair actually exists for (token, WETH) — belt-and-suspenders on top of the static KNOWN_V2_TOKENS list. */
export async function hasV2Pool(tokenAddr: string): Promise<boolean> {
  try {
    const factory = new ethers.Contract(V2_FACTORY, v2FactoryIface, readProvider);
    const pair: string = await factory.getPair(tokenAddr, WETH_ADDR);
    return !!pair && pair !== ethers.ZeroAddress;
  } catch {
    return false;
  }
}

/** Quotes tokenAddr -> WETH via the classic V2 router, applying `slippagePct` to get a safe minOut. */
export async function quoteV2TokenToEth(tokenAddr: string, amountWei: bigint, slippagePct: number): Promise<bigint> {
  const router = new ethers.Contract(DEFAULT_ROUTER, v2RouterIface, readProvider);
  const amounts: bigint[] = await router.getAmountsOut(amountWei, [tokenAddr, WETH_ADDR]);
  const quoted = amounts[amounts.length - 1];
  const slipBps = BigInt(Math.round(slippagePct * 100));
  return (quoted * (10000n - slipBps)) / 10000n;
}

/** Quotes ETH -> tokenAddr via the classic V2 router, applying `slippagePct` to get a safe minOut. */
export async function quoteV2EthToToken(tokenAddr: string, amountWei: bigint, slippagePct: number): Promise<bigint> {
  const router = new ethers.Contract(DEFAULT_ROUTER, v2RouterIface, readProvider);
  const amounts: bigint[] = await router.getAmountsOut(amountWei, [WETH_ADDR, tokenAddr]);
  const quoted = amounts[amounts.length - 1];
  const slipBps = BigInt(Math.round(slippagePct * 100));
  return (quoted * (10000n - slipBps)) / 10000n;
}

const MAX_UINT160 = (1n << 160n) - 1n;
const FAR_FUTURE_EXPIRATION = 4102444800;

export async function needsErc20ApprovalFor(tokenAddr: string, owner: string, amountWei: bigint): Promise<boolean> {
  const token = new ethers.Contract(tokenAddr, erc20Iface, readProvider);
  const allowance: bigint = await token.allowance(owner, PERMIT2);
  return allowance < amountWei;
}

export async function needsPermit2ApprovalFor(tokenAddr: string, owner: string, amountWei: bigint): Promise<boolean> {
  const permit2 = new ethers.Contract(PERMIT2, permit2Iface, readProvider);
  const [amount, expiration] = await permit2.allowance(owner, tokenAddr, UNIVERSAL_ROUTER);
  const notExpired = Number(expiration) === 0 || Number(expiration) > Math.floor(Date.now() / 1000);
  return amount < amountWei || !notExpired;
}

export function buildErc20ApproveTxFor(tokenAddr: string) {
  const data = erc20Iface.encodeFunctionData("approve", [PERMIT2, ethers.MaxUint256]);
  return { to: tokenAddr, data, value: 0n };
}

export function buildPermit2ApproveTxFor(tokenAddr: string) {
  const data = permit2Iface.encodeFunctionData("approve", [tokenAddr, UNIVERSAL_ROUTER, MAX_UINT160, FAR_FUTURE_EXPIRATION]);
  return { to: PERMIT2, data, value: 0n };
}

const w = (x: ethers.BigNumberish) => ethers.toBeHex(x, 32).slice(2);
const wa = (a: string) => ethers.zeroPadValue(a, 32).slice(2);

/**
 * Self-routed tokenAddr -> ETH, delivered straight to `recipient`.
 * PERMIT2_TRANSFER_FROM(0x02) + V2_SWAP_EXACT_IN(0x08) + UNWRAP_WETH(0x0c) —
 * the swap step's own amountOutMin is the only slippage floor needed;
 * UNWRAP_WETH just delivers whatever WETH balance resulted, no separate
 * floor or "assumed exact amount" risk (see the file-level comment).
 * Same non-standard offset layout as PrintBot.tsx's buildV2Calldata
 * (`pathOffset(0xc0)` + trailing empty-bytes field at `0x120`) — this
 * chain's Universal Router expects it on every path-bearing command, not
 * just V2_SWAP_EXACT_IN in the ETH->token direction.
 */
export function buildV2TokenToEthTx(tokenAddr: string, recipient: string, amountInWei: bigint, minEthOutWei: bigint) {
  const transferFromInput = abiCoder.encode(["address", "address", "uint160"], [tokenAddr, UNIVERSAL_ROUTER, amountInWei]);

  const v2Swap =
    "0x" +
    wa(ADDRESS_THIS) + // recipient: keep WETH in the router for the unwrap step
    w(amountInWei) +
    w(minEthOutWei) + // amountOutMin
    w(0xc0) + // pathOffset
    w(0) + // payerIsUser=false (router already holds tokenAddr from the transferFrom above)
    w(0x120) +
    w(2) + // path length
    wa(tokenAddr) +
    wa(WETH_ADDR) +
    w(0);

  const unwrap = abiCoder.encode(["address", "uint256"], [recipient, 0]); // deliver all resulting ETH to recipient

  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const data = routerIface.encodeFunctionData("execute", ["0x02080c", [transferFromInput, v2Swap, unwrap], deadline]);
  return { to: UNIVERSAL_ROUTER, data, value: 0n };
}

/**
 * Self-routed ETH -> tokenAddr, delivered straight to `recipient`. Same
 * WRAP_ETH(0x0b) + V2_SWAP_EXACT_IN(0x08) shape as PrintBot.tsx's
 * buildV2Calldata, just parameterized by recipient instead of hardcoding
 * the bot's own wallet.
 */
export function buildV2EthToTokenTx(tokenAddr: string, recipient: string, valueWei: bigint, minTokenOutWei: bigint) {
  const wrap = "0x" + wa(ADDRESS_THIS) + w(valueWei);
  const v2Swap =
    "0x" +
    wa(recipient) +
    w(valueWei) +
    w(minTokenOutWei) +
    w(0xc0) +
    w(0) +
    w(0x120) +
    w(2) +
    wa(WETH_ADDR) +
    wa(tokenAddr) +
    w(0);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const data = routerIface.encodeFunctionData("execute", ["0x0b08", [wrap, v2Swap], deadline]);
  return { to: UNIVERSAL_ROUTER, data, value: valueWei };
}
