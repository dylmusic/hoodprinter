"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { siteConfig, WALLETCONNECT_PROJECT_ID } from "@/site.config";
import {
  getRelayQuote,
  RelayError,
  RelayQuote,
  NATIVE_TOKEN,
  MIN_SLIPPAGE_PCT,
  DEFAULT_SLIPPAGE_PCT,
} from "@/lib/relay";

type WalletKind = "injected" | "walletconnect";

const CHAIN = {
  chainIdHex: "0x" + siteConfig.chain.chainId.toString(16),
  name: siteConfig.chain.name,
  rpc: siteConfig.chain.rpcUrl,
  explorer: siteConfig.chain.explorerUrl,
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const DEFAULT_TOKEN = {
  address: siteConfig.contractAddress,
  symbol: "PRINT",
  decimals: 18,
};

// A quote doesn't move funds, so it's fine to preview rates before a wallet
// is connected — Relay just needs *some* address to price against.
const QUOTE_PLACEHOLDER_ADDR = "0x000000000000000000000000000000000000dEaD";

type Direction = "buy" | "sell"; // buy = ETH -> token, sell = token -> ETH
type TokenInfo = { address: string; symbol: string; decimals: number };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number, max = 6) =>
  n === 0 ? "0" : n < 0.000001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: max });

export default function SwapWidget() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<WalletKind | null>(null);
  const [walletKind, setWalletKind] = useState<WalletKind | null>(null);
  const providerRef = useRef<any>(null); // active EIP-1193 provider (injected or WalletConnect)

  const [direction, setDirection] = useState<Direction>("buy");
  const [tokenInput, setTokenInput] = useState<string>(DEFAULT_TOKEN.address);
  const [token, setToken] = useState<TokenInfo>(DEFAULT_TOKEN);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT);

  const [quote, setQuote] = useState<RelayQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [ethBalance, setEthBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  const [swapping, setSwapping] = useState(false);
  const [swapStepLabel, setSwapStepLabel] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const readProvider = useRef<ethers.JsonRpcProvider | null>(null);
  if (!readProvider.current) readProvider.current = new ethers.JsonRpcProvider(CHAIN.rpc);

  const fromIsNative = direction === "buy";
  const fromSymbol = fromIsNative ? "ETH" : token.symbol;
  const toSymbol = fromIsNative ? token.symbol : "ETH";
  const fromDecimals = fromIsNative ? 18 : token.decimals;
  const fromTokenAddr = fromIsNative ? NATIVE_TOKEN : token.address;
  const toTokenAddr = fromIsNative ? token.address : NATIVE_TOKEN;

  // ---- resolve pasted token contract (symbol/decimals) ----
  useEffect(() => {
    if (!ethers.isAddress(tokenInput)) {
      setTokenError(tokenInput ? "Not a valid address" : null);
      return;
    }
    let cancelled = false;
    setTokenLoading(true);
    setTokenError(null);
    const t = setTimeout(async () => {
      try {
        const erc = new ethers.Contract(tokenInput, ERC20_ABI, readProvider.current!);
        const [symbol, decimals] = await Promise.all([erc.symbol(), erc.decimals()]);
        if (cancelled) return;
        setToken({ address: ethers.getAddress(tokenInput), symbol, decimals: Number(decimals) });
      } catch {
        if (!cancelled) setTokenError("Couldn't read that contract — check the address and chain.");
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tokenInput]);

  // ---- quote (debounced, cancellable) ----
  useEffect(() => {
    setActionError(null);
    setTxHash(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || tokenError || tokenLoading) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const controller = new AbortController();
    setQuoting(true);
    setQuoteError(null);
    const t = setTimeout(async () => {
      try {
        const fromAmount = ethers.parseUnits(amount, fromDecimals).toString();
        const q = await getRelayQuote({
          fromToken: fromTokenAddr,
          toToken: toTokenAddr,
          fromAmount,
          fromAddress: address || QUOTE_PLACEHOLDER_ADDR,
          slippagePct: slippage,
          signal: controller.signal,
        });
        setQuote(q);
      } catch (e) {
        if (controller.signal.aborted) return;
        setQuote(null);
        setQuoteError(e instanceof RelayError ? e.message : "Couldn't fetch a quote. Try again.");
      } finally {
        if (!controller.signal.aborted) setQuoting(false);
      }
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromTokenAddr, toTokenAddr, fromDecimals, slippage, address, tokenError, tokenLoading]);

  // ---- balances ----
  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [eth, erc] = await Promise.all([
        readProvider.current!.getBalance(address),
        new ethers.Contract(token.address, ERC20_ABI, readProvider.current!).balanceOf(address),
      ]);
      setEthBalance(Number(ethers.formatUnits(eth, 18)));
      setTokenBalance(Number(ethers.formatUnits(erc, token.decimals)));
    } catch {
      /* balances are decorative */
    }
  }, [address, token]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  // ---- wallet: injected (MetaMask / browser extension) ----
  async function addOrSwitchNetwork(eth: any) {
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
  }

  async function connectInjected() {
    const eth = (window as any).ethereum;
    if (!eth) {
      setActionError("No browser wallet found — install MetaMask, or use WalletConnect instead.");
      return;
    }
    setConnecting("injected");
    setActionError(null);
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      await addOrSwitchNetwork(eth);
      providerRef.current = eth;
      setWalletKind("injected");
      setAddress(accounts[0]);
    } catch (e: any) {
      setActionError(e?.message || "Could not connect wallet.");
    } finally {
      setConnecting(null);
    }
  }

  // injected-wallet events only matter while it's the active connection
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth?.on || walletKind !== "injected") return;
    const onAccounts = (accs: string[]) => setAddress(accs[0] || null);
    const onChain = () => window.location.reload();
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [walletKind]);

  // ---- wallet: WalletConnect (mobile wallets, Coinbase Wallet, Rainbow, etc.) ----
  async function connectWalletConnect() {
    if (!WALLETCONNECT_PROJECT_ID) {
      setActionError(
        "WalletConnect isn't set up yet on this site (missing Project ID) — use a browser wallet like MetaMask instead."
      );
      return;
    }
    setConnecting("walletconnect");
    setActionError(null);
    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const wc = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [siteConfig.chain.chainId],
        rpcMap: { [siteConfig.chain.chainId]: CHAIN.rpc },
        showQrModal: true,
        metadata: {
          name: "HOODPrinter Swap",
          description: `Swap ETH for ${siteConfig.symbol} on ${CHAIN.name}`,
          url: siteConfig.url,
          icons: [`${siteConfig.url}/logo.png`],
        },
      });
      await wc.connect();
      providerRef.current = wc;
      setWalletKind("walletconnect");
      setAddress((wc.accounts as string[])[0] || null);
      wc.on("accountsChanged", (accs: string[]) => setAddress(accs[0] || null));
      wc.on("disconnect", () => {
        providerRef.current = null;
        setWalletKind(null);
        setAddress(null);
      });
    } catch (e: any) {
      setActionError(e?.message || "Could not connect via WalletConnect.");
    } finally {
      setConnecting(null);
    }
  }

  function disconnect() {
    if (walletKind === "walletconnect") providerRef.current?.disconnect?.();
    providerRef.current = null;
    setWalletKind(null);
    setAddress(null);
    setQuote(null);
    setTxHash(null);
  }

  // Relay's quote already includes an "approve" step ahead of "swap" when the
  // connected wallet's on-chain allowance is insufficient — no separate
  // allowance check needed, just sign whatever steps came back, in order.
  async function doSwap() {
    if (!quote || !address) return;
    setSwapping(true);
    setActionError(null);
    setTxHash(null);
    try {
      const provider = new ethers.BrowserProvider(providerRef.current);
      const signer = await provider.getSigner();
      let lastHash = "";
      for (const step of quote.steps) {
        const item = step.items[0];
        if (!item) continue;
        setSwapStepLabel(step.description);
        const tx = await signer.sendTransaction({
          to: item.data.to,
          data: item.data.data,
          value: item.data.value,
        });
        lastHash = tx.hash;
        await tx.wait();
      }
      setTxHash(lastHash);
      refreshBalances();
    } catch (e: any) {
      setActionError(e?.shortMessage || e?.reason || e?.message || "Swap failed.");
    } finally {
      setSwapping(false);
      setSwapStepLabel(null);
    }
  }

  function flip() {
    setDirection((d) => (d === "buy" ? "sell" : "buy"));
    setQuote(null);
    setTxHash(null);
    setActionError(null);
  }

  const toAmountDisplay = quote && !quoting ? fmt(Number(quote.details.currencyOut.amountFormatted)) : "";
  const minReceivedDisplay =
    quote && !quoting
      ? `${fmt(
          Number(ethers.formatUnits(quote.details.currencyOut.minimumAmount, quote.details.currencyOut.currency.decimals))
        )} ${toSymbol}`
      : "—";
  const gasDisplay = quote?.fees.gas ? `~${fmt(Number(quote.fees.gas.amountFormatted), 5)} ETH` : "—";
  const feeDisplay = quote?.fees.app ? `${fmt(Number(quote.fees.app.amountFormatted), 5)} ${fromSymbol}` : "—";
  const priceImpact = quote?.details.totalImpact?.percent;
  const fromBalance = fromIsNative ? ethBalance : tokenBalance;

  return (
    <div className="swap-card">
      <span className="swap-corner swap-corner-tl" />
      <span className="swap-corner swap-corner-br" />

      <div className="swap-panel">
        <div className="swap-panel-head">
          <span>You pay</span>
          {address && fromBalance !== null && (
            <button type="button" className="swap-balance" onClick={() => setAmount(String(fromBalance))}>
              Balance: {fmt(fromBalance)} {fromSymbol}
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
          <span className="swap-token-pill">{fromSymbol}</span>
        </div>
      </div>

      <button type="button" className="swap-flip" onClick={flip} aria-label="Flip direction">
        ⇅
      </button>

      <div className="swap-panel">
        <div className="swap-panel-head">
          <span>You receive</span>
          {address && (
            <span className="swap-balance swap-balance-static">
              Balance: {fmt((fromIsNative ? tokenBalance : ethBalance) ?? 0)} {toSymbol}
            </span>
          )}
        </div>
        <div className="swap-panel-row">
          <span className="swap-amount-display">{quoting ? "…" : toAmountDisplay || "0.0"}</span>
          <span className="swap-token-pill">{toSymbol}</span>
        </div>
      </div>

      <div className="swap-token-field">
        <label htmlFor="swap-token-ca">
          {fromIsNative ? "Token to buy" : "Token to sell"} — defaults to $PRINT
        </label>
        <input
          id="swap-token-ca"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value.trim())}
          spellCheck={false}
        />
        {tokenLoading && <span className="swap-token-status">Reading contract…</span>}
        {tokenError && <span className="swap-token-status swap-token-status-err">{tokenError}</span>}
        {!tokenLoading && !tokenError && (
          <span className="swap-token-status">
            {token.symbol} · {short(token.address)}
          </span>
        )}
      </div>

      {quote && !quoteError && (
        <div className="swap-details">
          <div className="swap-detail-row">
            <span>Minimum received</span>
            <strong>{minReceivedDisplay}</strong>
          </div>
          <div className="swap-detail-row">
            <span>Network fee</span>
            <strong>{gasDisplay}</strong>
          </div>
          <div className="swap-detail-row">
            <span>HOODPrinter fee (0.85%)</span>
            <strong>{feeDisplay}</strong>
          </div>
          {priceImpact && (
            <div className="swap-detail-row">
              <span>Price impact</span>
              <strong>{Number(priceImpact).toFixed(2)}%</strong>
            </div>
          )}
          <div className="swap-detail-row">
            <span>Route</span>
            <strong>Relay</strong>
          </div>
        </div>
      )}

      <div className="swap-slippage">
        <span>Slippage</span>
        <div className="swap-slippage-opts">
          {[MIN_SLIPPAGE_PCT, 10, 15].map((p) => (
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
      </div>
      <p className="swap-slippage-note">{MIN_SLIPPAGE_PCT}% minimum — covers $PRINT&rsquo;s trade tax.</p>

      {quoteError && <div className="pb-warn">{quoteError}</div>}
      {actionError && <div className="pb-warn">{actionError}</div>}

      {!address ? (
        <div className="swap-connect-row">
          <button
            type="button"
            className="btn btn-primary swap-cta"
            onClick={connectInjected}
            disabled={connecting !== null}
          >
            {connecting === "injected" ? "Connecting…" : "Browser Wallet"}
          </button>
          <button
            type="button"
            className="btn btn-ghost swap-cta"
            onClick={connectWalletConnect}
            disabled={connecting !== null}
            title={WALLETCONNECT_PROJECT_ID ? undefined : "Needs a WalletConnect Project ID — see site.config.ts"}
          >
            {connecting === "walletconnect" ? "Connecting…" : "WalletConnect"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary swap-cta"
          onClick={doSwap}
          disabled={swapping || quoting || !quote}
        >
          {swapping ? swapStepLabel || "Confirm in wallet…" : `Swap ${fromSymbol} for ${toSymbol}`}
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
          Connected via {walletKind === "walletconnect" ? "WalletConnect" : "browser wallet"}: {short(address)} ·{" "}
          <button type="button" className="swap-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        </p>
      )}
    </div>
  );
}
