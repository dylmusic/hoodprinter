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

// Solana Foundation's own public RPC (api.mainnet-beta.solana.com) is NOT
// meant for production traffic — it aggressively rate-limits/blocks by
// source IP, and a real live attempt hit this immediately ("failed to get
// recent blockhash... 403 Access forbidden") even though it answered fine
// from this server's own IP in isolated testing, confirming it's an IP-
// based block, not a code bug. Allnodes' public multi-tenant endpoint is
// more production-tolerant and needs no API key, but is still a shared
// public RPC — if this 403s again under real load, the real fix is a
// dedicated provider (Helius/QuickNode/Triton, free tiers exist) with an
// API key, same category of fix as WALLETCONNECT_PROJECT_ID above.
const SOLANA_RPC_URL = "https://solana-rpc.publicnode.com";

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
  // "confirmed" (not the default "finalized") — a real live attempt
  // expired ("TransactionExpiredBlockheightExceededError") before landing,
  // and Solana blockhashes are only valid ~60-90s; "confirmed" shaves a
  // meaningful chunk off the round-trip vs waiting for full finality on
  // every read this Connection makes.
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  return adaptSolanaWallet(address, SOLANA_CHAIN_ID, connection, signAndSendTransaction);
}

export type RelayLegProgress = { label: string; part: number; total: number };

/**
 * Executes a previously-fetched quote against an already-adapted wallet
 * (EVM or Solana), surfacing Relay's own internal steps via onProgress.
 * Relay silently splits some quotes into multiple steps we don't control
 * (e.g. an ERC20 origin needing an approve step before its swap step —
 * real live bug: a Base cbBTC->ETH swap needed exactly this and the old
 * flat-text progress made it look broken/stuck between the two wallet
 * prompts) — `part`/`total` here are read directly off the quote's own
 * `steps` array (present on the quote before execute() ever runs, same
 * shape ProgressData.steps uses during execution) so the caller can render
 * a real "Confirmation X/Y" indicator instead of just changing text.
 */
export async function executeRelayLeg(quote: Execute, wallet: AdaptedWallet, onProgress?: (p: RelayLegProgress) => void) {
  await ensureRelayClient();
  const totalSteps = quote.steps?.length ?? 1;
  return execute({
    quote,
    wallet,
    onProgress: (data) => {
      const label = data?.currentStep?.description || data?.currentStep?.action;
      if (!label) return;
      const idx = data.steps && data.currentStep ? data.steps.findIndex((s) => s.id === data.currentStep!.id) : -1;
      onProgress?.({ label, part: idx >= 0 ? idx + 1 : 1, total: data.steps?.length ?? totalSteps });
    },
  });
}

/** Number of discrete wallet confirmations a fetched quote will need (approve + swap, etc.) — read before execute() runs. */
export function quoteStepCount(quote: Execute): number {
  return quote.steps?.length ?? 1;
}

/** The requestId is already present on the quote's own steps as soon as getQuote() returns, before execute() ever runs — not something only the post-execute result object has. */
export function relayRequestId(quote: Execute): string | null {
  return quote.steps?.find((s) => s.requestId)?.requestId ?? null;
}

// Same URL pattern Relay's own SwapWidget links to on its success screen
// (relay-kit-ui's SwapSuccessStep.js: `${baseTransactionUrl}/transaction/${requestId}`)
// — the requestId is already present on the quote's own steps as soon as
// getQuote() returns, before execute() ever runs (relay-kit-ui's own
// extractQuoteId() reads it the same way pre-execution).
export function relayTransactionUrl(quote: Execute): string | null {
  const requestId = relayRequestId(quote);
  return requestId ? `https://relay.link/transaction/${requestId}` : null;
}

export type RelayRequestStatus = {
  status: string; // "success" | "failure" | "refund" | "pending" | "depositing" | ...
  originTxHash: string | null;
  destinationTxHash: string | null;
  outputAmountFormatted: string | null;
};

/**
 * Looks up a request's real status by the id already known from its quote
 * (relayRequestId, above) — this is Relay's own ground truth, independent
 * of whether our own execute() call locally succeeded or threw. Built
 * after a real live SOL->CASHCAT swap threw a client-side error (execute()
 * rejected) while the swap had genuinely completed on Relay's backend —
 * same root cause as the documented Solana blockhash-expiry issue
 * elsewhere in this codebase (a signed tx can land AFTER our own wait
 * gives up on it), just for a plan (`relay-only`) with no leg of our own
 * left afterward to verify against via a balance check, so this asks
 * Relay directly instead. Endpoint/shape verified live against a real
 * successful request (`api.relay.link/requests/v2?status=success&limit=1`),
 * not guessed — `data.inTxs[0].hash`/`data.outTxs[0].hash`/
 * `data.metadata.currencyOut.amountFormatted` are real observed fields.
 */
export async function checkRelayRequestStatus(requestId: string): Promise<RelayRequestStatus | null> {
  try {
    const res = await fetch(`https://api.relay.link/requests/v2?id=${encodeURIComponent(requestId)}`);
    const json = await res.json();
    const req = json?.requests?.[0];
    if (!req?.status) return null;
    return {
      status: req.status,
      originTxHash: req.data?.inTxs?.[0]?.hash ?? null,
      destinationTxHash: req.data?.outTxs?.[0]?.hash ?? null,
      outputAmountFormatted: req.data?.metadata?.currencyOut?.amountFormatted ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Polls checkRelayRequestStatus until it resolves definitively (success or
 * a terminal failure state) or the timeout elapses — used as a recovery
 * check right after execute() throws, not as the primary wait (execute()'s
 * own onProgress already covers the normal path). Returns null if still
 * unresolved after the timeout, which the caller should treat the same as
 * "couldn't confirm either way," not as a confirmed failure.
 */
export async function waitForRelaySuccess(
  requestId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<RelayRequestStatus | null> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 20000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = await checkRelayRequestStatus(requestId);
    if (status && status.status !== "pending" && status.status !== "depositing") return status;
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
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
