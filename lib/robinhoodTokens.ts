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

/**
 * Chain picker for TokenPickerModal.tsx — UI/layout only for now (Dylan,
 * 2026-07-25: "ship the layout now, chains disabled" — Base/Solana are
 * shown but not selectable until the actual cross-chain routing + wallet
 * work is built). Robinhood Chain is the only `enabled` entry; picking it
 * is a no-op today since it's already the only chain the rest of the swap
 * flow understands. Icons are Relay's own hosted chain-icon CDN
 * (`assets.relay.link/icons/<chainId>/light.png`) — same source this repo
 * already trusts for token logos via Relay's `/currencies/v2` API, and the
 * same icon set Relay's own SwapWidget shows for these exact chains.
 */
export type RhChain = {
  id: number; // Relay's own chain ID (792703809 for Solana, not a real EVM chain ID)
  name: string;
  icon: string;
  enabled: boolean;
};

export const CHAINS: RhChain[] = [
  { id: siteConfig.chain.chainId, name: "Robinhood", icon: "https://assets.relay.link/icons/4663/light.png", enabled: true },
  { id: 8453, name: "Base", icon: "https://assets.relay.link/icons/8453/light.png", enabled: false },
  { id: 792703809, name: "Solana", icon: "https://assets.relay.link/icons/792703809/light.png", enabled: false },
];

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

// Same addresses PrintBot/MultiSender curate elsewhere in the app. Logos
// pulled via Relay's /currencies/v2 address lookup (see resolveCustomToken
// below — the same live source, just fetched once and hardcoded here since
// these 4 are static/curated rather than user-pasted).
const OTHER_CURATED: RhToken[] = [
  {
    address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
    symbol: "CASHCAT",
    name: "CashCat",
    decimals: 18,
    logo: "https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg?1782922765",
  },
  {
    address: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03",
    symbol: "ARROW",
    name: "Arrow",
    decimals: 18,
    logo: "https://assets.geckoterminal.com/43zbrz8v0ejqxxstwmt88xt8kkt1",
  },
  {
    address: "0x8e62f281f282686fca6dcb39288069a93fc23f1c",
    symbol: "HOODRAT",
    name: "HoodRat",
    decimals: 18,
    logo: "https://coin-images.coingecko.com/coins/images/102174350/large/hoodrat_400x400.jpg?1783361154",
  },
  {
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
  { address: "0x92d176ccbeeffecd8089e841d09ea17b6c22d969", symbol: "VLAD", name: "Vladhood", decimals: 18, logo: "https://assets.geckoterminal.com/ao9qfd2m3321z7s5pm9v95korxiq" }, // V2
  { address: "0xc6911796042b15d7fa4f6cde69e245ddcd3d9c31", symbol: "VIRTUAL", name: "Virtuals Protocol", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/34057/large/LOGOMARK.png?1708356054" }, // V2
  { address: "0x39dbed3a2bd333467115de45665cc57f813c4571", symbol: "PONS", name: "Pons", decimals: 18, logo: "https://assets.geckoterminal.com/jhitvkisdq8fhxvimdkpcw7y3dx5" }, // V2
  { address: "0x45242320dbb855eea8fd36804c6487e10e97fcf9", symbol: "TENDIES", name: "Tendies", decimals: 18, logo: "https://assets.geckoterminal.com/x1o0qj8dm7mlay3licerc1y75hr4" }, // V2
  { address: "0xdb87393727b666c43f5aecb03d8b419ba54d9b03", symbol: "SWOGE", name: "Swole Doge", decimals: 18, logo: "https://assets.geckoterminal.com/7t4dl21ciugls2q680q2kew04slp" }, // V2
  { address: "0xf8bc08092c06db6148114dcf82af881f1085f92b", symbol: "WOOD", name: "Sherwood Protocol", decimals: 18, logo: "https://coin-images.coingecko.com/coins/images/102174574/large/4vvnmslrns3stkpsmbsnsv4cu5ae.?1784094690" }, // V2
  { address: "0xe934e36a439c94017b64a3fece66af12099abf50", symbol: "STONKBROKER", name: "StonkBroker", decimals: 18, logo: "https://assets.geckoterminal.com/9gwu14e3hpizobkefg65k66l70wu" }, // V3
  { address: "0x56910d4409f3a0c78c64dd8d0545ff0705389870", symbol: "INDEX", name: "The Index", decimals: 18, logo: "https://assets.geckoterminal.com/wjec7qns101ifpflir8zgbcl6u0i" }, // V3
  { address: "0x0c1ed62d7811e5b437e537ac9d0592469c119c74", symbol: "DIH", name: "Dih", decimals: 18, logo: "https://assets.geckoterminal.com/pg5adkfrjm0a1p8j41q5dg1ez8hu" }, // V3
  { address: "0x62c71cd34a52c30d894419cbcc55db2afa8032ea", symbol: "YOLO", name: "YOLO", decimals: 18, logo: "https://assets.geckoterminal.com/fzvhldxmvphx85ls235mclk6bf3x" }, // V3
  { address: "0x7fe995a80075df3dc8ae11a9b82c7fe4202cd87f", symbol: "HMM", name: "Thinking Cat", decimals: 18, logo: "https://assets.geckoterminal.com/fmu02lq7zai1iyp4qqwfnmu5wr1v" }, // V3
  { address: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", symbol: "AI", name: "Artificial Inu", decimals: 18, logo: "https://assets.geckoterminal.com/byuw84qv9ez2sp99h8q3vzcws5iq" }, // V3
  // Deliberately NOT added: 0xc2362aff...4BA3, also symbol "GME"/name
  // "GameStop" — a real, liquid token, but a DIFFERENT contract from the
  // official Robinhood-issued GameStop stock already in RWA_MARKET_TOKENS
  // below (0x1b0e319c...153e, Relay `verified: false` on this one vs. the
  // real one's "Robinhood Token" tagging everywhere). Adding both under
  // the same "GME" symbol would make it trivially easy to pick the wrong
  // one — Dylan's call: exclude it, even though it's a valid token.
];

export const CURATED_TOKENS: RhToken[] = [
  ETH_TOKEN,
  PRINT_TOKEN,
  WETH_TOKEN,
  USDG_TOKEN,
  ...OTHER_CURATED,
  ...TRENDING_TOKENS,
  ...ALL_RWA_TOKENS,
];

const erc20MetaIface = new ethers.Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/**
 * Live logo lookup for a pasted address, via Relay's own /currencies/v2 API
 * scoped to Robinhood Chain — the same source already used to hardcode
 * WETH/USDG/RWA/curated-token logos above, just called live here instead.
 * This is genuinely how a lot of wallets/DEX UIs solve "where do token
 * icons come from" for tokens they don't maintain their own list for:
 * MetaMask's own token-icon set is a maintained repo (originally
 * MetaMask/contract-metadata, now a CDN) for a curated set of chains/
 * tokens, same idea as the Trust Wallet assets repo (github.com/
 * trustwallet/assets) most other wallets/aggregators pull from — but
 * neither of those has meaningful Robinhood Chain coverage yet (it's a
 * very new chain). Relay's endpoint does, because Relay already needs
 * per-token metadata (symbol/decimals/logo) to power its own swap widget
 * across every chain it supports, us included — reusing it here avoids
 * a second, separate token-icon API integration (e.g. CoinGecko's
 * `/coins/{platform}/contract/{address}`, which needs a CoinGecko
 * "platform id" for the chain that may not even exist for one this new).
 * Anything Relay doesn't recognize falls back to no logo — the picker
 * renders a generic badge in that case (components/TokenPickerModal.tsx).
 */
async function fetchRelayTokenLogo(address: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://api.relay.link/currencies/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainIds: [siteConfig.chain.chainId], address }),
    });
    const results = await res.json();
    return results?.[0]?.metadata?.logoURI || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a pasted contract address that isn't in the curated list, by
 * reading symbol/name/decimals directly on-chain — mirrors the "add by CA"
 * pattern already used in PrintBot.tsx — plus a live logo lookup via Relay.
 */
export async function resolveCustomToken(address: string): Promise<RhToken | null> {
  if (!ethers.isAddress(address)) return null;
  const known = CURATED_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  if (known) return known;
  try {
    const provider = new ethers.JsonRpcProvider(siteConfig.chain.rpcUrl);
    const token = new ethers.Contract(address, erc20MetaIface, provider);
    const [symbol, name, decimals, logo] = await Promise.all([
      token.symbol(),
      token.name(),
      token.decimals(),
      fetchRelayTokenLogo(address),
    ]);
    return { address, symbol, name, decimals: Number(decimals), logo };
  } catch {
    return null;
  }
}
