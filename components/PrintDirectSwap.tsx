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

const FlipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Two-tone diamond, standard Ethereum brand blue — the plain green "◆"
// character just blended into the green pill and didn't read as ETH.
const EthIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="12,2 20,12 12,16 4,12" fill="#8A92B2" />
    <polygon points="12,2 12,16 4,12" fill="#62688F" />
    <polygon points="12,22 20,13 12,17 4,13" fill="#8A92B2" />
    <polygon points="12,22 12,17 4,13" fill="#62688F" />
  </svg>
);

type Direction = "buy" | "sell"; // buy = ETH -> PRINT, sell = PRINT -> ETH

type SwapTxRow = {
  hash: string;
  fromAmt: string;
  fromSym: string;
  toAmt: string | null;
  toSym: string;
  status: "pending" | "ok" | "fail";
  t: string;
};

// Deliberately basic: ETH <-> $PRINT only, direct against the known-correct
// pool (see lib/printDirectSwap.ts). No token/chain picker, no cross-chain —
// this exists only until Relay's routing for $PRINT is fixed.
function InnerDirectSwap() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const { data: ethBalance } = useBalance({ address, chainId: robinhoodChain.id });
  const { data: printBalance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    token: siteConfig.contractAddress as `0x${string}`,
  });

  const [direction, setDirection] = useState<Direction>("buy");
  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT);
  const [customSlippage, setCustomSlippage] = useState(String(DEFAULT_CUSTOM_SLIPPAGE_PCT));
  const [rate, setRate] = useState<number | null>(null);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [lastSwapped, setLastSwapped] = useState<{ amt: string; sym: string } | null>(null);
  const [receivedAmt, setReceivedAmt] = useState<number | null>(null);
  const [receivedIsExact, setReceivedIsExact] = useState(false);
  const [txs, setTxs] = useState<SwapTxRow[]>([]);
  const txsRestoredRef = useRef(false);

  const fromSym = direction === "buy" ? "ETH" : "PRINT";
  const toSym = direction === "buy" ? "PRINT" : "ETH";

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

  function flip() {
    setDirection((d) => (d === "buy" ? "sell" : "buy"));
    setAmount(direction === "buy" ? "10000" : "0.01");
    setError(null);
    setTxHash(null);
  }

  function setMaxAmount() {
    if (direction === "buy") {
      if (!ethBalance) return;
      const balanceEth = Number(ethers.formatEther(ethBalance.value));
      const reserve = ethUsd ? 1 / ethUsd : FALLBACK_GAS_RESERVE_ETH;
      setAmount(Math.max(0, balanceEth - reserve).toFixed(6));
    } else {
      if (!printBalance) return;
      setAmount(Number(ethers.formatUnits(printBalance.value, printBalance.decimals)).toFixed(2));
    }
  }

  async function doSwap() {
    if (!walletClient || !address || !rate) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);
    setReceivedAmt(null);
    try {
      if (direction === "buy") {
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
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: received !== null ? fmt(received) : null });
      } else {
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
        // ETH isn't an ERC20 Transfer log — show the pre-swap estimate, clearly labeled, instead of an exact parsed amount.
        setReceivedAmt(ok ? expectedOut : null);
        setReceivedIsExact(false);
        updateTx(swapHash, { status: ok ? "ok" : "fail", toAmt: ok ? `~${fmt(expectedOut)}` : null });
      }
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
  let previewOut: number | null = null;
  if (rate) {
    if (direction === "buy") {
      const { swapWei } = splitFee(ethers.parseEther((amt || 0).toString() || "0"));
      previewOut = Number(ethers.formatEther(swapWei)) * rate * (1 - POOL_TAX_PCT / 100);
    } else {
      const { swapWei } = splitFee(ethers.parseUnits((amt || 0).toString() || "0", 18));
      previewOut = (Number(ethers.formatUnits(swapWei, 18)) / rate) * (1 - POOL_TAX_PCT / 100);
    }
  }
  const fromBalance =
    direction === "buy"
      ? ethBalance
        ? Number(ethers.formatEther(ethBalance.value))
        : null
      : printBalance
        ? Number(ethers.formatUnits(printBalance.value, printBalance.decimals))
        : null;

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
                Balance: {fmt(fromBalance)} {fromSym}
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
            <span className="swap-token-pill-wrap" onClick={flip}>
              <span className="swap-token-pill">
                {fromSym === "ETH" ? (
                  <span className="swap-token-pill-icon swap-eth-icon">
                    <EthIcon />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="swap-token-pill-icon" src="/logo.png" alt="" />
                )}
                {fromSym}
              </span>
              <span className="swap-token-tooltip">⚠️ Multi-Chain Relay Under Construction</span>
            </span>
          </div>
        </div>

        <button type="button" className="swap-divider" onClick={flip} aria-label="Flip direction">
          <FlipIcon />
        </button>

        <div className="swap-panel">
          <div className="swap-panel-head">
            <span>You receive (estimated)</span>
          </div>
          <div className="swap-panel-row">
            <span className="swap-amount-display">{previewOut !== null ? fmt(previewOut) : rateError ? "—" : "…"}</span>
            <span className="swap-token-pill-wrap" onClick={flip}>
              <span className="swap-token-pill">
                {toSym === "ETH" ? (
                  <span className="swap-token-pill-icon swap-eth-icon">
                    <EthIcon />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="swap-token-pill-icon" src="/logo.png" alt="" />
                )}
                {toSym}
              </span>
              <span className="swap-token-tooltip">⚠️ Multi-Chain Relay Under Construction</span>
            </span>
          </div>
          <p className="swap-tax-note">$PRINT includes 5% rewards fee</p>
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
            {swapping ? step || "Swapping…" : `Swap ${fromSym} for $${toSym === "PRINT" ? "PRINT" : toSym}`}
          </button>
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
                {fmt(receivedAmt)} {lastSwapped.sym === "ETH" ? "PRINT" : "ETH"}.
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
