"use client";

import { useEffect, useMemo, useState } from "react";
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
// Surfaced first in the widget's origin-chain picker — Robinhood Chain
// itself plus the handful of chains most people actually hold ETH/stables on.
const POPULAR_CHAIN_IDS = [4663, 1, 8453, 42161, 10];
// Relay's own token/chain search defaults to ALL 85+ chains it supports,
// which buries Robinhood Chain (brand new, low volume) under generic
// global-trending tokens with no relevance to buying $PRINT. Scoping
// RelayKitProvider to this curated set of majors + Robinhood Chain keeps
// the picker relevant without losing real cross-chain breadth — wagmi's
// own chain list (for actual wallet signing) stays the full fetched set.
const CURATED_CHAIN_IDS = [4663, 1, 8453, 42161, 10, 137, 56, 43114, 324, 59144, 534352, 81457, 34443, 5000, 7777777];

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

  return (
    <>
      <SwapWidget
        supportedWalletVMs={["evm"]}
        wallet={walletClient ? adaptViemWallet(walletClient) : undefined}
        fromToken={fromToken}
        setFromToken={setFromToken}
        toToken={toToken}
        setToToken={setToToken}
        defaultAmount="0.01"
        defaultTradeType="EXACT_INPUT"
        lockToToken={true}
        popularChainIds={POPULAR_CHAIN_IDS}
        onConnectWallet={() => openConnectModal?.()}
      />
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
      // only its WalletConnect-based wallet options need this.
      projectId: WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
      chains: chains as [Chain, ...Chain[]],
      transports: Object.fromEntries(chains.map((c) => [c.id, http()])),
    });
  }, [chains]);

  const relayChains = useMemo(() => {
    if (!chains) return undefined;
    return chains
      .filter((c) => CURATED_CHAIN_IDS.includes(c.id))
      .map((c) => convertViemChainToRelayChain(c));
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
