"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { siteConfig } from "@/site.config";
import { buildDirectSwapTx, fetchPrintEthRate, splitFee, FEE_RECIPIENT, MIN_SLIPPAGE_PCT } from "@/lib/printDirectSwap";

const CHAIN = {
  chainIdHex: "0x" + siteConfig.chain.chainId.toString(16),
  name: siteConfig.chain.name,
  rpc: siteConfig.chain.rpcUrl,
  explorer: siteConfig.chain.explorerUrl,
};

const fmt = (n: number, max = 6) =>
  n === 0 ? "0" : n < 0.000001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: max });

// Deliberately basic: ETH -> $PRINT only, direct against the known-correct
// pool (see lib/printDirectSwap.ts). No token/chain picker, no cross-chain —
// this exists only until Relay's routing for $PRINT is fixed.
export default function PrintDirectSwap() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [amount, setAmount] = useState("0.01");
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

  async function connect() {
    const eth = (window as any).ethereum;
    if (!eth) {
      setError("No browser wallet found — install MetaMask.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.chainIdHex }] });
      } catch (e: any) {
        if (e.code === 4902 || /Unrecognized chain/i.test(e.message || "")) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN.chainIdHex,
                chainName: CHAIN.name,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [CHAIN.rpc],
                blockExplorerUrls: [CHAIN.explorer],
              },
            ],
          });
        } else {
          throw e;
        }
      }
      setAddress(accounts[0]);
    } catch (e: any) {
      setError(e?.message || "Could not connect wallet.");
    } finally {
      setConnecting(false);
    }
  }

  async function doSwap() {
    const eth = (window as any).ethereum;
    if (!eth || !address || !rate) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSwapping(true);
    setError(null);
    setTxHash(null);
    try {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const totalWei = ethers.parseEther(amount);
      const { feeWei, swapWei } = splitFee(totalWei);

      setStep("Sending platform fee (0.85%)…");
      const feeTx = await signer.sendTransaction({ to: FEE_RECIPIENT, value: feeWei });
      await feeTx.wait();

      const expectedOut = Number(ethers.formatEther(swapWei)) * rate;
      const minOut = expectedOut * (1 - MIN_SLIPPAGE_PCT / 100);
      const minAmountOutWei = ethers.parseUnits(minOut.toFixed(18), 18);

      setStep("Confirm the swap…");
      const { to, data, value } = buildDirectSwapTx(swapWei, minAmountOutWei);
      const swapTx = await signer.sendTransaction({ to, data, value });
      setTxHash(swapTx.hash);
      setStep("Confirming on-chain…");
      await swapTx.wait();
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
          <span className="swap-token-pill">ETH</span>
        </div>
      </div>

      <div className="swap-panel" style={{ marginTop: 10 }}>
        <div className="swap-panel-head">
          <span>You receive (estimated)</span>
        </div>
        <div className="swap-panel-row">
          <span className="swap-amount-display">{previewOut !== null ? fmt(previewOut) : rateError ? "—" : "…"}</span>
          <span className="swap-token-pill">PRINT</span>
        </div>
      </div>

      {rateError && <div className="pb-warn">{rateError}</div>}
      {error && <div className="pb-warn">{error}</div>}

      {!address ? (
        <button type="button" className="btn btn-primary swap-cta" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect Wallet"}
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
        <p className="swap-address">Connected: {address.slice(0, 6)}…{address.slice(-4)}</p>
      )}

      <p className="swap-powered-by">Routes directly through Robinhood Chain&rsquo;s $PRINT pool.</p>
    </div>
  );
}
