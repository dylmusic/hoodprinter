import type { Chain } from "viem";

type RelayApiChain = {
  id: number;
  name: string;
  displayName?: string;
  httpRpcUrl: string;
  explorerUrl?: string;
  explorerName?: string;
  disabled?: boolean;
  vmType?: string;
  currency: { symbol: string; name: string; decimals: number };
};

/**
 * Wagmi needs real viem Chain definitions for every network a connected
 * wallet might need to sign on — Relay itself doesn't need this (its own
 * /quote endpoint defaults to "all supported chains" with no config from
 * us), but wagmi's chain list is what actually lets the wallet switch to
 * whatever origin chain the user picks in the embedded widget. Building
 * this from Relay's own /chains endpoint means new chains Relay adds show
 * up here automatically instead of us hand-maintaining a list.
 */
export async function fetchRelayEvmChains(): Promise<Chain[]> {
  const res = await fetch("https://api.relay.link/chains");
  const json = await res.json();
  const chains: RelayApiChain[] = json?.chains || [];
  return chains
    .filter((c) => c.vmType === "evm" && !c.disabled && c.httpRpcUrl)
    .map((c) => ({
      id: c.id,
      name: c.displayName || c.name,
      nativeCurrency: {
        name: c.currency.name,
        symbol: c.currency.symbol,
        decimals: c.currency.decimals,
      },
      rpcUrls: { default: { http: [c.httpRpcUrl] } },
      blockExplorers: c.explorerUrl
        ? { default: { name: c.explorerName || "Explorer", url: c.explorerUrl } }
        : undefined,
    }));
}
