import type { RhToken } from "@/lib/robinhoodTokens";

/**
 * Per-token USD price for the swap card's "≈ $X" lines and the mismatch
 * warning below them — Dylan's ask after seeing Relay's own bottom-left USD
 * display: "this can help to show the real swap rate and avoid mistakes."
 *
 * Native ETH and WETH both use the already-fetched `ethUsd` (from
 * lib/printDirectSwap.ts's fetchPrintPriceData, itself sourced from
 * DexScreener) rather than a second fetch. $PRINT is derived from the same
 * on-chain `rate` (PRINT per ETH) already polled for the pool-rate display,
 * not DexScreener, for the same staleness reasons documented there. Every
 * other curated token queries DexScreener's `/tokens/<address>` endpoint
 * directly (same API already used elsewhere in this file/codebase),
 * filtered to Robinhood Chain pairs, highest-liquidity pair wins.
 */
export async function getTokenUsdPrice(
  token: RhToken,
  rate: number | null,
  ethUsd: number | null
): Promise<number | null> {
  if (token.isNative || token.symbol === "WETH") return ethUsd;
  if (token.symbol === "PRINT") return rate && ethUsd ? ethUsd / rate : null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`);
    const json = await res.json();
    const pairs = (json?.pairs || []).filter(
      (p: any) => p.chainId === "robinhood" && p.baseToken?.address?.toLowerCase() === token.address.toLowerCase()
    );
    if (!pairs.length) return null;
    const best = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const price = Number(best.priceUsd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}
