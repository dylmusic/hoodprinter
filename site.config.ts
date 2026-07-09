/**
 * HOODPrinter site configuration.
 * Swap the PLACEHOLDER_* values here at launch — nothing else needs to change.
 */

export const PLACEHOLDER_CONTRACT_ADDRESS = "0xPLACEHOLDER_CONTRACT_ADDRESS";
export const PLACEHOLDER_BUY_LINK = "https://PLACEHOLDER_BUY_LINK";
export const PLACEHOLDER_TELEGRAM = "https://t.me/+8EIlOqo7O3tiYjdh";
export const PLACEHOLDER_TWITTER = "https://x.com/PLACEHOLDER_TWITTER";

export const siteConfig = {
  name: "HOODPrinter",
  symbol: "$PRINT",
  tagline: "The printer that pays you in ETH.",
  description:
    "HOODPrinter ($PRINT) lives on Robinhood Chain and prints ETH to holders. Buy, hold, and the printer pays you — no staking, no claiming.",
  url: "https://hoodprinter.xyz",

  contractAddress: PLACEHOLDER_CONTRACT_ADDRESS,
  buyLink: PLACEHOLDER_BUY_LINK,
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
