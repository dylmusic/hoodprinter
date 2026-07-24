/**
 * HOODPrinter site configuration.
 * Swap the PLACEHOLDER_* values here at launch — nothing else needs to change.
 */

export const PLACEHOLDER_CONTRACT_ADDRESS = "0x6af5dB6f72E6030E71Ea9B45feD55CBD68A69b1d";
export const PLACEHOLDER_BUY_LINK = "https://PLACEHOLDER_BUY_LINK";
export const PLACEHOLDER_TELEGRAM = "https://t.me/HOODPrint";
export const PLACEHOLDER_TWITTER = "https://x.com/HOODPrinterxyz";

// $PRINT is live and trading. Every primary CTA (announce bar, hero button,
// nav CTA, how-to-buy step 4, roadmap) points to the live buy link while
// this is true. Flip back to false to restore the airdrop / "level up"
// (Buy Bot) CTAs across the site — the Buy Bot contest keeps running
// either way (Tools dropdown).
export const PRESALE_ACTIVE = true;
// Relay bridge+buy: lets anyone land on $PRINT straight from another chain
// in one step (bridges into Robinhood Chain and buys $PRINT), not just
// people who already have ETH there. Better default than sending everyone
// to the based.bid pool page directly.
export const PRESALE_LINK =
  "https://relay.link/bridge/robinhood?toCurrency=0x6af5db6f72e6030e71ea9b45fed55cbd68a69b1d&fromChainId=4663";

// Google Analytics 4 measurement ID (G-XXXXXXXXXX). Empty = GA script not
// rendered. Create the property at analytics.google.com → Admin → Create
// property → hoodprinter.xyz, then paste the ID here.
export const GA_MEASUREMENT_ID = "G-YM2PTVBGS5";

// Google Search Console "HTML tag" verification token (the content= value).
// Empty = meta tag not rendered. Not needed if verifying via DNS or GA.
export const GOOGLE_SITE_VERIFICATION = "";

// WalletConnect Project ID for the /swap page's "WalletConnect" connect
// option (mobile wallets, Coinbase Wallet, Rainbow, etc. — anything besides
// a browser-injected wallet like MetaMask). Empty = that connect option is
// disabled with an explanatory message; MetaMask/injected connect still
// works either way. Get a free ID at https://cloud.reown.com (Reown is the
// WalletConnect Cloud dashboard's current name) — create a project, copy
// its Project ID, paste it here.
export const WALLETCONNECT_PROJECT_ID = "";

export const siteConfig = {
  name: "HOODPrinter",
  symbol: "$PRINT",
  tagline: "Backed by RWAs. Paid in ETH.",
  description:
    "HOODPrinter ($PRINT) pays 5% ETH rewards backed by real-world assets on Robinhood Chain. Buy, hold, and the printer pays you — no staking, no claiming.",
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
