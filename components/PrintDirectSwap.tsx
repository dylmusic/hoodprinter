"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, useAccount, useDisconnect, useWalletClient } from "wagmi";
import { getDefaultConfig, RainbowKitProvider, darkTheme, useConnectModal } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import type { Chain } from "viem";
import { siteConfig, WALLETCONNECT_PROJECT_ID } from "@/site.config";
import {
  buildDirectSwapTx,
  fetchPrintEthRate,
  splitFee,
  DEFAULT_SLIPPAGE_PCT,
  SLIPPAGE_OPTIONS,
} from "@/lib/printDirectSwap";

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

// Deliberately basic: ETH -> $PRINT only, direct against the known-correct
// pool (see lib/printDirectSwap.ts). No token/chain picker, no cross-chain —
// this exists only until Relay's routing for $PRINT is fixed.
function InnerDirectSwap() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();

  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT);
  const [rate, setRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPrintEthRate(controller.signal)
      .then(setRate)
      .catch(() => setRateError("Couldn't load a live price — try again shortly."));
    return () => controller.abort();
  }, []);

  async function doSwap() {
    if (!walletClient || !address || !rate) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);
    try {
      const totalWei = ethers.parseEther(amount);
      const { swapWei } = splitFee(totalWei);

      const expectedOut = Number(ethers.formatEther(swapWei)) * rate;
      const minOut = expectedOut * (1 - slippage / 100);
      const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);

      setStep("Confirm in wallet…");
      const { to, data, value } = buildDirectSwapTx(totalWei, minAmountOutWei);
      const swapHash = await walletClient.sendTransaction({ to: to as `0x${string}`, data: data as `0x${string}`, value });
      setTxHash(swapHash);
      setStep("Confirming on-chain…");
      await readProvider.waitForTransaction(swapHash);
      setStep(null);
    } catch (e: any) {
      setError(e?.shortMessage || e?.reason || e?.message || "Swap failed.");
      setStep(null);
    } finally {
      setSwapping(false);
    }
  }

  const amt = parseFloat(amount) || 0;
  const { swapWei: previewSwapWei } = splitFee(ethers.parseEther((amt || 0).toString() || "0"));
  const previewOut = rate ? Number(ethers.formatEther(previewSwapWei)) * rate : null;

  return (
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
            <span className="swap-token-tooltip">Multi-Chain Relay Under Construction</span>
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
            <span className="swap-token-tooltip">Multi-Chain Relay Under Construction</span>
          </span>
        </div>
      </div>

      {rate && (
        <div className="swap-summary">
          <div className="swap-summary-row">
            <span>Rate</span>
            <strong>1 ETH ≈ {fmt(rate, 0)} PRINT</strong>
          </div>
        </div>
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
