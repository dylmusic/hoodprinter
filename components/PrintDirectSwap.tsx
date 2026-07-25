"use client";

import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, useAccount, useBalance, useDisconnect, useWalletClient } from "wagmi";
import { getDefaultConfig, RainbowKitProvider, darkTheme, useConnectModal } from "@rainbow-me/rainbowkit";
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
import { ETH_TOKEN, PRINT_TOKEN, type RhToken } from "@/lib/robinhoodTokens";
import { getRelayLegQuote, executeRelayLeg, quoteLastTxHash } from "@/lib/relayLeg";
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
  if (msg && typeof msg === "string") return msg;
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

const wagmiConfig = getDefaultConfig({
  appName: "HOODPrinter",
  appUrl: siteConfig.url,
  appIcon: `${siteConfig.url}/logo.png`,
  // See components/SwapEmbed.tsx for why this placeholder (not empty string).
  projectId: WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http() },
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
};

type LegProgress = { part: 1 | 2; total: 2; label: string } | null;

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
  return t.address.toLowerCase() === PRINT_TOKEN.address.toLowerCase();
}
function isSameToken(a: RhToken, b: RhToken) {
  return a.address.toLowerCase() === b.address.toLowerCase();
}
function planRoute(from: RhToken, to: RhToken): PlanKind {
  if (isSameToken(from, to)) return "invalid";
  const fromPrint = isPrintToken(from);
  const toPrint = isPrintToken(to);
  if (from.isNative && toPrint) return "print-buy";
  if (fromPrint && to.isNative) return "print-sell";
  if (fromPrint) return isKnownV2Token(to.address) ? "print-to-curated" : "print-to-relay";
  if (toPrint) return isKnownV2Token(from.address) ? "curated-to-print" : "relay-to-print";
  return "relay-only";
}

function InnerDirectSwap() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();

  const [fromToken, setFromToken] = useState<RhToken>(ETH_TOKEN);
  const [toToken, setToToken] = useState<RhToken>(PRINT_TOKEN);
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);

  const { data: fromBalanceData } = useBalance({
    address,
    chainId: robinhoodChain.id,
    token: fromToken.isNative ? undefined : (fromToken.address as `0x${string}`),
  });
  const { data: toBalanceData } = useBalance({
    address,
    chainId: robinhoodChain.id,
    token: toToken.isNative ? undefined : (toToken.address as `0x${string}`),
  });

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
  }, [fromToken.address, toToken.address, rate, ethUsd]);

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
    const previewAddress = address || PREVIEW_QUOTE_ADDRESS;

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
            chainId: CHAIN.id,
            fromCurrency: fromToken.address,
            toCurrency: toToken.address,
            amountWei,
            userAddress: previewAddress,
            chargeFee: true,
          });
          const outFormatted = (quote as any)?.details?.currencyOut?.amountFormatted;
          if (!cancelled) setRelayPreviewOut(outFormatted ? Number(outFormatted) : null);
        } else if (plan === "relay-to-print") {
          const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
          const quote = await getRelayLegQuote({
            chainId: CHAIN.id,
            fromCurrency: fromToken.address,
            toCurrency: NATIVE_ETH,
            amountWei,
            userAddress: previewAddress,
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
            fromCurrency: NATIVE_ETH,
            toCurrency: toToken.address,
            amountWei,
            userAddress: previewAddress,
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
  }, [plan, fromToken.address, toToken.address, amount, address, rate]);

  async function doSwap() {
    if (!walletClient || !address) return;
    if (!amt || amt <= 0) return;

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
        const totalWei = ethers.parseEther(amount);
        const { swapWei } = splitFee(totalWei);
        const expectedOut = Number(ethers.formatEther(swapWei)) * rate * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);

        setStep("Confirm in wallet…");
        const { to, data, value } = buildBuySwapTx(totalWei, minAmountOutWei);
        const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
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
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        const { swapWei } = splitFee(totalPrintWei);
        const expectedOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseEther(minOut.toFixed(18));

        setStep("Confirm in wallet…");
        const { to, data, value } = buildSellSwapTx(totalPrintWei, minAmountOutWei);
        const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
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
        setStep("Confirm in wallet…");
        legContext = `${fromToken.symbol} → ${toToken.symbol} (via Relay)`;
        const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
        const quote = await getRelayLegQuote({
          chainId: CHAIN.id,
          fromCurrency: fromToken.address,
          toCurrency: toToken.address,
          amountWei,
          userAddress: address,
          chargeFee: true,
        });
        const { data: result } = await executeRelayLeg(quote, walletClient, (label) => setStep(label));
        const hash = quoteLastTxHash(result, CHAIN.id);
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
          });
        }
      } else if (plan === "curated-to-print") {
        // Leg 1/2 — fromToken -> ETH via OUR OWN Universal Router call
        // against fromToken's known V2 pool (lib/curatedPoolSwap.ts) — no
        // Relay involved for this token at all. Conditional one-time
        // Permit2 approvals, same pattern as PRINT's own sell flow.
        const totalTokenWei = ethers.parseUnits(amount, fromToken.decimals);
        if (await needsErc20ApprovalFor(fromToken.address, address, totalTokenWei)) {
          setStep(`Approve ${fromToken.symbol}…`);
          const approveTx = buildErc20ApproveTxFor(fromToken.address, totalTokenWei);
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2ApprovalFor(fromToken.address, address, totalTokenWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTxFor(fromToken.address, totalTokenWei);
          const h = await walletClient.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        legContext = `Step 1/2 (${fromToken.symbol} → ETH, our own pool)`;
        setLegProgress({ part: 1, total: 2, label: `Confirm ${fromToken.symbol} → ETH` });
        const preBalance = await readProvider.getBalance(address);
        const minEthOutWei = await quoteV2TokenToEth(fromToken.address, totalTokenWei, slippage);
        const leg1 = buildV2TokenToEthTx(fromToken.address, address, totalTokenWei, minEthOutWei);
        const hash1 = await walletClient.sendTransaction({ to: leg1.to as `0x${string}`, data: leg1.data as `0x${string}`, value: leg1.value });
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
        const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
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
        // our 0.85% is taken once, on leg 2 below.
        legContext = `Step 1/2 (${fromToken.symbol} → ETH via Relay)`;
        setLegProgress({ part: 1, total: 2, label: `Confirm ${fromToken.symbol} → ETH` });
        const preBalance = await readProvider.getBalance(address);
        const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
        const quote1 = await getRelayLegQuote({
          chainId: CHAIN.id,
          fromCurrency: fromToken.address,
          toCurrency: NATIVE_ETH,
          amountWei,
          userAddress: address,
          chargeFee: false,
        });
        const feeDataPromise = readProvider.getFeeData(); // resolves while Relay's own leg runs, not after
        await executeRelayLeg(quote1, walletClient, (label) => setLegProgress({ part: 1, total: 2, label }));

        const postBalance = await readProvider.getBalance(address);
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        if (receivedWei <= 0n || !rate) {
          throw new Error(`Didn't receive any ETH from ${fromToken.symbol} — the swap may not have gone through.`);
        }
        // Probe leg 2's real gas cost (leg 2 is our own tx, so this is estimable even though leg 1 was Relay's).
        const gasReserveWei = await estimateEthGasReserve(buildBuySwapTx(receivedWei, 0n), address, ethUsd, feeDataPromise);
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n) {
          throw new Error(
            `Received ${ethers.formatEther(receivedWei)} ETH from ${fromToken.symbol} — not enough left over to also cover gas for the $PRINT swap. Try a larger amount.`
          );
        }

        // Leg 2/2 — ETH -> $PRINT via our own designated pool. Our fee is
        // taken here (see buildBuySwapTx's internal splitFee call).
        legContext = "Step 2/2 (ETH → $PRINT)";
        setLegProgress({ part: 2, total: 2, label: "Confirm ETH → $PRINT" });
        const expectedOut = Number(ethers.formatEther(leg2InputWei)) * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
        const minOut = expectedOut * (1 - slippage / 100);
        const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);
        const { to, data, value } = buildBuySwapTx(leg2InputWei, minAmountOutWei);
        const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
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
      } else if (plan === "print-to-relay") {
        if (!rate) return;
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
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
        const { to, data, value } = buildSellSwapTx(totalPrintWei, minAmountOutWei);
        const hash1 = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
        setTxHash(hash1);
        addTx({ hash: hash1, fromAmt: amount, fromSym: "PRINT", toAmt: null, toSym: "ETH", status: "pending", t: new Date().toLocaleTimeString() });
        await readProvider.waitForTransaction(hash1);
        updateTx(hash1, { status: "ok", toAmt: `~${fmt(expectedEthOut)}` });

        // Leg 2 here is Relay's own tx, not ours — its exact gas cost isn't
        // estimable ahead of a quote (which itself needs this amount), so
        // this reserve stays a flat heuristic rather than the dynamic
        // estimate used where leg 2 is our own transaction.
        const postBalance = await readProvider.getBalance(address);
        const gasReserveWei = ethers.parseEther((ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH).toFixed(18));
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n) {
          throw new Error(
            `$PRINT → ETH landed (${ethers.formatEther(receivedWei)} ETH), but not enough was left over to also cover gas for the ${toToken.symbol} swap. Try a larger amount.`
          );
        }

        // Leg 2/2 — ETH -> toToken via Relay. Fee-free (already taken above).
        legContext = `Step 2/2 (ETH → ${toToken.symbol} via Relay)`;
        setLegProgress({ part: 2, total: 2, label: `Confirm ETH → ${toToken.symbol}` });
        const quote2 = await getRelayLegQuote({
          chainId: CHAIN.id,
          fromCurrency: NATIVE_ETH,
          toCurrency: toToken.address,
          amountWei: leg2InputWei.toString(),
          userAddress: address,
          chargeFee: false,
        });
        const { data: result2 } = await executeRelayLeg(quote2, walletClient, (label) =>
          setLegProgress({ part: 2, total: 2, label })
        );
        const hash2 = quoteLastTxHash(result2, CHAIN.id);
        finalOk = !!hash2;
        setTxHash(hash2);
        setLastSwapped({ amt: amount, sym: "PRINT" });
        const outFormatted = (result2 as any)?.details?.currencyOut?.amountFormatted;
        setReceivedAmt(outFormatted ? Number(outFormatted) : null);
        setReceivedIsExact(false);
        setReceivedSym(toToken.symbol);
        if (hash2) {
          addTx({
            hash: hash2,
            fromAmt: amount,
            fromSym: "PRINT",
            toAmt: outFormatted ? `~${fmt(Number(outFormatted))}` : null,
            toSym: toToken.symbol,
            status: "ok",
            t: new Date().toLocaleTimeString(),
          });
        }
      } else if (plan === "print-to-curated") {
        if (!rate) return;
        const totalPrintWei = ethers.parseUnits(amount, 18);

        if (await needsErc20Approval(address, totalPrintWei)) {
          setStep("Approve PRINT…");
          const approveTx = buildErc20ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx(totalPrintWei);
          const h = await walletClient.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
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
        const hash1 = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
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
        const hash2 = await walletClient.sendTransaction({ to: leg2.to as `0x${string}`, data: leg2.data as `0x${string}`, value: leg2.value });
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

  const fromBalance = fromBalanceData ? Number(ethers.formatUnits(fromBalanceData.value, fromBalanceData.decimals)) : null;
  const toBalance = toBalanceData ? Number(ethers.formatUnits(toBalanceData.value, toBalanceData.decimals)) : null;
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
                  <span className={`swap-step-dot${legProgress.part >= 1 ? " active" : ""}`} />
                  <span className={`swap-step-line${legProgress.part >= 2 ? " active" : ""}`} />
                  <span className={`swap-step-dot${legProgress.part >= 2 ? " active" : ""}`} />
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
      </div>

      <section className="pb-card">
        <h2>Transactions</h2>
        <div className="pb-txs">
          {txs.length === 0 && <div className="pb-log-empty">No swaps yet — your recent swaps will land here.</div>}
          {txs.map((tx) => (
            <a
              key={tx.hash}
              className={`pb-tx ${tx.status}`}
              href={`${CHAIN.explorer}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="pb-tx-status" />
              <span className="pb-tx-amt">
                {tx.fromAmt} {tx.fromSym}
              </span>
              <span className="pb-tx-hash">
                {tx.toAmt ? `→ ${tx.toAmt} ${tx.toSym}` : `${tx.hash.slice(0, 10)}…${tx.hash.slice(-6)}`}
              </span>
              <span className="pb-tx-t">{tx.t}</span>
              <span className="pb-tx-arrow">↗</span>
            </a>
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
