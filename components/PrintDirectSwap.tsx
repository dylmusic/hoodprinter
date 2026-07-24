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
  buildDirectSwapTx,
  fetchPrintPriceData,
  parseReceivedPrint,
  splitFee,
  DEFAULT_SLIPPAGE_PCT,
  SLIPPAGE_OPTIONS,
  POOL_TAX_PCT,
} from "@/lib/printDirectSwap";

// Reserved out of "swap your full balance" so gas doesn't eat into the swap
// amount and cause a revert — roughly $1 worth of ETH, falls back to a fixed
// amount if a live USD price isn't loaded yet.
const FALLBACK_GAS_RESERVE_ETH = 0.0004;
const PRICE_POLL_MS = 15000;
const TXS_STORAGE_KEY = "hoodprint_swap_txs"; // separate feed from the Buy Bot's own hoodprint_txs

const CHAIN = {
  explorer: siteConfig.chain.explorerUrl,
};

const fmt = (n: number, max = 6) =>
  n === 0 ? "0" : n < 0.000001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: max });

// Same wallet-connect stack as the Relay widget (wagmi + RainbowKit) so
// MetaMask/WalletConnect/etc. all work correctly here too — the earlier
// version only supported a literal window.ethereum injected wallet.
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

type SwapTxRow = {
  hash: string;
  ethAmt: string;
  printAmt: string | null;
  status: "pending" | "ok" | "fail";
  t: string;
};

// Deliberately basic: ETH -> $PRINT only, direct against the known-correct
// pool (see lib/printDirectSwap.ts). No token/chain picker, no cross-chain —
// this exists only until Relay's routing for $PRINT is fixed.
function InnerDirectSwap() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const { data: balance } = useBalance({ address, chainId: robinhoodChain.id });

  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT);
  const [rate, setRate] = useState<number | null>(null);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [swappedEth, setSwappedEth] = useState<string | null>(null);
  const [receivedPrint, setReceivedPrint] = useState<number | null>(null);
  const [txs, setTxs] = useState<SwapTxRow[]>([]);
  const txsRestoredRef = useRef(false);

  const refreshPrice = () =>
    fetchPrintPriceData()
      .then(({ rate, ethUsd }) => {
        setRate(rate);
        setEthUsd(ethUsd);
        setRateError(null);
      })
      .catch(() => setRateError((prev) => prev ?? "Couldn't load a live price — try again shortly."));

  // Keep the estimate live — poll continuously, not just once on mount.
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

  function setMaxAmount() {
    if (!balance) return;
    const balanceEth = Number(ethers.formatEther(balance.value));
    const reserve = ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH;
    const max = Math.max(0, balanceEth - reserve);
    setAmount(max.toFixed(6));
  }

  async function doSwap() {
    if (!walletClient || !address || !rate) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);
    setReceivedPrint(null);
    try {
      const totalWei = ethers.parseEther(amount);
      const { swapWei } = splitFee(totalWei);

      const expectedOut = Number(ethers.formatEther(swapWei)) * rate * (1 - POOL_TAX_PCT / 100);
      const minOut = expectedOut * (1 - slippage / 100);
      const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);

      setStep("Confirm in wallet…");
      const { to, data, value } = buildDirectSwapTx(totalWei, minAmountOutWei);
      const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
      setTxHash(swapHash);
      setSwappedEth(amount);
      addTx({ hash: swapHash, ethAmt: amount, printAmt: null, status: "pending", t: new Date().toLocaleTimeString() });

      setStep("Confirming on-chain…");
      const receipt = await readProvider.waitForTransaction(swapHash);
      const ok = receipt?.status === 1;
      const received = ok ? parseReceivedPrint(receipt!, address) : null;
      setReceivedPrint(received);
      updateTx(swapHash, { status: ok ? "ok" : "fail", printAmt: received !== null ? fmt(received) : null });
      setStep(null);
      refreshPrice(); // the swap just moved the pool's price — don't show a stale estimate
    } catch (e: any) {
      setError(e?.shortMessage || e?.reason || e?.message || "Swap failed.");
      setStep(null);
    } finally {
      setSwapping(false);
    }
  }

  const amt = parseFloat(amount) || 0;
  const { swapWei: previewSwapWei } = splitFee(ethers.parseEther((amt || 0).toString() || "0"));
  const previewOut = rate ? Number(ethers.formatEther(previewSwapWei)) * rate * (1 - POOL_TAX_PCT / 100) : null;
  const balanceEth = balance ? Number(ethers.formatEther(balance.value)) : null;

  return (
    <>
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
        </div>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You pay</span>
            {isConnected && balanceEth !== null && (
              <button type="button" className="swap-balance" onClick={setMaxAmount}>
                Balance: {fmt(balanceEth)} ETH
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
            <span className="swap-token-pill-wrap">
              <span className="swap-token-pill">
                <span className="swap-token-pill-icon" aria-hidden="true">
                  ◆
                </span>
                ETH
              </span>
              <span className="swap-token-tooltip">⚠️ Multi-Chain Relay Under Construction</span>
            </span>
          </div>
        </div>

        <span className="swap-divider" aria-hidden="true">
          ↓
        </span>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You receive (estimated)</span>
          </div>
          <div className="swap-panel-row">
            <span className="swap-amount-display">{previewOut !== null ? fmt(previewOut) : rateError ? "—" : "…"}</span>
            <span className="swap-token-pill-wrap">
              <span className="swap-token-pill">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="swap-token-pill-icon" src="/logo.png" alt="" />
                PRINT
              </span>
              <span className="swap-token-tooltip">⚠️ Multi-Chain Relay Under Construction</span>
            </span>
          </div>
        </div>

        {rate && (
          <button type="button" className="swap-summary swap-summary-refresh" onClick={refreshPrice} title="Refresh price">
            <div className="swap-summary-row">
              <span>Rate</span>
              <strong>1 ETH ≈ {fmt(rate, 0)} PRINT</strong>
            </div>
          </button>
        )}

        {rateError && <div className="pb-warn">{rateError}</div>}
        {error && <div className="pb-warn">{error}</div>}

        {!isConnected ? (
          <button type="button" className="btn btn-primary swap-cta" onClick={() => openConnectModal?.()}>
            Connect Wallet
          </button>
        ) : (
          <button type="button" className="btn btn-primary swap-cta" onClick={doSwap} disabled={swapping || !rate}>
            {swapping ? step || "Swapping…" : "Swap ETH for $PRINT"}
          </button>
        )}

        {txHash && (
          <div className="swap-success">
            ✅ Swap sent —{" "}
            <a href={`${CHAIN.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
              view on the explorer ↗
            </a>
            {receivedPrint !== null && (
              <div>
                Swapped {swappedEth} ETH for {fmt(receivedPrint)} PRINT.
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
              <span className="pb-tx-amt">{tx.ethAmt} ETH</span>
              <span className="pb-tx-hash">
                {tx.printAmt ? `→ ${tx.printAmt} PRINT` : `${tx.hash.slice(0, 10)}…${tx.hash.slice(-6)}`}
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
