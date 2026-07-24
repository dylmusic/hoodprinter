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
  POOL_TAX_PCT,
  NATIVE_ETH,
} from "@/lib/printDirectSwap";
import { ETH_TOKEN, PRINT_TOKEN, type RhToken } from "@/lib/robinhoodTokens";
import { getRelayLegQuote, executeRelayLeg, quoteLastTxHash } from "@/lib/relayLeg";
import TokenPickerModal, { TokenIcon } from "@/components/TokenPickerModal";

// Reserved out of "swap your full balance" so gas doesn't eat into the swap
// amount and cause a revert — roughly $1 worth of ETH, falls back to a fixed
// amount if a live USD price isn't loaded yet. Also used as the gas buffer
// held back between legs of a 2-leg route (see planRoute below) so leg 2
// always has something left to pay for its own gas.
const FALLBACK_GAS_RESERVE_ETH = 0.0004;
const PRICE_POLL_MS = 15000;
const RELAY_QUOTE_DEBOUNCE_MS = 500;
const TXS_STORAGE_KEY = "hoodprint_swap_txs"; // separate feed from the Buy Bot's own hoodprint_txs

const CHAIN = {
  id: siteConfig.chain.chainId,
  explorer: siteConfig.chain.explorerUrl,
};

const fmt = (n: number, max = 6) =>
  n === 0 ? "0" : n < 0.000001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: max });

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
 * - relay-to-print / print-to-relay: two signatures, always exactly two
 *   (never more) — leg 1 gets the swap to/from plain ETH on Robinhood
 *   Chain via Relay (fee-free — we don't double-charge), leg 2 is our own
 *   ETH<->PRINT pool tx (where the 0.85% fee is taken, once). The amount
 *   fed into leg 2 is measured from the wallet's own ETH balance delta
 *   across leg 1 (post-fee, post-leg-1-gas) rather than trusted from
 *   Relay's quote, so a worse-than-quoted leg 1 fill can't leave leg 2
 *   trying to spend ETH that never arrived.
 */
type PlanKind = "print-buy" | "print-sell" | "relay-only" | "relay-to-print" | "print-to-relay" | "invalid";

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
  if (fromPrint) return "print-to-relay";
  if (toPrint) return "relay-to-print";
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

  // Relay preview quote for legs that touch Relay (relay-only / one leg of
  // a 2-leg route) — debounced so we're not hammering Relay's quote API on
  // every keystroke. Not used at all for the pure print-buy/print-sell path.
  const [relayPreviewEth, setRelayPreviewEth] = useState<number | null>(null); // relay-to-print: ETH out of leg 1
  const [relayPreviewOut, setRelayPreviewOut] = useState<number | null>(null); // relay-only / print-to-relay: final token out
  const [relayPreviewLoading, setRelayPreviewLoading] = useState(false);
  const [relayPreviewError, setRelayPreviewError] = useState<string | null>(null);

  const plan = planRoute(fromToken, toToken);

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

  // Debounced Relay preview quote, only for the legs that actually go
  // through Relay. relay-to-print previews leg 1 (fromToken -> ETH); the
  // ETH estimate then flows through the same PRINT-pool math as print-buy
  // to produce the panel's final number. print-to-relay previews leg 2
  // (ETH -> toToken) using the ETH amount our own sell math would produce.
  useEffect(() => {
    setRelayPreviewEth(null);
    setRelayPreviewOut(null);
    setRelayPreviewError(null);
    if (!address || !amt || amt <= 0) return;
    if (plan === "print-buy" || plan === "print-sell" || plan === "invalid") return;

    let cancelled = false;
    setRelayPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (plan === "relay-only") {
          const amountWei = ethers.parseUnits(amount, fromToken.decimals).toString();
          const quote = await getRelayLegQuote({
            chainId: CHAIN.id,
            fromCurrency: fromToken.address,
            toCurrency: toToken.address,
            amountWei,
            userAddress: address,
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
            userAddress: address,
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
            userAddress: address,
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
          const approveTx = buildErc20ApproveTx();
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx();
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
        setReceivedAmt(ok ? expectedOut : null);
        setReceivedIsExact(false);
        setReceivedSym("ETH");
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: ok ? `~${fmt(expectedOut)}` : null });
      } else if (plan === "relay-only") {
        setStep("Confirm in wallet…");
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
      } else if (plan === "relay-to-print") {
        // Leg 1/2 — fromToken -> ETH on Robinhood Chain via Relay. Fee-free:
        // our 0.85% is taken once, on leg 2 below.
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
        await executeRelayLeg(quote1, walletClient, (label) => setLegProgress({ part: 1, total: 2, label }));

        const postBalance = await readProvider.getBalance(address);
        const gasReserveWei = ethers.parseEther((ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH).toFixed(18));
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n || !rate) {
          throw new Error(`Didn't receive enough ETH from ${fromToken.symbol} to continue to $PRINT.`);
        }

        // Leg 2/2 — ETH -> $PRINT via our own designated pool. Our fee is
        // taken here (see buildBuySwapTx's internal splitFee call).
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
          const approveTx = buildErc20ApproveTx();
          const h = await walletClient.sendTransaction({ to: approveTx.to as `0x${string}`, data: approveTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }
        if (await needsPermit2Approval(address, totalPrintWei)) {
          setStep("Approve router…");
          const permitTx = buildPermit2ApproveTx();
          const h = await walletClient.sendTransaction({ to: permitTx.to as `0x${string}`, data: permitTx.data as `0x${string}` });
          await readProvider.waitForTransaction(h);
        }

        // Leg 1/2 — $PRINT -> ETH via our own pool. Fee taken here (once).
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

        const postBalance = await readProvider.getBalance(address);
        const gasReserveWei = ethers.parseEther((ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH).toFixed(18));
        const receivedWei = postBalance > preBalance ? postBalance - preBalance : 0n;
        const leg2InputWei = receivedWei > gasReserveWei ? receivedWei - gasReserveWei : 0n;
        if (leg2InputWei <= 0n) {
          throw new Error(`$PRINT → ETH landed, but there wasn't enough left to continue to ${toToken.symbol}.`);
        }

        // Leg 2/2 — ETH -> toToken via Relay. Fee-free (already taken above).
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
      }
      setStep(null);
      setLegProgress(null);
      refreshPrice(); // a PRINT-pool leg just moved the price — don't show a stale estimate
    } catch (e: any) {
      setError(e?.shortMessage || e?.reason || e?.message || "Swap failed.");
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
  } else if (plan === "relay-to-print" && relayPreviewEth !== null && rate) {
    previewOut = relayPreviewEth * (1 - 0.0085) * rate * (1 - POOL_TAX_PCT / 100);
  } else if (plan === "print-to-relay") {
    previewOut = relayPreviewOut;
  }

  const fromBalance = fromBalanceData ? Number(ethers.formatUnits(fromBalanceData.value, fromBalanceData.decimals)) : null;
  const toBalance = toBalanceData ? Number(ethers.formatUnits(toBalanceData.value, toBalanceData.decimals)) : null;
  const isTwoLeg = plan === "relay-to-print" || plan === "print-to-relay";
  const involvesPrint = isPrintToken(fromToken) || isPrintToken(toToken);

  return (
    <>
      <TokenPickerModal
        open={pickerSide !== null}
        onClose={() => setPickerSide(null)}
        onSelect={(t) => pickerSide && selectToken(pickerSide, t)}
        exclude={pickerSide === "from" ? toToken.address : fromToken.address}
      />

      <div className="swap-card">
        <div className="swap-slippage-row">
          {SLIPPAGE_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`swap-slip-btn${slippage === p ? " active" : ""}`}
              onClick={() => setSlippage(p)}
            >
              {p}%
            </button>
          ))}
          <span className={`swap-slip-custom${!SLIPPAGE_OPTIONS.includes(slippage) ? " active" : ""}`}>
            <input
              type="text"
              inputMode="decimal"
              value={customSlippage}
              onChange={(e) => {
                if (!/^[0-9]*\.?[0-9]*$/.test(e.target.value)) return;
                setCustomSlippage(e.target.value);
                const n = parseFloat(e.target.value);
                if (n > 0) setSlippage(n);
              }}
            />
            %
          </span>
        </div>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You pay</span>
            {isConnected && fromBalance !== null && (
              <button type="button" className="swap-balance" onClick={setMaxAmount}>
                Balance: {fmt(fromBalance)} {fromToken.symbol}
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
        </div>

        <button type="button" className="swap-divider" onClick={flip} aria-label="Flip direction">
          <FlipIcon />
        </button>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You receive (estimated)</span>
            {isConnected && toBalance !== null && (
              <span className="swap-balance swap-balance-static">
                Balance: {fmt(toBalance)} {toToken.symbol}
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
          {involvesPrint && <p className="swap-tax-note">$PRINT includes 5% rewards fee</p>}
        </div>

        {isTwoLeg && (
          <p className="swap-route-note">
            Routed as {fromToken.symbol} → ETH → {toToken.symbol === "ETH" ? toToken.symbol : `$PRINT`}
            {plan === "print-to-relay" ? ` → ${toToken.symbol}` : ""} · 2 wallet confirmations
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

        {!isConnected ? (
          <button type="button" className="btn btn-primary swap-cta" onClick={() => openConnectModal?.()}>
            Connect Wallet
          </button>
        ) : (
          <>
            {swapping && legProgress && (
              <div className="swap-steps">
                <span className={`swap-step-dot${legProgress.part >= 1 ? " active" : ""}`}>1</span>
                <span className={`swap-step-line${legProgress.part >= 2 ? " active" : ""}`} />
                <span className={`swap-step-dot${legProgress.part >= 2 ? " active" : ""}`}>2</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary swap-cta"
              onClick={doSwap}
              disabled={swapping || plan === "invalid" || (plan !== "relay-only" && !rate)}
            >
              {swapping
                ? legProgress
                  ? `Sign in wallet ${legProgress.part}/${legProgress.total} — ${legProgress.label}`
                  : step || "Swapping…"
                : plan === "invalid"
                  ? "Choose two different tokens"
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
    </>
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
