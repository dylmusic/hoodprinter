# HOODPrinter — Project Context

$PRINT is an ETH-reflection meme token on **Robinhood Chain**. The site is a
Next.js 14 (App Router) app on Vercel. Repo: `dylmusic/hoodprinter` (branch
`main`). **Standing rule: commit AND push after every change.** End commit
messages with the Claude co-author trailer for whichever model is working
(e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

The two flagship products right now: the **Buy Bot** (`/print`) and the
**native $PRINT airdrop signup** (`/airdrop`). The GemPad presale is **paused**
(delayed) — all presale CTAs are swapped to "Level Up" / airdrop until it's live.

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
  (`0x41E0bA8940C753d348c437d7E3D901956Cc94B85`). **$PRINT has a 5% transfer
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

## Site navigation

`components/SiteNav.tsx` (client) is THE nav for home/roadmap/airdrop/media/
multisend — don't hand-roll `<nav>` blocks on pages anymore. `variant="home"`
= section anchors + Roadmap/Airdrop/Tools/FAQ; default `"sub"` = Home/Roadmap/
Airdrop/Tools. The **Tools dropdown** groups product pages (Buy Bot BETA,
Multisend NEW) — add future tools there, not as top-level links. Mobile
(≤720px) hides text links + the Tools trigger; only logo/socials/Level Up
remain. `/print` and `/multisend` both show SiteNav on top plus the small pb-logo above their H1 — matching tool-page headers.

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

- `app/page.tsx` (home): nav has "Level Up" → `/print` + "Buy Bot BETA" link;
  green top **announce bar** "Sign Up For FREE Pre-Launch Airdrop" → `/airdrop`
  (home only); hero CTA "Level up before $PRINT drops" → `/print`. Presale
  kicker bubble + banner removed. `PRESALE_ACTIVE=false` hides presale copy.
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
`hoodprinter-airdrop-signups`, `always-push-to-github`.
