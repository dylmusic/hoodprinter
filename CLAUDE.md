# HOODPrinter — Project Context

$PRINT is an ETH-reflection meme token on **Robinhood Chain**. The site is a
Next.js 14 (App Router) app on Vercel. Repo: `dylmusic/hoodprinter` (branch
`main`). **Standing rule: commit AND push after every change.** End commit
messages with the Claude co-author trailer for whichever model is working
(e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

The flagship products right now: the **Buy Bot** (`/print`), **RWA Pools**
(`/rwa`), the **Swap** page (`/swap`), and the **native $PRINT airdrop
signup** (`/airdrop`). **$PRINT is LIVE and trading**
(`PRESALE_ACTIVE=true` in `site.config.ts`) — every primary CTA sitewide is
"Buy Now" pointing at `PRESALE_LINK`, which is **`/swap`** (our own page, not
an external link — see Swap section below), not the old airdrop/"Level Up"
framing. The GemPad presale itself never launched — it was superseded by a
based.bid fair launch, which sold out and bonded into live trading.

---

## Build / run / deploy

- **Node 20 required** (repo default node is v18). Always prefix:
  `export PATH="/usr/local/opt/node@20/bin:$PATH"` before `npm run build`/`start`.
- Verify builds with exit code, not grep: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"`.
- Deploy = push to `main` (Vercel auto-deploys **production**). A plain
  "Redeploy" of an existing deployment does NOT reliably re-snapshot newly-added
  env vars — push a commit (even `--allow-empty`) to force a fresh prod build.
- **Canonical domain is `www.hoodprinter.xyz`** (apex 308-redirects to www).
  Hit www directly for API calls, especially POST.
- Env vars only apply to deployments created *after* they're added.

### True mobile screenshots (for verifying responsive fixes)
Headless `--screenshot` renders at ~800px and is MISLEADING. Use CDP device
emulation at 393px. A working script lives at the scratchpad as `mobshot.mjs`
(uses `Emulation.setDeviceMetricsOverride`, attaches to a fresh page target, not
the browser endpoint). Node 20 needs `--experimental-websocket`. Pattern:
`npm run start` on a port → launch headless Chrome w/ `--remote-debugging-port`
→ run mobshot.mjs. It can also click/scroll via injected JS args.

---

## On-chain (Robinhood Chain)

- chainId **4663** (hex 0x1237), RPC `https://rpc.mainnet.chain.robinhood.com`,
  explorer `https://robinhoodchain.blockscout.com`.
- $PRINT contract: `site.config.ts` → `PLACEHOLDER_CONTRACT_ADDRESS`
  (`0x6af5dB6f72E6030E71Ea9B45feD55CBD68A69b1d`, updated at fair launch
  2026-07-15 — the old `0x41E0…4B85` deploy is dead). **$PRINT has a 5% transfer
  tax** → buys need **≥7% slippage** (enforced in the bot; see below).
- Uniswap: V2 Router02 `0x89e5db8b5aa49aa85ac63f691524311aeb649eba`, V2 Factory
  `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f`, V3 Factory
  `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`, **Universal Router
  `0x8876789976dEcBfCbBbe364623C63652db8C0904`** (NO standalone SwapRouter02
  exists), WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.
- **This chain's Universal Router uses a NON-standard input layout** (path
  offset 0xc0 + an extra trailing empty-bytes field at 0x120). Wrong layout →
  `SliceOutOfBounds()` (0x3b99b53d). The bot routes BOTH V2 and V3 through the
  Universal Router transparently — no pair address ever required.
- Curated tokens: ARROW/CASHCAT/HOODRAT are V2; JUGGERNAUT is V3.

## Redis (Upstash / Vercel KV)

- Client in `lib/stats.ts` (`getRedis`) reads `UPSTASH_REDIS_REST_URL/TOKEN`
  or `KV_REST_API_URL/TOKEN`. Free tier: 500K cmds/mo, 256MB.
- **GOTCHA: Upstash auto-parses numeric-looking hash values into numbers**
  (`"1"`→`1`, `"0"`→`0`). Always coerce with `String(...)` before comparing or
  using `|| ""` on hash reads (this bit the airdrop export — see `lib/airdrop.ts`
  `readAllSubmissions`).
- Platform stats are CDN-edge-cached so many tabs collapse to ~1 Redis read per
  interval (`/api/stats` no-wallet response: `public, s-maxage=4, swr=30`).
  Per-wallet responses are `private, no-store`.

---

## Buy Bot — `components/PrintBot.tsx` (+ `/print` page)

Auto-buys any Robinhood Chain token from a **dedicated in-browser wallet** (key
generated + stored locally; NEVER call it a "throwaway" wallet — user corrected
this). Key never leaves the browser; txs go straight to RPC.

- **Spam mode**: reserves nonces locally (synchronous, before any await),
  fire-and-forget broadcast, background `tx.wait()` confirmation, self-heals
  nonce gaps by resyncing from chain.
- **Routing**: `detectRoute()` checks V2 factory getPair, else V3 pool across
  fee tiers [10000,3000,500,100]. Always sends via Universal Router
  (`buildV2Calldata`/`buildV3Calldata`). After 5 consecutive fails → "buying
  failed, check your settings" modal + stop.
- **$PRINT slippage rule**: `PRINT_MIN_SLIPPAGE = 7`. An effect forces slippage
  ≥7% whenever $PRINT is the selected token (only raises, never lowers). $PRINT
  buys are still gated with a "coming soon → join Telegram" modal.
- **Balance/gas guards**: won't start if balance ≤ buy amount; stops when out of
  funds; ETH withdrawal leaves `gasPrice × 21000 × 5` for gas.
- **Branded modal system** replaces ALL native browser popups (no
  `alert`/`confirm`/`prompt` anywhere). `showAlert` / `showConfirm` /
  `showPrompt` (text input) / success cards. Forget-wallet forces DOWNLOAD then
  DELETE PERMANENTLY.
- **UI**: single top "Start buying" button (bottom duplicate removed); logo
  links back to `/`; wallet address is tap-to-copy; header stats pill
  (TOTAL BUYS / ETH VOLUME) with gold-pulse count-up; trending row (auto-scrolls
  on mobile to hint swipe); recents row + "+" add-by-CA modal; **hourly cost
  estimate** (ETH spend/gas/total per hr, USD under each via CoinGecko, plus
  projected runway from balance ÷ burn rate); LIVE monitor panel (has ETH/hr +
  Runway tiles); XP **level bar**: Bronze 100 / Silver 1,000 / Gold 10,000 /
  Platinum 100,000 / Diamond 1,000,000 buys, "Level up to earn rewards. Coming
  soon."
- Custom window events wire PrintBot ↔ PlatformStatsNote: `hoodprint:buy`
  (each confirmed buy) and `hoodprint:running`.

### Buy stats + wallet levels (airdrop-ready)
- `app/api/buy/route.ts`: POST verifies the tx on-chain, dedupes by hash,
  attributes the bought token, calls `recordBuy` (`lib/stats.ts`).
  **Token attribution**: client sends the targeted CA (`token` in reportBuy);
  server only trusts it if the receipt logs contain a Transfer of that token
  to the buyer (UR `execute()` calldata isn't decodable the legacy way);
  falls back to the old direct-router calldata decode.
- `lib/stats.ts` keys: `stats:buys`, `stats:eth`, `wallet:<addr>:buys`,
  `wallet:<addr>:eth`, `seen:<txHash>`, `tokens:*`, `wallets:bybuys`
  (sorted set, score = buy count → the wallet leaderboard / airdrop index),
  plus funnel/time-series: `wallets:created` (zset, score = first-seen ms,
  ZADD NX so re-reports keep FCFS), `stats:visits:<YYYY-MM-DD>`,
  `stats:buys:<YYYY-MM-DD>`, `stats:eth:<YYYY-MM-DD>`,
  `wallet:<addr>:first_buy` (NX ms), `ip:<scope>:<ip>` throttles.
- **Wallet-creation tracking**: `POST /api/wallet` `{address}` → 
  `recordWalletCreated` (address only — the private key NEVER leaves the
  browser); `{type:"visit"}` → daily /print landing bucket. PrintBot reports
  from the pk-sync effect (covers new/imported/restored wallets — existing
  users backfill on next visit), deduped per device via localStorage
  `hoodprint:wallet_reported`.
- `RANKS`/`tierFor()` mirror the UI ladder. `readAllWallets()` +
  `backfillWallets()` (one-time seed of pre-index wallets — already run once).
- **Buy-fail churn** (P3 done): bot POSTs `{type:"buy_fail"|"buy_stop"}` to
  /api/wallet → `stats:buy_fails[( :<day>)]` / `stats:buy_stops` counters.
  Anonymous + unverifiable — directional only, never leaderboard input.
- **Multisend telemetry**: `POST /api/multisend` once per completed run →
  `ms:runs` (last 500 JSON), `ms:senders` (FCFS zset), `ms:sender:<a>:txs`,
  `ms:tokens(+:sym)`, `stats:ms:runs/txs(+:<day>)`. /multisend mount pings
  `stats:visits:ms:<day>`. Airdrop signups bucket into `stats:airdrop:<day>`.

---

## RWA Pools — `/rwa` (`components/RwaPools.tsx`, `lib/rwaPools.ts`)

Second flagship angle alongside the Buy Bot, shipped 2026-07-22: $PRINT's ETH
reflections deployed as liquidity paired against Robinhood Chain's real
tokenized Stock Tokens (NVDA/TSLA/SPCX/AAPL/MSFT — verified real contracts via
on-chain `symbol()` calls, not invented). Dashboard shows platform-wide stats
(ETH distributed, TVL, pools live) + 5 pool cards. **Everything is currently
zero on purpose** — no $PRINT/RWA pool exists on-chain yet, confirmed via V2
factory `getPair`. Deposit/Withdraw open a coming-soon modal → Telegram, not a
disabled button or waitlist form. Full narrative/rationale in the
`hoodprinter-rwa-pools` memory file — don't re-litigate the "why RWA" framing,
it's deliberate and Dylan-approved.

Homepage hero, roadmap (new Phase 04), and site.config.ts tagline/description
all lead with this RWA framing now. Buy Bot and Multisend were explicitly left
untouched during this rebrand — additive only.

---

## Swap — `/swap` — THE primary buy destination sitewide

**INCIDENT (2026-07-24): Relay's routing was hitting the wrong on-chain pool
for $PRINT.** There are THREE ETH/PRINT Uniswap V4 pools on Robinhood Chain
(PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`, confirmed by
querying `Initialize` events filtered by currency0=native ETH,
currency1=$PRINT) — only `0xf19f1556acc8cabf39a9632002a92877852031148d4d1deb0144dffa4ee27075`
has our tax hook (`0x9c274C45083cf90A92e1DFB5041F094c3A8D90Cc`) and real
liquidity; the other two (`0x524c6cd6...`, `0xf83b6c1b...`) are hookless
decoy pools with near-zero depth. Relay's quotes were landing on a decoy —
confirmed empirically: quoted rate was ~1.29M PRINT/ETH vs the real pool's
~83M+ per DexScreener (a ~65x gap), and the "impact" stayed flat at ~-98%
regardless of trade size from $0.18 up, which is the signature of a wrong
reference pool, not real slippage. **Relay's public API has no way to pin a
specific pool** — `includedSwapSources`/`excludedSwapSources` only filter by
DEX name ("uniswap" covers all three pools identically), and forcing
`includedSwapSources: ["uniswap"]` returned `NO_SWAP_ROUTES_FOUND` outright
(same-chain quotes here don't even go through that filter).
**Fix: `/swap` now uses `components/PrintDirectSwap.tsx`** — a deliberately
basic ETH-only-to-$PRINT-only swap that hand-builds a Universal Router
V4Router transaction against the KNOWN-correct pool (`lib/printDirectSwap.ts`
has the full `PoolKey` — fee is Uniswap's `DYNAMIC_FEE_FLAG` 0x800000 since
the hook sets the real fee/tax at swap time, tickSpacing 200). Live price
for the output preview and slippage protection comes from DexScreener's API
(indexes this exact pool), not Relay. The 0.85% fee is now a plain ETH
transfer to `RELAY_FEE_RECIPIENT` sent as its own transaction *before* the
swap transaction (two signatures total) rather than Relay's `appFees`
mechanism, since we're bypassing Relay entirely for this pair.
**`components/SwapEmbed.tsx` (the full Relay-embedded any-token/any-chain
widget) is untouched, just not rendered on `/swap` right now** — swap it
back in once Relay fixes their pool selection for this token. Everything
below this paragraph describes SwapEmbed and is accurate for when it's
re-enabled, not for the current live page.

`components/SwapEmbed.tsx`. Shipped live 2026-07-24: in SiteNav (home variant
— replaced "How It Works"), in the sitemap, indexable, BETA badge on the page
only (not the nav link). **`site.config.ts` `PRESALE_LINK = "/swap"`** — every
buy button sitewide (announce bar, hero CTA, nav "Buy Now" desktop+mobile,
How It Works step 4, roadmap Fair Launch link) reads from this one constant,
so they all point here now instead of out to relay.link directly. That's the
entire point: collect the 0.85% fee on every buy intent on the site instead
of giving that traffic away. All these buy links dropped `target="_blank"`
too since it's an internal route now. Exists because $PRINT's real liquidity
is a Uniswap V4 pool with a hook enforcing the 5% trade tax, which a plain
swap UI can't account for (miscalculates output, reverts or shorts the user).

**Architecture — embeds Relay's own `SwapWidget`, doesn't hand-roll a UI.**
First pass hand-rolled a quote UI calling Relay's REST API directly (still in
git history) — replaced entirely with `@reservoir0x/relay-kit-ui`'s real
`SwapWidget` component per Dylan's direction ("they have all the sick
crosschain stuff... rely on the relay interface more"). This gets Relay's
actual cross-chain UI (any of 85+ origin chains → $PRINT on Robinhood Chain
in one step), not just same-chain ETH swaps.

- **Package scope matters**: use `@reservoir0x/relay-kit-ui` (React 18-
  compatible), NOT `@relayprotocol/relay-kit-ui` (their newer scope, requires
  React 19 — this app is Next 14/React 18 and upgrading the whole framework
  just for a swap widget is out of scope). Docs at docs.relay.link show the
  `@relayprotocol` examples; the actual installed/working package here is the
  `@reservoir0x` one — same protocol/backend, older React-compat UI release.
- **Wallet connect**: RainbowKit (`getDefaultConfig` + `RainbowKitProvider` +
  `useConnectModal`), NOT a hand-rolled connect picker — a first attempt at a
  custom "Browser Wallet / WalletConnect" button picker was unreliable and
  got ripped out. RainbowKit is what Relay's own docs pair with `SwapWidget`.
  Bridge to Relay: `wallet={adaptViemWallet(walletClient)}` from wagmi's
  `useWalletClient()`.
- **WalletConnect Project ID gotcha**: `getDefaultConfig` requires a non-empty
  `projectId` string. A genuinely empty string **crashes it outright**
  (tested). Until `WALLETCONNECT_PROJECT_ID` (site.config.ts) is set to a
  real ID from cloud.reown.com, we pass a dummy placeholder
  (`"00000000...")` — this works but spams harmless 403s against Reown's
  remote-config endpoint (falls back to local defaults). Injected/browser
  wallets work fully either way; only WC-based wallets in the modal need the
  real ID.
- **Chain list**: wagmi's `chains`/`transports` config AND `RelayKitProvider`'s
  `options.chains` are both built dynamically from Relay's live `/chains` API
  (`lib/relayChains.ts`, `fetchRelayEvmChains()`) — every EVM chain Relay
  supports, not hand-maintained or curated down. An earlier version scoped
  `options.chains` to a curated ~15-chain subset because leaving it fully
  unset caused a real bug — Robinhood Chain got buried under generic global-
  trending tokens with no "Robinhood Chain" label anywhere, reading as the
  widget defaulting to mainnet ETH instead of Robinhood Chain's ETH.
  Curating to a small explicit list fixed the labeling, but also
  (unintentionally) restricted the whole page to only those ~15 chains —
  Dylan wants full any-token/any-chain functionality (see Default pair
  below), so it's now the FULL fetched list instead of a subset. The
  labeling fix turned out to depend on Robinhood Chain being *explicitly
  included* in a non-empty `options.chains` array, not on the array being
  *small* — passing the full list (which still includes 4663) keeps the
  labeling correct while restoring full breadth.
- **Fee**: 0.85% on every swap via Relay's native `appFees` mechanism, set in
  `RelayKitProvider options.appFees`, credited to `RELAY_FEE_RECIPIENT`
  (site.config.ts) — accrues off-chain as a USDC balance, claimable via
  `api.relay.link/app-fees/<address>/balances` + `/claim`, NOT sent live
  per-trade. `RELAY_API_KEY` is set in Vercel (Production) but is currently
  **unused dead config** — it was needed for the deleted server-proxy
  architecture (`/api/relay/quote`, now removed), the embedded-widget
  architecture calls Relay directly client-side and doesn't need it.
- **Default pair, not a locked pair**: ETH → $PRINT on Robinhood Chain
  (matches `relay.link/bridge/robinhood?toCurrency=...&fromChainId=4663`)
  is just the pre-filled default on load — neither `fromToken` nor `toToken`
  is locked (`lockToToken` was removed on purpose; Dylan: "let them swap any
  token for any token on our page using the full relay functionality").
  `defaultAmount="0.01"` is still required — omitting it crashes the widget
  on mount (`Value.InvalidDecimalNumberError` parsing an empty string).
- **Theming gotchas (Relay uses Panda CSS, not all of it is theme-able via
  their typed `theme` prop)**: fixed TWO separate hardcoded light-gray Panda
  utility classes in the "Select Token" modal, found via live CDP
  (`CSS`/`Runtime.evaluate` walking `getComputedStyle` up the DOM) inspection
  since neither is exposed through `RelayKitTheme`'s dropdown/modal/widget
  keys — `.relay-bg_gray3` (the chain-list sidebar background) and
  `.relay-bg_gray6` (the *currently-selected* chain's highlight — a
  different class, found separately) — both overridden in `globals.css`
  with `!important` since the modal portals to `<body>`, outside any of our
  own scoped containers. The token-pill background also needed an explicit
  `widget.selector` override (not covered by the base palette) or its text
  is invisible.
- **Card frame**: `.swap-card`'s decorative top accent bar (`::before`) must
  use `width: fit-content` on the card, not `width: 100%`/stretch — the
  widget has its own intrinsic width and doesn't stretch to fill a wider
  parent, so a stretched frame visibly overhangs past the actual widget.
- **Post-swap "crash" is actually the success screen**: the widget reliably
  throws a render error during its own post-swap state reset (confirmed —
  fires after every completed swap, not an edge case; not something we
  control/can patch, it's bundled/minified). Wrapped in a local React error
  boundary (`SwapErrorBoundary` in SwapEmbed.tsx, `key`-bump remount) so
  Next's page-level boundary can't blank the whole page over it — and since
  it's 100% reliable, the fallback IS the success UI: checkmark icon,
  "Swap successful!", "Swap again" button. `onSwapSuccess` on `SwapWidget`
  captures the completed tx hash into `InnerSwap`'s own state (survives the
  widget crashing/unmounting) to show a "View transaction" explorer link
  when the swap landed on Robinhood Chain.
- **webpack**: `next.config.mjs` aliases `@x402/*` to `false` — `wagmi/
  connectors`' barrel export pulls in a Coinbase "Base Account" connector we
  don't use, which statically imports `@coinbase/cdp-sdk`'s optional x402
  payment modules that aren't installed. Safe to stub; nothing reaches them.
- Removed `@walletconnect/ethereum-provider` (superseded by RainbowKit/
  wagmi's own connectors) and the old hand-rolled `lib/lifi.ts`/LI.FI
  integration entirely (LI.FI had no sell-side route for $PRINT at all;
  Relay routes both directions).

---

## Site navigation

`components/SiteNav.tsx` (client) is THE nav for home/roadmap/airdrop/media/
multisend — don't hand-roll `<nav>` blocks on pages anymore. `variant="home"`
= Swap/RWA Pools/Roadmap/Airdrop/Tools/FAQ ("How It Works" was replaced by
the "Swap" link, plain text no badge); default `"sub"` = Home/**Swap**/**RWA
Pools**/Roadmap/Airdrop/Tools — same set as home minus "FAQ" (a homepage
section anchor that doesn't resolve from other pages), plus "Home" for
wayfinding. Both variants got Swap+RWA Pools as of 2026-07-24 — sub pages
used to only show Home/Roadmap/Airdrop/Tools, which buried the two
highest-priority pages behind the Tools dropdown; fixed for consistency.
**RWA Pools is a top-level link** (with its own BETA badge) both desktop
and mobile, not tucked in the Tools dropdown. The **Tools dropdown**
groups product pages (RWA Pools BETA, Buy Bot BETA, Multisend NEW) — add
future tools there, not as top-level links. The "Tools" trigger itself has
no badge (only individual dropdown items do). Mobile (≤720px) hides text
links + the Tools trigger; only logo/socials/Buy Now remain. `/print` and
`/multisend` both show SiteNav on top plus the small pb-logo above their H1
— matching tool-page headers; `/swap` matches this pattern too, plus a BETA
badge next to its own H1 (page only, not the nav link).

## Multisend — `/multisend` (PUBLIC since Jul 2026)

`components/MultiSender.tsx`. Indexed + in sitemap, bespoke `og-multisend.png`
(product-card style), WebApplication JSON-LD, SEO about-section targeting
"robinhood chain multisend / disperse" searches.
Contract-free disperse (the canonical
disperse.app contract is NOT deployed on this chain — verified via
eth_getCode): sequential `transfer()` txs in waves of 25 with locally
reserved nonces, shares the Buy Bot's wallet (`hoodprint_burner_pk`).
Paste `address[, amount]` lines; per-line amounts override a default;
dedupe + unparseable reporting; preflight = token balance, ETH-for-gas,
and a test `estimateGas`; stop-between-waves + failure retry.
**$PRINT contract facts (from verified source, RewardToken.sol):**
wallet→wallet transfers are NOT taxed (5% only on AMM buys/sells via
`automatedMarketMakerPairs`); BUT `require(tradingStartedAt > 0)` makes
transfers revert pre-launch unless sender or recipient is in
`isExcludedFromFee` — owner must call `excludeFromFee(sender, true)`
before any pre-launch airdrop. Transfers also run the dividend tracker
(`process(gas)`), so $PRINT transfers are gas-heavy → gasLimit comes
from estimateGas +30%, never a flat constant.

## Airdrop system — native, in our own DB (Google Forms replaced)

- **Form**: `components/AirdropForm.tsx` on `/airdrop` (replaced the Google
  Forms iframe). Fields (kept the "silly" presale questions ON PURPOSE — they
  force users to absorb presale info): Robinhood ETH address, Telegram username,
  joined Telegram, GemPad presale check (considering/farming), ETH-into-presale
  (0/0.01/0.1/0.3), X follow+repost, and **beta-awareness** (aware/free). Live
  "you'll be #N" count + success card showing rank + tier.
- **Storage**: `lib/airdrop.ts`. `airdrop:order` sorted set (score = first-seen
  ms) preserves **first-come-first-served** order for the BIG (first 100) /
  SMALL (first 1000) tiers; dedupe by lowercased address keeps original rank;
  answers in `airdrop:sub:<addr>` hash. `POST /api/airdrop` validates + soft
  per-IP hourly throttle; `GET /api/airdrop` returns live count.
- **Migration**: the old Google Form CSV (19 unique signups) was imported via
  `POST /api/export?import=airdrop&key=SECRET` (raw CSV body), seeded oldest-
  first so early signers keep low ranks. Native form signups append after them.
- X follow+repost link: `X_LAUNCH_POST` in AirdropForm
  (`.../status/2075759741217739206`).

## Admin data export — `app/api/export/route.ts`
Gated by **`STATS_ADMIN_KEY`** env var (set in Vercel; value
`hoodprint_admin_9x7k2mQp4vRt8`).
- `GET ?key=SECRET` → buy-bot wallets CSV (`address,buys,eth_volume,tier`);
  JSON form includes `walletsCreated`, CSV form carries it in an
  `x-wallets-created` response header.
- `GET ?key=SECRET&dataset=airdrop` → airdrop CSV in FCFS order
  (`rank,address,telegram,joined_telegram,gempad_checked,presale_eth_intent,x_followed,beta_aware,tier,submitted_at`).
- `GET ?key=SECRET&dataset=wallets_created` → every bot wallet ever seen,
  first-seen order (`address,created_at_iso,has_bought,buys`); JSON form adds
  a `neverBought` count.
- `GET ?key=SECRET&dataset=multisend` → runs CSV; `&format=json` adds senders.
- `GET ?key=SECRET&dataset=summary` → one-shot JSON of EVERY platform counter
  (buys/eth + today, visits per tool, wallets created, buyers, airdrop count,
  multisend runs/txs/senders, buy fails/stops). THE quick health check.
- `&format=list` → plain address-per-line text, paste-ready for /multisend
  (default = buyers, `dataset=airdrop` FCFS + `&limit=N`, `dataset=wallets_created`).
- `?format=json`, `?backfill=1` (wallet index seed).
- `POST ?import=airdrop&key=SECRET` with raw CSV body → migrate old signups.

Current state (last checked 2026-07-11 late): **112 airdrop signups**,
**35 wallets created**, 3 buyer wallets (2,291 buys / 0.0507 ETH total),
163 /print visits today. Growth is real — check `dataset=summary` for live
numbers instead of trusting this snapshot.

---

## Analytics / Search Console

`site.config.ts` → `GA_MEASUREMENT_ID` (GA4 gtag snippet in layout.tsx via
next/script) and `GOOGLE_SITE_VERIFICATION` (GSC HTML-tag meta). Both empty =
nothing rendered. Mirrors RemoteWorkUnion's setup (its GA is `G-J84MSTXMXF` —
NEVER reuse it here; hoodprinter needs its own GA4 property). Waiting on
Dylan to create the GA4 property + GSC property and supply the IDs
(as of 2026-07-11).

## Site pages & metadata

- `app/page.tsx` (home): `PRESALE_ACTIVE=true` — nav CTA is "Buy Now" →
  `PRESALE_LINK` everywhere (not "Level Up"/airdrop framing). Hero is 3
  buttons only (Dylan: "5 is too many and crowded"): "Buy $PRINT" + "Chart"
  (DexScreener link) side by side in `.hero-ctas-top`, "RWA Pools BETA" as a
  full-width button below matching their combined width
  (`.hero-rwa-full`) — all wrapped in `.hero-cta-group`. `LaunchCountdown`
  and `FairLaunchModal` components were both deleted once trading went live
  (no more pre-launch countdown/sold-out messaging needed).
- Each page has its own OG image + title/description (all absolute via
  `metadataBase`): home `og.png`, `/print` `og-print.png?v=2` (bespoke Buy Bot
  card — BETA badge + feature chips, NOT the generic centered template),
  `/roadmap` `og-roadmap.png`, `/airdrop` `og-airdrop.png`. Twitter site+creator
  `@HOODPrinterxyz`. Sitemap includes all four.
- OG/brand PNGs are generated by `scripts/render-assets.mjs` (`npm run assets`,
  uses `sharp`). Bump the `?v=` when you change an OG image so crawlers refetch.
- **Promo graphics**: `scripts/render-promos.mjs` renders 10 square 1080×1080
  cards into `public/brand/promo/` — promos 1–5 are the core $PRINT story,
  6–10 the Buy Bot pack (hero, spam-mode feed, rank ladder, $PRINT flywheel,
  beta CTA). No chain-ID anywhere (Dylan: pointless on socials).
- **`/media` — media kit page** (`app/media/page.tsx` + `components/MediaKit.tsx`,
  `.mk-*` styles in globals.css, own `og-media.png`, in sitemap, linked from the
  home footer). Sections: logos/PFP, banners, story promos, Buy Bot pack, OG
  link cards, and six ready-to-post tweets (copy + `x.com/intent/post` links).
  "Download everything" serves `public/brand/hoodprinter-media-kit.zip` —
  **rebuild that zip whenever brand assets change** (folders: logos/, banners/,
  promos/, link-cards/). **Section order is infographics-first on purpose**
  (Dylan: "the infographics are the most important content"): story promos →
  Buy Bot pack → banners → link cards → one compact logo strip → tweets. The
  logo gets ONE `.mk-logo-card` box with three download buttons, not a grid of
  variants. `logo-icon-hood.svg` was deleted permanently (Dylan hated it) —
  never recreate it.
- **Buy Bot story on the site**: homepage `#utility` section ("Reflections that
  reload") + a Buy Bot FAQ weave the bot into the reflection narrative — the
  angle is the flywheel: hold $PRINT in the bot wallet → 5% tax pays it ETH →
  the bot spends those reflections on auto-buys. Keep bot marketing light;
  ETH rewards / 5% tax / reflections stay the headline story.
- `components/RoadmapTimeline.tsx`: Phase 02 "The Buy Bot" (Beta Testing =
  active/yellow, etc.); GemPad Presale item softened to upcoming, no live link.

## Mobile CSS gotcha (recurring)
Media-query rules don't add specificity — a later, equal-specificity base rule
overrides an earlier `@media` override (source order wins). This shadowed the
mobile `.pb-head h1` and the `.pb-tile-wd` withdraw buttons. Fix at the base
rule (e.g. `clamp()`), or raise the override's specificity.

---

## Related memory files
`~/.claude/projects/-Users-dylanrhodes-Documents-hoodprinter/memory/`:
`hoodprinter-github-vercel`, `hoodprinter-onchain`, `hoodprinter-buy-stats`,
`hoodprinter-airdrop-signups`, `hoodprinter-rwa-pools`, `hoodprinter-swap-relay`,
`always-push-to-github`.
