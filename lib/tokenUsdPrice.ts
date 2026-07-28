import { siteConfig } from "@/site.config";
import { SOLANA_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type RhToken } from "@/lib/robinhoodTokens";

/**
 * Per-token USD price for the swap card's "≈ $X" lines and the mismatch
 * warning below them — Dylan's ask after seeing Relay's own bottom-left USD
 * display: "this can help to show the real swap rate and avoid mistakes."
 *
 * Native ETH (on ANY EVM chain — Robinhood/Base/Ethereum all share the same
 * ~$1 ETH price) and WETH both use the already-fetched `ethUsd` (from
 * lib/printDirectSwap.ts's fetchPrintPriceData, itself sourced from
 * DexScreener) rather than a second fetch. Native SOL is NOT the same
 * price as ETH, so it's excluded from that shortcut and priced via
 * DexScreener like any other token, using the real wrapped-SOL mint
 * address DexScreener indexes under (Relay's own NATIVE_SOL sentinel,
 * "1111...1111", isn't a real indexed mint). $PRINT is derived from the
 * same on-chain `rate` (PRINT per ETH) already polled for the pool-rate
 * display, not DexScreener, for the same staleness reasons documented
 * there. Every other curated token queries DexScreener's `/tokens/<address>`
 * endpoint directly, filtered to the token's own chain, highest-liquidity
 * pair wins.
 */
const DEXSCREENER_CHAIN_SLUG: Record<number, string> = {
  [siteConfig.chain.chainId]: "robinhood",
  [BASE_CHAIN_ID]: "base",
  [MAINNET_CHAIN_ID]: "ethereum",
  [SOLANA_CHAIN_ID]: "solana",
};
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export async function getTokenUsdPrice(
  token: RhToken,
  rate: number | null,
  ethUsd: number | null
): Promise<number | null> {
  if ((token.isNative && token.chainId !== SOLANA_CHAIN_ID) || token.symbol === "WETH") return ethUsd;
  if (token.symbol === "PRINT") return rate && ethUsd ? ethUsd / rate : null;
  const slug = DEXSCREENER_CHAIN_SLUG[token.chainId];
  if (!slug) return null;
  const queryAddress = token.isNative && token.chainId === SOLANA_CHAIN_ID ? WRAPPED_SOL_MINT : token.address;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${queryAddress}`);
    const json = await res.json();
    const pairs = (json?.pairs || []).filter(
      (p: any) => p.chainId === slug && p.baseToken?.address?.toLowerCase() === queryAddress.toLowerCase()
    );
    if (!pairs.length) return null;
    const best = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const price = Number(best.priceUsd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}
