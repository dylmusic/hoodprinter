/**
 * HOODPrinter site configuration.
 * Swap the PLACEHOLDER_* values here at launch — nothing else needs to change.
 */

export const PLACEHOLDER_CONTRACT_ADDRESS = "0x41E0bA8940C753d348c437d7E3D901956Cc94B85";
export const PLACEHOLDER_BUY_LINK = "https://PLACEHOLDER_BUY_LINK";
export const PLACEHOLDER_TELEGRAM = "https://t.me/HOODPrint";
export const PLACEHOLDER_TWITTER = "https://x.com/HOODPrinterxyz";

// Presale is paused (GemPad delayed) — CTAs point to the Buy Bot / "level up"
// instead. Flip back to true when the presale is actually live to restore all
// presale CTAs across the site.
export const PRESALE_ACTIVE = false;
export const PRESALE_LINK =
  "https://gempad.app/presale/0xc9D8f13a1293f43554F89dD07f9C6CC4730CD0c6?network=Robinhood_Chain";

export const siteConfig = {
  name: "HOODPrinter",
  symbol: "$PRINT",
  tagline: "The printer that pays you in ETH.",
  description:
    "HOODPrinter ($PRINT) lives on Robinhood Chain and prints ETH to holders. Buy, hold, and the printer pays you — no staking, no claiming.",
  url: "https://hoodprinter.xyz",

  contractAddress: PLACEHOLDER_CONTRACT_ADDRESS,
  buyLink: PLACEHOLDER_BUY_LINK,
  presaleActive: PRESALE_ACTIVE,
  presaleLink: PRESALE_LINK,
  telegram: PLACEHOLDER_TELEGRAM,
  twitter: PLACEHOLDER_TWITTER,

  // Robinhood Chain mainnet (source: docs.robinhood.com/chain/connecting)
  chain: {
    name: "Robinhood Chain",
    chainId: 4663,
    currency: "ETH",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    bridgeUrl: "https://bridge.arbitrum.io",
  },
} as const;

export type SiteConfig = typeof siteConfig;
