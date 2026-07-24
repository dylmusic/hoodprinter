"use client";

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { adaptViemWallet } from "@reservoir0x/relay-sdk";
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
    selector: { background: "#142219", hover: { background: "#1a2c20" } },
  },
  modal: { background: "#101b14", border: "1px solid #1d2b22", borderRadius: "16px" },
};

function InnerSwap() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fromToken, setFromToken] = useState<Token | undefined>(ETH_TOKEN);
  const [toToken, setToToken] = useState<Token | undefined>(PRINT_TOKEN);

  useEffect(() => {
    if (isConnected) setPickerOpen(false);
  }, [isConnected]);

  const injectedConnector = connectors.find((c) => c.id === "injected" || c.type === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");

  return (
    <>
      {pickerOpen && (
        <div className="swap-connect-row">
          <button
            type="button"
            className="btn btn-primary swap-cta"
            onClick={() => injectedConnector && connect({ connector: injectedConnector })}
          >
            Browser Wallet
          </button>
          <button
            type="button"
            className="btn btn-ghost swap-cta"
            onClick={() => wcConnector && connect({ connector: wcConnector })}
            disabled={!wcConnector}
            title={wcConnector ? undefined : "Needs a WalletConnect Project ID — see site.config.ts"}
          >
            WalletConnect
          </button>
        </div>
      )}
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
        onConnectWallet={() => setPickerOpen(true)}
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
    const connectors = [injected()];
    if (WALLETCONNECT_PROJECT_ID) {
      connectors.push(walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true }) as any);
    }
    return createConfig({
      chains: chains as [Chain, ...Chain[]],
      connectors,
      transports: Object.fromEntries(chains.map((c) => [c.id, http()])),
    });
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
          }}
          theme={relayTheme}
        >
          <WagmiProvider config={wagmiConfig}>
            <InnerSwap />
          </WagmiProvider>
        </RelayKitProvider>
      </QueryClientProvider>
    </div>
  );
}
