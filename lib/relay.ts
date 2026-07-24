/**
 * Relay (relay.link) swap-aggregator client for the /swap page.
 *
 * Replaces the earlier LI.FI integration. Verified live against $PRINT:
 * same-chain ETH <-> PRINT quotes on Robinhood Chain (4663) work through
 * Relay's /quote/v2 (their router correctly routes through the taxed V4
 * pool), both buy AND sell directions get real routes (LI.FI's sell side
 * returned no route at all), and the appFees param genuinely deducts our
 * cut into an off-chain balance we can claim later. One quirk: Relay's
 * currency-address matching is case-sensitive and expects lowercase, NOT
 * EIP-55 checksummed — a checksummed address 404s with INVALID_INPUT_CURRENCY.
 *
 * Quotes go through our own /api/relay/quote proxy (not directly to
 * api.relay.link) so the API key stays server-side and the app-fee
 * recipient/bps can't be tampered with by a modified client.
 */

export const RELAY_CHAIN_ID = 4663;
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

// $PRINT taxes every AMM trade 5%; quotes below this slippage reliably get
// filtered out (mirrors PRINT_MIN_SLIPPAGE in PrintBot.tsx).
export const MIN_SLIPPAGE_PCT = 7;
export const DEFAULT_SLIPPAGE_PCT = 10;

// Our cut, collected via Relay's native appFees mechanism — bps of input
// value, deducted automatically inside the quote, no separate contract.
export const APP_FEE_BPS = "85";

export type RelayCurrency = {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
};

export type RelayTxStep = {
  id: string;
  description: string;
  items: { data: { to: string; data: string; value: string; chainId: number } }[];
  check?: { endpoint: string; method: string };
};

export type RelayQuote = {
  steps: RelayTxStep[];
  fees: {
    gas?: { amountFormatted: string; amountUsd: string };
    app?: { amountFormatted: string; amountUsd: string };
  };
  details: {
    currencyOut: { currency: RelayCurrency; amount: string; amountFormatted: string; minimumAmount: string };
    totalImpact?: { usd: string; percent: string };
  };
};

export class RelayError extends Error {}

export async function getRelayQuote(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippagePct: number;
  signal?: AbortSignal;
}): Promise<RelayQuote> {
  const res = await fetch("/api/relay/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      user: params.fromAddress,
      originChainId: RELAY_CHAIN_ID,
      destinationChainId: RELAY_CHAIN_ID,
      originCurrency: params.fromToken,
      destinationCurrency: params.toToken,
      amount: params.fromAmount,
      tradeType: "EXACT_INPUT",
      slippageTolerance: String(Math.round(params.slippagePct * 100)),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.message) {
    throw new RelayError(
      json?.message
        ? `No route available right now — ${json.message.toLowerCase()}. Try a smaller amount or more slippage.`
        : "No route available right now. Try a smaller amount."
    );
  }
  return json as RelayQuote;
}
