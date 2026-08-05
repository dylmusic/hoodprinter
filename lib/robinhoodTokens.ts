import { ethers } from "ethers";
import { siteConfig } from "@/site.config";
import { RWA_POOLS } from "@/lib/rwaPools";
import { NATIVE_ETH } from "@/lib/printDirectSwap";

/**
 * Curated token list for the swap page's asset picker — styled after
 * Relay's own "Select Token" modal. Originally Robinhood Chain only;
 * extended 2026-07-28 to cover Base, Solana, and Ethereum mainnet as real
 * origin/destination chains for cross-chain swaps (see CHAINS below and
 * components/PrintDirectSwap.tsx's planRoute). $PRINT only exists on
 * Robinhood Chain — the router is what enforces that any leg touching it
 * always goes through our own designated pool instead of Relay, no matter
 * which chain the other side of the swap is on.
 */
export type RhToken = {
  chainId: number; // Relay's own chain id (792703809 for Solana, not a real EVM chain id)
  address: string; // NATIVE_ETH / NATIVE_SOL for each chain's own native asset
  symbol: string;
  name: string;
  decimals: number;
  logo?: string; // image URL, else render initials
  isNative?: boolean;
};

/**
 * Chain picker for TokenPickerModal.tsx. Base and Solana shipped
 * 2026-07-25 as layout-only (disabled pills, Dylan: "ship the layout now,
 * chains disabled") while the actual cross-chain routing + wallet work was
 * scoped. That work is what shipped 2026-07-28 (Dylan: "enable base, SOL,
 * ETH") — all four chains are enabled now. Ethereum mainnet added as a
 * 4th chain at the same time (not part of the original 2026-07-25 scoping,
 * which only named Base/Solana, but the same EVM pattern as Base makes it
 * effectively free once Base is wired up). Icons are Relay's own hosted
 * chain-icon CDN (`assets.relay.link/icons/<chainId>/light.png`) — same
 * source this repo already trusts for token logos via Relay's
 * `/currencies/v2` API, and the same icon set Relay's own SwapWidget shows
 * for these exact chains.
 */
export type RhChain = {
  id: number;
  name: string;
  icon: string;
  enabled: boolean;
};

export const SOLANA_CHAIN_ID = 792703809; // Relay's own id for Solana, not a real EVM chain id
export const BASE_CHAIN_ID = 8453;
export const MAINNET_CHAIN_ID = 1;

export const CHAINS: RhChain[] = [
  { id: siteConfig.chain.chainId, name: "Robinhood", icon: "https://assets.relay.link/icons/4663/light.png", enabled: true },
  { id: BASE_CHAIN_ID, name: "Base", icon: "https://assets.relay.link/icons/8453/light.png", enabled: true },
  { id: SOLANA_CHAIN_ID, name: "Solana", icon: "https://assets.relay.link/icons/792703809/light.png", enabled: true },
  { id: MAINNET_CHAIN_ID, name: "Ethereum", icon: "https://assets.relay.link/icons/1/light.png", enabled: true },
];

export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

/** Compound identity key — plain `address` alone collides across chains (every EVM chain's native ETH shares the same NATIVE_ETH sentinel address). */
export function tokenKey(t: RhToken): string {
  return `${t.chainId}:${t.address.toLowerCase()}`;
}
function sameToken(a: RhToken, b: RhToken): boolean {
  return a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase();
}

export const ETH_TOKEN: RhToken = {
  chainId: siteConfig.chain.chainId,
  address: NATIVE_ETH,
  symbol: "ETH",
  name: "Ethereum",
  decimals: 18,
  isNative: true,
};

export const PRINT_TOKEN: RhToken = {
  chainId: siteConfig.chain.chainId,
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
  chainId: siteConfig.chain.chainId,
  address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  symbol: "WETH",
  name: "WETH",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/102174283/large/weth-robinhood.jpeg?1782924507",
};

export const USDG_TOKEN: RhToken = {
  chainId: siteConfig.chain.chainId,
  address: "0x5FC5360D0400a0Fd4f2AF552Add042d716f1D168",
  symbol: "USDG",
  name: "Global Dollar",
  decimals: 6,
  logo: "https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png",
};

// Same addresses PrintBot/MultiSender curate elsewhere in the app. Logos
// pulled via Relay's /currencies/v2 address lookup (see resolveCustomToken
// below — the same live source, just fetched once and hardcoded here since
// these 4 are static/curated rather than user-pasted).
const OTHER_CURATED: RhToken[] = [
  {
    chainId: siteConfig.chain.chainId,
    address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
    symbol: "CASHCAT",
    name: "CashCat",
    decimals: 18,
    logo: "https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg?1782922765",
  },
  {
    chainId: siteConfig.chain.chainId,
    address: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03",
    symbol: "ARROW",
    name: "Arrow",
    decimals: 18,
    logo: "https://assets.geckoterminal.com/43zbrz8v0ejqxxstwmt88xt8kkt1",
  },
  {
    chainId: siteConfig.chain.chainId,
    address: "0x8e62f281f282686fca6dcb39288069a93fc23f1c",
    symbol: "HOODRAT",
    name: "HoodRat",
    decimals: 18,
    logo: "https://coin-images.coingecko.com/coins/images/102174350/large/hoodrat_400x400.jpg?1783361154",
  },
  {
    chainId: siteConfig.chain.chainId,
    address: "0xd7321801caae694090694ff55a9323139f043b88",
    symbol: "JUGGERNAUT",
    name: "Juggernaut",
    decimals: 18,
    logo: "https://assets.geckoterminal.com/85cjg6du87ljb72yga9i14m42cb2",
  },
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
  chainId: siteConfig.chain.chainId,
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
  { chainId: siteConfig.chain.chainId, address: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", symbol: "SLV", name: "iShares Silver Trust (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174120/large/0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f.png?1782444590" },
  { chainId: siteConfig.chain.chainId, address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", symbol: "SPY", name: "SPDR S&P 500 ETF Trust (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174115/large/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png?1782444578" },
  { chainId: siteConfig.chain.chainId, address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", symbol: "AMZN", name: "Amazon (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174126/large/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png?1782444606" },
  { chainId: siteConfig.chain.chainId, address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", symbol: "META", name: "Meta Platforms (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174122/large/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png?1782444595" },
  { chainId: siteConfig.chain.chainId, address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", symbol: "GOOGL", name: "Alphabet Class A (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174124/large/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png?1782444601" },
  { chainId: siteConfig.chain.chainId, address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", symbol: "GME", name: "GameStop (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174150/large/0x1b0e319c6a659f002271b69db8a7df2f911c153e.png?1782444670" },
  { chainId: siteConfig.chain.chainId, address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", symbol: "COIN", name: "Coinbase (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174136/large/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png?1782444632" },
  { chainId: siteConfig.chain.chainId, address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", symbol: "PLTR", name: "Palantir Technologies (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174117/large/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png?1782444583" },
  { chainId: siteConfig.chain.chainId, address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", symbol: "AMD", name: "AMD (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174114/large/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png?1782444575" },
  { chainId: siteConfig.chain.chainId, address: "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", symbol: "INTC", name: "Intel (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174118/large/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png?1782444585" },
  { chainId: siteConfig.chain.chainId, address: "0xff080c8ce2e5feadaca0da81314ae59d232d4afd", symbol: "MU", name: "Micron Technology (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174111/large/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png?1782444567" },
  { chainId: siteConfig.chain.chainId, address: "0xb90a19ff0af67f7779aff50a882a9cff42446400", symbol: "SNDK", name: "Sandisk Corporation (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174113/large/0xb90a19ff0af67f7779aff50a882a9cff42446400.png?1782444573" },
  { chainId: siteConfig.chain.chainId, address: "0xec262a75e413fafd0df80480274532c79d42da09", symbol: "MSTR", name: "Strategy Inc. (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174143/large/0xec262a75e413fafd0df80480274532c79d42da09.png?1782444651" },
  { chainId: siteConfig.chain.chainId, address: "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8", symbol: "NFLX", name: "Netflix (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174165/large/0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8.png?1782444710" },
  { chainId: siteConfig.chain.chainId, address: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c", symbol: "RDDT", name: "Reddit (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174197/large/0x05b37fb53a299a1b874a619e1c4c404d52c36f4c.png?1782444795" },
  { chainId: siteConfig.chain.chainId, address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", symbol: "COST", name: "Costco (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174152/large/0x4ea005168d7f09a7a0ba9d1def21a479950e44c2.png?1782444675" },
  { chainId: siteConfig.chain.chainId, address: "0xd917b029c761d264c6a312bbbcda868658ef86a6", symbol: "USAR", name: "USA Rare Earth (Robinhood Tokenized Stock)", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174132/large/0xd917b029c761d264c6a312bbbcda868658ef86a6.png?1782444621" },
];

// RWA_TOKENS (our 5 tracked pools) first, then the broader market list —
// this order is what the picker's "RWAs" pill shows.
export const ALL_RWA_TOKENS: RhToken[] = [...RWA_TOKENS, ...RWA_MARKET_TOKENS];

// Top non-RWA tokens on Robinhood Chain — sourced from Relay's own
// /currencies/v2 `defaultList: true` response for chainId 4663 (Relay's own
// "what matters on this chain" ranking, the same one their screenshot
// showed pinned/first), then cross-checked against DexScreener for real
// liquidity/volume before including any of them (all had five- to seven-
// figure 24h volume and real liquidity at the time — not just listed,
// actually traded). Pool venue (V2 vs V3, `getPair`/`getPool` against
// WETH) checked for every one of these too, feeding `KNOWN_V2_TOKENS` in
// lib/curatedPoolSwap.ts below — V3 ones aren't included there since
// there's no verified V3 quoter on this chain yet to compute a safe minOut
// against (same reasoning JUGGERNAUT was left out of the V1 curated-pool
// build), so they route through Relay when paired with $PRINT instead,
// same as any other non-curated token — never a correctness regression,
// just not on the no-Relay fast path.
const TRENDING_TOKENS: RhToken[] = [
  { chainId: siteConfig.chain.chainId, address: "0x92d176ccbeeffecd8089e841d09ea17b6c22d969", symbol: "VLAD", name: "Vladhood", decimals: 18, logo: "https://assets.geckoterminal.com/ao9qfd2m3321z7s5pm9v95korxiq" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0xc6911796042b15d7fa4f6cde69e245ddcd3d9c31", symbol: "VIRTUAL", name: "Virtuals Protocol", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/34057/large/LOGOMARK.png?1708356054" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0x39dbed3a2bd333467115de45665cc57f813c4571", symbol: "PONS", name: "Pons", decimals: 18, logo: "https://assets.geckoterminal.com/jhitvkisdq8fhxvimdkpcw7y3dx5" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0x45242320dbb855eea8fd36804c6487e10e97fcf9", symbol: "TENDIES", name: "Tendies", decimals: 18, logo: "https://assets.geckoterminal.com/x1o0qj8dm7mlay3licerc1y75hr4" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0xdb87393727b666c43f5aecb03d8b419ba54d9b03", symbol: "SWOGE", name: "Swole Doge", decimals: 18, logo: "https://assets.geckoterminal.com/7t4dl21ciugls2q680q2kew04slp" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0xf8bc08092c06db6148114dcf82af881f1085f92b", symbol: "WOOD", name: "Sherwood Protocol", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174574/large/4vvnmslrns3stkpsmbsnsv4cu5ae.?1784094690" }, // V2
  { chainId: siteConfig.chain.chainId, address: "0xe934e36a439c94017b64a3fece66af12099abf50", symbol: "STONKBROKER", name: "StonkBroker", decimals: 18, logo: "https://assets.geckoterminal.com/9gwu14e3hpizobkefg65k66l70wu" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0x56910d4409f3a0c78c64dd8d0545ff0705389870", symbol: "INDEX", name: "The Index", decimals: 18, logo: "https://assets.geckoterminal.com/wjec7qns101ifpflir8zgbcl6u0i" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0x0c1ed62d7811e5b437e537ac9d0592469c119c74", symbol: "DIH", name: "Dih", decimals: 18, logo: "https://assets.geckoterminal.com/pg5adkfrjm0a1p8j41q5dg1ez8hu" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0x62c71cd34a52c30d894419cbcc55db2afa8032ea", symbol: "YOLO", name: "YOLO", decimals: 18, logo: "https://assets.geckoterminal.com/fzvhldxmvphx85ls235mclk6bf3x" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0x7fe995a80075df3dc8ae11a9b82c7fe4202cd87f", symbol: "HMM", name: "Thinking Cat", decimals: 18, logo: "https://assets.geckoterminal.com/fmu02lq7zai1iyp4qqwfnmu5wr1v" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", symbol: "AI", name: "Artificial Inu", decimals: 18, logo: "https://assets.geckoterminal.com/byuw84qv9ez2sp99h8q3vzcws5iq" }, // V3
  { chainId: siteConfig.chain.chainId, address: "0xA3BfBccD4Aeec8ac56B17FEE3e02Dd2C60722ccc", symbol: "CATSTR", name: "Cashcat Strategy", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174618/large/cashstrategy.jpg?1784192415" }, // V4, no direct V2/V3 WETH pool — routes via Relay
  { chainId: siteConfig.chain.chainId, address: "0x6245e67affA44a23077f0Ea7f981a8DC743a0c47", symbol: "FRONG", name: "frong", decimals: 18, logo: "https://cdn.dexscreener.com/cms/images/zm10U0vUz_wBxnTO?width=800&height=800&quality=95&format=auto" }, // V4 (real liquidity, ~$650K) — NOT the V2 pair add-token.mjs found, that one's a ~$0.50 decoy; routes via Relay. The Relay/GeckoTerminal logo URL 403'd (genuinely dead, not hotlink protection) — used DexScreener's own CDN image instead, verified live
  // Deliberately NOT added: 0xc2362aff...4BA3, also symbol "GME"/name
  // "GameStop" — a real, liquid token, but a DIFFERENT contract from the
  // official Robinhood-issued GameStop stock already in RWA_MARKET_TOKENS
  // below (0x1b0e319c...153e, Relay `verified: false` on this one vs. the
  // real one's "Robinhood Token" tagging everywhere). Adding both under
  // the same "GME" symbol would make it trivially easy to pick the wrong
  // one — Dylan's call: exclude it, even though it's a valid token.
];

// --- Cross-chain tokens (Base / Solana / Ethereum mainnet), added
// 2026-07-28. Same "native asset + a couple of verified pairs" shape as
// the Robinhood-chain curated list above, not an attempt at full parity —
// any token not listed here can still be reached via paste-a-CA
// (resolveCustomToken below). Addresses verified live against Relay's own
// /currencies/v2 API for each chainId (same source/methodology already
// used throughout this file for Robinhood Chain), not hand-typed.

const ETH_BASE: RhToken = { chainId: BASE_CHAIN_ID, address: NATIVE_ETH, symbol: "ETH", name: "Ethereum", decimals: 18, isNative: true };
const WETH_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0x4200000000000000000000000000000000000006",
  symbol: "WETH",
  name: "WETH",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/2518/large/weth.png",
};
const USDC_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png",
};

// More common Base tokens beyond the pinned row — Dylan: "show more common
// tokens on base, SOL, and ETH." Sourced the same way as Robinhood Chain's
// own TRENDING_TOKENS: Relay's /currencies/v2 `defaultList: true` response
// for chainId 8453, filtered to `verified: true` (skips low-quality/
// unverified entries mixed into that same response).
const USDT_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  symbol: "USDT",
  name: "Tether USD",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/39963/large/usdt.png",
};
const CBBTC_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  symbol: "cbBTC",
  name: "Coinbase Wrapped BTC",
  decimals: 8,
  logo: "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp",
};
const CBETH_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  symbol: "cbETH",
  name: "Coinbase Wrapped Staked ETH",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/27008/large/cbeth.png",
};
const AERO_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  symbol: "AERO",
  name: "Aerodrome",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/31745/large/token.png",
};
const VIRTUAL_BASE: RhToken = {
  chainId: BASE_CHAIN_ID,
  address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  symbol: "VIRTUAL",
  name: "Virtual Protocol",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/34057/large/LOGOMARK.png",
};
const MORE_BASE_TOKENS: RhToken[] = [USDT_BASE, CBBTC_BASE, CBETH_BASE, AERO_BASE, VIRTUAL_BASE];

const ETH_MAINNET: RhToken = { chainId: MAINNET_CHAIN_ID, address: NATIVE_ETH, symbol: "ETH", name: "Ethereum", decimals: 18, isNative: true };
// Ethereum mainnet had literally nothing beyond bare native ETH before this
// — not even WETH. Canonical WETH address verified via Relay's own
// /currencies/v2 (term="WETH", chainId=1), matches the well-known contract.
const WETH_MAINNET: RhToken = {
  chainId: MAINNET_CHAIN_ID,
  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  symbol: "WETH",
  name: "Wrapped Ether",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/39810/large/weth.png",
};
const USDC_MAINNET: RhToken = {
  chainId: MAINNET_CHAIN_ID,
  address: "0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png",
};
const USDT_MAINNET: RhToken = {
  chainId: MAINNET_CHAIN_ID,
  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  symbol: "USDT",
  name: "Tether USD",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/39963/large/usdt.png",
};
const DAI_MAINNET: RhToken = {
  chainId: MAINNET_CHAIN_ID,
  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  symbol: "DAI",
  name: "Dai Stablecoin",
  decimals: 18,
  logo: "https://coin-images.coingecko.com/coins/images/9956/large/Badge_Dai.png",
};
const WBTC_MAINNET: RhToken = {
  chainId: MAINNET_CHAIN_ID,
  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  symbol: "WBTC",
  name: "Wrapped BTC",
  decimals: 8,
  logo: "https://coin-images.coingecko.com/coins/images/7598/large/wrapped_bitcoin_wbtc.png",
};
const MORE_MAINNET_TOKENS: RhToken[] = [WETH_MAINNET, USDC_MAINNET, USDT_MAINNET, DAI_MAINNET, WBTC_MAINNET];

// Relay's own sentinel address for native SOL (Solana's System Program id —
// verified live against Relay's /currencies/v2 API, not guessed).
export const NATIVE_SOL = "11111111111111111111111111111111";
const SOL_NATIVE: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: NATIVE_SOL,
  symbol: "SOL",
  name: "Solana",
  decimals: 9,
  isNative: true,
  logo: "https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png",
};
const USDC_SOLANA: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png",
};
const USDG_SOLANA: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
  symbol: "USDG",
  name: "Global Dollar",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png",
};
// Global Dollar is real on Solana, not a copy-paste mistake — verified
// live against Relay's /currencies/v2 (address lookup, not a term search)
// right before adding these: {"chainId":792703809,"address":"2u1t...",
// "symbol":"USDG","name":"Global Dollar","decimals":6,"verified":true}.
// It's Paxos's multi-chain stablecoin (same "Global Dollar Network" token
// as the Robinhood-chain USDG_TOKEN above and Ethereum's below — same
// CoinGecko image id 51281 across all three), issued on Solana/Ethereum/
// Base/etc, not something specific to this app.

// More common Solana tokens beyond the pinned row — same sourcing as Base
// above (Relay's defaultList for chainId 792703809, verified:true only).
const USDT_SOLANA: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  symbol: "USDT",
  name: "USDT",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
};
const PYUSD_SOLANA: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  symbol: "PYUSD",
  name: "PayPal USD",
  decimals: 6,
  logo: "https://coin-images.coingecko.com/coins/images/31212/large/PYUSD_Logo_%282%29.png",
};
const CBBTC_SOLANA: RhToken = {
  chainId: SOLANA_CHAIN_ID,
  address: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
  symbol: "cbBTC",
  name: "Coinbase Wrapped BTC",
  decimals: 8,
  logo: "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp",
};
const MORE_SOLANA_TOKENS: RhToken[] = [USDT_SOLANA, PYUSD_SOLANA, CBBTC_SOLANA];

// Pinned quick-select row at the top of the picker, per chain — mirrors
// Relay's own "Select Token" modal. Robinhood Chain's own list is
// unchanged (PRINT first — "it's the whole point of this page").
export const PINNED_TOKENS: Record<number, RhToken[]> = {
  [siteConfig.chain.chainId]: [PRINT_TOKEN, ETH_TOKEN, WETH_TOKEN, USDG_TOKEN],
  [BASE_CHAIN_ID]: [ETH_BASE, WETH_BASE, USDC_BASE],
  [SOLANA_CHAIN_ID]: [SOL_NATIVE, USDC_SOLANA, USDG_SOLANA],
  // Mainnet had only bare native ETH pinned before — WETH added so it
  // isn't the one chain without its own wrapped-native pair pinned.
  [MAINNET_CHAIN_ID]: [ETH_MAINNET, WETH_MAINNET],
};

export const CROSS_CHAIN_TOKENS: RhToken[] = [
  ETH_MAINNET,
  ETH_BASE,
  WETH_BASE,
  USDC_BASE,
  SOL_NATIVE,
  USDC_SOLANA,
  USDG_SOLANA,
  ...MORE_BASE_TOKENS,
  ...MORE_SOLANA_TOKENS,
  ...MORE_MAINNET_TOKENS,
];

export const CURATED_TOKENS: RhToken[] = [
  ETH_TOKEN,
  PRINT_TOKEN,
  WETH_TOKEN,
  USDG_TOKEN,
  ...OTHER_CURATED,
  ...TRENDING_TOKENS,
  ...ALL_RWA_TOKENS,
  ...CROSS_CHAIN_TOKENS,
];

/** Tokens to show for a given chain pill — curated list filtered by chainId, RWA filter applied same as before (RWA tokens are Robinhood-chain only). */
export function tokensForChain(chainId: number, rwaFilter: boolean): RhToken[] {
  if (rwaFilter) return chainId === siteConfig.chain.chainId ? ALL_RWA_TOKENS : [];
  return CURATED_TOKENS.filter((t) => t.chainId === chainId);
}

/**
 * Symbol -> chain id, for shareable swap links (?from=SYMBOL&to=SYMBOL,
 * optional &fromChain=/&toChain= to disambiguate a symbol that exists on
 * more than one chain, e.g. "eth"/"usdc"/"weth"). Accepts either a chain's
 * display name ("Solana", case-insensitive) or its raw numeric id.
 */
export function chainIdFromParam(param: string): number | undefined {
  const p = param.trim().toLowerCase();
  const byName = CHAINS.find((c) => c.name.toLowerCase() === p);
  if (byName) return byName.id;
  const asNum = Number(p);
  return CHAINS.some((c) => c.id === asNum) ? asNum : undefined;
}

/**
 * Looks up a curated token by symbol (case-insensitive) for shareable swap
 * links — e.g. /swap?to=cashcat. `chainId`, when given, disambiguates a
 * symbol that exists on more than one chain (ETH/WETH/USDC/USDT all do);
 * without it, the first match in CURATED_TOKENS wins, which is Robinhood
 * Chain for every symbol native to this site (ETH/PRINT/WETH/USDG/curated
 * tokens all come before CROSS_CHAIN_TOKENS in that array). Returns
 * undefined for an unknown symbol rather than guessing.
 */
export function findTokenBySymbol(symbol: string, chainId?: number): RhToken | undefined {
  const s = symbol.trim().toLowerCase();
  if (!s) return undefined;
  return CURATED_TOKENS.find((t) => t.symbol.toLowerCase() === s && (chainId === undefined || t.chainId === chainId));
}

const erc20MetaIface = new ethers.Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

// Public read RPCs for the two non-Robinhood EVM chains — read-only calls
// (symbol/name/decimals) only, never used for signing/sending.
const EVM_RPC_URLS: Record<number, string> = {
  [siteConfig.chain.chainId]: siteConfig.chain.rpcUrl,
  [BASE_CHAIN_ID]: "https://mainnet.base.org",
  [MAINNET_CHAIN_ID]: "https://eth.llamarpc.com",
};

/**
 * Live logo lookup for a pasted address, via Relay's own /currencies/v2 API
 * — same source already used to hardcode WETH/USDG/RWA/curated-token logos
 * above, just called live here instead, now scoped per chain instead of
 * hardcoded to Robinhood Chain.
 */
async function fetchRelayTokenLogo(chainId: number, address: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://api.relay.link/currencies/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainIds: [chainId], address }),
    });
    const results = await res.json();
    return results?.[0]?.metadata?.logoURI || undefined;
  } catch {
    return undefined;
  }
}

// Address-shape detection: EVM chains look for a "0x..." address; Solana
// mint addresses are base58 (no 0/O/I/l), typically 32-44 chars, with no
// distinguishing prefix — length+charset is the best available heuristic
// short of attempting a resolve on every input. Split into two standalone
// checks (not just the chain-aware `looksLikeAddress` below) so shareable
// swap links (?to=0x.../?to=<base58 mint>) can auto-detect which chain an
// address belongs to when the link doesn't say (PrintDirectSwap.tsx) —
// TokenPickerModal.tsx's paste-a-CA box already knows its chain from
// context, so it only ever needs the chain-aware wrapper.
export function looksLikeEvmAddress(q: string): boolean {
  return q.length >= 8 && /^0x/i.test(q);
}
export function looksLikeSolanaAddress(q: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
}
export function looksLikeAddress(chainId: number, q: string): boolean {
  return isSolanaChain(chainId) ? looksLikeSolanaAddress(q) : looksLikeEvmAddress(q);
}

/**
 * Resolves a pasted address that isn't in the curated list, for the
 * currently-selected chain. EVM chains (Robinhood/Base/Ethereum) read
 * symbol/name/decimals directly on-chain, same "add by CA" pattern as
 * PrintBot.tsx, plus a live logo lookup via Relay. Solana has no on-chain
 * SPL name/symbol standard to read the same way (that's Metaplex metadata,
 * a separate program) — mirrors dylmusic's own resolveCustomToken, which
 * trusts Relay's /currencies/v2 lookup alone for SVM tokens and returns
 * null (curated-list-only) if Relay doesn't recognize the mint, rather than
 * guessing.
 */
export async function resolveCustomToken(chainId: number, address: string): Promise<RhToken | null> {
  const known = CURATED_TOKENS.find((t) => t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase());
  if (known) return known;

  if (isSolanaChain(chainId)) {
    try {
      const res = await fetch("https://api.relay.link/currencies/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainIds: [chainId], address }),
      });
      const results = await res.json();
      const r = results?.[0];
      if (!r?.symbol || !r?.decimals) return null;
      return {
        chainId,
        address,
        symbol: r.symbol,
        name: r.name || r.symbol,
        decimals: Number(r.decimals),
        logo: r.metadata?.logoURI,
      };
    } catch {
      return null;
    }
  }

  if (!ethers.isAddress(address)) return null;
  const rpcUrl = EVM_RPC_URLS[chainId];
  if (!rpcUrl) return null;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const token = new ethers.Contract(address, erc20MetaIface, provider);
    const [symbol, name, decimals, logo] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals(),
      fetchRelayTokenLogo(chainId, address),
    ]);
    return { chainId, address, symbol, name, decimals: Number(decimals), logo };
  } catch {
    return null;
  }
}
