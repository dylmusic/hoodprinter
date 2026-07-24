import { ethers } from "ethers";
import { siteConfig } from "@/site.config";
import { RWA_POOLS } from "@/lib/rwaPools";
import { NATIVE_ETH } from "@/lib/printDirectSwap";

/**
 * Curated Robinhood Chain token list for the swap page's asset picker —
 * styled after Relay's own "Select Token" modal, scoped to this chain only
 * for now (see components/TokenPickerModal.tsx). $PRINT is included here
 * like any other token; the router (components/PrintDirectSwap.tsx) is what
 * enforces that any leg touching $PRINT goes through our own designated
 * pool instead of Relay, never this list's addresses directly.
 */
export type RhToken = {
  address: string; // NATIVE_ETH for native ETH
  symbol: string;
  name: string;
  decimals: number;
  logo?: string; // image URL, else render initials
  isNative?: boolean;
};

export const ETH_TOKEN: RhToken = {
  address: NATIVE_ETH,
  symbol: "ETH",
  name: "Ethereum",
  decimals: 18,
  isNative: true,
};

export const PRINT_TOKEN: RhToken = {
  address: siteConfig.contractAddress,
  symbol: "PRINT",
  name: "HOOD Printer",
  decimals: 18,
  logo: "/logo.png",
};

// Verified against Relay's own /currencies/v2 API for chainId 4663 — same
// WETH address already documented in CLAUDE.md's on-chain section, and the
// "verified" USDG entry (Global Dollar) matching the address Relay's own
// "Select Token" modal shows pinned at the top ("Global Dollar 0x5f...d168").
export const WETH_TOKEN: RhToken = {
  address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  symbol: "WETH",
  name: "WETH",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/102174283/large/weth-robinhood.jpeg?1782924507",
};

export const USDG_TOKEN: RhToken = {
  address: "0x5FC5360D0400a0Fd4f2AF552Add042d716f1D168",
  symbol: "USDG",
  name: "Global Dollar",
  decimals: 6,
  logo: "https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png",
};

// Pinned quick-select row at the top of the picker — mirrors Relay's own
// "Select Token" modal (ETH/WETH/USDG pinned pills), with $PRINT added
// since it's the whole point of this page.
export const PINNED_TOKENS: RhToken[] = [PRINT_TOKEN, ETH_TOKEN, WETH_TOKEN, USDG_TOKEN];

// Same addresses PrintBot/MultiSender curate elsewhere in the app.
const OTHER_CURATED: RhToken[] = [
  { address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", symbol: "CASHCAT", name: "CashCat", decimals: 18 },
  { address: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03", symbol: "ARROW", name: "Arrow", decimals: 18 },
  { address: "0x8e62f281f282686fca6dcb39288069a93fc23f1c", symbol: "HOODRAT", name: "HoodRat", decimals: 18 },
  { address: "0xd7321801caae694090694ff55a9323139f043b88", symbol: "JUGGERNAUT", name: "Juggernaut", decimals: 18 },
];

// Logos for the 5 RWA_POOLS tokens, pulled from the same Relay
// /currencies/v2 lookup as WETH/USDG above (addresses cross-checked
// against lib/rwaPools.ts's verified Robinhood Assets contracts — identical
// besides checksum casing).
const RWA_POOL_LOGOS: Record<string, string> = {
  NVDA: "https://coin-images.coingecko.com/coins/images/102174110/large/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png?1782444565",
  TSLA: "https://coin-images.coingecko.com/coins/images/102174112/large/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png?1782444570",
  SPCX: "https://coin-images.coingecko.com/coins/images/102174129/large/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png?1782444614",
  AAPL: "https://coin-images.coingecko.com/coins/images/102174123/large/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png?1782444598",
  MSFT: "https://coin-images.coingecko.com/coins/images/102174116/large/0xe93237c50d904957cf27e7b1133b510c669c2e74.png?1782444580",
};

// The 5 pools we actually track on /rwa — prioritized first wherever RWA
// tokens are shown (this list, and the picker's "RWAs" filter).
const RWA_TOKENS: RhToken[] = RWA_POOLS.map((p) => ({
  address: p.tokenAddress,
  symbol: p.symbol,
  name: `${p.name} (Robinhood Tokenized Stock)`,
  decimals: 18,
  logo: RWA_POOL_LOGOS[p.symbol],
}));

// Broader Robinhood-issued tokenized-stock roster beyond our own 5 pools —
// sourced from Relay's /currencies/v2 API (search term "Robinhood Tokenized",
// chainId 4663) for the "RWAs" picker filter Dylan asked for ("show a bunch
// of RWA tokens"). Not RWA pool targets (yet), just swappable like any other
// curated token — any leg touching $PRINT still always routes through our
// own pool regardless of which of these is on the other side.
const RWA_MARKET_TOKENS: RhToken[] = [
  { address: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", symbol: "SLV", name: "iShares Silver Trust (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174120/large/0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f.png?1782444590" },
  { address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", symbol: "SPY", name: "SPDR S&P 500 ETF Trust (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174115/large/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png?1782444578" },
  { address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", symbol: "AMZN", name: "Amazon (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174126/large/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png?1782444606" },
  { address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", symbol: "META", name: "Meta Platforms (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174122/large/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png?1782444595" },
  { address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", symbol: "GOOGL", name: "Alphabet Class A (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174124/large/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png?1782444601" },
  { address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", symbol: "GME", name: "GameStop (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174150/large/0x1b0e319c6a659f002271b69db8a7df2f911c153e.png?1782444670" },
  { address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", symbol: "COIN", name: "Coinbase (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174136/large/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png?1782444632" },
  { address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", symbol: "PLTR", name: "Palantir Technologies (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174117/large/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png?1782444583" },
  { address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", symbol: "AMD", name: "AMD (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174114/large/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png?1782444575" },
  { address: "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", symbol: "INTC", name: "Intel (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174118/large/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png?1782444585" },
  { address: "0xff080c8ce2e5feadaca0da81314ae59d232d4afd", symbol: "MU", name: "Micron Technology (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174111/large/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png?1782444567" },
  { address: "0xb90a19ff0af67f7779aff50a882a9cff42446400", symbol: "SNDK", name: "Sandisk Corporation (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174113/large/0xb90a19ff0af67f7779aff50a882a9cff42446400.png?1782444573" },
  { address: "0xec262a75e413fafd0df80480274532c79d42da09", symbol: "MSTR", name: "Strategy Inc. (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174143/large/0xec262a75e413fafd0df80480274532c79d42da09.png?1782444651" },
  { address: "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8", symbol: "NFLX", name: "Netflix (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174165/large/0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8.png?1782444710" },
  { address: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", symbol: "RDDT", name: "Reddit (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174197/large/0x05b37fb53a299a1b874a619e1c4c404d52c36f4c.png?1782444795" },
  { address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", symbol: "COST", name: "Costco (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174152/large/0x4ea005168d7f09a7a0ba9d1def21a479950e44c2.png?1782444675" },
  { address: "0xd917b029c761d264c6a312bbbcda868658ef86a6", symbol: "USAR", name: "USA Rare Earth (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174132/large/0xd917b029c761d264c6a312bbbcda868658ef86a6.png?1782444621" },
];

// RWA_TOKENS (our 5 tracked pools) first, then the broader market list —
// this order is what the picker's "RWAs" pill shows.
export const ALL_RWA_TOKENS: RhToken[] = [...RWA_TOKENS, ...RWA_MARKET_TOKENS];

export const CURATED_TOKENS: RhToken[] = [
  ETH_TOKEN,
  PRINT_TOKEN,
  WETH_TOKEN,
  USDG_TOKEN,
  ...OTHER_CURATED,
  ...ALL_RWA_TOKENS,
];

const erc20MetaIface = new ethers.Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/**
 * Resolves a pasted contract address that isn't in the curated list, by
 * reading symbol/name/decimals directly on-chain — mirrors the "add by CA"
 * pattern already used in PrintBot.tsx.
 */
export async function resolveCustomToken(address: string): Promise<RhToken | null> {
  if (!ethers.isAddress(address)) return null;
  const known = CURATED_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  if (known) return known;
  try {
    const provider = new ethers.JsonRpcProvider(siteConfig.chain.rpcUrl);
    const token = new ethers.Contract(address, erc20MetaIface, provider);
    const [symbol, name, decimals] = await Promise.all([token.symbol(), token.name(), token.decimals()]);
    return { address, symbol, name, decimals: Number(decimals) };
  } catch {
    return null;
  }
}
