/**
 * LI.FI swap-aggregator client for the /swap page.
 *
 * $PRINT's main liquidity is a Uniswap V4 pool with a hook enforcing the 5%
 * trade tax (pool id 0xf19f1556acc8cabf39a9632002a92877852031148d4d1deb0144dffa4ee27075)
 * — not the V2/V3 pools PrintBot.tsx's hand-rolled Universal Router calldata
 * knows how to build. Reimplementing V4Router-via-Universal-Router encoding
 * for a hooked pool is a lot of surface area to get wrong with real funds,
 * so this routes through LI.FI instead. LI.FI genuinely supports Robinhood
 * Chain (chainId 4663, confirmed via GET https://li.quest/v1/chains) and its
 * "fly" solver successfully quotes ETH -> $PRINT, decoded calldata confirms
 * it lands in the Universal Router (which does speak V4Router commands).
 * Selling $PRINT back to ETH currently returns no route (fee-on-transfer
 * tokens are hard for solvers to simulate on the sell side) — surfaced as a
 * normal "no quote" error, not hidden.
 */

export const LIFI_API = "https://li.quest/v1";
export const LIFI_CHAIN_ID = 4663;
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

// $PRINT taxes every AMM trade 5%; quotes below this slippage reliably get
// filtered out by LI.FI's own price-impact/slippage checks (mirrors
// PRINT_MIN_SLIPPAGE in PrintBot.tsx).
export const MIN_SLIPPAGE_PCT = 7;
export const DEFAULT_SLIPPAGE_PCT = 10;

export type LifiToken = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
};

export type LifiQuote = {
  tool: string;
  toolDetails?: { name: string };
  action: { fromToken: LifiToken; toToken: LifiToken; fromAmount: string; slippage: number };
  estimate: {
    approvalAddress: string;
    toAmount: string;
    toAmountMin: string;
    gasCosts?: { amount: string; amountUSD?: string }[];
    feeCosts?: { amount: string; amountUSD?: string; name: string }[];
  };
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    gasLimit?: string;
    gasPrice?: string;
  };
};

export class LifiError extends Error {}

/** Human-readable reason from LI.FI's structured "no route" error payload. */
function extractNoRouteReason(json: any): string | null {
  const filtered = json?.errors?.filteredOut?.[0]?.reason;
  if (filtered) return filtered;
  const failed = json?.errors?.failed?.[0]?.subpaths;
  if (failed) {
    const firstKey = Object.keys(failed)[0];
    const msg = firstKey && failed[firstKey]?.[0]?.message;
    if (msg) return msg;
  }
  return null;
}

export async function getLifiQuote(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippagePct: number;
  signal?: AbortSignal;
}): Promise<LifiQuote> {
  const qs = new URLSearchParams({
    fromChain: String(LIFI_CHAIN_ID),
    toChain: String(LIFI_CHAIN_ID),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    slippage: String(params.slippagePct / 100),
    integrator: "hoodprinter",
  });
  const res = await fetch(`${LIFI_API}/quote?${qs.toString()}`, { signal: params.signal });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.message) {
    const reason = extractNoRouteReason(json);
    throw new LifiError(
      reason
        ? `No route available right now — ${reason.toLowerCase()}. Try a smaller amount or more slippage.`
        : json?.message || "No route available right now. Try a smaller amount."
    );
  }
  return json as LifiQuote;
}
