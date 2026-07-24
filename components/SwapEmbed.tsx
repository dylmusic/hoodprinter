"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, useAccount, useDisconnect, useWalletClient } from "wagmi";
import { getDefaultConfig, RainbowKitProvider, darkTheme, useConnectModal } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { adaptViemWallet, convertViemChainToRelayChain } from "@reservoir0x/relay-sdk";
import { RelayKitProvider, SwapWidget, type Token } from "@reservoir0x/relay-kit-ui";
import "@reservoir0x/relay-kit-ui/styles.css";
import type { Chain } from "viem";
import { siteConfig, WALLETCONNECT_PROJECT_ID, RELAY_FEE_RECIPIENT } from "@/site.config";
import { fetchRelayEvmChains } from "@/lib/relayChains";

const RELAY_CHAIN_ID = 4663;
const APP_FEE_BPS = "85";
// Surfaced first in the widget's origin/destination chain pickers —
// Robinhood Chain itself plus the handful of chains most people actually
// hold ETH/stables on. This is just an ordering hint; every chain Relay
// supports is still fully selectable (see relayChains below).
const POPULAR_CHAIN_IDS = [4663, 1, 8453, 42161, 10];

const ETH_TOKEN: Token = {
  chainId: RELAY_CHAIN_ID,
  address: "0x0000000000000000000000000000000000000000",
  name: "Ethereum",
  symbol: "ETH",
  decimals: 18,
  logoURI: "https://assets.relay.link/icons/1/light.png",
};

const PRINT_TOKEN: Token = {
  chainId: RELAY_CHAIN_ID,
  address: siteConfig.contractAddress,
  name: "HOOD Printer",
  symbol: "PRINT",
  decimals: 18,
  logoURI: `${siteConfig.url}/logo.png`,
};

const relayTheme = {
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  primaryColor: "#00c805",
  focusColor: "#00c805",
  subtleBackgroundColor: "#101b14",
  subtleBorderColor: "#1d2b22",
  text: {
    default: "#e8f2ea",
    subtle: "#8fa898",
    error: "#ff6b6b",
    success: "#00c805",
  },
  buttons: {
    primary: {
      color: "#04140a",
      background: "#00c805",
      hover: { color: "#04140a", background: "#17d81c" },
    },
    secondary: {
      color: "#e8f2ea",
      background: "#101b14",
      hover: { background: "#142219" },
    },
  },
  input: { background: "#0c120e", borderRadius: "10px", color: "#e8f2ea" },
  anchor: { color: "#00c805", hover: { color: "#17d81c" } },
  dropdown: { background: "#101b14", borderRadius: "12px", border: "1px solid #1d2b22" },
  widget: {
    background: "#101b14",
    borderRadius: "16px",
    border: "1px solid #1d2b22",
    card: { background: "#0c120e", borderRadius: "16px", border: "1px solid #1d2b22" },
    selector: {
      background: "rgba(0, 200, 5, 0.12)",
      hover: { background: "rgba(0, 200, 5, 0.2)" },
    },
    swapCurrencyButtonBorderColor: "#00c805",
    swapCurrencyButtonBorderWidth: "1px",
    swapCurrencyButtonBorderRadius: "999px",
  },
  modal: { background: "#101b14", border: "1px solid #1d2b22", borderRadius: "16px" },
};

// The widget occasionally throws a render error right after a successful
// swap (its own post-swap state reset, not something we control) — without
// this, that crash bubbles up to Next.js's page-level error boundary and
// blanks the ENTIRE page, right after the user's swap already went through.
// This contains the blast radius to just the widget and offers a one-click
// remount instead of a dead page.
class SwapErrorBoundary extends Component<{ onReset: () => void; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Swap widget error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="swap-crash-recover">
          <p>Your swap likely went through — this is just a display glitch after it finished.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
          >
            Reload swap widget
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// RainbowKit owns the actual wallet-connection UX (its own multi-wallet
// modal, WalletConnect QR flow, account/disconnect menu) — this is the
// pairing Relay's own docs use for SwapWidget. We only supply the
// `wallet`/`onConnectWallet` bridge; no hand-rolled connect UI of our own.
function InnerSwap() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const [fromToken, setFromToken] = useState<Token | undefined>(ETH_TOKEN);
  const [toToken, setToToken] = useState<Token | undefined>(PRINT_TOKEN);
  const [swapKey, setSwapKey] = useState(0);

  return (
    <>
      <SwapErrorBoundary onReset={() => setSwapKey((k) => k + 1)}>
        <SwapWidget
          key={swapKey}
          supportedWalletVMs={["evm"]}
          wallet={walletClient ? adaptViemWallet(walletClient) : undefined}
          fromToken={fromToken}
          setFromToken={setFromToken}
          toToken={toToken}
          setToToken={setToToken}
          defaultAmount="0.01"
          defaultTradeType="EXACT_INPUT"
          popularChainIds={POPULAR_CHAIN_IDS}
          onConnectWallet={() => openConnectModal?.()}
        />
      </SwapErrorBoundary>
      {isConnected && (
        <p className="swap-address">
          <button type="button" className="swap-disconnect" onClick={() => disconnect()}>
            Disconnect wallet
          </button>
        </p>
      )}
    </>
  );
}

const rainbowTheme = darkTheme({
  accentColor: "#00c805",
  accentColorForeground: "#04140a",
  borderRadius: "medium",
});

export default function SwapEmbed() {
  const [chains, setChains] = useState<Chain[] | null>(null);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    let cancelled = false;
    fetchRelayEvmChains()
      .then((c) => !cancelled && setChains(c))
      .catch(() => !cancelled && setChains([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const wagmiConfig = useMemo(() => {
    if (!chains || chains.length === 0) return null;
    return getDefaultConfig({
      appName: "HOODPrinter",
      appUrl: siteConfig.url,
      appIcon: `${siteConfig.url}/logo.png`,
      // Empty until a real WalletConnect Cloud project ID is set (site.config.ts)
      // — RainbowKit's injected/browser-wallet options still work either way,
      // only its WalletConnect-based wallet options need this. A genuinely
      // empty string crashes getDefaultConfig outright (tested); a
      // placeholder avoids that at the cost of a harmless 403 against
      // Reown's remote-config endpoint (it falls back to local defaults).
      projectId: WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
      chains: chains as [Chain, ...Chain[]],
      transports: Object.fromEntries(chains.map((c) => [c.id, http()])),
    });
  }, [chains]);

  // Full breadth on purpose — this is a general any-token/any-chain swap
  // page (defaulting to ETH -> $PRINT on Robinhood Chain, not locked to
  // it), so RelayKitProvider gets every EVM chain Relay supports, built
  // from the same live fetch wagmi's config uses. Chain 4663 was included
  // in earlier chain-restriction testing that fixed Robinhood Chain
  // labeling — since it's still in this full list, the labeling stays
  // correct, we've just stopped excluding everything else.
  const relayChains = useMemo(() => {
    if (!chains) return undefined;
    return chains.map((c) => convertViemChainToRelayChain(c));
  }, [chains]);

  if (!wagmiConfig) {
    return <div className="swap-card swap-loading">Loading Relay…</div>;
  }

  return (
    <div className="swap-card">
      <QueryClientProvider client={queryClient}>
        <RelayKitProvider
          options={{
            source: "hoodprinter.xyz",
            appFees: [{ recipient: RELAY_FEE_RECIPIENT.toLowerCase(), fee: APP_FEE_BPS }],
            appName: "HOODPrinter",
            themeScheme: "dark",
            chains: relayChains,
          }}
          theme={relayTheme}
        >
          <WagmiProvider config={wagmiConfig}>
            <RainbowKitProvider theme={rainbowTheme}>
              <InnerSwap />
            </RainbowKitProvider>
          </WagmiProvider>
        </RelayKitProvider>
      </QueryClientProvider>
    </div>
  );
}
