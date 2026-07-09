# HOODPrinter — Pre-Build Research

Date: 2026-07-09

## 1. ETH Printer (the original)

### Sources
- Live site: https://ethprinter.xyz/ (SSL handshake fails as of today; recovered via Wayback Machine)
- Wayback snapshot used: `web.archive.org/web/20251111042416/https://ethprinter.xyz/` (Nov 2025, latest full capture; snapshots run Dec 2024 → Nov 2025)
- `ethprinter.com` — parked domain lander only (July 2025 snapshot), not the project site
- `ethprinter.io` — 301 redirect, no content
- CoinMarketCap: https://coinmarketcap.com/currencies/ethprinter/
- Phantom token page: https://phantom.com/tokens/base/0x35bfe9427d37cec78ea1eb9fa922f12ae8a32547

### Basic facts
- Token: **$ETHPrinter**, on **Base** (Ethereum L2)
- Contract: `0x35bfE9427d37cEc78ea1EB9fa922f12Ae8A32547`
- Founders (per CMC): Jackson Blau, Alec Beckman
- Launched via GemPad presale

### The "printing" mechanic (how they explain it)
- **5% tax** on buys, sells, and transfers.
- The tax is redistributed **proportionally to all holders in ETH** ("reflections").
- Key selling line: *"Receive wETH straight to your wallet by just holding without claiming, staking, or farming."* — i.e., rewards arrive as WETH automatically, no claim step.
- "The more $ETHPrinter you hold and the more market activity, the more ETH you receive."
- Secondary engine: a **Treasury / Reserve Fund** (staking, yield farming) targeting **32 ETH** to spin up an Ethereum **validator node**, whose rewards also flow to holders — pitched as "perpetual ETH printing independent of trading volume."

### Site structure (section order)
1. Nav: Home / About / Community / Uniswap / DexScreener / Whitepaper
2. **Hero** — "Welcome To [$ETHPrinter]", tagline *"Print $ETH nonstop, powered by Base."*, brrr copy, contract address displayed prominently
3. **Mission/About** — "Build the biggest $ETHPrinter in the world on Base…"
4. **Tokenomics** — 5% tax → reflections; 1B supply; allocation: 40% presale, 19–20% locked LP, 5% founders (capped 1%/founder), 5% buybacks/LP, 6% marketing, 25–35% treasury
5. **Pillars** — ETH Reflections / Reserve Fund / Validator Node Launch / Decentralized Governance
6. **Roadmap** — Phase 1 Foundation & Growth (launch, reflections, staking pool 10→20→32 ETH), Phase 2 Decentralization (validator node, DAO), Phase 3 Sustainability ("$ETH Forever" initiative, audit)
7. **Whitepaper download** (PDF)
8. **FAQ** — grouped: General / Security & Concerns / Launch & Presale / Treasury & Validator / Community & Governance
9. **Footer** — X-Twitter, Telegram, YouTube; "Copyright © 2025 | Powered by ETHPrinter"

### Copy tone
Hype-meme but earnest: "ready to go brrr", "golden ticket to nonstop ETH rewards", "when we print, we print $ETH — forever", mixed with sober sustainability/treasury language in FAQ. Money-printer meme (BRRR) is the central metaphor.

### Color scheme
**Light theme** (WordPress/Elementor build): white/#fbfbfb backgrounds, #111 text, Ethereum-blue accents (#046bd2 / #045cb4), slate grays. Note: our brief calls for dark theme + printer green, so HOODPrinter intentionally diverges here.

## 2. Robinhood Chain

### Sources
- Docs: https://docs.robinhood.com/chain/ and https://docs.robinhood.com/chain/connecting/
- Marketing: https://robinhood.com/us/en/chain/
- Arbitrum blog (mainnet announcement): https://blog.arbitrum.io/robinhood-chain-mainnet/
- Arbitrum Portal listing: https://portal.arbitrum.io/?orbitChain=robinhood
- Blockscout: https://www.blog.blockscout.com/build-on-robinhood-chain-with-the-blockscout-pro-api/

### Status
- **Mainnet live as of July 1, 2026** (public testnet before that hit 4M transactions in week one).
- Arbitrum Orbit L2 on Ethereum; Ethereum blobs for DA; **ETH is the native gas token**; ~100 ms block times; sub-cent gas. Focus: tokenized stocks / onchain finance.

### Network parameters (mainnet)
| Field | Value |
|---|---|
| Chain ID | **4663** |
| Currency | ETH |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` (rate-limited) |
| Recommended RPC | Alchemy `https://robinhood-mainnet.g.alchemy.com/v2/{KEY}` |
| Explorer | `https://robinhoodchain.blockscout.com` (Blockscout) |

Testnet: chain ID 46630, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `explorer.testnet.chain.robinhood.com`.

### Bridging
Canonical **Arbitrum bridge** plus third-party cross-chain routes; listed on the Arbitrum Portal.

## 3. Build decisions derived from research
- Mirror ETH Printer's concept & section flow (hero w/ contract, how-it-works reflections, tokenomics, roadmap-lite folded into tokenomics, FAQ groups, socials footer) with original code and copy.
- Mechanic for $PRINT: 5% tax → ETH reflections to holders, auto-paid, no claiming — same explanation style ("hold = get paid ETH").
- Dark theme, printer-green accent (#00C805 family) per brief; no Robinhood logo/feather, explicit non-affiliation disclaimer.
- How To Buy must cover: get ETH → bridge to Robinhood Chain (Arbitrum bridge, chain ID 4663) → add network to wallet → DEX swap (PLACEHOLDER_BUY_LINK).
