"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, useAccount, useBalance, useDisconnect, useSwitchChain, useWalletClient, ConnectorChainMismatchError } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { getWalletClient } from "wagmi/actions";
import {
  getDefaultConfig,
  getDefaultWallets,
  getWalletConnectConnector,
  RainbowKitProvider,
  darkTheme,
  useConnectModal,
  type Wallet,
  type WalletList,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import type { Chain } from "viem";
import { siteConfig, WALLETCONNECT_PROJECT_ID } from "@/site.config";
import {
  buildBuySwapTx,
  buildSellSwapTx,
  buildErc20ApproveTx,
  buildPermit2ApproveTx,
  needsErc20Approval,
  needsPermit2Approval,
  fetchPrintPriceData,
  parseReceivedPrint,
  splitFee,
  DEFAULT_SLIPPAGE_PCT,
  SLIPPAGE_OPTIONS,
  DEFAULT_CUSTOM_SLIPPAGE_PCT,
  DEFAULT_SLIPPAGE_PCT_OTHER,
  SLIPPAGE_OPTIONS_OTHER,
  DEFAULT_CUSTOM_SLIPPAGE_PCT_OTHER,
  POOL_TAX_PCT,
  NATIVE_ETH,
} from "@/lib/printDirectSwap";
import { ETH_TOKEN, PRINT_TOKEN, NATIVE_SOL, isSolanaChain, tokenKey, type RhToken } from "@/lib/robinhoodTokens";
import { getRelayLegQuote, executeRelayLeg, adaptEvmWallet, adaptPrintSolanaWallet, quoteLastTxHash, quoteStepCount, relayTransactionUrl } from "@/lib/relayLeg";
import { useSolanaWallet, getSolanaBalance } from "@/lib/solanaWallet";
import {
  isKnownV2Token,
  quoteV2TokenToEth,
  quoteV2EthToToken,
  needsErc20ApprovalFor,
  needsPermit2ApprovalFor,
  buildErc20ApproveTxFor,
  buildPermit2ApproveTxFor,
  buildV2TokenToEthTx,
  buildV2EthToTokenTx,
} from "@/lib/curatedPoolSwap";
import TokenPickerModal, { TokenIcon } from "@/components/TokenPickerModal";
import { getTokenUsdPrice } from "@/lib/tokenUsdPrice";

// Reserved out of "swap your full balance" so gas doesn't eat into the swap
// amount and cause a revert — roughly $1 worth of ETH, falls back to a fixed
// amount if a live USD price isn't loaded yet. Also used as the gas buffer
// held back between legs of a 2-leg route (see planRoute below) so leg 2
// always has something left to pay for its own gas.
const FALLBACK_GAS_RESERVE_ETH = 0.0004;
const PRICE_POLL_MS = 15000;
const RELAY_QUOTE_DEBOUNCE_MS = 500;
const TXS_STORAGE_KEY = "hoodprint_swap_txs"; // separate feed from the Buy Bot's own hoodprint_txs
const PENDING_RESUME_KEY = "hoodprint_swap_pending"; // interrupted 2-leg swaps waiting on leg 1's output to arrive
// How often/long to poll a bridge leg's output balance before giving up —
// a real live cross-chain attempt (SOL -> ETH) needed noticeably longer
// than a fixed short timeout: Dylan, after watching one land late: "check
// every 3 seconds or something... it should be easy if the user waits on
// the loading screen." 5 minutes covers real bridge settlement times
// without holding the UI hostage forever on a genuinely dead swap.
const BALANCE_POLL_INTERVAL_MS = 3000;
const BALANCE_POLL_TIMEOUT_MS = 5 * 60 * 1000;
// Relay's getQuote requires a `user` field but doesn't validate it belongs
// to anyone real for a read-only quote (verified live) — used ONLY to let
// the preview estimate work before a wallet is connected, never for
// execution (doSwap always requires the real connected address).
const PREVIEW_QUOTE_ADDRESS = "0x0000000000000000000000000000000000000000";

const CHAIN = {
  id: siteConfig.chain.chainId,
  explorer: siteConfig.chain.explorerUrl,
};

// Below this, a nonzero result reads as dust from rounding/estimation, not
// a real amount worth showing — "1.24e-10 ETH" is a genuinely confusing
// preview for what's functionally zero, so it collapses to a plain "0"
// instead of switching to scientific notation.
const DUST_THRESHOLD = 0.000001;

const fmt = (n: number, max = 6) =>
  n === 0 || (n > 0 && n < DUST_THRESHOLD)
    ? "0"
    : n.toLocaleString(undefined, { maximumFractionDigits: max });

// Balances specifically: 3 decimals once the amount is >= 1 (a wallet
// holding 39,059.161337 CASHCAT doesn't need all 6 digits shown), but keep
// full precision below 1 where the extra decimals are the only thing that
// distinguishes a meaningful amount from dust.
const fmtBalance = (n: number) => (n === 0 ? "0" : n >= 1 ? fmt(n, 3) : fmt(n, 6));

const fmtUsd = (n: number) => {
  if (n > 0 && n < DUST_THRESHOLD) return "$0";
  return n > 0 && n < 0.01
    ? `$${n.toFixed(4)}`
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// @reservoir0x/relay-svm-wallet-adapter's own confirm step throws exactly
// this the instant a Solana blockhash's ~60-90s validity window closes —
// whether or not the signed tx actually landed (it often does land right
// after this fires; confirmed live 2026-07-28, see the recovery logic in
// doSwap's relay-to-print branch, which verifies the real on-chain balance
// instead of trusting this error as definitive).
function isSolanaBlockheightTimeout(e: unknown): boolean {
  const msg = (e as any)?.message ?? (e as any)?.shortMessage ?? String(e);
  return typeof msg === "string" && (msg.includes("TransactionExpiredBlockheightExceededError") || msg.includes("block height exceeded"));
}

// Wallet/viem errors, Relay SDK errors, and our own thrown Errors all shape
// their message differently — try every field we've actually seen used
// before falling back to a raw dump, so a failure is diagnosable from the
// UI alone instead of just showing "Swap failed." with no detail.
function describeError(e: any): string {
  const msg =
    e?.shortMessage ||
    e?.reason ||
    e?.errors?.[0]?.message ||
    e?.error?.message ||
    e?.data?.message ||
    e?.response?.data?.message ||
    e?.message;
  if (msg && typeof msg === "string") {
    if (isSolanaBlockheightTimeout(e)) {
      return "Solana network took too long to confirm this transaction (it may have been sent, but expired before landing). Please try again.";
    }
    return msg;
  }
  try {
    return JSON.stringify(e)?.slice(0, 300) || "Swap failed.";
  } catch {
    return "Swap failed.";
  }
}

// Same wallet-connect stack as the Relay widget (wagmi + RainbowKit) so
// MetaMask/WalletConnect/etc. all work correctly here too.
const robinhoodChain: Chain = {
  id: siteConfig.chain.chainId,
  name: siteConfig.chain.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [siteConfig.chain.rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: siteConfig.chain.explorerUrl } },
};

// Robinhood Wallet isn't in RainbowKit's built-in wallet list, so it's
// defined by hand per RainbowKit's documented "Custom Wallets" pattern.
// WalletConnect-only (no browser-extension identity flag found for it) --
// built from WalletConnect's own public Explorer listing for "Robinhood
// Wallet" (verified live, not guessed): native deep-link scheme is
// `robinhood-wallet://`, no universal link. The `wc?uri=` suffix is
// WalletConnect's own documented mobile-linking convention for wallets
// that don't register a more specific path. **Icon is NOT WalletConnect's
// own registered icon for the wallet app (that one's purple/pink)** --
// Dylan: "you used the wrong logo everyones doing the neon green for
// robinhood chain." Uses the same neon-green Robinhood feather mark
// already self-hosted for the chain picker (`lib/robinhoodTokens.ts`
// `CHAINS`, sourced from Relay's own chain-icon CDN for chain 4663),
// downloaded once as `public/brand/robinhood-wallet.webp` (really WebP
// bytes under a `.png`-looking source URL -- saved with the correct
// extension so it's served with the right content-type).
const robinhoodWallet = ({
  projectId,
  walletConnectParameters,
}: {
  projectId: string;
  walletConnectParameters?: Parameters<typeof getWalletConnectConnector>[0]["walletConnectParameters"];
}): Wallet => ({
  id: "robinhood",
  name: "Robinhood Wallet",
  iconUrl: "/brand/robinhood-wallet.webp",
  iconBackground: "#c8fb00",
  downloadUrls: {
    android: "https://play.google.com/store/apps/details?id=com.robinhood.gateway",
    ios: "https://robinhood.com/web3-wallet/",
    qrCode: "https://robinhood.com/web3-wallet/",
  },
  mobile: {
    getUri: (uri: string) => `robinhood-wallet://wc?uri=${encodeURIComponent(uri)}`,
  },
  qrCode: {
    getUri: (uri: string) => uri,
  },
  createConnector: getWalletConnectConnector({ projectId, walletConnectParameters }),
});

// Slotted in right after MetaMask within its own existing group (Dylan:
// "dont put it in reccomended just put it under metamask") rather than
// getting its own featured group above everything else.
// Matched by `.id === "metaMask"` (RainbowKit's own stable identifier),
// not function reference -- the imported `metaMaskWallet` isn't the same
// object identity `getDefaultWallets()` builds its list from internally,
// so a plain `.indexOf(metaMaskWallet)` silently matches nothing and the
// button vanishes instead of erroring. Calling each factory to check its
// `.id` is cheap/safe -- `getDefaultConfig` already does this same thing
// internally to build its full connector list.
const dummyWalletParams = {
  projectId: WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  appName: "HOODPrinter",
};
const walletsWithRobinhood: WalletList = getDefaultWallets().wallets.map((group) => {
  const metaMaskIndex = group.wallets.findIndex((w) => w(dummyWalletParams).id === "metaMask");
  if (metaMaskIndex === -1) return group;
  const wallets = [...group.wallets];
  wallets.splice(metaMaskIndex + 1, 0, robinhoodWallet);
  return { ...group, wallets };
});

// Base + Ethereum mainnet added 2026-07-28 (Dylan: "enable base, SOL, ETH")
// as real EVM origin/destination chains for cross-chain swaps — same
// MetaMask/RainbowKit connection already working for Robinhood Chain works
// unchanged for these, wagmi just needs them registered. Solana isn't a
// wagmi/viem chain at all (it's not EVM) — that side is handled separately
// via lib/solanaWallet.ts's lightweight Phantom hook, not through wagmi.
const wagmiConfig = getDefaultConfig({
  appName: "HOODPrinter",
  appUrl: siteConfig.url,
  appIcon: `${siteConfig.url}/logo.png`,
  // See components/SwapEmbed.tsx for why this placeholder (not empty string).
  projectId: WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [robinhoodChain, base, mainnet],
  transports: { [robinhoodChain.id]: http(), [base.id]: http(), [mainnet.id]: http() },
  wallets: walletsWithRobinhood,
});

const rainbowTheme = darkTheme({
  accentColor: "#00c805",
  accentColorForeground: "#04140a",
  borderRadius: "medium",
});

const readProvider = new ethers.JsonRpcProvider(siteConfig.chain.rpcUrl);
// Default ethers polling interval (4s) meant every waitForTransaction call
// in a 2-leg swap — leg 1's confirmation, any approvals, leg 2's own wait —
// could sit up to 4s past the block actually landing before we noticed.
// Tightening this is the single biggest lever on perceived "slowness"
// between leg 1 confirming and leg 2's wallet prompt appearing.
readProvider.pollingInterval = 1000;

// A real CASHCAT->PRINT attempt failed at exactly this step: leg 1
// genuinely succeeded, but a flat "~$1 of ETH" reserve held back for leg
// 2's gas turned out to be roughly the same size as the ENTIRE trade (a
// small test amount), leaving nothing to actually spend on leg 2 — not a
// routing bug, but a needlessly imprecise reserve. This estimates leg 2's
// real gas cost against the actual amount received, so only genuinely-
// too-small trades get blocked, not moderate ones. Falls back to the old
// flat heuristic only if estimation itself fails (e.g. an RPC hiccup).
async function estimateEthGasReserve(
  tx: { to: string; data: string; value: bigint },
  from: string,
  ethUsd: number | null,
  // Callers kick this off right after sending leg 1, so it resolves
  // concurrently with the confirmation wait instead of adding its own
  // sequential round-trip once leg 1 lands.
  feeDataPromise?: Promise<ethers.FeeData>
): Promise<bigint> {
  try {
    const [gasUnits, feeData] = await Promise.all([
      readProvider.estimateGas({ ...tx, from }),
      feeDataPromise ?? readProvider.getFeeData(),
    ]);
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
    return (gasUnits * gasPrice * 130n) / 100n; // 30% buffer for gas price drift between estimate and send
  } catch {
    return ethers.parseEther((ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH).toFixed(18));
  }
}

const FlipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type SwapTxRow = {
  hash: string;
  fromAmt: string;
  fromSym: string;
  toAmt: string | null;
  toSym: string;
  status: "pending" | "ok" | "fail";
  t: string;
  relayUrl?: string | null; // set whenever a leg of this swap was Relay-routed — links to Relay's own tx status page so the bridge itself is checkable, not just our own chain's side of it
};

// `total` is no longer always exactly 2 — Relay silently splits some
// quotes into more than one step itself (an ERC20 origin needing an
// approve step before its swap step), so a plan's real confirmation count
// is only known once the relevant quote(s) are in hand (see
// `lib/relayLeg.ts`'s `quoteStepCount`/`RelayLegProgress`).
type LegProgress = { part: number; total: number; label: string } | null;

/**
 * An interrupted 2-leg swap whose leg 1 is done (or in flight) but whose
 * leg 2 never fired — either because the tab closed while waiting for a
 * bridge to settle, or because `doSwap()` gave up waiting. Persisted so
 * "Resume swap" (Transactions section) can pick it back up later without
 * re-doing leg 1. Only `relay-to-print` (leg 1 is the slow/unpredictable
 * cross-chain bridge) and `print-to-relay` (leg 2 is) are ever recorded —
 * the other 2-leg plans (curated-to-print/print-to-curated) are same-chain
 * and settle in normal EVM block time, so there's nothing meaningful to
 * resume there.
 */
type PendingResume = {
  address: string; // only ever shown/resumable while this wallet is the connected one
  plan: "relay-to-print" | "print-to-relay";
  fromToken: RhToken;
  toToken: RhToken;
  amount: string;
  slippage: number;
  preBalanceWei: string; // Robinhood-chain ETH balance right before leg 1 started
  startedAt: number;
  relayUrl?: string | null; // relay-to-print's leg 1 quote, captured when the record is written — leg 1's own quote object won't exist anymore by the time a resumed leg 2 finishes
};

function loadPendingResumes(): PendingResume[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_RESUME_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function savePendingResumes(rows: PendingResume[]) {
  try {
    localStorage.setItem(PENDING_RESUME_KEY, JSON.stringify(rows.slice(0, 10)));
  } catch {
    /* storage blocked / full */
  }
}
function addPendingResume(row: PendingResume) {
  savePendingResumes([row, ...loadPendingResumes().filter((r) => r.startedAt !== row.startedAt)]);
}
function removePendingResume(startedAt: number) {
  savePendingResumes(loadPendingResumes().filter((r) => r.startedAt !== startedAt));
}

/**
 * Polls a Robinhood-chain ETH balance until it rises above `preBalance` or
 * `timeoutMs` elapses — the "let the loading screen wait for the bridge"
 * mechanism Dylan asked for after a real cross-chain swap settled well
 * after our own polling had already given up. `onTick` fires every
 * `intervalMs` with elapsed time so the caller can show a live counter
 * instead of a static "please wait."
 */
async function waitForBalanceIncrease(
  address: string,
  preBalance: bigint,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (elapsedMs: number) => void } = {}
): Promise<bigint> {
  const interval = opts.intervalMs ?? BALANCE_POLL_INTERVAL_MS;
  const timeout = opts.timeoutMs ?? BALANCE_POLL_TIMEOUT_MS;
  const start = Date.now();
  for (;;) {
    const balance = await readProvider.getBalance(address);
    if (balance > preBalance) return balance - preBalance;
    const elapsed = Date.now() - start;
    if (elapsed >= timeout) return 0n;
    opts.onTick?.(elapsed);
    await new Promise((r) => setTimeout(r, interval));
  }
}

// Mirrors lib/stats.ts's SwapStats — basic framework, room to grow (top
// pairs, per-route breakdown, etc.) without changing this shape's callers.
type SwapStatsShape = {
  trades: number;
  eth: number;
  tradesToday: number;
  ethToday: number;
  traders: number;
  newTradersToday: number;
  buys: number;
  sells: number;
  topPairs: { pair: string; count: number }[];
  planMix: { plan: string; count: number }[];
};

// Route-plan keys -> a short, terminal-friendly label. Kept here (not in
// lib/printDirectSwap.ts) since it's purely a display concern.
const PLAN_LABELS: Record<string, string> = {
  "print-buy": "PRINT POOL",
  "print-sell": "PRINT POOL",
  "relay-only": "RELAY",
  "curated-to-print": "SELF-ROUTED",
  "print-to-curated": "SELF-ROUTED",
  "relay-to-print": "RELAY+POOL",
  "print-to-relay": "POOL+RELAY",
};

/**
 * Our own router: any Robinhood Chain token to any other Robinhood Chain
 * token. $PRINT's real liquidity lives behind a hook-taxed Uniswap V4 pool
 * (see lib/printDirectSwap.ts for the full incident writeup) that Relay
 * can't route to correctly, so any leg touching $PRINT ALWAYS goes through
 * our own hardcoded pool — never Relay — no matter what the other side of
 * the swap is. Everything else (an ordinary token that isn't $PRINT) is
 * Relay's job, same-chain today; a future cross-chain leg is just a
 * different `toChainId` passed into lib/relayLeg.ts, not different logic.
 *
 * - print-buy / print-sell: today's original ETH<->PRINT flow, one signature.
 * - relay-only: neither side is $PRINT, one Relay-routed leg (its own
 *   internal approve+swap steps, if any, are Relay's, not ours) — our
 *   0.85% fee rides this leg since there's no PRINT leg to take it on.
 * - curated-to-print / print-to-curated: for tokens we already know the
 *   pool for (CASHCAT/ARROW/HOODRAT — lib/curatedPoolSwap.ts's
 *   KNOWN_V2_TOKENS), self-routed through our own Universal Router calls
 *   instead of Relay — NOT because Relay can't route them (it can), but
 *   because self-routing is strictly better here: it's the same 2
 *   signatures without Relay's extra hidden approve sub-step (a real
 *   CASHCAT->PRINT attempt needed 3 confirmations, not the promised 2 —
 *   Relay's own quote for an ERC20 origin splits into approve+swap before
 *   our leg even starts), no cross-service dependency risk, and no reason
 *   to pay Relay's 0.85% appFee on top of our own — that would be
 *   double-charging one swap 1.7% total instead of 0.85%, which the fee
 *   design explicitly avoids everywhere else. Same balance-delta technique
 *   as relay-to-print/print-to-relay for measuring leg 2's real input.
 * - relay-to-print / print-to-relay: the fallback for tokens whose pool we
 *   DON'T control (RWA stock tokens, arbitrary pasted addresses) — two
 *   signatures, leg 1 to/from plain ETH via Relay (fee-free — we don't
 *   double-charge), leg 2 is our own ETH<->PRINT pool tx (0.85% fee taken
 *   here, once). The amount fed into leg 2 is measured from the wallet's
 *   own ETH balance delta across leg 1 (post-fee, post-leg-1-gas) rather
 *   than trusted from Relay's quote, so a worse-than-quoted leg 1 fill
 *   can't leave leg 2 trying to spend ETH that never arrived.
 */
type PlanKind =
  | "print-buy"
  | "print-sell"
  | "relay-only"
  | "curated-to-print"
  | "print-to-curated"
  | "relay-to-print"
  | "print-to-relay"
  | "invalid";

function isPrintToken(t: RhToken) {
  return t.chainId === CHAIN.id && t.address.toLowerCase() === PRINT_TOKEN.address.toLowerCase();
}
// Address alone collides across chains (every EVM chain's native ETH shares
// the NATIVE_ETH sentinel address) — identity must include chainId.
function isSameToken(a: RhToken, b: RhToken) {
  return a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase();
}
// Cross-chain (Base/Solana/Ethereum mainnet), added 2026-07-28. $PRINT only
// exists on Robinhood Chain (isPrintToken already requires that), so
// fromPrint/toPrint branches are unaffected by chain — they're print-buy/
// print-sell/print-to-relay/relay-to-print exactly as before whenever the
// OTHER side happens to also be Robinhood Chain, and automatically become
// the cross-chain variant of the same plan (relay-to-print/print-to-relay)
// the instant the other side isn't, since getRelayLegQuote's chainId/
// toChainId params are what actually vary, not the plan kind itself. The
// two curated-pool plans stay chain-guarded to Robinhood<->Robinhood only
// (defensive — KNOWN_V2_TOKENS addresses are all real Robinhood Chain
// contracts, so this never actually fires today, but removes any
// theoretical cross-chain address-collision risk for free).
function planRoute(from: RhToken, to: RhToken): PlanKind {
  if (isSameToken(from, to)) return "invalid";
  const fromPrint = isPrintToken(from);
  const toPrint = isPrintToken(to);
  if (from.isNative && from.chainId === CHAIN.id && toPrint) return "print-buy";
  if (fromPrint && to.isNative && to.chainId === CHAIN.id) return "print-sell";
  if (fromPrint) return to.chainId === CHAIN.id && isKnownV2Token(to.address) ? "print-to-curated" : "print-to-relay";
  if (toPrint) return from.chainId === CHAIN.id && isKnownV2Token(from.address) ? "curated-to-print" : "relay-to-print";
  return "relay-only";
}

function InnerDirectSwap() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  // Lightweight direct-Phantom connection (lib/solanaWallet.ts) — separate
  // from wagmi/RainbowKit entirely, since Solana isn't an EVM chain. Only
  // consulted at all when a Solana token is actually on one side of the
  // swap (see fromIsSolana/toIsSolana below) — connecting Phantom is never
  // required or prompted for a Robinhood/Base/Ethereum-only swap.
  const sol = useSolanaWallet();

  const [fromToken, setFromToken] = useState<RhToken>(ETH_TOKEN);
  const [toToken, setToToken] = useState<RhToken>(PRINT_TOKEN);
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);

  const fromIsSolana = isSolanaChain(fromToken.chainId);
  const toIsSolana = isSolanaChain(toToken.chainId);

  const { data: fromBalanceData } = useBalance({
    address,
    chainId: fromToken.chainId,
    token: fromToken.isNative ? undefined : (fromToken.address as `0x${string}`),
    query: { enabled: !!address && !fromIsSolana },
  });
  const { data: toBalanceData } = useBalance({
    address,
    chainId: toToken.chainId,
    token: toToken.isNative ? undefined : (toToken.address as `0x${string}`),
    query: { enabled: !!address && !toIsSolana },
  });

  // wagmi's useBalance can't fetch a Solana balance (not an EVM chain) —
  // fetched separately here, added after Dylan flagged it missing from the
  // "You pay"/"You receive" panels ("solana balance doesnt show in the top
  // right where it should"). `solBalanceNonce` (bumped right after any
  // swap involving a Solana side confirms — see doSwap) forces a refetch
  // post-swap the same way wagmi's own block-watching keeps EVM balances
  // fresh without an explicit dependency here.
  const [solFromBalance, setSolFromBalance] = useState<number | null>(null);
  const [solToBalance, setSolToBalance] = useState<number | null>(null);
  const [solBalanceNonce, setSolBalanceNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSolFromBalance(null);
    if (!sol.address || !fromIsSolana) return;
    getSolanaBalance(sol.address, fromToken.address, fromToken.decimals).then((b) => !cancelled && setSolFromBalance(b));
    return () => {
      cancelled = true;
    };
  }, [sol.address, fromIsSolana, fromToken.address, fromToken.decimals, solBalanceNonce]);
  useEffect(() => {
    let cancelled = false;
    setSolToBalance(null);
    if (!sol.address || !toIsSolana) return;
    getSolanaBalance(sol.address, toToken.address, toToken.decimals).then((b) => !cancelled && setSolToBalance(b));
    return () => {
      cancelled = true;
    };
  }, [sol.address, toIsSolana, toToken.address, toToken.decimals, solBalanceNonce]);

  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT);
  const [customSlippage, setCustomSlippage] = useState(String(DEFAULT_CUSTOM_SLIPPAGE_PCT));
  // Renders as plain text (byte-for-byte the same size as the 7%/10% sibling
  // pills) until tapped — only becomes a real <input> while actively being
  // edited. A permanently-mounted tiny input can't be both genuinely 16px
  // (required so iOS Safari doesn't auto-zoom the page on focus) and
  // visually match its 0.66rem siblings at the same time: CSS transforms
  // shrink paint, not layout, so a scaled-down 16px input still reserves
  // its full pre-scale width in the flex row, making the pill wider than
  // its neighbors regardless (confirmed — this is what "still looks wider
  // on mobile" was).
  const [editingSlippage, setEditingSlippage] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [legProgress, setLegProgress] = useState<LegProgress>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [lastSwapped, setLastSwapped] = useState<{ amt: string; sym: string } | null>(null);
  const [receivedAmt, setReceivedAmt] = useState<number | null>(null);
  const [receivedIsExact, setReceivedIsExact] = useState(false);
  const [receivedSym, setReceivedSym] = useState<string>("");
  const [txs, setTxs] = useState<SwapTxRow[]>([]);
  const txsRestoredRef = useRef(false);
  // Interrupted 2-leg swaps (relay-to-print / print-to-relay) whose leg 2
  // never fired — see PendingResume above and "Resume swap" in the
  // Transactions section below. Loaded on mount and whenever the
  // connected wallet changes (only ever shown for the wallet that started
  // them — a different wallet's pending swap isn't actionable here).
  const [pendingResumes, setPendingResumes] = useState<PendingResume[]>([]);
  const [resuming, setResuming] = useState<number | null>(null); // startedAt of whichever pending resume is currently running, if any
  useEffect(() => {
    if (!address) {
      setPendingResumes([]);
      return;
    }
    setPendingResumes(loadPendingResumes().filter((r) => r.address.toLowerCase() === address.toLowerCase()));
  }, [address]);

  // Platform-wide swap stats (basic framework — see lib/stats.ts recordSwap
  // / readSwapStats). Fetched on mount and refreshed after each swap this
  // tab completes; other tabs' swaps show up next natural refresh, not live.
  const [swapStats, setSwapStats] = useState<SwapStatsShape | null>(null);
  const refreshSwapStats = () =>
    fetch("/api/swap")
      .then((r) => r.json())
      .then((d) => setSwapStats(d))
      .catch(() => {});
  useEffect(() => {
    refreshSwapStats();
  }, []);

  // Relay preview quote for legs that touch Relay (relay-only / one leg of
  // a 2-leg route) — debounced so we're not hammering Relay's quote API on
  // every keystroke. Not used at all for the pure print-buy/print-sell path.
  const [relayPreviewEth, setRelayPreviewEth] = useState<number | null>(null); // relay-to-print: ETH out of leg 1
  const [relayPreviewOut, setRelayPreviewOut] = useState<number | null>(null); // relay-only / print-to-relay: final token out
  const [relayPreviewLoading, setRelayPreviewLoading] = useState(false);
  const [relayPreviewError, setRelayPreviewError] = useState<string | null>(null);

  // Per-unit USD price for each side — fetched once per token selection
  // (not per keystroke), so "≈ $X" under each amount is cheap to keep live.
  // Powers both the display and the >25% mismatch warning below.
  const [fromUsdPrice, setFromUsdPrice] = useState<number | null>(null);
  const [toUsdPrice, setToUsdPrice] = useState<number | null>(null);

  const plan = planRoute(fromToken, toToken);
  const involvesPrint = isPrintToken(fromToken) || isPrintToken(toToken);

  const refreshPrice = () =>
    fetchPrintPriceData()
      .then(({ rate, ethUsd }) => {
        setRate(rate);
        setEthUsd(ethUsd);
        setRateError(null);
      })
      .catch(() => setRateError((prev) => prev ?? "Couldn't load a live price — try again shortly."));

  // Keep the $PRINT/ETH pool rate live regardless of which pair is selected
  // right now — cheap on-chain read, and needed the instant either side
  // becomes $PRINT.
  useEffect(() => {
    refreshPrice();
    const interval = setInterval(refreshPrice, PRICE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // Per-token USD price — refetches on token selection (not per keystroke).
  useEffect(() => {
    let cancelled = false;
    setFromUsdPrice(null);
    setToUsdPrice(null);
    getTokenUsdPrice(fromToken, rate, ethUsd).then((p) => !cancelled && setFromUsdPrice(p));
    getTokenUsdPrice(toToken, rate, ethUsd).then((p) => !cancelled && setToUsdPrice(p));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromToken.chainId, fromToken.address, toToken.chainId, toToken.address, rate, ethUsd]);

  // 7/10/15 only makes sense when clearing $PRINT's 5% tax — "7 as default
  // is too high for regular tokens, 2 should be default on most tokens."
  // Resets to the right preset whenever the pair crosses the PRINT boundary
  // (not on every keystroke — only when involvesPrint itself flips).
  useEffect(() => {
    setSlippage(involvesPrint ? DEFAULT_SLIPPAGE_PCT : DEFAULT_SLIPPAGE_PCT_OTHER);
    setCustomSlippage(String(involvesPrint ? DEFAULT_CUSTOM_SLIPPAGE_PCT : DEFAULT_CUSTOM_SLIPPAGE_PCT_OTHER));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [involvesPrint]);

  // Restore this wallet's recent-swap feed, same pattern as the Buy Bot's tx feed.
  useEffect(() => {
    if (!address || txsRestoredRef.current) return;
    txsRestoredRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(TXS_STORAGE_KEY) || "null");
      if (saved && saved.addr === address && Array.isArray(saved.rows)) {
        setTxs(saved.rows.slice(0, 25));
      }
    } catch {
      /* no saved feed */
    }
  }, [address]);

  useEffect(() => {
    if (!address || !txs.length) return;
    try {
      localStorage.setItem(TXS_STORAGE_KEY, JSON.stringify({ addr: address, rows: txs.slice(0, 25) }));
    } catch {
      /* storage blocked / full */
    }
  }, [address, txs]);

  function addTx(row: SwapTxRow) {
    setTxs((prev) => [row, ...prev].slice(0, 25));
  }
  function updateTx(hash: string, patch: Partial<SwapTxRow>) {
    setTxs((prev) => prev.map((r) => (r.hash === hash ? { ...r, ...patch } : r)));
  }

  // Component-level (not nested in doSwap) so `resumeSwap()` below can
  // share it too. `switchChainAsync` changes the real wallet's active
  // chain, but the plain `walletClient` object from `useWalletClient()`
  // does NOT reflect that for the rest of whichever call is in flight —
  // it's a captured reference, not reactive state, and viem validates a
  // send against THIS object's own baked-in `.chain`. `getWalletClient`
  // (an imperative wagmi/core action, not a hook — safe to call here)
  // fetches a brand new client scoped to the chain just switched to; that
  // is what must be used for every send after any switch, never the plain
  // `walletClient` hook value once a plan needs more than one chain.
  // Real live bug (mainnet ETH -> $PRINT): switchChainAsync's promise can
  // resolve slightly BEFORE the injected wallet's own eth_chainId actually
  // reflects the new chain — getWalletClient re-queries the connector live
  // and throws ConnectorChainMismatchError ("current chain of the connector
  // does not match the connection's chain") the instant that gap is hit.
  // Not a code bug in our switch logic, a genuine extension-side timing
  // lag — retry briefly instead of failing the whole swap on it.
  async function ensureEvmChain(chainId: number) {
    await switchChainAsync({ chainId });
    for (let attempt = 0; ; attempt++) {
      try {
        return await getWalletClient(wagmiConfig, { chainId });
      } catch (e) {
        if (attempt >= 5 || !(e instanceof ConnectorChainMismatchError)) throw e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  // Leg 2 of relay-to-print — ETH -> $PRINT via our own pool. Shared
  // between doSwap()'s normal flow and resumeSwap() (Transactions
  // section's "Resume swap") so this fund-moving logic exists in exactly
  // one place. Assumes the caller has already confirmed `ethWei` actually
  // arrived (a real balance-delta check, not a guess) and the wallet is
  // already on Robinhood Chain.
  async function runPrintBuyLeg2(client: Awaited<ReturnType<typeof ensureEvmChain>>, ethWei: bigint, fromAmt: string, fromSym: string, relayUrl?: string | null) {
    if (!rate || !address) throw new Error("Missing rate or address.");
    const gasReserveWei = await estimateEthGasReserve(buildBuySwapTx(ethWei, 0n), address, ethUsd);
    const leg2InputWei = ethWei > gasReserveWei ? ethWei - gasReserveWei : 0n;
    if (leg2InputWei <= 0n) {
      throw new Error(`Received ${ethers.formatEther(ethWei)} ETH — not enough left over to also cover gas for the $PRINT swap. Try a larger amount.`);
    }
    setLegProgress({ part: 2, total: 2, label: "Confirm ETH → $PRINT" });
    const expectedOut = Number(ethers.formatEther(leg2InputWei)) * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
    const minOut = expectedOut * (1 - slippage / 100);
    const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);
    const { to, data, value } = buildBuySwapTx(leg2InputWei, minAmountOutWei);
    const swapHash = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
    setTxHash(swapHash);
    setLastSwapped({ amt: fromAmt, sym: fromSym });
    addTx({ hash: swapHash, fromAmt, fromSym, toAmt: null, toSym: "PRINT", status: "pending", t: new Date().toLocaleTimeString(), relayUrl });
    setLegProgress(null);
    setStep("Confirming on-chain…");
    const receipt = await readProvider.waitForTransaction(swapHash);
    const ok = receipt?.status === 1;
    const received = ok ? parseReceivedPrint(receipt!, address) : null;
    setReceivedAmt(received);
    setReceivedIsExact(true);
    setReceivedSym("PRINT");
    updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: received !== null ? fmt(received) : null });
    return ok;
  }

  // Leg 2 of print-to-relay — ETH -> toToken via Relay. Same sharing
  // rationale as runPrintBuyLeg2 above. Takes `fromAmt` explicitly (not
  // the live `amount` input state) so a resumed swap reports the
  // ORIGINAL amount it was for, even if the input field has since
  // changed; same reasoning for computing Solana-ness from the passed
  // `toToken` param rather than the live `toIsSolana` closure value.
  async function runRelayToTokenLeg2(client: Awaited<ReturnType<typeof ensureEvmChain>>, ethWei: bigint, toToken: RhToken, fromAmt: string) {
    if (!address) throw new Error("Missing address.");
    const gasReserveWei = ethers.parseEther((ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH).toFixed(18));
    const leg2InputWei = ethWei > gasReserveWei ? ethWei - gasReserveWei : 0n;
    if (leg2InputWei <= 0n) {
      throw new Error(`$PRINT → ETH landed (${ethers.formatEther(ethWei)} ETH), but not enough was left over to also cover gas for the ${toToken.symbol} swap. Try a larger amount.`);
    }
    setLegProgress({ part: 2, total: 2, label: `Confirm ETH → ${toToken.symbol}` });
    const quote2 = await getRelayLegQuote({
      chainId: CHAIN.id,
      toChainId: toToken.chainId,
      fromCurrency: NATIVE_ETH,
      toCurrency: toToken.address,
      amountWei: leg2InputWei.toString(),
      userAddress: address,
      recipientAddress: isSolanaChain(toToken.chainId) ? sol.address! : address,
      chargeFee: false,
    });
    const { data: result2 } = await executeRelayLeg(quote2, adaptEvmWallet(client), (p) => setLegProgress({ part: 2, total: 2, label: p.label }));
    const hash2 = quoteLastTxHash(result2, CHAIN.id);
    const relayUrl2 = relayTransactionUrl(result2);
    setTxHash(hash2);
    setLastSwapped({ amt: fromAmt, sym: "PRINT" });
    const outFormatted = (result2 as any)?.details?.currencyOut?.amountFormatted;
    setReceivedAmt(outFormatted ? Number(outFormatted) : null);
    setReceivedIsExact(false);
    setReceivedSym(toToken.symbol);
    if (hash2) {
      addTx({
        hash: hash2,
        fromAmt,
        fromSym: "PRINT",
        toAmt: outFormatted ? `~${fmt(Number(outFormatted))}` : null,
        toSym: toToken.symbol,
        status: "ok",
        t: new Date().toLocaleTimeString(),
        relayUrl: relayUrl2,
      });
    }
    return !!hash2;
  }

  function flip() {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("0.01");
    setError(null);
    setTxHash(null);
  }

  function selectToken(side: "from" | "to", token: RhToken) {
    if (side === "from") {
      if (isSameToken(token, toToken)) setToToken(fromToken); // avoid picking the same token on both sides
      setFromToken(token);
    } else {
      if (isSameToken(token, fromToken)) setFromToken(toToken);
      setToToken(token);
    }
    setError(null);
    setTxHash(null);
  }

  function setMaxAmount() {
    if (fromToken.isNative) {
      if (!fromBalanceData) return;
      const balanceEth = Number(ethers.formatEther(fromBalanceData.value));
      const reserve = ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH;
      setAmount(Math.max(0, balanceEth - reserve).toFixed(6));
    } else {
      if (!fromBalanceData) return;
      setAmount(Number(ethers.formatUnits(fromBalanceData.value, fromBalanceData.decimals)).toFixed(6));
    }
  }

  const amt = parseFloat(amount) || 0;

  // Debounced preview quote for any plan that isn't the pure print-buy/
  // print-sell path. relay-to-print/curated-to-print preview leg 1
  // (fromToken -> ETH); the ETH estimate then flows through the same
  // PRINT-pool math as print-buy to produce the panel's final number.
  // print-to-relay/print-to-curated preview leg 2 (ETH -> toToken) using
  // the ETH amount our own sell math would produce. Curated plans quote
  // directly on-chain (lib/curatedPoolSwap.ts) and don't need a connected
  // wallet to preview, unlike the Relay-backed plans.
  useEffect(() => {
    setRelayPreviewEth(null);
    setRelayPreviewOut(null);
    setRelayPreviewError(null);
    if (!amt || amt <= 0) return;
    if (plan === "print-buy" || plan === "print-sell" || plan === "invalid") return;

    // Relay's getQuote requires *some* user address but doesn't need it to
    // be real for a read-only quote (verified live) — a placeholder lets
    // the estimate show up before connecting a wallet. Never used for
    // execution: doSwap() below still requires a real connected address.
    // Chain-aware since 2026-07-28: a Solana-shaped placeholder for a
    // Solana-origin/destination leg, an EVM-shaped one otherwise — Relay
    // validates address format per chain, an EVM zero-address "user" isn't
    // valid for an SVM quote.
    const previewAddressFor = (chainId: number) => (isSolanaChain(chainId) ? sol.address || NATIVE_SOL : address || PREVIEW_QUOTE_ADDRESS);
    const previewAddress = previewAddressFor(fromToken.chainId);

    let cancelled = false;
    setRelayPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (plan === "curated-to-print") {
          const amountWei = ethers.parseUnits(amount, fromToken.decimals);
          const ethOut = await quoteV2TokenToEth(fromToken.address, amountWei, 0); // unslipped estimate for display
          if (!cancelled) setRelayPreviewEth(Number(ethers.formatEther(ethOut)));
        } else if (plan === "print-to-curated" && rate) {
          const { swapWei } = splitFee(ethers.parseUnits(amount, 18));
          const ethOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
          if (ethOut <= 0) return;
          const tokenOut = await quoteV2EthToToken(toToken.address, ethers.parseEther(ethOut.toFixed(18)), 0);
          if (!cancelled) setRelayPreviewOut(Number(ethers.formatUnits(tokenOut, toToken.decimals)));
        } else if (plan === "relay-only") {
          const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
          const quote = await getRelayLegQuote({
            chainId: fromToken.chainId,
            toChainId: toToken.chainId,
            fromCurrency: fromToken.address,
            toCurrency: toToken.address,
            amountWei,
            userAddress: previewAddress,
            recipientAddress: previewAddressFor(toToken.chainId),
            chargeFee: true,
          });
          const outFormatted = (quote as any)?.details?.currencyOut?.amountFormatted;
          if (!cancelled) setRelayPreviewOut(outFormatted ? Number(outFormatted) : null);
        } else if (plan === "relay-to-print") {
          const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
          const quote = await getRelayLegQuote({
            chainId: fromToken.chainId,
            toChainId: CHAIN.id,
            fromCurrency: fromToken.address,
            toCurrency: NATIVE_ETH,
            amountWei,
            userAddress: previewAddress,
            recipientAddress: previewAddressFor(CHAIN.id),
            chargeFee: false,
          });
          const outFormatted = (quote as any)?.details?.currencyOut?.amountFormatted;
          if (!cancelled) setRelayPreviewEth(outFormatted ? Number(outFormatted) : null);
        } else if (plan === "print-to-relay" && rate) {
          const { swapWei } = splitFee(ethers.parseUnits(amount, 18));
          const ethOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
          if (ethOut <= 0) return;
          const amountWei = ethers.parseEther(ethOut.toFixed(18)).toString();
          const quote = await getRelayLegQuote({
            chainId: CHAIN.id,
            toChainId: toToken.chainId,
            fromCurrency: NATIVE_ETH,
            toCurrency: toToken.address,
            amountWei,
            userAddress: previewAddressFor(CHAIN.id),
            recipientAddress: previewAddressFor(toToken.chainId),
            chargeFee: false,
          });
          const outFormatted = (quote as any)?.details?.currencyOut?.amountFormatted;
          if (!cancelled) setRelayPreviewOut(outFormatted ? Number(outFormatted) : null);
        }
      } catch {
        if (!cancelled) setRelayPreviewError("No route found for this pair yet.");
      } finally {
        if (!cancelled) setRelayPreviewLoading(false);
      }
    }, RELAY_QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, fromToken.chainId, fromToken.address, toToken.chainId, toToken.address, amount, address, sol.address, rate]);

  async function doSwap() {
    if (!walletClient || !address) return;
    if (!amt || amt <= 0) return;
    // Cross-chain (added 2026-07-28): the EVM wallet is always required
    // (every plan's Robinhood-chain leg needs it — that's unchanged from
    // before this feature existed), and Phantom is ADDITIONALLY required
    // only when a Solana token is actually selected on either side.
    if ((fromIsSolana || toIsSolana) && !sol.address) {
      setError("Connect Phantom to swap with Solana.");
      return;
    }
    setSwapping(true);
    setError(null);
    setTxHash(null);
    setReceivedAmt(null);
    setLegProgress(null);
    let legContext: string | null = null; // prefixed onto the error below if a 2-leg route fails mid-flight
    let finalOk = false; // set at each plan's final leg — gates the swap-stats report below
    try {
      if (plan === "print-buy") {
        if (!rate) return;
        const client = await ensureEvmChain(CHAIN.id);
        const totalWei = ethers.parseEther(amount);
        const { swapWei } = splitFee(totalWei);
        const expectedOut = Number(ethers.formatEther(swapWei)) * rate * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);

        setStep("Confirm in wallet…");
        const { to, data, value } = buildBuySwapTx(totalWei, minAmountOutWei);
        const swapHash = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(swapHash);
        setLastSwapped({ amt: amount, sym: "ETH" });
        addTx({ hash: swapHash, fromAmt: amount, fromSym: "ETH", toAmt: null, toSym: "PRINT", status: "pending", t: new Date().toLocaleTimeString() });

        setStep("Confirming on-chain…");
        const receipt = await readProvider.waitForTransaction(swapHash);
        const ok = receipt?.status === 1;
        finalOk = ok;
        const received = ok ? parseReceivedPrint(receipt!, address) : null;
        setReceivedAmt(received);
        setReceivedIsExact(true);
        setReceivedSym("PRINT");
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: received !== null ? fmt(received) : null });
      } else if (plan === "print-sell") {
        if (!rate) return;
        const client = await ensureEvmChain(CHAIN.id);
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        const { swapWei } = splitFee(totalPrintWei);
        const expectedOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseEther(minOut.toFixed(18));

        setStep("Confirm in wallet…");
        const { to, data, value } = buildSellSwapTx(totalPrintWei, minAmountOutWei);
        const swapHash = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(swapHash);
        setLastSwapped({ amt: amount, sym: "PRINT" });
        addTx({ hash: swapHash, fromAmt: amount, fromSym: "PRINT", toAmt: null, toSym: "ETH", status: "pending", t: new Date().toLocaleTimeString() });

        setStep("Confirming on-chain…");
        const receipt = await readProvider.waitForTransaction(swapHash);
        const ok = receipt?.status === 1;
        finalOk = ok;
        setReceivedAmt(ok ? expectedOut : null);
        setReceivedIsExact(false);
        setReceivedSym("ETH");
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: ok ? `~${fmt(expectedOut)}` : null });
      } else if (plan === "relay-only") {
        // Cross-chain (Base/Solana/Ethereum mainnet), added 2026-07-28 —
        // neither side touches $PRINT, so this is a single plain Relay leg
        // exactly as before, just with real chainId/toChainId instead of
        // both hardcoded to Robinhood Chain. Signer is whichever wallet
        // matches the ORIGIN chain (Phantom for a Solana fromToken, the
        // connected EVM wallet otherwise — switching chain first if the
        // EVM wallet isn't already on fromToken's chain); recipient is
        // whichever wallet matches the DESTINATION chain.
        setStep("Confirm in wallet…");
        legContext = `${fromToken.symbol} → ${toToken.symbol} (via Relay)`;
        const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
        const recipientAddress = toIsSolana ? sol.address! : address;
        const quote = await getRelayLegQuote({
          chainId: fromToken.chainId,
          toChainId: toToken.chainId,
          fromCurrency: fromToken.address,
          toCurrency: toToken.address,
          amountWei,
          userAddress: fromIsSolana ? sol.address! : address,
          recipientAddress,
          chargeFee: true,
        });
        let relayWallet;
        if (fromIsSolana) {
          const provider = sol.getProvider();
          if (!provider) throw new Error("Phantom wallet not found.");
          relayWallet = adaptPrintSolanaWallet(sol.address!, (tx, opts) => provider.signAndSendTransaction(tx, opts));
        } else {
          const client = await ensureEvmChain(fromToken.chainId);
          relayWallet = adaptEvmWallet(client);
        }
        // Relay can silently split a quote into more than one step itself
        // (an ERC20 origin needing an approve step before its swap step —
        // real live bug: a same-chain Base cbBTC->ETH swap needed exactly
        // this and the old flat-text progress made it look stuck/broken
        // between the two wallet prompts). Only show the "Confirmation
        // X/Y" overlay when Relay's own quote actually needs more than one
        // — a plain single-signature swap keeps the existing flat button
        // text, no added clutter.
        const relaySteps = quoteStepCount(quote);
        if (relaySteps > 1) setLegProgress({ part: 1, total: relaySteps, label: "Confirm in wallet…" });
        const { data: result } = await executeRelayLeg(quote, relayWallet, (p) =>
          relaySteps > 1 ? setLegProgress({ part: p.part, total: p.total, label: p.label }) : setStep(p.label)
        );
        setLegProgress(null);
        const hash = quoteLastTxHash(result, fromToken.chainId);
        const relayUrl = relayTransactionUrl(result);
        finalOk = !!hash;
        setTxHash(hash);
        setLastSwapped({ amt: amount, sym: fromToken.symbol });
        const outFormatted = (result as any)?.details?.currencyOut?.amountFormatted;
        setReceivedAmt(outFormatted ? Number(outFormatted) : null);
        setReceivedIsExact(false);
        setReceivedSym(toToken.symbol);
        if (hash) {
          addTx({
            hash,
            fromAmt: amount,
            fromSym: fromToken.symbol,
            toAmt: outFormatted ? `~${fmt(Number(outFormatted))}` : null,
            toSym: toToken.symbol,
            status: "ok",
            t: new Date().toLocaleTimeString(),
            relayUrl,
          });
        }
      } else if (plan === "curated-to-print") {
        // Leg 1/2 — fromToken -> ETH via OUR OWN Universal Router call
        // against fromToken's known V2 pool (lib/curatedPoolSwap.ts) — no
        // Relay involved for this token at all. Conditional one-time
        // Permit2 approvals, same pattern as PRINT's own sell flow.
        const client = await ensureEvmChain(CHAIN.id); // both legs are Robinhood Chain — planRoute() only allows this plan when fromToken/toToken both are
        const totalTokenWei = ethers.parseUnits(amount, fromToken.decimals);
        if (await needsErc20ApprovalFor(fromToken.address, address, totalTokenWei)) {
          setStep(`Approve ${fromToken.symbol}…`);
          const approveTx = buildErc20ApproveTxFor(fromToken.address, totalTokenWei);
          const h = await client.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2ApprovalFor(fromToken.address, address, totalTokenWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTxFor(fromToken.address, totalTokenWei);
          const h = await client.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        legContext = `Step 1/2 (${fromToken.symbol} → ETH, our own pool)`;
        setLegProgress({ part: 1, total: 2, label: `Confirm ${fromToken.symbol} → ETH` });
        const preBalance = await readProvider.getBalance(address);
        const minEthOutWei = await quoteV2TokenToEth(fromToken.address, totalTokenWei, slippage);
        const leg1 = buildV2TokenToEthTx(fromToken.address, address, totalTokenWei, minEthOutWei);
        const hash1 = await client.sendTransaction({ to: leg1.to as `0x${string}`, data: leg1.data as `0x${string}`, value: leg1.value });
        setTxHash(hash1);
        addTx({ hash: hash1, fromAmt: amount, fromSym: fromToken.symbol, toAmt: null, toSym: "ETH", status: "pending", t: new Date().toLocaleTimeString() });
        const feeDataPromise = readProvider.getFeeData(); // resolves while we wait below, not after
        await readProvider.waitForTransaction(hash1);
        updateTx(hash1, { status: "ok" });

        const postBalance = await readProvider.getBalance(address);
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        if (receivedWei <= 0n || !rate) {
          throw new Error(`Didn't receive any ETH from ${fromToken.symbol} — the swap may not have gone through.`);
        }
        // Probe leg 2's real gas cost using the full received amount (minOut=0 — estimation only, never sent).
        const probeMinOutWei = 0n;
        const gasReserveWei = await estimateEthGasReserve(buildBuySwapTx(receivedWei, probeMinOutWei), address, ethUsd, feeDataPromise);
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n) {
          throw new Error(
            `Received ${ethers.formatEther(receivedWei)} ETH from ${fromToken.symbol} — not enough left over to also cover gas for the $PRINT swap. Try a larger amount.`
          );
        }

        // Leg 2/2 — ETH -> $PRINT via our own designated pool. Our fee is
        // taken here (see buildBuySwapTx's internal splitFee call) — this
        // is the ONLY fee taken across the whole swap.
        legContext = "Step 2/2 (ETH → $PRINT)";
        setLegProgress({ part: 2, total: 2, label: "Confirm ETH → $PRINT" });
        const expectedOut = Number(ethers.formatEther(leg2InputWei)) * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);
        const { to, data, value } = buildBuySwapTx(leg2InputWei, minAmountOutWei);
        const swapHash = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(swapHash);
        setLastSwapped({ amt: amount, sym: fromToken.symbol });
        addTx({ hash: swapHash, fromAmt: amount, fromSym: fromToken.symbol, toAmt: null, toSym: "PRINT", status: "pending", t: new Date().toLocaleTimeString() });

        setLegProgress(null);
        setStep("Confirming on-chain…");
        const receipt = await readProvider.waitForTransaction(swapHash);
        const ok = receipt?.status === 1;
        finalOk = ok;
        const received = ok ? parseReceivedPrint(receipt!, address) : null;
        setReceivedAmt(received);
        setReceivedIsExact(true);
        setReceivedSym("PRINT");
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: received !== null ? fmt(received) : null });
      } else if (plan === "relay-to-print") {
        // Leg 1/2 — fromToken -> ETH on Robinhood Chain via Relay. Fee-free:
        // our 0.85% is taken once, on leg 2 below. Cross-chain (added
        // 2026-07-28): fromToken's own chain is the leg's origin (signed by
        // Phantom if it's Solana, else the EVM wallet, switching chain
        // first if needed) — the destination is ALWAYS Robinhood Chain ETH
        // into our own EVM `address`, exactly as before, since leg 2 below
        // (our own pool) only ever exists on Robinhood Chain.
        legContext = `Step 1/2 (${fromToken.symbol} → ETH via Relay)`;
        setLegProgress({ part: 1, total: 2, label: `Confirm ${fromToken.symbol} → ETH` });
        const preBalance = await readProvider.getBalance(address);
        const startedAt = Date.now();
        const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
        const quote1 = await getRelayLegQuote({
          chainId: fromToken.chainId,
          toChainId: CHAIN.id,
          fromCurrency: fromToken.address,
          toCurrency: NATIVE_ETH,
          amountWei,
          userAddress: fromIsSolana ? sol.address! : address,
          recipientAddress: address,
          chargeFee: false,
        });
        const relayUrl = relayTransactionUrl(quote1); // requestId is on the quote itself, present before execute() ever runs
        let leg1Wallet;
        if (fromIsSolana) {
          const provider = sol.getProvider();
          if (!provider) throw new Error("Phantom wallet not found.");
          leg1Wallet = adaptPrintSolanaWallet(sol.address!, (tx, opts) => provider.signAndSendTransaction(tx, opts));
        } else {
          const leg1Client = await ensureEvmChain(fromToken.chainId);
          leg1Wallet = adaptEvmWallet(leg1Client);
        }
        try {
          await executeRelayLeg(quote1, leg1Wallet, (p) => setLegProgress({ part: 1, total: 2, label: p.label }));
        } catch (e) {
          // A real signed Solana tx can still land AFTER Relay's own
          // confirm-step gives up on it — Solana blockhashes are only
          // valid ~60-90s, and @reservoir0x/relay-svm-wallet-adapter
          // throws this exact error the instant that window closes,
          // whether or not the tx actually made it (confirmed live: a
          // real ETH delivery landed several minutes after this fired).
          // The balance-poll below is real on-chain proof either way —
          // don't fail the whole swap on a client-side polling timeout
          // alone, wait and check the chain instead.
          if (!fromIsSolana || !isSolanaBlockheightTimeout(e)) throw e;
        }
        const leg2Client = await ensureEvmChain(CHAIN.id); // leg 2 below is our own Robinhood-chain tx — switch back unconditionally (see ensureEvmChain's own comment for why this can't be a conditional check)

        // Persist BEFORE the wait, not after — this is exactly the window
        // Dylan flagged ("in case the user loses the loading screen"): if
        // the tab closes anywhere from here until leg 2 actually fires,
        // "Resume swap" (Transactions section) can still pick this up
        // using this same preBalance.
        addPendingResume({ address, plan: "relay-to-print", fromToken, toToken, amount, slippage, preBalanceWei: preBalance.toString(), startedAt, relayUrl });
        setPendingResumes(loadPendingResumes().filter((r) => r.address.toLowerCase() === address.toLowerCase()));

        // Dylan: "check for this balance to come in and then initiate the
        // 2nd part of the txn, check every 3 seconds... it should be easy
        // if the user waits on the loading screen." Bridges can genuinely
        // take a while to settle — up to 5 minutes before this gives up
        // and leaves the pending-resume record for later instead.
        const receivedWei = await waitForBalanceIncrease(address, preBalance, {
          onTick: (ms) => setLegProgress({ part: 1, total: 2, label: `Checking for bridge… (${Math.round(ms / 1000)}s)` }),
        });
        if (receivedWei <= 0n || !rate) {
          throw new Error(`Didn't receive any ETH from ${fromToken.symbol} yet — it may still be on the way. Check "Resume swap" in Transactions in a bit.`);
        }

        const ok = await runPrintBuyLeg2(leg2Client, receivedWei, amount, fromToken.symbol, relayUrl);
        finalOk = ok;
        if (ok) {
          removePendingResume(startedAt);
          setPendingResumes((prev) => prev.filter((r) => r.startedAt !== startedAt));
        }
      } else if (plan === "print-to-relay") {
        if (!rate) return;
        const client = await ensureEvmChain(CHAIN.id); // leg 1 is our own pool, always Robinhood Chain regardless of toToken's chain
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        // Leg 1/2 — $PRINT -> ETH via our own pool. Fee taken here (once).
        legContext = "Step 1/2 ($PRINT → ETH)";
        setLegProgress({ part: 1, total: 2, label: "Confirm $PRINT → ETH" });
        const { swapWei } = splitFee(totalPrintWei);
        const expectedEthOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedEthOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseEther(minOut.toFixed(18));
        const preBalance = await readProvider.getBalance(address);
        const startedAt = Date.now();
        const { to, data, value } = buildSellSwapTx(totalPrintWei, minAmountOutWei);
        const hash1 = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(hash1);
        addTx({ hash: hash1, fromAmt: amount, fromSym: "PRINT", toAmt: null, toSym: "ETH", status: "pending", t: new Date().toLocaleTimeString() });
        await readProvider.waitForTransaction(hash1);
        updateTx(hash1, { status: "ok", toAmt: `~${fmt(expectedEthOut)}` });

        // Leg 1 (ours) just landed, but leg 2 (the Relay bridge send) is
        // still ahead — persist a resume point now, same as relay-to-print,
        // in case the tab closes in the gap before it fires.
        addPendingResume({ address, plan: "print-to-relay", fromToken, toToken, amount, slippage, preBalanceWei: preBalance.toString(), startedAt });
        setPendingResumes(loadPendingResumes().filter((r) => r.address.toLowerCase() === address.toLowerCase()));

        const postBalance = await readProvider.getBalance(address);
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        if (receivedWei <= 0n) {
          throw new Error("$PRINT → ETH didn't land — the swap may not have gone through.");
        }

        const ok2 = await runRelayToTokenLeg2(client, receivedWei, toToken, amount);
        finalOk = ok2;
        if (ok2) {
          removePendingResume(startedAt);
          setPendingResumes((prev) => prev.filter((r) => r.startedAt !== startedAt));
        }
      } else if (plan === "print-to-curated") {
        if (!rate) return;
        const client = await ensureEvmChain(CHAIN.id); // both legs are Robinhood Chain — planRoute() only allows this plan when fromToken/toToken both are
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await client.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        // Leg 1/2 — $PRINT -> ETH via our own pool. Fee taken here (once) —
        // the ONLY fee taken across the whole swap.
        legContext = "Step 1/2 ($PRINT → ETH)";
        setLegProgress({ part: 1, total: 2, label: "Confirm $PRINT → ETH" });
        const { swapWei } = splitFee(totalPrintWei);
        const expectedEthOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedEthOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseEther(minOut.toFixed(18));
        const preBalance = await readProvider.getBalance(address);
        const { to, data, value } = buildSellSwapTx(totalPrintWei, minAmountOutWei);
        const hash1 = await client.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(hash1);
        addTx({ hash: hash1, fromAmt: amount, fromSym: "PRINT", toAmt: null, toSym: "ETH", status: "pending", t: new Date().toLocaleTimeString() });
        const feeDataPromise = readProvider.getFeeData(); // resolves while we wait below, not after
        await readProvider.waitForTransaction(hash1);
        updateTx(hash1, { status: "ok", toAmt: `~${fmt(expectedEthOut)}` });

        const postBalance = await readProvider.getBalance(address);
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        if (receivedWei <= 0n) {
          throw new Error("$PRINT → ETH didn't land — the swap may not have gone through.");
        }
        // Probe leg 2's real gas cost using the full received amount (minOut=0 — estimation only, never sent).
        const probeLeg2 = buildV2EthToTokenTx(toToken.address, address, receivedWei, 0n);
        const gasReserveWei = await estimateEthGasReserve(probeLeg2, address, ethUsd, feeDataPromise);
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n) {
          throw new Error(
            `$PRINT → ETH landed (${ethers.formatEther(receivedWei)} ETH), but not enough was left over to also cover gas for the ${toToken.symbol} swap. Try a larger amount.`
          );
        }

        // Leg 2/2 — ETH -> toToken via OUR OWN Universal Router call
        // against toToken's known V2 pool. Fee-free (already taken above).
        legContext = `Step 2/2 (ETH → ${toToken.symbol}, our own pool)`;
        setLegProgress({ part: 2, total: 2, label: `Confirm ETH → ${toToken.symbol}` });
        const minTokenOutWei = await quoteV2EthToToken(toToken.address, leg2InputWei, slippage);
        const leg2 = buildV2EthToTokenTx(toToken.address, address, leg2InputWei, minTokenOutWei);
        const hash2 = await client.sendTransaction({ to: leg2.to as `0x${string}`, data: leg2.data as `0x${string}`, value: leg2.value });
        setTxHash(hash2);
        setLastSwapped({ amt: amount, sym: "PRINT" });
        addTx({ hash: hash2, fromAmt: amount, fromSym: "PRINT", toAmt: null, toSym: toToken.symbol, status: "pending", t: new Date().toLocaleTimeString() });

        setLegProgress(null);
        setStep("Confirming on-chain…");
        const receipt2 = await readProvider.waitForTransaction(hash2);
        const ok2 = receipt2?.status === 1;
        finalOk = ok2;
        const receivedTokenEstimate = Number(ethers.formatUnits(minTokenOutWei, toToken.decimals));
        setReceivedAmt(ok2 ? receivedTokenEstimate : null);
        setReceivedIsExact(false);
        setReceivedSym(toToken.symbol);
        updateTx(hash2, { status: ok2 ? "ok" : "fail", toAmt: ok2 ? `~${fmt(receivedTokenEstimate)}` : null });
      }
      if (finalOk) {
        // Best-effort telemetry, not on-chain-verified — same tradeoff as
        // multisend's own usage reporting (nothing user-facing depends on
        // this count). ethValue is a best-effort ETH-equivalent size for
        // ANY pair, derived from the same USD pricing that already powers
        // the mismatch warning above, not an exact on-chain amount.
        const ethValue = ethUsd && fromUsdPrice && amt > 0 ? (fromUsdPrice * amt) / ethUsd : 0;
        fetch("/api/swap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet: address, plan, fromSym: fromToken.symbol, toSym: toToken.symbol, ethValue }),
        })
          .then(() => refreshSwapStats())
          .catch(() => {});
      }
      setStep(null);
      setLegProgress(null);
      refreshPrice(); // a PRINT-pool leg just moved the price — don't show a stale estimate
      if (fromIsSolana || toIsSolana) setSolBalanceNonce((n) => n + 1); // wagmi's own block-watching keeps EVM balances fresh automatically; Solana needs an explicit nudge
    } catch (e: any) {
      console.error("Swap failed", legContext, e);
      const detail = describeError(e);
      setError(legContext ? `${legContext} failed: ${detail}` : detail);
      setStep(null);
      setLegProgress(null);
    } finally {
      setSwapping(false);
    }
  }

  // "Resume swap" (Transactions section) — Dylan: "in case the user loses
  // the loading screen, make a 'resume swap' button... if they havent
  // completed the final leg." Doesn't re-do leg 1 (already sent/confirmed)
  // — just re-checks for its output and fires leg 2, reusing the exact
  // same runPrintBuyLeg2/runRelayToTokenLeg2 functions doSwap() itself
  // calls, so this fund-moving logic only exists in one place.
  async function resumeSwap(pending: PendingResume) {
    if (!walletClient || !address || address.toLowerCase() !== pending.address.toLowerCase() || swapping) return;
    setSwapping(true);
    setResuming(pending.startedAt);
    setError(null);
    setTxHash(null);
    setReceivedAmt(null);
    setLegProgress(null);
    const preBalance = BigInt(pending.preBalanceWei);
    let finalOk = false;
    try {
      const client = await ensureEvmChain(CHAIN.id);
      if (pending.plan === "relay-to-print") {
        if (!rate) throw new Error("Price not loaded yet — try again in a moment.");
        setLegProgress({ part: 1, total: 2, label: "Checking for bridge…" });
        const receivedWei = await waitForBalanceIncrease(pending.address, preBalance, {
          onTick: (ms) => setLegProgress({ part: 1, total: 2, label: `Checking for bridge… (${Math.round(ms / 1000)}s)` }),
        });
        if (receivedWei <= 0n) {
          throw new Error(`Still haven't received any ETH from ${pending.fromToken.symbol} — it may still be on the way. Try resuming again shortly.`);
        }
        finalOk = await runPrintBuyLeg2(client, receivedWei, pending.amount, pending.fromToken.symbol, pending.relayUrl);
      } else {
        // print-to-relay: leg 1 (ours) already fully landed by definition of
        // how this got persisted — no polling needed, just re-derive the
        // delta and fire leg 2 fresh (a new quote, since the old one may
        // be stale).
        const currentBalance = await readProvider.getBalance(pending.address);
        const receivedWei = currentBalance > preBalance ? currentBalance - preBalance : 0n;
        if (receivedWei <= 0n) {
          throw new Error("Didn't find the expected ETH from leg 1 — it may not have gone through.");
        }
        finalOk = await runRelayToTokenLeg2(client, receivedWei, pending.toToken, pending.amount);
      }
      if (finalOk) {
        removePendingResume(pending.startedAt);
        setPendingResumes((prev) => prev.filter((r) => r.startedAt !== pending.startedAt));
        fetch("/api/swap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet: address, plan: pending.plan, fromSym: pending.fromToken.symbol, toSym: pending.toToken.symbol, ethValue: 0 }),
        })
          .then(() => refreshSwapStats())
          .catch(() => {});
      }
      setStep(null);
      setLegProgress(null);
      refreshPrice();
    } catch (e: any) {
      console.error("Resume swap failed", pending, e);
      setError(describeError(e));
      setStep(null);
      setLegProgress(null);
    } finally {
      setSwapping(false);
      setResuming(null);
    }
  }

  // "You receive (estimated)" preview — branches by route, same shape either way.
  let previewOut: number | null = null;
  if (plan === "print-buy" && rate) {
    const { swapWei } = splitFee(ethers.parseEther((amt || 0).toString() || "0"));
    previewOut = Number(ethers.formatEther(swapWei)) * rate * (1 - POOL_TAX_PCT / 100);
  } else if (plan === "print-sell" && rate) {
    const { swapWei } = splitFee(ethers.parseUnits((amt || 0).toString() || "0", fromToken.decimals));
    previewOut = (Number(ethers.formatUnits(swapWei, fromToken.decimals)) / rate) * (1 - POOL_TAX_PCT / 100);
  } else if (plan === "relay-only") {
    previewOut = relayPreviewOut;
  } else if (plan === "curated-to-print" && relayPreviewEth !== null && rate) {
    // leg 2 (buildBuySwapTx) skims the 0.85% fee off this ETH amount before
    // swapping — same haircut as relay-to-print's preview, just fed by an
    // on-chain V2 quote instead of a Relay quote.
    previewOut = relayPreviewEth * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
  } else if (plan === "relay-to-print" && relayPreviewEth !== null && rate) {
    previewOut = relayPreviewEth * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
  } else if (plan === "print-to-relay" || plan === "print-to-curated") {
    previewOut = relayPreviewOut;
  }

  const fromBalance = fromIsSolana ? solFromBalance : fromBalanceData ? Number(ethers.formatUnits(fromBalanceData.value, fromBalanceData.decimals)) : null;
  const toBalance = toIsSolana ? solToBalance : toBalanceData ? Number(ethers.formatUnits(toBalanceData.value, toBalanceData.decimals)) : null;
  const isTwoLeg =
    plan === "relay-to-print" || plan === "print-to-relay" || plan === "curated-to-print" || plan === "print-to-curated";
  const isCuratedRoute = plan === "curated-to-print" || plan === "print-to-curated";

  // USD value on each side + a >25% mismatch warning — a gap that big means
  // a bad quote, a mispriced/illiquid token, or a mistake, not normal
  // slippage or our own fees (PRINT's 5% tax + 0.85% fee together are ~6%,
  // well under this threshold, so a legitimate PRINT swap never trips it).
  const fromUsdTotal = fromUsdPrice !== null && amt > 0 ? fromUsdPrice * amt : null;
  const toUsdTotal = toUsdPrice !== null && previewOut !== null ? toUsdPrice * previewOut : null;
  const mismatchPct =
    fromUsdTotal !== null && toUsdTotal !== null && fromUsdTotal > 0
      ? (Math.abs(fromUsdTotal - toUsdTotal) / fromUsdTotal) * 100
      : null;
  const showMismatchWarning = mismatchPct !== null && mismatchPct > 25;

  const slipOptions = involvesPrint ? SLIPPAGE_OPTIONS : SLIPPAGE_OPTIONS_OTHER;

  return (
    <>
      <TokenPickerModal
        open={pickerSide !== null}
        chainId={pickerSide === "to" ? toToken.chainId : fromToken.chainId}
        onClose={() => setPickerSide(null)}
        onSelect={(t) => pickerSide && selectToken(pickerSide, t)}
      />

      <div className="swap-card">
        <div className="swap-slippage-row">
          {slipOptions.map((p) => (
            <button
              key={p}
              type="button"
              className={`swap-slip-btn${slippage === p ? " active" : ""}`}
              onClick={() => setSlippage(p)}
            >
              {p}%
            </button>
          ))}
          <span className={`swap-slip-custom${!slipOptions.includes(slippage) ? " active" : ""}`}>
            {editingSlippage ? (
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={customSlippage}
                onBlur={() => setEditingSlippage(false)}
                onChange={(e) => {
                  if (!/^[0-9]*\.?[0-9]*$/.test(e.target.value)) return;
                  setCustomSlippage(e.target.value);
                  const n = parseFloat(e.target.value);
                  if (n > 0) setSlippage(n);
                }}
              />
            ) : (
              <button type="button" className="swap-slip-custom-display" onClick={() => setEditingSlippage(true)}>
                {customSlippage}
              </button>
            )}
            %
          </span>
        </div>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You pay</span>
            {isConnected && fromBalance !== null && (
              <button type="button" className="swap-balance" onClick={setMaxAmount}>
                {fmtBalance(fromBalance)} {fromToken.symbol}
              </button>
            )}
          </div>
          <div className="swap-panel-row">
            <input
              className="swap-amount-input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => /^[0-9]*\.?[0-9]*$/.test(e.target.value) && setAmount(e.target.value)}
              placeholder="0.0"
            />
            <button type="button" className="swap-token-pill-wrap" onClick={() => setPickerSide("from")}>
              <span className="swap-token-pill">
                <span className="swap-token-pill-icon">
                  <TokenIcon token={fromToken} size={18} />
                </span>
                {fromToken.symbol}
                <span className="swap-token-caret">▾</span>
              </span>
            </button>
          </div>
          {fromUsdTotal !== null && <p className="swap-usd-note">≈ {fmtUsd(fromUsdTotal)}</p>}
        </div>

        <button type="button" className="swap-divider" onClick={flip} aria-label="Flip direction">
          <FlipIcon />
        </button>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You receive</span>
            {isConnected && toBalance !== null && (
              <span className="swap-balance swap-balance-static">
                {fmtBalance(toBalance)} {toToken.symbol}
              </span>
            )}
          </div>
          <div className="swap-panel-row">
            <span className="swap-amount-display">
              {previewOut !== null ? fmt(previewOut) : relayPreviewLoading ? "…" : relayPreviewError || rateError ? "—" : "…"}
            </span>
            <button type="button" className="swap-token-pill-wrap" onClick={() => setPickerSide("to")}>
              <span className="swap-token-pill">
                <span className="swap-token-pill-icon">
                  <TokenIcon token={toToken} size={18} />
                </span>
                {toToken.symbol}
                <span className="swap-token-caret">▾</span>
              </span>
            </button>
          </div>
          {toUsdTotal !== null && <p className="swap-usd-note">≈ {fmtUsd(toUsdTotal)}</p>}
          {involvesPrint && <p className="swap-tax-note">$PRINT includes 5% rewards fee</p>}
        </div>

        {isTwoLeg && (
          <p className="swap-route-note">
            Routed as {fromToken.symbol} → ETH → {toToken.symbol === "ETH" ? toToken.symbol : `$PRINT`}
            {plan === "print-to-relay" || plan === "print-to-curated" ? ` → ${toToken.symbol}` : ""}
            {isCuratedRoute ? " · our own pool · 2 wallet confirmations" : " · 2 wallet confirmations"}
          </p>
        )}

        {rate && (
          <button type="button" className="swap-summary swap-summary-refresh" onClick={refreshPrice} title="Refresh price">
            <div className="swap-summary-row">
              <span>$PRINT Rate</span>
              <strong>1 ETH ≈ {fmt(rate, 0)} PRINT</strong>
            </div>
          </button>
        )}

        {relayPreviewError && !involvesPrint && <div className="pb-warn">{relayPreviewError}</div>}
        {rateError && involvesPrint && <div className="pb-warn">{rateError}</div>}
        {error && <div className="pb-warn">{error}</div>}

        {showMismatchWarning && fromUsdTotal !== null && toUsdTotal !== null && (
          <div className="swap-mismatch-warn">
            ⚠️ <strong>Price mismatch:</strong> you're paying ≈{fmtUsd(fromUsdTotal)} but receiving ≈
            {fmtUsd(toUsdTotal)} — a {fmt(mismatchPct!, 0)}% difference. This is much bigger than normal fees or
            slippage and usually means a bad quote, an illiquid token, or a mistake. Double check before continuing.
          </div>
        )}

        {!isConnected ? (
          <button type="button" className="btn btn-primary swap-cta" onClick={() => openConnectModal?.()}>
            Connect Wallet
          </button>
        ) : (fromIsSolana || toIsSolana) && !sol.address ? (
          // Solana (added 2026-07-28) needs a second, separate wallet
          // connection — Phantom, not RainbowKit/wagmi — only prompted at
          // all once a Solana token is actually selected on either side.
          <button type="button" className="btn btn-primary swap-cta" onClick={() => sol.connect()}>
            Connect Phantom
          </button>
        ) : (
          <>
            {swapping && legProgress && (
              <div className="swap-waiting">
                <span className="swap-waiting-ring">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="" className="swap-waiting-logo" />
                </span>
                <p className="swap-waiting-title">
                  Waiting for Confirmation {legProgress.part}/{legProgress.total}
                </p>
                <p className="swap-waiting-sub">{legProgress.label}</p>
                <div className="swap-waiting-dots">
                  {Array.from({ length: legProgress.total }, (_, i) => i + 1).map((n) => (
                    <Fragment key={n}>
                      {n > 1 && <span className={`swap-step-line${legProgress!.part >= n ? " active" : ""}`} />}
                      <span className={`swap-step-dot${legProgress!.part >= n ? " active" : ""}`} />
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              className={`btn swap-cta ${showMismatchWarning ? "swap-cta-danger" : "btn-primary"}`}
              onClick={doSwap}
              disabled={swapping || plan === "invalid" || (plan !== "relay-only" && !rate)}
            >
              {swapping
                ? legProgress
                  ? "Confirm in wallet…"
                  : step || "Swapping…"
                : plan === "invalid"
                  ? "Choose two different tokens"
                  : showMismatchWarning
                    ? "Swap Anyway"
                    : `Swap ${fromToken.symbol} for ${toToken.symbol}`}
            </button>
          </>
        )}

        {txHash && (
          <div className="swap-success">
            ✅ Swap sent —{" "}
            <a href={`${CHAIN.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              view on the explorer ↗
            </a>
            {receivedAmt !== null && lastSwapped && (
              <div>
                Swapped {lastSwapped.amt} {lastSwapped.sym} for {receivedIsExact ? "" : "~"}
                {fmt(receivedAmt)} {receivedSym}.
              </div>
            )}
          </div>
        )}

        {address && (
          <p className="swap-address">
            Connected: {address.slice(0, 6)}…{address.slice(-4)} ·{" "}
            <button type="button" className="swap-disconnect" onClick={() => disconnect()}>
              Disconnect
            </button>
          </p>
        )}
        {sol.address && (
          <p className="swap-address">
            Phantom: {sol.address.slice(0, 4)}…{sol.address.slice(-4)} ·{" "}
            <button type="button" className="swap-disconnect" onClick={() => sol.disconnect()}>
              Disconnect
            </button>
          </p>
        )}
      </div>

      <section className="pb-card">
        <h2>Transactions</h2>
        <div className="pb-txs">
          {txs.length === 0 && pendingResumes.length === 0 && (
            <div className="pb-log-empty">No swaps yet — your recent swaps will land here.</div>
          )}
          {pendingResumes.map((p) => (
            <div key={p.startedAt} className="pb-tx pending">
              <span className="pb-tx-status" />
              <span className="pb-tx-amt">
                {p.amount} {p.fromToken.symbol}
              </span>
              <span className="pb-tx-hash">
                {p.fromToken.symbol} → {p.toToken.symbol} · leg 2 not finished, started {Math.max(1, Math.round((Date.now() - p.startedAt) / 60000))}m ago
              </span>
              <button type="button" className="pb-tx-resume" disabled={swapping} onClick={() => resumeSwap(p)}>
                {resuming === p.startedAt ? "Resuming…" : "Resume"}
              </button>
              <button
                type="button"
                className="pb-tx-link pb-tx-dismiss"
                disabled={swapping}
                aria-label="Dismiss"
                onClick={() => {
                  removePendingResume(p.startedAt);
                  setPendingResumes((prev) => prev.filter((r) => r.startedAt !== p.startedAt));
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {txs.map((tx) => (
            <div key={tx.hash} className={`pb-tx ${tx.status}`}>
              <span className="pb-tx-status" />
              <span className="pb-tx-amt">
                {tx.fromAmt} {tx.fromSym}
              </span>
              <span className="pb-tx-hash">
                {tx.toAmt ? `→ ${tx.toAmt} ${tx.toSym}` : `${tx.hash.slice(0, 10)}…${tx.hash.slice(-6)}`}
              </span>
              <span className="pb-tx-t">{tx.t}</span>
              {tx.relayUrl && (
                <a className="pb-tx-link pb-tx-relay" href={tx.relayUrl} target="_blank" rel="noopener noreferrer">
                  Relay ↗
                </a>
              )}
              <a className="pb-tx-link" href={`${CHAIN.explorer}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">
                ↗
              </a>
            </div>
          ))}
        </div>
      </section>

      <SwapTerminal stats={swapStats} />
    </>
  );
}

// A little scroll-down easter egg, not promoted anywhere — a live-feeling
// terminal readout of platform-wide swap activity. Basic framework (self-
// reported, ethValue estimated — see lib/stats.ts) dressed up to feel
// futuristic without pulling in a charting library. Fee revenue is
// deliberately never computed or shown here, anywhere in this codebase.
function SwapTerminal({ stats }: { stats: SwapStatsShape | null }) {
  const loaded = !!stats;
  const trades = stats?.trades ?? 0;
  const dirTotal = (stats?.buys ?? 0) + (stats?.sells ?? 0);
  const buyPct = dirTotal > 0 ? Math.round(((stats?.buys ?? 0) / dirTotal) * 100) : 0;
  const sellPct = dirTotal > 0 ? 100 - buyPct : 0;

  const planTotals: Record<string, number> = {};
  for (const { plan, count } of stats?.planMix ?? []) {
    const label = PLAN_LABELS[plan] || plan.toUpperCase();
    planTotals[label] = (planTotals[label] || 0) + count;
  }
  const planSum = Object.values(planTotals).reduce((a, b) => a + b, 0);
  const routeMix = Object.entries(planTotals)
    .map(([label, count]) => ({ label, count, pct: planSum > 0 ? Math.round((count / planSum) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return (
    <section className="swap-term">
      <div className="swap-term-head">
        <span className="swap-term-dot" />
        <span className="swap-term-title">Swap Terminal</span>
        <span className="swap-term-live">
          <span className="swap-term-live-dot" /> LIVE
        </span>
      </div>

      {!loaded ? (
        <div className="swap-term-line swap-term-muted">Connecting to feed…</div>
      ) : trades === 0 ? (
        <div className="swap-term-line swap-term-muted">
          Awaiting first trade <span className="swap-term-cursor">●</span>
        </div>
      ) : (
        <>
          <div className="swap-term-row">
            <span className="swap-term-key">Total Trades</span>
            <span className="swap-term-val">{trades.toLocaleString()}</span>
          </div>
          <div className="swap-term-row">
            <span className="swap-term-key">ETH Volume</span>
            <span className="swap-term-val">
              {fmt(stats!.eth)}
              <em> ETH</em>
            </span>
          </div>
          <div className="swap-term-row">
            <span className="swap-term-key">Traders</span>
            <span className="swap-term-val">
              {stats!.traders.toLocaleString()}
              {stats!.newTradersToday > 0 && <em> (+{stats!.newTradersToday} today)</em>}
            </span>
          </div>
          {dirTotal > 0 && (
            <div className="swap-term-row">
              <span className="swap-term-key">$PRINT Flow</span>
              <span className="swap-term-val">
                <span className="swap-term-up">▲ {buyPct}%</span> <span className="swap-term-down">▼ {sellPct}%</span>
              </span>
            </div>
          )}

          {routeMix.length > 0 && (
            <>
              <div className="swap-term-divider" />
              <div className="swap-term-sub">Top Routes</div>
              {routeMix.map((r) => (
                <div className="swap-term-bar-row" key={r.label}>
                  <span className="swap-term-bar-label">{r.label}</span>
                  <span className="swap-term-bar-track">
                    <span className="swap-term-bar-fill" style={{ width: `${Math.max(r.pct, 4)}%` }} />
                  </span>
                  <span className="swap-term-bar-pct">{r.pct}%</span>
                </div>
              ))}
            </>
          )}

          {stats!.topPairs.length > 0 && (
            <>
              <div className="swap-term-divider" />
              <div className="swap-term-sub">Top Pairs</div>
              {stats!.topPairs.map((p, i) => (
                <div className="swap-term-row" key={p.pair}>
                  <span className="swap-term-key">
                    {i + 1}. {p.pair}
                  </span>
                  <span className="swap-term-val">{p.count}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div className="swap-term-foot">// self-reported · basic framework · eth values estimated</div>
    </section>
  );
}

export default function PrintDirectSwap() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider theme={rainbowTheme}>
          <InnerDirectSwap />
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
