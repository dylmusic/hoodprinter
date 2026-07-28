import {
  createClient,
  getQuote,
  execute,
  adaptViemWallet,
  convertViemChainToRelayChain,
  type Execute,
  type AdaptedWallet,
} from "@reservoir0x/relay-sdk";
import { adaptSolanaWallet } from "@reservoir0x/relay-svm-wallet-adapter";
import { Connection, type VersionedTransaction, type SendOptions } from "@solana/web3.js";
import type { Chain, WalletClient } from "viem";
import { base, mainnet } from "viem/chains";
import { siteConfig, RELAY_FEE_RECIPIENT } from "@/site.config";
import { SOLANA_CHAIN_ID } from "@/lib/robinhoodTokens";

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
// estimation, etc.), not just reachable over Relay's own API.
const ROBINHOOD_VIEM_CHAIN: Chain = {
  id: siteConfig.chain.chainId,
  name: siteConfig.chain.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [siteConfig.chain.rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: siteConfig.chain.explorerUrl } },
};

const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

// Cross-chain (Base/Solana/Ethereum mainnet), added 2026-07-28 — Base and
// Ethereum mainnet come from viem's own built-in chain list (no need to
// hand-roll metadata the way Robinhood Chain needed above); Solana isn't a
// viem `Chain` at all, so its entry is fetched live from Relay's own
// `/chains` API instead of hand-authored, same approach proven in the
// dylmusic project's own cross-chain Relay integration (SVM chain shapes
// come from `RelayChain`, not `viem/Chain` — Relay's API is the only
// correct source for that shape).
let clientReadyPromise: Promise<void> | null = null;
function ensureRelayClient(): Promise<void> {
  if (!clientReadyPromise) {
    clientReadyPromise = (async () => {
      let solanaChain: Awaited<ReturnType<typeof fetchSolanaChain>> = undefined;
      try {
        solanaChain = await fetchSolanaChain();
      } catch {
        // fall through — createClient still works for the EVM chains below
      }
      createClient({
        source: "hoodprinter.xyz",
        chains: [
          convertViemChainToRelayChain(ROBINHOOD_VIEM_CHAIN),
          convertViemChainToRelayChain(base),
          convertViemChainToRelayChain(mainnet),
          ...(solanaChain ? [solanaChain] : []),
        ],
      });
    })();
  }
  return clientReadyPromise;
}

async function fetchSolanaChain() {
  const res = await fetch("https://api.relay.link/chains");
  const data = await res.json();
  return (data?.chains as Array<{ id: number }> | undefined)?.find((c) => c.id === SOLANA_CHAIN_ID) as any;
}

/**
 * Quote for a single Relay-routed leg. `chainId`/`toChainId` are separate
 * params specifically so a cross-chain leg (any origin chain -> native ETH
 * on Robinhood Chain, or a pure cross-chain non-$PRINT swap) is just
 * different values through the same code path, not different code.
 * `chargeFee` should be true ONLY when this leg is the entire swap (neither
 * side touches $PRINT) — when it's paired with a $PRINT leg, our 0.85% is
 * taken once on that leg instead (lib/printDirectSwap.ts PAY_PORTION), so
 * we don't double-charge across two legs of one swap.
 */
export async function getRelayLegQuote(params: {
  chainId: number;
  toChainId?: number;
  fromCurrency: string;
  toCurrency: string;
  amountWei: string;
  userAddress: string;
  recipientAddress?: string; // cross-chain: destination-chain address, if it differs from userAddress (e.g. EVM origin -> Solana destination)
  chargeFee: boolean;
}): Promise<Execute> {
  await ensureRelayClient();
  return getQuote({
    chainId: params.chainId,
    currency: params.fromCurrency,
    toChainId: params.toChainId ?? params.chainId,
    toCurrency: params.toCurrency,
    tradeType: "EXACT_INPUT",
    amount: params.amountWei,
    user: params.userAddress,
    recipient: params.recipientAddress ?? params.userAddress,
    options: params.chargeFee
      ? { appFees: [{ recipient: RELAY_FEE_RECIPIENT.toLowerCase(), fee: APP_FEE_BPS }] }
      : undefined,
  });
}

/** Adapts a connected EVM wallet client for Relay's `execute()`. */
export function adaptEvmWallet(walletClient: WalletClient): AdaptedWallet {
  return adaptViemWallet(walletClient);
}

// Phantom's own signAndSendTransaction (see lib/solanaWallet.ts) matches
// the shape adaptSolanaWallet expects exactly — one prompt, sign + broadcast
// together. Same wrapper proven live in the dylmusic project.
export function adaptPrintSolanaWallet(
  address: string,
  signAndSendTransaction: (transaction: VersionedTransaction, options?: SendOptions) => Promise<{ signature: string }>
): AdaptedWallet {
  const connection = new Connection(SOLANA_RPC_URL);
  return adaptSolanaWallet(address, SOLANA_CHAIN_ID, connection, signAndSendTransaction);
}

/** Executes a previously-fetched quote against an already-adapted wallet (EVM or Solana), surfacing Relay's own internal steps via onProgress. */
export async function executeRelayLeg(quote: Execute, wallet: AdaptedWallet, onProgress?: (label: string) => void) {
  await ensureRelayClient();
  return execute({
    quote,
    wallet,
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
