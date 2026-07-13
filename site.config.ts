/**
 * HOODPrinter site configuration.
 * Swap the PLACEHOLDER_* values here at launch — nothing else needs to change.
 */

export const PLACEHOLDER_CONTRACT_ADDRESS = "0x41E0bA8940C753d348c437d7E3D901956Cc94B85";
export const PLACEHOLDER_BUY_LINK = "https://PLACEHOLDER_BUY_LINK";
export const PLACEHOLDER_TELEGRAM = "https://t.me/HOODPrint";
export const PLACEHOLDER_TWITTER = "https://x.com/HOODPrinterxyz";

// PRESALE IS LIVE. Every primary CTA (announce bar, hero button, nav "Level Up",
// how-to-buy step 4, roadmap) points to the GemPad presale while this is true.
// Flip back to false to restore the airdrop / "level up" (Buy Bot) CTAs across
// the site — the Buy Bot contest keeps running either way (Tools dropdown).
export const PRESALE_ACTIVE = true;
export const PRESALE_LINK =
  "https://gempad.app/presale/0xc9D8f13a1293f43554F89dD07f9C6CC4730CD0c6?network=Robinhood_Chain";

// Google Analytics 4 measurement ID (G-XXXXXXXXXX). Empty = GA script not
// rendered. Create the property at analytics.google.com → Admin → Create
// property → hoodprinter.xyz, then paste the ID here.
export const GA_MEASUREMENT_ID = "G-YM2PTVBGS5";

// Google Search Console "HTML tag" verification token (the content= value).
// Empty = meta tag not rendered. Not needed if verifying via DNS or GA.
export const GOOGLE_SITE_VERIFICATION = "";

export const siteConfig = {
  name: "HOODPrinter",
  symbol: "$PRINT",
  tagline: "The printer that pays you in ETH.",
  description:
    "HOODPrinter ($PRINT) lives on Robinhood Chain and prints ETH to holders. Buy, hold, and the printer pays you — no staking, no claiming.",
  // Canonical host is www — the apex 308-redirects to it, so every absolute
  // URL we emit (canonicals, sitemap, OG, JSON-LD) must be the www form.
  url: "https://www.hoodprinter.xyz",

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
