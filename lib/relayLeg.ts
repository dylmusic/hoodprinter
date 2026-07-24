import { createClient, getQuote, execute, adaptViemWallet, convertViemChainToRelayChain, type Execute } from "@reservoir0x/relay-sdk";
import type { Chain, WalletClient } from "viem";
import { siteConfig, RELAY_FEE_RECIPIENT } from "@/site.config";

/**
 * Headless Relay SDK usage — same package (@reservoir0x/relay-sdk) that
 * powers the embedded SwapWidget (components/SwapEmbed.tsx), used directly
 * here instead of the widget UI because our own router needs to sequence a
 * Relay leg with our own $PRINT-pool leg (lib/printDirectSwap.ts) as one
 * combined swap, with custom 1/2-2/2 step UI — the widget has no hook for
 * that. Per docs.relay.link/references/sdk this is Relay's own recommended
 * "headless" integration path, not a hand-rolled REST client (that mistake
 * was already made and reverted once for the full-widget version — see
 * CLAUDE.md "Swap" section).
 */

const APP_FEE_BPS = "85";

// Real bug, not a hypothetical: createClient() with no `chains` failed a
// live CASHCAT->PRINT attempt with "Unable to find chain: Chain id 4663" —
// the SDK's baked-in chain defaults don't include Robinhood Chain, and
// getQuote/execute both need it registered locally (for RPC calls, gas
// estimation, etc.), not just reachable over Relay's own API. SwapEmbed.tsx
// hit the same class of issue for chain *labeling* and fixed it by passing
// an explicit chains array — same fix here, just for one chain instead of
// the full fetched list, since this router is same-chain only today.
const ROBINHOOD_VIEM_CHAIN: Chain = {
  id: siteConfig.chain.chainId,
  name: siteConfig.chain.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [siteConfig.chain.rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: siteConfig.chain.explorerUrl } },
};

let clientReady = false;
function ensureRelayClient() {
  if (clientReady) return;
  createClient({ source: "hoodprinter.xyz", chains: [convertViemChainToRelayChain(ROBINHOOD_VIEM_CHAIN)] });
  clientReady = true;
}

/**
 * Quote for a single Relay-routed leg (same-chain today; `chainId`/`toChainId`
 * are separate params so a future cross-chain leg is just different values,
 * not different code). `chargeFee` should be true ONLY when this leg is the
 * entire swap (neither side touches $PRINT) — when it's paired with a $PRINT
 * leg, our 0.85% is taken once on that leg instead (lib/printDirectSwap.ts
 * PAY_PORTION), so we don't double-charge across two legs of one swap.
 */
export async function getRelayLegQuote(params: {
  chainId: number;
  toChainId?: number;
  fromCurrency: string;
  toCurrency: string;
  amountWei: string;
  userAddress: string;
  chargeFee: boolean;
}): Promise<Execute> {
  ensureRelayClient();
  return getQuote({
    chainId: params.chainId,
    currency: params.fromCurrency,
    toChainId: params.toChainId ?? params.chainId,
    toCurrency: params.toCurrency,
    tradeType: "EXACT_INPUT",
    amount: params.amountWei,
    user: params.userAddress,
    recipient: params.userAddress,
    options: params.chargeFee
      ? { appFees: [{ recipient: RELAY_FEE_RECIPIENT.toLowerCase(), fee: APP_FEE_BPS }] }
      : undefined,
  });
}

/** Executes a previously-fetched quote, surfacing each of Relay's own internal steps via onProgress. */
export async function executeRelayLeg(
  quote: Execute,
  walletClient: WalletClient,
  onProgress?: (label: string) => void
) {
  ensureRelayClient();
  return execute({
    quote,
    wallet: adaptViemWallet(walletClient),
    onProgress: (data) => {
      const desc = data?.currentStep?.description || data?.currentStep?.action;
      if (desc) onProgress?.(desc);
    },
  });
}

/** Pulls the estimated output amount (base units, as a string) off a quote for chained-leg previews. */
export function quoteOutputAmount(quote: Execute): string | null {
  const details = (quote as any)?.details;
  return details?.currencyOut?.amount ?? null;
}

/** Pulls the last on-chain tx hash Relay actually sent for this quote, if the chain matches. */
export function quoteLastTxHash(quote: Execute, chainId: number): string | null {
  const steps = (quote as any)?.steps as Array<{ items?: Array<{ txHashes?: Array<{ txHash: string; chainId: number }> }> }> | undefined;
  for (let i = (steps?.length ?? 0) - 1; i >= 0; i--) {
    const items = steps![i].items ?? [];
    for (let j = items.length - 1; j >= 0; j--) {
      const hashes = items[j].txHashes ?? [];
      for (let k = hashes.length - 1; k >= 0; k--) {
        if (hashes[k].chainId === chainId) return hashes[k].txHash;
      }
    }
  }
  return null;
}
