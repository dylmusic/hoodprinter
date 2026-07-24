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

// Same addresses PrintBot/MultiSender curate elsewhere in the app.
const OTHER_CURATED: RhToken[] = [
  { address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", symbol: "CASHCAT", name: "CashCat", decimals: 18 },
  { address: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03", symbol: "ARROW", name: "Arrow", decimals: 18 },
  { address: "0x8e62f281f282686fca6dcb39288069a93fc23f1c", symbol: "HOODRAT", name: "HoodRat", decimals: 18 },
  { address: "0xd7321801caae694090694ff55a9323139f043b88", symbol: "JUGGERNAUT", name: "Juggernaut", decimals: 18 },
];

const RWA_TOKENS: RhToken[] = RWA_POOLS.map((p) => ({
  address: p.tokenAddress,
  symbol: p.symbol,
  name: `${p.name} (Robinhood Tokenized Stock)`,
  decimals: 18,
}));

export const CURATED_TOKENS: RhToken[] = [ETH_TOKEN, PRINT_TOKEN, ...OTHER_CURATED, ...RWA_TOKENS];

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
