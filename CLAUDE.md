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
  ≥7% whenever $PRINT is the selected token (only raises, never lowers).
- **$PRINT buys are live** — Dylan: "make sure that the buy bot only hits our
  designated LP for $PRINT, and then enable it." `detectRoute()` short-
  circuits to `{kind: "v4-print"}` for PRINT's own address *before* either
  factory is ever queried (PRINT has no V2/V3 pool at all — this just
  guarantees there's no code path by which a PRINT buy could land anywhere
  but our known pool). `sendBuyNoWait` builds that leg via
  `buildBuySwapParts()` (shared with `/swap`'s `lib/printDirectSwap.ts`, so
  the actual V4Router encoding only exists once), `quotePrintMinOut()`
  computing the floor from the same StateView rate + 5% tax math `/swap`
  uses. **Fee-free** (`skimFee: false`) — Dylan's call, so buying PRINT
  through the bot costs the same as buying anything else through it, unlike
  `/swap` where every PRINT leg pays 0.85%. **Bypasses the HOODPrinter Buy
  Router for this token only** — V2/V3 SWAP commands encode an explicit
  `recipient` so they deliver correctly no matter who calls `execute()` on
  the buyer's behalf, but V4's `TAKE_ALL` has no such field; on `/swap`
  that's safe because the user's own wallet calls Universal Router
  directly, but through BuyRouter, `msg.sender` would be BuyRouter's own
  address — not a risk worth taking without a funded wallet available to
  verify it, so PRINT buys go straight to the Universal Router instead
  (losing BuyRouter's on-chain attribution for this token only, not the
  site's own Redis stats, which verify via receipt logs regardless of
  which contract was called). Also bumped the bot's gas-buffer estimate
  for PRINT specifically (`PRINT_GAS_UNITS_ESTIMATE = 600000n`) — a real
  V4 buy against the taxed pool measured ~558k gas live via `estimateGas`,
  nearly 3x the bot's generic 200k assumption, which would have under-
  reserved the $1 safety floor's gas cushion for this token. Verified via
  the same round-trip-decode discipline used throughout `/swap` (no funded
  wallet available in-session for a real signed test) plus a live click-
  through confirming the old "$PRINT is coming soon" gate no longer
  appears and the 7% slippage floor still fires correctly.
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
- **Pinned tokens**: `PINNED_TOKENS` is PRINT then CASHCAT, always shown
  first in the quick-select row. ROBINFUN was removed from
  `DEFAULT_RECENTS` and replaced with PONS earlier (commit `bf8b416`) —
  confirmed zero remaining references anywhere in the repo before Dylan
  asked to remove it again 2026-07-26, so that part was already done.
  **Default token defaults to $PRINT now** (Dylan: "set default to
  PRINT") — `token` state's initial value changed from `""` to
  `PRINT_TOKEN` so a first-time visitor lands with $PRINT's contract
  already filled into "Token to buy" and the 7% $PRINT-tax slippage floor
  already applied, no manual selection needed. The localStorage restore
  effect was hardened alongside this (`s.token.trim()` check, not just
  `typeof === "string"`) so a stray saved empty string from an old visit
  can't stomp the new default back to blank — returning users who already
  picked a real token are unaffected either way.
  **Turned out Dylan was still seeing ROBINFUN anyway** — not from the
  app's own list (already confirmed clean), but from his OWN browser's
  saved recents row (`hoodprint_recent_tokens` localStorage key, per-user,
  independent of `DEFAULT_RECENTS`/`PINNED_TOKENS` — a token clicked once
  gets remembered there via `addRecent()` and stays until manually
  cleared). Fix: bumped `RECENTS_STORAGE_KEY` to `hoodprint_recent_
  tokens_v2`, forcing every browser's saved recents row to reset on next
  load. Dylan flagged the risk directly before I touched anything —
  "is that gunna dump all of the local storage they have? thats really
  bad then. especially we cant lose their wallets" — confirmed and showed
  him the four keys involved are fully independent (`hoodprint_burner_pk`
  the wallet, `hoodprint_settings`, `hoodprint_txs`, and the recents key)
  before making the change. **The old key is left in place, just
  unread/unwritten** — nothing is deleted, only orphaned. Verified live
  with a seeded fake wallet key + settings + tx history + an old-key
  ROBINFUN entry, reloaded, and confirmed: old recents key still holds
  the ROBINFUN data untouched, the new key is empty (so it can never load
  into state again), and the wallet/settings/tx keys all survived
  byte-for-byte.
- **Selected-token pill lights up** (Dylan: "the buy bot needs to light
  up the currency you currently selected") — pinned/recents/defaults
  pills in `.pb-recents` had no active-state styling at all before this;
  `isSameToken(ca)` (case-insensitive compare against `token`) adds an
  `active` class (`.pb-recent.active` — solid green fill, `#04140a` text,
  same dark-on-green treatment as `.btn-primary`) to whichever pill
  matches. **Balance-tile order** (Dylan: "PRINT balance should be on the
  left with the currently selected token in the middle") — was ETH/PRINT/
  selected-token, now PRINT/selected-token/ETH. Since PRINT defaults to
  the selected token now (see above), the middle "selected token" tile
  only renders `!isPrintToken(token)` — otherwise it'd be a literal
  duplicate of the PRINT tile immediately to its left. Verified live both
  ways: PRINT-selected shows a clean 2-tile row (PRINT, ETH) with the
  PRINT pill lit; picking CASHCAT expands to 3 tiles (PRINT, CASHCAT,
  ETH) with the CASHCAT pill lit instead.

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

Homepage hero, roadmap, and site.config.ts tagline/description all lead with
this RWA framing now. Buy Bot and Multisend were explicitly left untouched
during this rebrand — additive only. **Roadmap reordered later (2026-07-25,
Dylan: "the RWA story is most important now")**: RWA Pools moved up to Phase
02 (right after Ignition, ahead of the Buy Bot) — was Phase 04. The
Multisender's old dedicated 3-item phase was removed entirely and folded into
a single "Multisend Tool Launched" milestone inside the Buy Bot phase (Dylan:
"multisend should just be a small step... it's not worth a whole section").
Phases renumbered straight through, 01–06 (Ignition, RWA Pools, The Buy Bot,
Launch, Expansion, Ascension) — no gaps.

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

**Fix: `/swap` now uses `components/PrintDirectSwap.tsx`, our own router.**
Not just an ETH↔PRINT-only patch anymore (2026-07-24 initial fix) — as of
2026-07-24 (later same day) it routes **any Robinhood Chain token to any
other**, styled after Relay's own "Select Token" picker (screenshots Dylan
supplied matched almost exactly — chain sidebar + search + result rows).
The rule that keeps this safe: **any leg touching $PRINT always goes
through our own hardcoded pool, never Relay, no matter what the other side
of the swap is.** Everything else is Relay's job. `components/SwapEmbed.tsx`
(the full pre-incident widget) is untouched, just unused — swap it back in
whole-hog only if Relay ever ships pool-level pinning. Everything from
"Architecture — embeds Relay's own SwapWidget" below describes SwapEmbed
and is background for if that ever happens, not the current live page.

**Router (`lib/robinhoodTokens.ts`, `lib/relayLeg.ts`, `lib/curatedPoolSwap.ts`,
`components/TokenPickerModal.tsx`, `components/PrintDirectSwap.tsx`
`planRoute()`)** — given `fromToken`/`toToken`, picks one of six plans:
  - `print-buy` (ETH→PRINT) / `print-sell` (PRINT→ETH): the original
    single-signature flow, unchanged.
  - `relay-only`: neither side is $PRINT — one Relay-routed leg (Relay's
    own headless SDK, `getQuote`/`execute` from `@reservoir0x/relay-sdk`,
    same package the old widget used, just called directly instead of
    through `SwapWidget` — this is Relay's own documented "headless"
    integration path, not a hand-rolled REST client). Our 0.85% fee rides
    this leg via `getQuote`'s `options.appFees` since there's no PRINT leg
    to take it on instead.
  - `curated-to-print` (CASHCAT/ARROW/HOODRAT → PRINT) / `print-to-curated`
    (PRINT → same): **self-routed, no Relay at all** —
    `lib/curatedPoolSwap.ts` builds the token↔ETH leg ourselves against
    these tokens' known Uniswap V2 pools (same addresses/venue
    `components/PrintBot.tsx`'s `detectRoute`/`buildV2Calldata` already
    route through), reusing the exact non-standard offset-plus-trailing-
    empty-bytes input layout this chain's Universal Router needs for every
    path-bearing command (confirmed it applies to `V2_SWAP_EXACT_IN` in
    the token→ETH direction too, not just the ETH→token direction PrintBot
    already proved). Built after a real CASHCAT→PRINT attempt via
    `relay-to-print` needed **3** confirmations instead of the promised 2
    (Relay's own quote for an ERC20 origin silently splits into an approve
    step + a swap step before our leg even starts) and then failed
    outright on the chain-registration bug above. Dylan's framing when
    asked whether to fix the Relay flow or replace it: *"Which ever method
    ENSURES that the ETH hits our correct PRINT pool... wouldnt it be
    better to make 0.85% off the relay pool anyway?"* — no: self-routing
    still takes the same 0.85% exactly once (via `PAY_PORTION` on the leg
    that touches $PRINT, identical to every other plan here), so also
    charging Relay's `appFees` on the token↔ETH leg would be **double**-
    charging one swap 1.7% total, not extra revenue. Deliberately still 2
    signatures rather than 1 fully-atomic tx: the V2 leg's real output
    isn't known exactly until it executes (only a guaranteed *minimum* via
    slippage), and hardcoding an assumed amount into a chained V4_SWAP
    step in the same tx risks *stranding* the difference in the router if
    the real fill is better than quoted — a fund-loss bug class, not just
    a revert. Two signatures with the real delivered amount read from a
    balance delta between them (same technique as `relay-to-print`) has no
    such risk, and removing Relay's own approve sub-step means it's a
    clean, honest 2 — not the 3 the Relay-routed version silently needed.
    JUGGERNAUT (V3) and everything without a known pool here still falls
    back to `relay-to-print`/`print-to-relay` — no verified V3 quoter
    contract on this chain to compute a safe minOut against yet.
  - `relay-to-print` (any other token → PRINT) / `print-to-relay` (PRINT →
    any other token): the fallback for tokens whose pool we don't control.
    **Always exactly two signatures, never charged a fee twice.** Leg 1
    gets the swap to/from plain ETH on Robinhood Chain via Relay, fee-free.
    Leg 2 is our own ETH↔PRINT pool tx, where the 0.85% fee is taken once
    (same `PAY_PORTION` mechanism as print-buy/print-sell below). The
    amount fed into leg 2 is measured from the wallet's own ETH balance
    delta across leg 1 (`getBalance` before/after, which nets out leg 1's
    own gas automatically) rather than trusted from Relay's quote — a
    worse-than-quoted fill on leg 1 can't leave leg 2 trying to spend ETH
    that never arrived.
  - `invalid`: same token both sides — submit button disables itself
    instead of building anything.
  - All four two-leg plans (`curated-to-print`/`print-to-curated` included)
    share the same `swap-waiting` step UI — see "2-signature step UI" below.
  - **Gas reserve between legs is estimated, not a flat guess, whenever
    leg 2 is our own tx** (`curated-to-print`/`print-to-curated`, and
    `relay-to-print`'s leg 2 which is also always ours) — `estimateEthGasReserve()`
    calls `estimateGas` + `getFeeData` against a probe build of the actual
    leg-2 tx (minOut=0, never sent) using the real amount leg 1 delivered,
    with a 30% buffer, falling back to the old flat "~$1 of ETH" heuristic
    only if estimation itself fails. Built after a live CASHCAT→$PRINT
    attempt: leg 1 genuinely succeeded, but the flat reserve turned out to
    be roughly the SAME size as the entire (small test-amount) trade,
    leaving nothing for leg 2 and throwing "didn't receive enough ETH" —
    not a routing bug, just an imprecise reserve. Verified live: real gas
    cost for a buy-direction leg 2 was ~0.000154 ETH (with buffer) against
    a ~0.00025 ETH trade — the old flat reserve alone was ~0.00027 ETH,
    i.e. bigger than the entire trade, so *any* small trade was doomed
    regardless of routing correctness. `print-to-relay`'s leg 2 is the one
    exception left on the flat heuristic — it's Relay's own tx, not ours,
    so its exact gas isn't estimable ahead of a quote (which itself needs
    this same amount as input — circular).
  - **Speed**: `readProvider.pollingInterval = 1000` (ethers v6 defaults to
    4000ms) — every `waitForTransaction` across every leg/approval was
    sitting up to 4s past the block actually landing before ethers even
    checked again; Dylan flagged the gap between leg 1 confirming and leg
    2's wallet prompt as "really slow." Each leg also now kicks off
    `getFeeData()` immediately after sending, running concurrently with
    that leg's own confirmation wait instead of as a separate sequential
    round-trip once it lands — passed into `estimateEthGasReserve()`'s
    optional `feeDataPromise` param.
- **Token list (`lib/robinhoodTokens.ts`)**: curated (ETH, $PRINT, the same
  CASHCAT/ARROW/HOODRAT/JUGGERNAUT addresses PrintBot/MultiSender already
  curate, the 5 RWA stock tokens from `lib/rwaPools.ts`) plus a paste-any-
  address fallback (`resolveCustomToken`, reads `symbol()`/`name()`/
  `decimals()` on-chain — same "add by CA" pattern as PrintBot). No chain
  sidebar functionality yet (Robinhood Chain is the only real row, "More
  chains coming soon" note) — phase 1 is same-chain only, Dylan's own
  suggestion ("maybe its easier to start with robinhood chain only, same
  chain swaps... before integrating the multichain").
- **Live preview for Relay-touching plans**: debounced (500ms) `getQuote`
  call as the user types, separate from the always-on PRINT/ETH pool-rate
  poller. `relay-to-print` previews leg 1 only (fromToken→ETH) then runs
  that ETH amount through the same pool-rate/tax math as print-buy;
  `print-to-relay` computes the ETH leg 1 output locally then previews
  Relay's leg 2 (ETH→toToken) for the final number.
- **Pinned tokens** (`PINNED_TOKENS` in `lib/robinhoodTokens.ts`) — a quick-
  select pill row at the top of the picker, mirroring Relay's own modal
  (ETH/WETH/USDG pinned pills, screenshots Dylan supplied). WETH
  (`0x0Bd7…AD73`, matches the address already in the on-chain section) and
  USDG (`0x5FC5360D0400a0Fd4f2AF552Add042d716f1D168`, 6 decimals, "Global
  Dollar") were pulled from Relay's own `/currencies/v2` API for chainId
  4663 rather than guessed — same source SwapEmbed already used for its
  chain list, just queried directly this once to get real checksummed
  addresses instead of hand-typing them (a hand-typed guess previously
  crashed the page with a bad-checksum error on load — always source
  addresses from a verified API or on-chain read, never type them from a
  truncated UI screenshot).
- **Trending tokens** (`TRENDING_TOKENS` in `lib/robinhoodTokens.ts`) — 11
  more of Robinhood Chain's top tokens by real activity, added when Dylan
  asked to "identify the top tokens on Robinhood Chain and integrate a lot
  more CAs": VLAD, VIRTUAL, PONS, TENDIES, SWOGE, WOOD, STONKBROKER, INDEX,
  DIH, YOLO, HMM. Sourced from Relay's `/currencies/v2` `defaultList: true`
  response for chainId 4663 (Relay's own "what matters on this chain"
  ranking — the same ordering their screenshot showed pinned first), then
  cross-checked on DexScreener before including any of them (all had real
  five-to-seven-figure 24h volume and liquidity, not just a listing — e.g.
  VIRTUAL alone had ~$7.1M liquidity). Pool venue (V2 vs V3) was checked
  for every one via `getPair`/`getPool` against WETH: VLAD/VIRTUAL/PONS/
  TENDIES/SWOGE/WOOD are V2 and got added to `KNOWN_V2_TOKENS` in
  `lib/curatedPoolSwap.ts` for the no-Relay self-routed fast path (same
  treatment as CASHCAT/ARROW/HOODRAT); STONKBROKER/INDEX/DIH/YOLO/HMM are
  V3 and were left off it, same reasoning as JUGGERNAUT — no verified V3
  quoter on this chain to compute a safe minOut against, so they route
  through Relay when paired with $PRINT instead (not a correctness
  regression, just not on the fast path). **Caught and fixed a real
  copy-paste mistake before shipping**: four of the eleven logo URLs were
  initially copied from the wrong sibling token (INDEX's logo reused for
  YOLO and HMM, DIH's reused for WOOD) — caught by re-deriving every URL
  from the saved raw API response instead of trusting what had already
  been typed, then verifying all eleven resolve with a live `curl -I`
  sweep before considering it done. **AI (Artificial Inu,
  `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18`, V3)** added the same way
  when Dylan supplied it directly along with two others — PONS turned out
  to already be in this list (same address, just re-supplied), no-op.
  **Deliberately excluded**: `0xc2362aff...4BA3`, also symbol "GME" / name
  "GameStop" on-chain — a real, liquid token (~$150-240K per pool, real
  volume) but a completely different contract from the official Robinhood-
  issued GameStop stock already in `RWA_MARKET_TOKENS` below
  (`0x1b0e319c...153e` — Relay tags that one "Robinhood Token" everywhere;
  this new one is `verified: false`, same as any ordinary meme token, not
  part of the tokenized-stock program). Flagged the collision risk to
  Dylan before adding anything; his call was to exclude it entirely rather
  than relabel it — two tokens sharing the exact "GME" symbol in the same
  picker was judged too easy to mix up, even with a disambiguating name.
- **`scripts/add-token.mjs` — quick-add framework for new token CAs**
  (2026-07-29, Dylan: "this needs to be a framework for adding new CAs
  quick and easy. Then I can give you a CA to add any time"). Given an
  address, reads `symbol`/`name`/`decimals` on-chain, checks V2
  (`getPair`) then V3 (`getPool` across the 4 known fee tiers) pool venue
  against WETH — the same manual check every `TRENDING_TOKENS` entry
  above already documents doing by hand — and pulls a real logo via
  Relay's `/currencies/v2` address lookup. Prints a ready-to-paste
  `TRENDING_TOKENS` line plus whether it also belongs in
  `KNOWN_V2_TOKENS` (`lib/curatedPoolSwap.ts`). Deliberately doesn't edit
  files itself — still a manual paste + build + push, same review
  discipline as every token added above, just with the on-chain/API
  legwork automated. Run with `export PATH="/usr/local/opt/node@20/bin:
  $PATH" && node scripts/add-token.mjs <address>`. First real use:
  **CATSTR** (Cashcat Strategy,
  `0xA3BfBccD4Aeec8ac56B17FEE3e02Dd2C60722ccc`) — the script found no V2
  or V3 pool against WETH; DexScreener confirmed its real liquidity
  (~$34K) is a Uniswap V4 pool, same pool type $PRINT itself uses, so it
  was added to `TRENDING_TOKENS` only, NOT `KNOWN_V2_TOKENS` — swaps
  touching $PRINT route through Relay (`relay-to-print`/`print-to-relay`),
  the same fallback every other non-V2 trending token (JUGGERNAUT/
  STONKBROKER/INDEX/DIH/YOLO/HMM) already uses.
- **ETH icon recolored** — the two-tone diamond (`TokenIcon`'s `isNative`
  branch) used a grey-blue palette (`#8A92B2`/`#62688F`, plain Ethereum
  brand colors); Dylan wanted it in the site's own neon green instead
  (`#00c805`/`#068a0a`) to match the rest of the page rather than reading
  as a generic/foreign brand color.
- **Clicking the other side's token now swaps sides instead of being
  blocked** — the picker used to greyed-out/`disabled` whichever token was
  already selected on the other side (an `exclude` prop passed down from
  `PrintDirectSwap.tsx`); Dylan: "more intuitive" to just let the click
  through. The swap-sides logic already existed and was correct
  (`selectToken()` in `PrintDirectSwap.tsx` already swapped `fromToken`/
  `toToken` when picking a token that matched the other side) — it was
  simply unreachable because the modal never let the click fire. Removed
  `exclude`/`disabled` entirely from `TokenPickerModal.tsx` rather than
  patching around it.
- **"RWAs (NEW)" pinned pill** (`ALL_RWA_TOKENS` in `lib/robinhoodTokens.ts`)
  — a category filter, not a direct token pick: toggles the results list to
  the tokenized-stock roster instead of selecting a token (the pill itself
  is the toggle — click again to clear; an earlier explanatory banner under
  it was removed as unnecessary clutter). Order is deliberate — the 5 pools
  `/rwa` actually tracks (`RWA_POOLS` from
  `lib/rwaPools.ts`) always come first, then ~17 more Robinhood-issued
  tokenized stocks (GME, AMZN, META, GOOGL, COIN, PLTR, AMD, INTC, MU,
  SNDK, MSTR, NFLX, RDDT, COST, USAR, SPY, SLV) as the "bunch" Dylan asked
  for — all sourced from Relay's `/currencies/v2` API (search term
  "Robinhood Tokenized", chainId 4663) for real checksummed addresses,
  including real per-token logos (same green-leaf icon style Relay's own
  modal uses for these). These extra tokens aren't RWA pool targets (no
  $PRINT pool exists against them) — they're just swappable like any other
  curated token; the $PRINT-always-routes-through-our-pool invariant still
  applies regardless of which of these is on the other side.
- **Token icon sourcing (`lib/robinhoodTokens.ts`)**: real logos, not just
  for RWA tokens — CASHCAT/ARROW/HOODRAT/JUGGERNAUT's hardcoded curated
  entries now have real logos too, and `resolveCustomToken` (the paste-any-
  address flow) fetches one live for ANY pasted address via
  `fetchRelayTokenLogo()`. The mechanism: Relay's `/currencies/v2` API
  supports a direct `{chainIds, address}` lookup (not just `term` search —
  confirmed live, `term` doesn't match on a raw address string but
  `address` does) and returns `metadata.logoURI` when it knows the token.
  This is genuinely how MetaMask/other wallets solve "where do token icons
  come from" — MetaMask maintains its own curated icon set (originally the
  `MetaMask/contract-metadata` repo, now a CDN), most others pull from the
  Trust Wallet assets repo (github.com/trustwallet/assets) or CoinGecko's
  `/coins/{platform}/contract/{address}` endpoint — but neither of those
  has meaningful Robinhood Chain coverage yet (too new a chain), and
  CoinGecko needs a platform-id string for the chain that may not exist.
  Relay already needs this same per-token metadata to power its own swap
  widget across every chain it supports, us included, so reusing its
  endpoint avoided standing up a second icon-source integration. **Broken
  logos degrade gracefully**: one of the hardcoded URLs (JUGGERNAUT's,
  pulled from a real API response) turned out to already 403 from
  GeckoTerminal's CDN (confirmed via direct curl, not a code bug) — `img
  onError` in `TokenIcon` (`components/TokenPickerModal.tsx`) catches this
  and falls through to the generic fallback badge instead of a broken-
  image glyph, so any future dead URL fails the same safe way.
- **Generic fallback badge**: an original inline SVG (a simple leaf/sprout
  mark, not a reproduction of Robinhood's own tokenized-stock icon or any
  real project's logo) replaces the old two-letter-initials circle for any
  token with no logo at all — Dylan liked how uniform the RWA tokens'
  real logos looked and wanted every logo-less token to default to
  something in that visual family instead of flat text initials.
- **2-signature step UI**: `swap-waiting` — a spinning ring around the
  $PRINT logo (CSS `@keyframes swap-spin`, not an image GIF) with "Waiting
  for Confirmation 1/2" / "…2/2" title text and a small 2-dot progress row
  underneath, replacing an earlier plain dot-stepper that Dylan felt wasn't
  sleek enough. Only rendered for the two-leg plans (`legProgress` state);
  single-leg plans keep the existing plain button-text behavior.
  **`position: absolute; inset: 0` over the whole `.swap-card`** (which is
  already `position: relative`), with a dark blurred backdrop — originally
  rendered inline near the button and pushed the layout down; Dylan wanted
  it as a greyed-out overlay across the whole trade box instead, so the
  pay/receive panels visibly dim underneath rather than staying interactive
  while a leg is in flight.
- **Slippage pill sizing**: the custom/editable pill (defaults to 15%) must
  visually match the fixed 7%/10% pills — the `<input>` inside it was
  originally a fixed 22px which made the whole pill noticeably wider than
  its siblings even though the padding was identical; narrowed to `1.4em`
  (fits 2 digits) so all three pills read as the same size.
- **Two slippage tiers, not one** (`lib/printDirectSwap.ts`) — 7/10/15%
  (`SLIPPAGE_OPTIONS`) only makes sense when clearing $PRINT's 5% tax;
  Dylan: "7 as default is too high for regular tokens, 2 should be default
  on most tokens." `SLIPPAGE_OPTIONS_OTHER` (2/5/10%, custom defaults to
  10) is used for any pair that doesn't touch $PRINT at all. A `useEffect`
  keyed on `involvesPrint` (not on every keystroke — only when the pair
  crosses the PRINT boundary) resets `slippage`/`customSlippage` to the
  right tier's default.
- **USD value under each side + a >25% mismatch warning**
  (`lib/tokenUsdPrice.ts`, `getTokenUsdPrice()`) — Dylan, after seeing
  Relay's own bottom-left "$0.00" display: "this can help to show the real
  swap rate and avoid mistakes." Native ETH/WETH reuse the already-fetched
  `ethUsd`; $PRINT is derived from the already-polled on-chain `rate`
  (`ethUsd / rate`) rather than a separate fetch, for the same staleness
  reasons `rate` itself moved off DexScreener earlier; every other curated
  token queries DexScreener's `/tokens/<address>` endpoint directly,
  filtered to Robinhood Chain pairs, highest-liquidity pair wins. Fetched
  once per token **selection** (a `useEffect` keyed on `fromToken.address`/
  `toToken.address`), not per keystroke — the `≈ $X` line then just
  multiplies the cached per-unit price by the live typed/estimated amount,
  no extra API calls while typing. **Mismatch warning**: `mismatchPct =
  |fromUsdTotal - toUsdTotal| / fromUsdTotal * 100`; PRINT's tax+fee
  together are ~6%, so a legitimate PRINT swap never comes close to the
  25% threshold — a gap that big means a bad quote, an illiquid/mispriced
  token, or a real mistake, not normal cost. When it fires, the warning
  box (`swap-mismatch-warn`, red) REPLACES the normal green CTA's label/
  style with a red "Swap Anyway" (`swap-cta-danger`) — the ask was to
  "give a warning before allowing them to swap," so the normal-looking
  button is never clickable while the mismatch is showing, only the
  explicitly-relabeled risky one.
- **Dust cutoff** (`DUST_THRESHOLD = 0.000001` in `PrintDirectSwap.tsx`) —
  `fmt()` used to fall back to scientific notation below this (`"1.24e-10
  ETH"`, seen in a real preview for a near-zero PRINT→ETH amount), which
  reads as a confusing amount rather than what it functionally is: zero.
  Below the threshold it now just renders `"0"` (and `fmtUsd()` renders
  `"$0"`) instead of switching notation. Display-only — the underlying
  numeric state driving calculations (mismatch %, minAmountOut, etc.) is
  untouched, only what's shown changes.
- **WETH→ETH is genuinely one signature, not two** — confirmed (not
  assumed) via a live `getQuote` call: Relay returns a single `"swap"`
  step for this pair, not `approve`+`swap` like an arbitrary ERC20 origin
  (e.g. CASHCAT) needs. Makes sense once you think about it — unwrapping
  WETH is `WETH.withdraw(amount)` on your own balance, which needs no
  allowance/approval at all, unlike a real DEX swap. `planRoute()` already
  correctly classifies WETH↔ETH as `relay-only` (neither side is $PRINT)
  — the `swap-waiting` two-leg overlay only ever applies to the four
  plans that actually split into two of *our own* legs, so it correctly
  never shows here.
- **Robinhood Wallet gets its own connect button, slotted under
  MetaMask** (Dylan: "add a button specifically for Robinhood Wallet").
  Not in RainbowKit's built-in wallet list (`@rainbow-me/rainbowkit@2.2.11`
  — checked, no `robinhoodWallet` export), so defined by hand in
  `PrintDirectSwap.tsx` per RainbowKit's own documented "Custom Wallets"
  pattern (`getWalletConnectConnector` + a `Wallet` object).
  WalletConnect-only — no browser-extension identity flag found for it,
  and it's mobile-app + in-app-browser focused. Deep-link scheme
  (`robinhood-wallet://`, no universal link) and store URLs pulled live
  from WalletConnect's own public Explorer API
  (`explorer-api.walletconnect.com/v3/wallets?search=Robinhood`) —
  confirmed via a live query, not assumed. The `wc?uri=` suffix on the
  deep link is WalletConnect's own documented mobile-linking convention
  (`docs.walletconnect.network`) for wallets that don't register a more
  specific path.
  **Icon, corrected**: first version used WalletConnect Explorer's own
  registered icon for the wallet app (purple/pink) — wrong. Dylan: "you
  used the wrong logo everyones doing the neon green for robinhood
  chain." Now uses the same neon-green feather mark already self-hosted
  for the chain picker (`lib/robinhoodTokens.ts` `CHAINS`, sourced from
  Relay's chain-icon CDN for chain 4663) — re-downloaded to
  `public/brand/robinhood-wallet.webp` (really WebP bytes behind a
  `.png`-looking source URL; saved with the correct extension this time
  so content-type is right).
  **Placement, corrected**: first version put it in its own featured
  `"Recommended"` group above everything else — Dylan: "dont put it in
  reccomended just put it under metamask." Now spliced directly into
  RainbowKit's own default `"Popular"` group, immediately after MetaMask.
  **Real gotcha hit while fixing this**: the obvious `group.wallets.
  indexOf(metaMaskWallet)` (matching by imported function reference)
  silently matched nothing — `getDefaultWallets()` doesn't build its
  internal list from the exact same function object the `/wallets`
  subpath export returns, so the button just vanished with no error.
  Fixed by matching on `.id === "metaMask"` instead (RainbowKit's own
  stable string identifier, invoked cheaply on each factory — the same
  thing `getDefaultConfig` already does internally to build its full
  connector list), which is the actually-robust way to find a specific
  built-in wallet in that array. Verified live both times (after each
  fix) via real screenshots, not just re-reading the code.
- **A real WalletConnect Project ID uncovered a genuine, previously-
  hidden QR-rendering crash** — Dylan: "theyre saying the robinhood
  button doesnt successfully open robinhood wallet." Root cause was the
  placeholder project ID above (fixed there), but fixing it exposed a
  SECOND, real bug: clicking Robinhood Wallet (or, confirmed live, the
  stock "WalletConnect" button too — not specific to the new button) now
  got far enough to try rendering a QR code and crashed the whole page
  (`Application error: a client-side exception has occurred`). Console
  showed `Error: invalid border=0` from the `qr` npm package. Traced
  precisely: `cuer@0.0.3` (the small QR-rendering package RainbowKit uses
  internally, last published Aug 2025, no newer version exists) hardcodes
  `border: 0` as its own default and depends on `qr: ~0` — an
  intentionally wide range covering any 0.x release. Diffed `qr`'s actual
  published versions directly (fetched each `unpkg.com/qr@<version>/
  index.js` and grepped the border-validation logic) to find the exact
  break: **0.4.0 through 0.5.5 only checked
  `!Number.isSafeInteger(border)`** (0 passes fine); **0.6.0** (released
  ~3 months before this session) added `|| border <= 0` to that check,
  which `border: 0` fails. `cuer` was never updated to account for this
  and never will be pinned correctly by its own loose `~0` range, so this
  broke silently the moment `qr` cut a new release — completely
  independent of anything in this codebase, and completely hidden until
  today because the placeholder project ID had prevented ANY wallet from
  ever reaching the QR-render step before. Fixed with an `overrides` entry
  in `package.json` (`"qr": "0.5.5"`, the last version before the
  breaking change) pinning the transitive dependency regardless of what
  `cuer` itself declares — verified live afterward: real QR code renders
  correctly, feather icon centered in it, no crash, for both the
  Robinhood Wallet button and the stock WalletConnect button.
- **Exact-amount approvals, not unlimited** (`buildErc20ApproveTx`/
  `buildPermit2ApproveTx` in `lib/printDirectSwap.ts`, `...For` variants in
  `lib/curatedPoolSwap.ts` — all now take an `amountWei` param instead of
  hardcoding `MaxUint256`/max-uint160) — Dylan, after asking whether
  Relay requests unlimited allowance too: it doesn't. Decoded Relay's own
  real approve calldata from an earlier CASHCAT quote and confirmed it
  requests exactly the trade amount (`is MaxUint256? false`), not
  unlimited. Our own unlimited approvals were a real, if standard,
  security tradeoff — Dylan's call was to match Relay's more conservative
  behavior. `needsErc20Approval`/`needsPermit2Approval` already checked
  `allowance < amountWei`, so a later, larger trade against the same token
  correctly triggers a fresh approval with no changes needed there — only
  the build functions and their call sites (now passing `totalPrintWei`/
  `totalTokenWei` through) changed.
- **Preview estimate works without a connected wallet** — Relay's
  `getQuote` requires *some* `user` address but doesn't validate it
  belongs to anyone real for a read-only quote (verified live: omitting
  `user` entirely 400s with "User is required", but the zero address
  works fine and returns real pricing). `PREVIEW_QUOTE_ADDRESS` (the zero
  address) is used as a fallback only inside the debounced preview effect
  when no wallet is connected — never for execution, `doSwap()` still
  hard-requires the real connected address throughout. `curated-to-print`/
  `print-to-curated` already worked wallet-less before this (they quote
  on-chain, no Relay call at all); this extends the same behavior to
  `relay-only`/`relay-to-print`/`print-to-relay`.
- **Slippage pill sizing, second attempt** — the first fix (font-size:16px
  + `transform: scale()` on the always-mounted `<input>`, to stop iOS
  auto-zoom while keeping the old visual size) didn't actually work:
  transforms shrink paint, not the reserved flex-layout box, so the pill
  stayed wider than its 7%/10% siblings regardless of how small the text
  was made to look — confirmed by measuring real `getBoundingClientRect()`
  widths on a live mobile render. Fixed properly by not permanently
  mounting an `<input>` at all: it renders as a plain `<button>` (`swap-
  slip-custom-display`, byte-for-byte the same size as its siblings, zero
  zoom risk since it isn't a text input) until tapped, and only becomes a
  real 16px `<input>` for the brief moment it's actually being edited —
  verified live, pill widths now within ~1px of each other.
- **`(estimated)` dropped from "You receive" and the "Any Robinhood Chain
  asset ⇄ $PRINT" subtitle removed** — Dylan: the subtitle "looks dumb"
  screenshotted next to an actual CASHCAT trade (the page is about $PRINT,
  not a generic multi-asset pitch, once you're mid-swap). Cosmetic only.
- **Balance display**: drops the "Balance:" label (just the number +
  symbol now) and truncates to 3 decimals once the amount is ≥ 1 via a new
  `fmtBalance()` (`fmt(n, 3)` above 1, `fmt(n, 6)` below it) — a wallet
  holding `39,059.161337 CASHCAT` doesn't need all 6 digits on screen;
  full precision is kept below 1 where the extra decimals are the only
  thing separating a real amount from dust.
- **Error diagnostics**: a real end-to-end CASHCAT→$PRINT attempt failed in
  production with just "Swap failed." — the generic fallback text, meaning
  the thrown error's shape didn't match any of the fields being checked.
  `describeError()` now tries every error-message shape actually seen
  across ethers/viem/Relay SDK errors before falling back to a raw
  `JSON.stringify`, the full raw error is `console.error`'d for follow-up
  debugging, and a `legContext` string (e.g. "Step 1/2 (CASHCAT → ETH via
  Relay)") is prefixed onto the message for 2-leg routes so a failure says
  which leg it was in. This immediately paid off: the retry surfaced
  **"Unable to find chain: Chain id 4663"** — `lib/relayLeg.ts`'s
  `createClient({ source: "hoodprinter.xyz" })` had no `chains` option, so
  the SDK fell back to its baked-in chain defaults, which don't include
  Robinhood Chain. `getQuote()` didn't need it (pure API call, worked fine
  in isolated testing), but `execute()` does — it needs the chain
  registered locally for RPC calls/gas estimation during signing, not just
  reachable over Relay's API. **Fix**: `createClient` now passes
  `chains: [convertViemChainToRelayChain(ROBINHOOD_VIEM_CHAIN)]`, same
  function SwapEmbed.tsx already used for its (much larger) chain list —
  just one chain here since this router is same-chain only for now.
  Verified the fix with a live `getQuote`+`createClient` round-trip outside
  the browser; still couldn't fully verify `execute()`'s signing path
  end-to-end without a funded/connected wallet in this environment (same
  gap noted for the swap tx encodings below), so if a 2-leg swap fails
  again the on-screen `legContext`-prefixed message is the next thing to
  check.

- **Price source**: read directly on-chain via Uniswap's `StateView` lens
  contract (`0xF3334192D15450CdD385c8B70e03f9A6bD9E673b`, verified live —
  Blockscout tags a SECOND contract "StateView" too, at a different address,
  which returns all zeros; not that one), calling
  `getSlot0(poolId)` → `sqrtPriceX96` → `(sqrtPriceX96/2^96)^2` = PRINT per
  ETH. DexScreener was used originally but is a third-party indexer that can
  lag a few seconds behind real chain state — exactly wrong right after the
  user's own swap moves the price. DexScreener is still used for `ethUsd`
  only (the ~$1 gas-reserve estimate for the balance "MAX" button — not
  precision-critical). Price polls every 15s and refetches immediately after
  a swap confirms; clicking the "Rate" box also force-refreshes.
- **The pool takes a flat 5% tax on every swap** (`POOL_TAX_PCT` in
  lib/printDirectSwap.ts) — MUST be multiplied into any "you'll receive"
  estimate or it reads ~5-7% high vs what actually lands (caught via a real
  swap: shown estimate 4,010 PRINT, actual received 3,752 PRINT). Slippage
  buttons (7/10/15%, small/sleek/no-label, top-right of the card, default
  7% matching `PRINT_MIN_SLIPPAGE` elsewhere in the codebase) apply on top
  of the tax-adjusted estimate, not instead of it.
- **Fee bundling — one signature, not two.** First version sent the 0.85%
  fee as its own transaction before the swap tx; Dylan's reaction: "unacceptable
  way to do it... every other swap hides it." Fixed by using the Universal
  Router's own `PAY_PORTION` command (0x06) ahead of `V4_SWAP` (0x10) in a
  single `execute()` call — `PAY_PORTION` skims `APP_FEE_BPS` (85 = 0.85%)
  of the router's current balance of a token to `RELAY_FEE_RECIPIENT`,
  atomically, before the swap settles. Buy: commands `0x0610`
  (PAY_PORTION then V4_SWAP), fee skimmed from ETH. Sell needs a third
  command first — see below.
- **Sell (PRINT→ETH) needs ERC20 approval + Permit2**, not just a native
  ETH value — meaningfully riskier to hand-roll than buy, built carefully:
  Permit2 is deployed at the canonical address
  (`0x000000000022D473030F116dDEE9F6B43aC78BA3`, same on every EVM chain via
  CREATE2 — verified real bytecode on Robinhood Chain before writing
  anything against it). Sell commands: `0x020610`
  (`PERMIT2_TRANSFER_FROM`, `PAY_PORTION`, `V4_SWAP`) — pulls the full PRINT
  amount into the router first, skims the fee from that balance, THEN lets
  `V4_SWAP`'s `SETTLE_ALL` use what the router already holds. Order matters:
  V4Router's settlement (`_pay`/`payOrPermit2Transfer`) only pulls fresh
  from the user via Permit2 if the router *doesn't* already hold the funds
  — pulling everything up front avoids a double-pull. `TAKE_ALL` still pays
  the ETH output straight to the caller either direction (proven pattern,
  no separate sweep step needed). Two conditional one-time approval txs
  (`PRINT.approve(PERMIT2, ...)`, then `Permit2.approve(PRINT, ROUTER, ...)`)
  fire automatically before the swap tx if not already granted —
  `needsErc20Approval`/`needsPermit2Approval` check first so repeat sellers
  only sign the swap itself.
- **Verify new command encodings by round-tripping them**, not just trusting
  the `abiCoder.encode` call succeeded — for both buy and sell, decoded the
  built calldata back apart (commands, every action's params) and checked
  the values matched what was intended before ever touching a real wallet.
  This is the actual verification method here, given no funded test wallet
  is available in-session to execute a real transaction end to end.
- **Balance + MAX**: shown above the "You pay" token pill (ETH balance for
  buy, PRINT balance for sell, via wagmi's `useBalance` — pass `token:` for
  the ERC20 case), clickable to fill the max swappable amount. Buy reserves
  ~$1 of ETH for gas (from live `ethUsd`, falls back to a fixed
  `FALLBACK_GAS_RESERVE_ETH` if that fetch failed); sell has no such
  reserve since PRINT isn't spent on gas.
- **Success message** shows the actual amount for buy (parsed from the
  PRINT `Transfer` log in the tx receipt via `parseReceivedPrint` — ETH
  isn't an ERC20 so there's no equivalent log for sell's output; sell shows
  the pre-swap estimate instead, labeled with a `~`).
- **Recent transactions feed** below the card reuses the Buy Bot's own
  `.pb-card`/`.pb-tx` CSS classes for visual consistency, persisted to
  `localStorage` under `hoodprint_swap_txs` (separate key from the Buy
  Bot's own `hoodprint_txs` feed) — same restore/save pattern as
  `components/PrintBot.tsx`.
- **Swap Terminal** below Transactions (Dylan: "do we track the total
  volume of the swap? add a section... total trades, total ETH value
  traded, and anything else... a basic framework we can turn into full
  robust analytics later") — until this, swap volume genuinely wasn't
  tracked anywhere (only the Buy Bot and Multisend had usage telemetry).
  New: `lib/stats.ts` `recordSwap()`/`readSwapStats()` +
  `app/api/swap/route.ts` (POST to report, GET to read), same self-
  reported/best-effort/throttled tradeoff already made for
  `/api/multisend` — nothing user-facing (leaderboard, airdrop) keys off
  this count, so on-chain re-verification isn't worth the round trip.
  **Client-side (`PrintDirectSwap.tsx`)**: a `finalOk` flag is set at each
  of the 7 route plans' own final-leg success point (mirroring the
  existing `updateTx(..., {status: "ok"})` calls) and gates a fire-and-
  forget `POST /api/swap` right after — same `.catch(() => {})` pattern
  `MultiSender.tsx` already uses, so a failed report can never surface as
  a false "swap failed" error. **`ethValue` is a deliberately simple
  cross-pair estimate**, not exact on-chain accounting: `(fromUsdPrice *
  amt) / ethUsd`, reusing the exact USD pricing already computed for the
  mismatch-warning feature (`lib/tokenUsdPrice.ts`) rather than hand-
  rolling per-route ETH math across 7 different plans — good enough for a
  "basic framework," not meant to be audit-grade.
  **Fee revenue is never computed or stored anywhere** — not in Redis, not
  admin-only, not in an export. Dylan floated seeing it, I offered to add
  an explicit tile for it, and he shut that down immediately: "do not add
  the fee revenue there absolutely not, we want that to be hidden."
  It's trivially estimable by anyone from `eth` (~0.85% of total volume)
  but HOODPrinter's own take deliberately isn't a first-class number in
  this codebase at all (see the `feedback-fee-revenue-stays-hidden`
  memory).
  **Redis keys**: `stats:swap:trades`/`stats:swap:eth` (+ `:<day>`
  buckets), `stats:swap:new_traders:<day>`, `stats:swap:buys`/
  `stats:swap:sells` (only counted when a leg actually touches $PRINT —
  an arbitrary CASHCAT↔ARROW relay-only swap isn't a "buy" or "sell" of
  anything HOODPrinter cares about), `swap:traders` (zset, NX, first-seen
  ms — `recordSwap` checks ZADD's own return value to know whether to
  bump `new_traders:<day>`, no separate lookup needed), `swap:plans`
  (zset, count per route kind — `readSwapStats` pulls ALL of these, not a
  top-N, since there are only ~7 possible plan keys and under-fetching
  would silently skew the route-mix percentages), `swap:pairs` (zset,
  count per `"<fromSym>→<toSym>"` string — this one IS a real top-N since
  the pair space is unbounded). Folded the trade/volume totals into
  `readPlatformSummary()` too, so `dataset=summary` picks them up for free
  (the new buy/sell/pair/plan breakdown isn't in that summary — it's
  terminal-only for now, no admin use for it yet).
  **UI**: a console-styled readout (`SwapTerminal` component, `.swap-term`
  classes) — monospace font, scanline texture, blinking status dot, plain
  spaced labels (Total Trades / ETH Volume / Traders / $PRINT Flow), a Top
  Routes section with horizontal bars (route-plan keys collapsed to short
  labels via `PLAN_LABELS`, e.g. `print-buy`+`print-sell` → "PRINT POOL"),
  and a Top Pairs ranked list. First pass used underscore-joined labels
  (`TOTAL_TRADES`, a `$ ` shell prompt, a literal `_` text cursor) — Dylan:
  "take away the underscores, it goes too far with the terminal branding.
  make it a little more like a futuristic trading terminal." Swapped to
  normal spaced words (no underscores, no `$` prompts), and the empty
  state's cursor is now a small pulsing dot (`Awaiting first trade ●`)
  instead of a glued-on underscore — same monospace/scanline/glow shell,
  reads like a trading ticker instead of a literal command line. Not
  reusing `.pb-card` or `/rwa`'s `.rwa-ov-tile` — its own independent
  look. Framed as "a little easter egg if people scroll down" (Dylan's
  words) — not linked or promoted anywhere, just sitting where the old
  plain stat-grid used to be. Fetches once on mount and again right after
  this tab's own swap
  reports — other tabs' swaps show up on next natural refresh, not live.
- The old **"⚠️ Multi-Chain Coming Soon" subnote** under the `/swap` H1 was
  removed entirely (Dylan: "feels unnecessary now") — no replacement text.
  It had already replaced an earlier "⚠️ Multi-Chain Relay Coming Soon"
  version. The token-pill hover tooltip ("⚠️ Multi-Chain Relay Under
  Construction") was separately **removed** earlier too — the pill is now
  a real picker button (opens `TokenPickerModal`), not a disabled-feature
  warning, now that same-chain token switching actually works.

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
  (tested). A dummy placeholder (`"00000000...")`) avoids that crash but
  silently no-ops every WalletConnect-based wallet — WalletConnect's own
  servers just refuse to issue a real pairing session for an unrecognized
  project, so those buttons sit there looking normal and do nothing.
  Injected/browser wallets (MetaMask etc.) work fully either way; only
  WC-based wallets needed the real ID. **A real ID was set 2026-07-27**
  (`WALLETCONNECT_PROJECT_ID` in `site.config.ts`, from cloud.reown.com)
  after Dylan reported the new Robinhood Wallet button "doesn't
  successfully open Robinhood Wallet" — root cause traced to this exact
  placeholder, confirmed by showing the stock "WalletConnect" button had
  the identical dead-end behavior (not something specific to the new
  button).
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

### Cross-chain swap — shipped 2026-07-28 (Base, Solana, Ethereum mainnet all live)

Scoped 2026-07-25 ("do not execute" — see git history / old CLAUDE.md
revisions for that discussion), built 2026-07-28 after Dylan asked
directly: "build solana connection (we already have it in our wallet
connector) and then enable cross chain and show the top tokens on those
chains... let them enter any CA and route it thru relay." The
`dylmusic` sibling project (same account, `@reservoir0x` scope, already
has a live Solana-inclusive Relay swap page) was the reference
implementation — pointed to directly by Dylan ("Look into the Dylmusic
project. It has a great solana connection") and used to de-risk the two
biggest open questions from the 2026-07-25 scoping before writing any
code:

- **The `@relayprotocol` package-scope migration flagged as the big
  Solana risk in the 2026-07-25 scoping turned out to be unnecessary.**
  dylmusic uses `@reservoir0x/relay-svm-wallet-adapter@^11.0.0` — the
  Solana wallet adapter DOES exist under the same `@reservoir0x` scope
  this repo already pins, no migration needed. Installed alongside
  `@solana/web3.js@^1.98.4` (peer dep for `Connection`/transaction types).
- **Solana wallet connection is a lightweight direct-Phantom hook**
  (`lib/solanaWallet.ts`, copied from dylmusic's own `lib/solana.ts`
  near-verbatim), not the full `@solana/wallet-adapter-react` stack —
  `window.solana` (Phantom's injected provider), `connect()`/
  `disconnect()`/`signAndSendTransaction()`. Proven live in production on
  dylmusic's own swap page. Only mounted/consulted when a Solana token is
  actually selected on either side of the swap — never prompted on page
  load, matching the non-negotiable guardrail from the 2026-07-25 scoping
  ("prioritize not messing with the current Robinhood chain only swap").

**Architecture — exactly what was scoped, now built:**
`lib/robinhoodTokens.ts`'s `RhToken` gained a `chainId` field (every
token is now chain-scoped, not implicitly Robinhood-only); `CHAINS` all
four entries (Robinhood/Base/Solana/Ethereum) are `enabled: true` now,
Ethereum mainnet added as a 4th chain at the same time (wasn't in the
original Base/Solana-only scoping, but free once Base's EVM pattern
existed — same `wagmi` registration, same Relay registration, zero extra
wallet work since RainbowKit/MetaMask already work on any EVM chain).
`components/PrintDirectSwap.tsx`'s `planRoute()` is UNCHANGED in
structure — the same 7 plan kinds, decided the same way — because
`isPrintToken()` already implicitly requires the Robinhood-chain side
(PRINT only exists there), so `fromPrint`/`toPrint` branches were already
chain-correct. The only real change: `getRelayLegQuote()` calls
(`lib/relayLeg.ts`) now pass real `chainId`/`toChainId` per leg instead
of both hardcoded to `CHAIN.id` — `relay-only` uses `fromToken.chainId`→
`toToken.chainId` (a single plain cross-chain Relay leg, pure Relay
end-to-end, exactly "all other non-print cross chain swaps can be pure
relay" per Dylan's framing); `relay-to-print`'s leg 1 uses
`fromToken.chainId`→Robinhood (any origin chain's token → native ETH on
Robinhood Chain, landing in the same EVM `address` leg 2 already reads
its balance-delta from — unchanged); `print-to-relay`'s leg 2 mirrors
that in reverse (Robinhood→`toToken.chainId`). **The $PRINT-pool
invariant is untouched**: any leg touching $PRINT still always goes
through our own hardcoded pool (`buildBuySwapTx`/`buildSellSwapTx`),
never Relay, no matter which chain the other side is on — that logic
didn't need to change at all, only the Relay quote's chain parameters
around it.
- **Signer selection per leg**: whichever wallet matches that leg's own
  origin chain — Phantom (`adaptPrintSolanaWallet`, wrapping
  `@reservoir0x/relay-svm-wallet-adapter`'s `adaptSolanaWallet` around
  Phantom's `signAndSendTransaction`) if the origin is Solana, else the
  connected EVM wallet (`adaptEvmWallet`, a thin `adaptViemWallet`
  wrapper), switching chain first via wagmi's `useSwitchChain` if the
  EVM wallet isn't already on that leg's chain (and switching BACK to
  Robinhood before a print-touching plan's own pool leg, if leg 1 moved
  it elsewhere — e.g. `relay-to-print` from a Base origin). Recipient
  selection is symmetric — whichever wallet matches the leg's
  destination chain.
- **EVM wallet connection stays the primary, always-required gate**
  (`!isConnected` → "Connect Wallet", byte-for-byte the same UI as
  before this feature existed) — every plan still has at least one
  Robinhood-chain (EVM) leg by construction, print-buy/print-sell/
  curated-to-print/print-to-curated are Robinhood-chain-only exactly as
  before and never touch Solana at all. Phantom is an ADDITIONAL,
  separate requirement, only surfaced (`(fromIsSolana || toIsSolana) &&
  !sol.address` → "Connect Phantom" button, replacing the swap button
  until connected) once a Solana token is actually selected on either
  side — confirms the "if routing to or from Solana, you need to connect
  both your EVM wallet and Solana wallet" dual-wallet requirement flagged
  in the 2026-07-25 scoping, now actually wired up rather than assumed.
- **Curated self-routed V2 plans (`curated-to-print`/`print-to-curated`)
  gained a defensive `chainId === CHAIN.id` guard** in `planRoute()` —
  `KNOWN_V2_TOKENS` (`lib/curatedPoolSwap.ts`) are all real Robinhood
  Chain contract addresses so this never actually fires today, but it
  closes off the (already near-impossible) theoretical risk of a
  same-address token on a different chain being misrouted through our
  self-built V2 calldata.
- **Cross-chain address-collision fix**: every EVM chain's native ETH
  shares the exact same `NATIVE_ETH` sentinel address
  (`0x0000...0000`) — `isSameToken()`/React list keys/`resolveCustomToken`'s
  "already known" check all switched from address-only comparison to a
  compound `chainId:address` identity (`tokenKey()` in
  `lib/robinhoodTokens.ts`) so Robinhood ETH, Base ETH, and mainnet ETH
  are never treated as the same token.
- **Token lists per chain** (`lib/robinhoodTokens.ts`): Base gets
  ETH/WETH/USDC, Solana gets SOL/USDC/USDG, Ethereum mainnet gets ETH —
  same "native + a couple of verified pairs" shape as the original
  Robinhood-chain curated list, not full parity (deliberately small — any
  other token reaches the picker via paste-a-CA). Addresses are the exact
  same ones already verified live in the dylmusic project (Relay's own
  `/currencies/v2` API), not re-derived. `PINNED_TOKENS` became
  `Record<chainId, RhToken[]>`; `tokensForChain(chainId, rwaFilter)`
  is the one place that decides what the picker shows for a given chain
  (RWA tokens stay Robinhood-only — the "RWAs" pill itself is hidden
  while browsing any other chain, since it would otherwise show an
  always-empty list).
  **Expanded 2026-07-28 (Dylan: "show more common tokens on base, SOL,
  and ETH")** — the picker's PINNED row stayed small/deliberate per-chain
  (Base: ETH/WETH/USDC; Solana: SOL/USDC/USDG; mainnet gained WETH
  alongside ETH — it had literally nothing else pinned before this), but
  the full scrollable list underneath was just as sparse since
  `CROSS_CHAIN_TOKENS` only ever held the pinned tokens themselves, no
  extras. Added `MORE_BASE_TOKENS` (USDT, cbBTC, cbETH, AERO, VIRTUAL),
  `MORE_SOLANA_TOKENS` (USDT, PYUSD, cbBTC), `MORE_MAINNET_TOKENS` (WETH,
  USDC, USDT, DAI, WBTC) — same sourcing discipline as Robinhood Chain's
  own `TRENDING_TOKENS`: Relay's `/currencies/v2` `defaultList: true`
  response per chainId, filtered to `verified: true` only (that same
  response mixes in real junk — e.g. Base's included an unverified
  "Wrapped PROS"). Mainnet's canonical WETH specifically confirmed via a
  live `term: "WETH"` lookup rather than typed from memory (matches the
  well-known `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`).
  **USDG on Solana, separately confirmed real** — Dylan asked directly
  ("i dont know anything about USDG on SOL but maybe u put it there for a
  reason"): verified live via Relay's own address-lookup endpoint
  (`{"chainId":792703809,"address":"2u1t...","symbol":"USDG","name":
  "Global Dollar","verified":true}`) — it's Paxos's multi-chain "Global
  Dollar" stablecoin, the same token family as the Robinhood-chain
  `USDG_TOKEN` and mainnet's own USDG (same CoinGecko image id 51281
  across all three), genuinely deployed on Solana among other chains —
  not a copy-paste mistake from the Robinhood-chain entry.
- **Paste-any-CA now works across chains, including Solana**
  (`resolveCustomToken(chainId, address)`, `TokenPickerModal.tsx`'s
  `looksLikeAddress()`) — EVM chains (Robinhood/Base/mainnet) read
  symbol/name/decimals directly on-chain via a small per-chain public-RPC
  map (`mainnet.base.org`, `eth.llamarpc.com`, alongside the existing
  Robinhood RPC), same "add by CA" pattern PrintBot already uses. Solana
  has no on-chain symbol/name standard to read the same way (that's
  Metaplex metadata, a separate program) — mirrors dylmusic's own
  approach exactly: trusts Relay's `/currencies/v2` lookup alone for SVM
  mints, returns nothing (curated-list-only) if Relay doesn't recognize
  it, rather than guessing. Base58 mint addresses (32-44 chars, no
  0/O/I/l) are detected separately from the existing `0x...` EVM
  heuristic.
- **Chain picker in `TokenPickerModal.tsx`** now actually switches which
  token list is shown (`browseChainId` local state, seeded from
  whichever token is currently on that side when the modal opens, freely
  switchable via the pills without touching the OTHER side) — the
  2026-07-25 version's pills were real UI but inert (`disabled`, no
  `onClick`) ahead of this work; that part didn't change, just gained a
  working handler.
- **USD pricing extended per chain** (`lib/tokenUsdPrice.ts`) — DexScreener
  queries now use the right chain slug (`robinhood`/`base`/`ethereum`/
  `solana`) instead of hardcoded `"robinhood"`; native SOL was pulled out
  of the "native ETH shortcut" (SOL's price isn't ETH's price) and priced
  via DexScreener using the real indexed wrapped-SOL mint
  (`So1111...1112`), since Relay's own `NATIVE_SOL` sentinel isn't an
  indexed DexScreener pair.
- **Verified live** (headless CDP, same methodology used throughout this
  file): all 4 chain pills clickable with correct per-chain pinned/result
  lists (Base → ETH/WETH/USDC, Solana → SOL/USDC/USDG); picking SOL as
  the "from" token correctly computes `relay-to-print` and renders
  "Routed as SOL → ETH → $PRINT · 2 wallet confirmations"; picking a
  cross-chain non-PRINT pair (SOL → Base USDC) correctly computes
  `relay-only` with no crash; switching back to Robinhood Chain
  reproduces the exact original pinned list (PRINT/ETH/WETH/USDG + RWAs)
  byte-for-byte; homepage/`/print`/`/swap` all load with zero console
  errors before and after. Not verified in this session (no funded
  Phantom/MetaMask wallets available): an actual signed end-to-end
  cross-chain transaction — the round-trip-decode/dylmusic-parity
  discipline is what stands in for that, same gap already noted
  elsewhere in this file for other unfundable-wallet cases.
- **First real signed attempt (same day) hit exactly that gap**: a live
  SOL → $PRINT swap failed leg 1 with `failed to get recent blockhash:
  Error: 403 Access forbidden`. Root cause: `SOLANA_RPC_URL` in
  `lib/relayLeg.ts` (used by `adaptPrintSolanaWallet`'s `Connection` to
  fetch the blockhash before signing) was Solana Foundation's own public
  endpoint (`api.mainnet-beta.solana.com`) — same one dylmusic's
  reference implementation uses. That endpoint is explicitly not meant
  for production traffic and rate-limits/blocks by source IP; confirmed
  it answered fine from this server's own IP in isolated testing, which
  narrows it to an IP-based block rather than a code bug. Swapped to
  Allnodes' public multi-tenant endpoint (`solana-rpc.publicnode.com`,
  no API key needed, verified live via curl) — more production-tolerant,
  but still a shared public RPC. **If this 403s again under real load,
  the real fix is a dedicated Solana RPC provider** (Helius/QuickNode/
  Triton all have free tiers) with an API key — same category of fix as
  `WALLETCONNECT_PROJECT_ID` needed. dylmusic likely has this exact same
  latent issue (same hardcoded endpoint) — not fixed there, out of scope
  for this session.
- **Second real live attempt (same day) failed leg 2 with a genuine chain-
  mismatch bug**: `The current chain of the wallet (id: 8453) does not
  match the target chain for the transaction (id: 4663 – Robinhood
  Chain)` — hit on both a Solana-origin and a Base-origin attempt. Root
  cause: the code that switched the EVM wallet back to Robinhood Chain
  before a plan's own pool-leg (`relay-to-print` leg 2, plus every
  Robinhood-only plan's first tx) was gated on `walletClient.chain?.id !==
  CHAIN.id` — but `walletClient` is a plain object captured once when
  `doSwap()` starts; it is NOT reactive, so its `.chain` field never
  reflects a `switchChainAsync()` call made earlier in the SAME function
  invocation. That stale check silently evaluated as "already on the
  right chain" and skipped the switch-back entirely, while the wallet's
  REAL active chain (verified live by the wallet/viem itself, which is
  where this error message actually comes from) had genuinely moved to
  Base/Solana's ETH landing chain. **Fix**: replaced every conditional
  `if (walletClient.chain?.id !== X) await switchChainAsync(...)` with an
  unconditional `await switchChainAsync({chainId: X})` (wrapped as
  `ensureEvmChain()`) — wagmi/wallets no-op this instantly with no extra
  prompt if already on the target chain, so calling it unconditionally
  everywhere a plan's next raw `walletClient.sendTransaction` assumes a
  specific chain (added to print-buy/print-sell/curated-to-print/
  print-to-curated/print-to-relay's leg 1 too, all of which silently
  assumed the wallet was still on Robinhood Chain and had no explicit
  switch at all before this fix — a real gap the moment cross-chain
  shipped, not just the `relay-to-print` leg-2 case that actually got
  reported) is both correct and safe, with no reliance on any locally
  cached "what chain is the wallet on" value.
- **Third real live attempt (same day) proved the switchChainAsync-only
  fix above was still incomplete** — a Base ETH → $PRINT swap failed leg
  2 again, this time with the mismatch in the OTHER direction ("current
  chain of the wallet (id: 8453) does not match the target chain for the
  transaction (id: 4663 – Robinhood Chain)" — Dylan confirmed leg 1's ETH
  genuinely bridged cross-chain first, only leg 2 broke). Root cause:
  `switchChainAsync` changes the REAL wallet's active chain, but the
  `walletClient` object from `useWalletClient()` is captured once per
  render and is a plain object reference, not reactive — it does NOT
  reflect that switch for the rest of the SAME `doSwap()` invocation.
  viem's `sendTransaction` validates the wallet's real live chain against
  THIS stale object's own baked-in `.chain`, not against whatever the
  wallet is actually on now, so the mismatch persisted even after the
  switch call itself started working correctly. **Real fix**: `wagmi/
  actions`' `getWalletClient(wagmiConfig, {chainId})` — an imperative
  action, not a hook, safe to call anywhere — fetches a BRAND NEW client
  scoped to the just-switched chain; `ensureEvmChain()` now does
  `switchChainAsync` THEN `getWalletClient` and returns that fresh
  client, and every single `walletClient.sendTransaction`/
  `adaptEvmWallet(walletClient)` call site in `doSwap()` (all 7 plans)
  was changed to use the freshly-returned client instead of the outer
  `walletClient` — the plain hook value is now only valid for a plan's
  very first action, never after any switch. Verified live via CDP
  (chain picker + route planning unaffected, zero console errors); a
  full signed multi-leg cross-chain transaction still isn't verifiable
  in this environment (no funded wallet), so this fix targets the exact
  mechanism both real failures pointed to rather than being independently
  confirmed end-to-end.
- **Relay's own hidden multi-step splits got a real progress UI** —
  Dylan, after a same-chain Base cbBTC→ETH `relay-only` swap: "it did
  work, but it didnt handle spending cap approval the right way... make
  sure this is handled" (1/2, 2/2, or 1/3 etc.). Relay's `getQuote()`
  return value already carries a `steps` array (present before
  `execute()` ever runs — an ERC20 origin silently needs an `approve`
  step before its `swap` step, same discovery that originally motivated
  `curated-to-print`'s self-routed V2 path). `executeRelayLeg()`
  (`lib/relayLeg.ts`) now surfaces `{label, part, total}` per progress
  event (`total` = `quote.steps.length`, `part` = that step's index)
  instead of a flat label string; `quoteStepCount(quote)` exposes the
  same count before executing at all. `relay-only` now shows the
  existing "Waiting for Confirmation X/Y" overlay (previously built only
  for the pre-planned 2-leg $PRINT routes) whenever Relay's own quote
  needs more than one step — a plain single-signature swap keeps the old
  flat button text, no added clutter. `LegProgress`'s type widened from a
  hardcoded `1 | 2` union to plain `number`, and the dot-progress row
  (`.swap-waiting-dots`) now maps over `total` dots instead of rendering
  exactly two, so a 3-step flow (e.g. an ERC20 origin needing approve
  *and* Permit2 before its swap) renders correctly too.
- **Solana balance was missing from the "You pay"/"You receive" panels**
  — Dylan: "solana balance doesnt show in the top right where it
  should." The EVM balance fetch (`useBalance`) was deliberately disabled
  for a Solana-selected side (wagmi can't query a non-EVM chain) but
  nothing replaced it. `getSolanaBalance()` (`lib/solanaWallet.ts`) reads
  native SOL via a plain lamports balance, or an SPL token's Associated
  Token Account via `@solana/spl-token`'s `getAssociatedTokenAddress`/
  `getAccount` — a wallet that's never held that token has no ATA yet,
  which is a normal "0 balance" state (`TokenAccountNotFoundError`/
  `TokenInvalidAccountOwnerError`), not an error, so both resolve to `0`
  rather than surfacing a failure. Refetches on token/address change and
  once more right after any Solana-involving swap confirms (`
  solBalanceNonce`, an explicit bump — Solana has no equivalent to
  wagmi's automatic block-watching here). The "MAX" click-to-fill
  behavior is still EVM-only for now (Solana's balance now *displays*
  correctly; tapping it to autofill isn't wired up yet — smaller, no
  reports of it being expected).
- **Fourth real live attempt — Solana leg1 itself can time out**: a SOL
  → $PRINT swap failed with `TransactionExpiredBlockheightExceededError:
  Signature ... has expired: block height exceeded` — Solana blockhashes
  are only valid ~60-90 seconds, and the error confirms a REAL signature
  reached the network (Dylan: "actually, it did work" was his instinct,
  correctly) — it just didn't land before expiring, most likely wallet-
  popup/confirmation latency plus a free public RPC's own response time
  eating into that narrow window. `describeError()` now recognizes this
  specific error and returns a clear "network took too long to confirm...
  please try again" message instead of the raw exception text — this is
  a timing issue, not a routing/code bug, so "try again" is the genuine
  fix. The `Connection` used for the Solana wallet adapter
  (`lib/relayLeg.ts`) was also switched from the default `"finalized"`
  commitment to `"confirmed"` (faster to resolve, shaves real time off
  the round-trip). **This is now the SECOND distinct Solana public-RPC
  reliability issue in one day** (see the earlier 403 entry above) — if
  it recurs again, the fix is the same one already flagged: a real
  dedicated Solana RPC provider (Helius/QuickNode/Triton, free tiers
  exist) with an API key, not another free public endpoint swap.
- **A REAL fund-location scare, investigated and cleared**: Dylan, after
  the above — "It looks like the SOL actually went thru but its unclear
  where it went it didnt land in my Robinhood wallet." Given two Solana
  transaction signatures, looked this up properly instead of guessing:
  both confirmed `"finalized"` on-chain (`getSignatureStatuses`), and
  Relay's own request-status API (`api.relay.link/requests/v2?hash=<sig>`
  — a real, documented endpoint, not assumed) showed both `"status":
  "success"` with `recipient` matching the exact wallet address shown as
  "Connected: 0x9e01…35b5" in the swap card. Cross-checked independently
  on-chain via `eth_getBalance` and Blockscout's tx-history API for that
  address: a real, non-zero balance and four separate inbound transfers
  timestamped right around the test attempts. **The funds landed exactly
  where they were supposed to — the code was correct.** The address in
  question is also `RELAY_FEE_RECIPIENT` in `site.config.ts`, which is
  presumably Dylan testing with his own fee-collection wallet; flagged
  this explicitly rather than assuming, in case that overlap is
  unintentional. No code change from this one — it's here so a future
  session doesn't re-litigate "are cross-chain funds actually landing
  correctly" without first checking `api.relay.link/requests/v2` and the
  destination chain directly, which settled it conclusively in minutes.
- **The waiting UX itself, redesigned (2026-07-28)** — Dylan, after
  watching a real bridge settle well after the old short retry window
  gave up: "check for this balance to come in and then initiate the 2nd
  part of the txn, check every 3 seconds... it should be easy if the user
  waits on the loading screen," plus a "resume swap" button "in case the
  user loses the loading screen." Both shipped:
  - `waitForBalanceIncrease()` replaces the old fixed-count retry loop —
    polls the Robinhood-chain ETH balance every 3s for up to 5 minutes
    (`BALANCE_POLL_INTERVAL_MS`/`BALANCE_POLL_TIMEOUT_MS`), used for BOTH
    `relay-to-print`'s leg 1→2 handoff (a real cross-chain bridge, timing
    genuinely unpredictable) and as the recovery path when Solana's own
    blockhash-timeout error fires (see above) — one mechanism covers
    both, not two separate ad-hoc retry loops. The loading overlay's
    label ticks a live "Checking for bridge… (Ns)" counter each poll
    (Dylan: "with a 3 second counter and loading thing it would feel
    engaging while they wait") rather than sitting on static text.
  - **"Resume swap"**: right when leg 1 lands (before waiting on its
    output, or before firing leg 2), a `PendingResume` record — plan,
    both tokens, amount, slippage, and the pre-leg-1 balance needed to
    compute leg 2's real input — is written to `localStorage`
    (`hoodprint_swap_pending`, `lib` pattern mirrors the existing
    `hoodprint_swap_txs` feed). If the tab closes before leg 2 fires, the
    Transactions section shows a "Resume swap" row (filtered to the
    currently-connected wallet only) on next visit. Clicking it calls the
    SAME leg-2 logic doSwap() itself uses — `runPrintBuyLeg2()`/
    `runRelayToTokenLeg2()` were extracted out of `doSwap()`'s
    `relay-to-print`/`print-to-relay` branches into component-level
    functions specifically so this fund-moving code exists in exactly one
    place, called from both `doSwap()` and the new `resumeSwap()`, rather
    than being duplicated (and risking the two copies drifting apart).
    Only these two plans are ever recorded — `curated-to-print`/
    `print-to-curated` are same-chain and settle in normal EVM block
    time, nothing meaningful to resume there. The record is removed on a
    successful leg 2, or via an explicit "✕" dismiss; a failed/timed-out
    wait leaves it in place on purpose so it's still there to resume
    later.
  - `ensureEvmChain()` (the chain-switch-then-fresh-client helper from
    the earlier fix above) was hoisted from a local `const` inside
    `doSwap()` to a component-level function so `resumeSwap()` can share
    it too — same reasoning as the leg-2 runners.
- **Relay tx link on every Relay-touching row** (Dylan: "make an easy link
  to the relay txn on the relay site... so they can see the bridge tx").
  `lib/relayLeg.ts` `relayTransactionUrl(quote)` reads `steps[].requestId`
  off the Execute object (present as soon as `getQuote()` returns, before
  `execute()` ever runs — the exact same field relay-kit-ui's own
  `extractQuoteId()`/`SwapSuccessStep.js` build their own "view transaction"
  link from: `https://relay.link/transaction/<requestId>`) — this is
  Relay's own real transaction-status page, not something invented.
  `SwapTxRow`/`PendingResume` both gained an optional `relayUrl` field.
  `relay-only` and `runRelayToTokenLeg2` (print-to-relay's leg 2) capture
  it from their own just-executed quote's result; `relay-to-print` reads
  it off `quote1` right after fetching it (before execute, since a Solana
  leg-1 timeout is swallowed and there's no post-execute result object in
  that path) and threads it through both `addPendingResume` (so a later
  *resumed* leg 2 still has it — leg 1's original quote object is long
  gone by the time a resume fires, possibly a different session) and
  `runPrintBuyLeg2`. Same-chain self-routed plans (print-buy/print-sell/
  curated-to-print/print-to-curated) never touch Relay, so never get one.
- **The "Resume swap" UI redesign that actually shipped broke on first
  render** — Dylan's screenshot showed a giant broken block: the row's
  text wrapped one word per line down a tall column while the "Resume
  swap" button rendered full-bleed-width, overlapping everything. Root
  cause: `.pb-card button { width:100%; margin-top:14px; padding:12px;
  border-radius:9px; font-size:0.9rem; border:1px solid var(--border); }`
  (an existing generic rule for the Buy Bot's own big block-style buttons)
  has higher CSS specificity (class+type) than a single class selector
  like `.swap-pending-resume` — so its `width:100%` won outright,
  ballooning the button and squeezing the sibling text span (`flex:1;
  min-width:0`) down to near-zero width, wrapping every word. Same
  category as the "Mobile CSS gotcha" documented lower in this file
  (later/higher-specificity base rule silently wins over an intended
  override) — confirmed by reading the cascade, not guessed.
  **Fixed by redesigning, not just patching specificity**, per Dylan's
  follow-up ("Resume swap needs to go away automatically after success,
  also... The resume swap button should be really small within the line,
  same with the Relay Tx button... very small, within the small recent tx
  line"): pending-resume rows now render as compact single-line entries
  *inside* `.pb-txs` itself (reusing `.pb-tx`'s own row/dot/amount/hash
  layout, `pending` status for the amber blinking dot) rather than a
  separate full-width card block above it, with small inline `Resume`/`✕`
  chips at the end of the line. The real tx rows changed from one
  whole-row `<a>` to a `<div>` with small trailing `.pb-tx-link` chips
  (`↗` to the chain explorer, plus `Relay ↗` when `relayUrl` is set) —
  same reasoning: a single small link/button per action, not one giant
  click target. New button/link selectors are scoped `.pb-txs
  .pb-tx-resume`/`.pb-txs .pb-tx-dismiss` (two classes, specificity
  (0,2,0)) specifically to out-rank `.pb-card button`'s (0,1,1) rather
  than repeat the same silent-override bug; verified by rendering the
  real compiled CSS output (`/_next/static/css/*.css` from a live `npm
  run start`) against the actual row markup via CDP and measuring real
  `getBoundingClientRect()` heights — each row is a genuine single line
  (~38px tall) with all text/buttons flowing inline, not stacked.
  **Auto-clear bug, separately real**: `doSwap()`'s own two success paths
  (`relay-to-print`/`print-to-relay`) called `removePendingResume()`
  (localStorage) on success but never called `setPendingResumes()` to
  update the component's own React state — so a pending row could still
  be showing stale after a *successful* swap completed in the same tab
  until something else (an address change) happened to re-trigger the
  loader effect. `resumeSwap()` itself already did this correctly; the
  two `doSwap()` success branches were missing the matching
  `setPendingResumes((prev) => prev.filter(...))` call, now added.
- **Mainnet ETH → $PRINT failed outright, a genuine third chain-mismatch
  bug** (Dylan: "SOL works now, but ETH totally doesnt work at all"),
  distinct from the two chain-mismatch bugs fixed earlier the same day —
  `ConnectorChainMismatchError: The current chain of the connector (id:
  4663) does not match the connection's chain (id: 1)`. Root cause, this
  time inside `@wagmi/core` itself (`getConnectorClient.js`): after
  `switchChainAsync({chainId})` resolves, `getWalletClient` re-queries the
  injected wallet's LIVE `getChainId()` and throws if it doesn't already
  match the target — but `switchChainAsync`'s own promise can resolve
  slightly *before* the extension's `eth_chainId` has actually caught up
  to the new network, a real timing gap in the wallet/extension itself,
  not a bug in this codebase's switch logic (confirmed by reading
  `@wagmi/core`'s source directly, not guessed). `ensureEvmChain()` now
  retries `getWalletClient` up to 5 times with a 250ms backoff,
  specifically (and only) when the thrown error is a real
  `ConnectorChainMismatchError` (imported from `wagmi` itself and checked
  via `instanceof`, not string-matched) — any other error still fails the
  swap immediately as before.
- **Chain-hover popup on every currency in Transactions** (Dylan: "show
  what chain it was on in a little popup with our sites style") — cross-
  chain means the same symbol (ETH, USDC) can legitimately appear on 3+
  different chains in the same list, ambiguous without this. `ChainTag`
  (`components/PrintDirectSwap.tsx`) wraps a symbol in a small `:hover`-
  driven popup (`.pb-chain-tag`/`.pb-chain-tip` in `globals.css`) showing
  the chain's name + icon from `CHAINS` (`lib/robinhoodTokens.ts`) — a
  plain CSS popup styled to match the site, not the native browser
  `title` tooltip. `SwapTxRow`/`PendingResume` both gained optional
  `fromChainId`/`toChainId` fields, set at every `addTx`/`addPendingResume`
  call site (same-chain plans hardcode `CHAIN.id` on both sides; cross-
  chain ones read the real `fromToken.chainId`/`toToken.chainId`) —
  `runPrintBuyLeg2` gained a required `fromChainId` param for this reason
  (curated-to-print's own leg 2 doesn't call it, so this only affects the
  two callers that do: `doSwap()`'s relay-to-print branch and
  `resumeSwap()`). Rows persisted before this field existed simply have no
  chainId — `ChainTag` renders the plain symbol with no tag/popup at all
  in that case, rather than guessing. **This was originally written to
  default to `CHAINS[0]` (Robinhood)**, reasoned as "correct for every
  pre-cross-chain row since they were all Robinhood-only anyway" — wrong,
  caught immediately by a real live SOL→PRINT row from earlier the same
  session (predates this feature, so genuinely has no `fromChainId`)
  showing "Robinhood" on its SOL leg. Confidently guessing wrong is worse
  than showing nothing, so the fallback is now "no tag" instead of "best
  guess."
  **Truncation vs. popup clipping**: `.pb-tx-hash` used to have
  `overflow:hidden;text-overflow:ellipsis` directly on it (needed for the
  raw-hash fallback text when a leg's output isn't known yet) — an
  ancestor with `overflow:hidden` clips ALL descendants regardless of
  their own `position`, which would silently clip `.pb-chain-tip`'s
  popup too. Moved the truncation onto a new inner `.pb-tx-hash-truncate`
  span used only for that fallback case, so the normal `→ amt <symbol>`
  case (where the popup lives) has no clipping ancestor of its own.
  `.pb-txs` itself is still a `overflow-y:auto` scroll container, so a
  popup on a row right at the very top/bottom edge of the visible
  scrolled area can still get clipped — a known, accepted minor tradeoff
  for a plain CSS tooltip rather than a JS-positioned portal, not worth
  the extra engineering for a small hover-info popup. Verified live via
  CDP: rows stay single-line (~38-39px tall) with the popup unaffected,
  and hovering a chain tag renders it with `opacity:1`/`visibility:visible`
  showing the correct chain name.
  **Shipped with the popup opening upward by default** (`bottom: calc(100%
  + 6px)`) — broke immediately on the very first row (Dylan: "chain hover
  popup doesnt show on first row, its under the border"), exactly the
  top-edge clipping risk already flagged above, just hit sooner than
  expected since the first row is the one everyone's most likely to hover
  first. Flipped to open downward (`top: calc(100% + 6px)`) instead — same
  theoretical clipping risk now sits at the last visible row of a
  scrolled list instead of the first, a much less likely thing to hit.
- **Bridge-wait counter fixes, from two real live reports the same day**
  (Dylan: "ETH works now, however the loading screen doesnt show waiting
  for bridge. also, the sol waiting screen shows waiting for bridge but
  stays stuck on 0s... just make it keep counting up 0s 1s 2s 3s... until
  it confirms"). Root cause of both: `waitForBalanceIncrease()`'s
  `onTick` callback used to fire only once per actual balance-poll
  iteration (every `BALANCE_POLL_INTERVAL_MS` = 3s), coupling the DISPLAY
  cadence to the POLL cadence. For a fast mainnet-ETH bridge that already
  landed by the very first poll, the loop returns before `onTick` ever
  fires once — "Checking for bridge…" never appears at all. For a slower
  Solana bridge, the counter genuinely only updates once every 3 real
  seconds, which reads as "stuck" between ticks even though it's working.
  Fixed by decoupling entirely: a separate `setInterval(..., 1000)` now
  drives `onTick` once immediately (so even a bridge that resolves before
  the first poll still shows at least a flash of "0s") and then every
  second after, independent of the underlying 3s poll loop — cleared in a
  `finally` block so it can't keep firing after the wait resolves either
  way (success or timeout).
  **Still not enough, per two more real live reports the same day**
  ("theres no counting timer for the bridge when u do base ETH to print"
  / "same problem with ETH, no bridge counting timer") — both a real Base
  and a real mainnet ETH→$PRINT bridge settled so fast that the very
  first balance check inside the poll loop already found the funds had
  arrived, returning before the counter had been visibly on screen long
  enough to register as "counting" at all (the immediate `onTick(0)` call
  from the fix above technically fired, but for a fraction of a second —
  not what "0s 1s 2s 3s... to show its counting and active" was actually
  asking for). Fixed with a deliberate minimum: after the immediate tick
  and starting the 1s ticker, `waitForBalanceIncrease` now always awaits
  one full second before ever checking the balance for the first time —
  guaranteeing at least "0s" then "1s" are genuinely visible on every
  bridge, however fast, before it's ever allowed to resolve. A slower
  bridge (Solana) is unaffected beyond that one extra second up front —
  the same 1s ticker and 3s poll loop continue exactly as already fixed
  above.
  **Still one gap left, per a fourth report the same day** ("the counter
  is not coming up quickly enough after i submit from ETH mainnet. it
  needs to start counting immediately after i submit"): all three fixes
  above only ever covered the POST-leg-1 balance-wait phase — nothing
  ticked during leg 1 itself (wallet-signing + Relay's own on-chain
  confirm before the funds even land), which for a real cross-chain
  bridge can be the bulk of the actual wait. New `startElapsedLabel()`
  helper starts a live "label (Ns)" counter the INSTANT it's called
  (right before `executeRelayLeg` even fires the wallet prompt) rather
  than only once `waitForBalanceIncrease` begins — the counter itself
  never stops ticking regardless of what's happening underneath. Its
  `startedAt` timestamp is then reused (not a fresh `Date.now()`) as the
  anchor for leg 2's `waitForBalanceIncrease` onTick label too, so the
  number the user sees is ONE continuous count from the moment they
  submitted, not a restart-to-0 when the balance-wait phase begins.
  **Text, corrected right after**: this version initially let Relay's own
  `onProgress` text drive the label prefix (e.g. "Confirming
  transaction…") — Dylan caught a real one on screen, "Depositing funds
  to the relayer to execute the swap for ETH," and said it plainly
  "doesnt need to say" that. Relay's internal step descriptions are real
  but too verbose/implementation-specific for this UI. Now the label is
  hardcoded to "Checking for bridge…" the moment Relay's own progress
  starts firing at all (`p.label`'s actual content is ignored entirely) —
  same simple copy leg 2's wait already used, just extended to cover leg
  1 too instead of two different phrasings for what's the same underlying
  wait from the user's perspective.
- **Phantom "Connect Phantom" showed even when already connected**
  (Dylan: "every time i switch to Solana, it says connect phantom at the
  bottom. but my phantom is already connected, because i click the button
  and it instantly populates... just populate with my balance and phantom
  info"). Root cause in `lib/solanaWallet.ts`'s `useSolanaWallet()`: the
  mount effect only checked `provider.publicKey` directly — but Phantom
  doesn't populate that field on page load just because the site was
  approved in an earlier session; it needs an explicit `connect()` call,
  which is exactly why a real click "instantly populated" with no prompt
  (silently already-authorized). Fixed using Phantom's own documented
  eager-reconnect flag, `connect({ onlyIfTrusted: true })`: resolves
  silently for a previously-approved site (populating `address` on mount,
  no prompt), rejects silently for one that was never approved (caught,
  ignored) — safe to fire unconditionally, no risk of an unwanted connect
  prompt appearing on page load for a first-time visitor.

### Swap SEO + OG image (2026-07-28)
`/swap` previously had only a generic title/description and no OG image
of its own — it fell through to the site-wide default `og.png`, unlike
`/print`/`/multisend`/`/rwa`, which all had bespoke everything. Brought
up to parity: `scripts/render-assets.mjs` gained `og-swap.png`, same
product-card layout as those three (wordmark, feature chips, url) with
a green **LIVE** badge instead of BETA — swap isn't beta anymore, it's
the primary buy destination sitewide. Headline "Swap Anything," chips
lead with the real differentiators (any token/any chain, 4 chains live,
always the right $PRINT pool) rather than generic swap-UI copy.
`app/swap/page.tsx` gained real `title`/`description`/`keywords`,
`openGraph`/`twitter` cards pointing at the new image, and a
`WebApplication` + `FAQPage` JSON-LD `@graph` (same pattern as
`/multisend`) — backed by a real on-page `swap-about` section (own
`.swap-about` CSS, byte-identical to `.ms-about`/`.rwa-about` per this
codebase's convention of each page keeping its own copy rather than
sharing) with visible `<details>` FAQ covering buying $PRINT, cross-chain
support, why not a generic aggregator (the wrong-pool-routing story from
the incident above), and the fee — so the structured data has real
crawlable content behind it, not just a JSON-LD block with nothing on
the page to back it.
**Copy corrected 2026-07-29** (Dylan: "it should not say that because
its a swap for everything"): the image's third chip and subhead
originally leaned on "always the right $PRINT pool" as the headline
differentiator — accurate but too $PRINT-specific for a page whose
whole pitch (by this point) is any-token/any-chain. Subhead is now
"Any token, any chain — swapped safely, every time," third chip is
"Safe & Secure" (also swapped in for `og:title`/`twitter:title`'s
"Safely Routed," same wording change, same reasoning). Real gotcha hit
regenerating it: a raw `&` in SVG text content is invalid XML and
crashed sharp's renderer (`xmlParseEntityRef: no name`) — needed
`&amp;` instead, same escaping any SVG/XML text content always needs.

### Shareable pre-filled swap links + PRINT Swap rename (2026-07-29)
Dylan: "how hard would it be to add the currencies into the URL so then
people can share any trade... I can say 'buy cashcat' and send them a
link." `lib/robinhoodTokens.ts` gained `findTokenBySymbol(symbol,
chainId?)` (case-insensitive lookup across `CURATED_TOKENS` — every
curated/trending/RWA/cross-chain token in one flat array already, so no
new lookup table needed) and `chainIdFromParam(nameOrId)` (accepts a
chain's display name or raw numeric id, for `CHAINS`). Symbols that
exist on more than one chain (ETH/WETH/USDC/USDT) resolve to Robinhood
Chain by default (first match in `CURATED_TOKENS`'s array order) unless
disambiguated.
`components/PrintDirectSwap.tsx`'s `InnerDirectSwap` reads `?from=`/
`?to=` (plus optional `&fromChain=`/`&toChain=`) once on mount via a
plain `new URLSearchParams(window.location.search)` — deliberately NOT
`next/navigation`'s `useSearchParams()`, which would force `/swap` out
of static prerendering unless wrapped in a `<Suspense>` boundary; the
plain browser API needs neither and keeps the page `○ Static`. If only
`to` is given and it resolves to a Solana-chain token, `from` defaults
to native SOL instead of ETH (SOL is the natural origin for a Solana
buy link); every other case keeps ETH as the default unless `from` is
explicit — matches Dylan's own framing ("default can be ETH or SOL")
once he'd also confirmed the common case is both sides being given
explicitly, not just `to`. **Verified live against a real prod build**
via headless CDP (not just read the code): `?to=cashcat` → ETH/CASHCAT,
`?to=usdc&toChain=solana` → SOL/USDC (SOL-default logic fired
correctly), `?from=cashcat&to=hoodrat` → CASHCAT/HOODRAT, plain `/swap`
→ unchanged ETH/PRINT defaults. First two attempts at this verification
falsely looked broken — a 5s wait after `Page.navigate` wasn't enough
for this page's ~600kB client bundle (wagmi/RainbowKit/Relay SDK) to
hydrate under headless Chrome with multiple accumulated tabs; bumping
the wait to 10-14s showed every case working correctly. Not a real bug,
just a lesson for testing this specific page: **give `/swap` generous
hydration time in headless verification, longer than lighter pages
need.**
No UI for generating these links (e.g. no "copy link" button) — Dylan's
own workflow is typing the URL by hand when he already has both tokens
in mind, which is the common case per his own clarification mid-task.
**Rename**: Dylan, separately, on seeing a real link preview: "social
share title should say PRINT Swap not HOOD Printer Swap. This is called
PRINT Swap." Every "HOOD Printer Swap"/"HOODPrinter Swap" string in
`app/swap/page.tsx` (og:title, twitter:title, og:image alt, JSON-LD
`WebApplication` name, FAQ questions/answers, on-page copy) renamed to
"PRINT Swap" — the plain `<title>` tag didn't need it, it was already
generic and never said the old name. Only `/swap`'s own copy changed —
`/print`'s "HOOD Printer Buy Bot" branding is a different, correctly-
named product and wasn't in scope.
**SEO strengthened same session** (Dylan: "make sure we are SEO'd for
having a swap and bridge from any token, any chain. specifically
mention Robinhood, SOL, base, Ethereum"): title/description/keywords/
FAQ now explicitly name all four chains together with "bridge" language
throughout, not just "cross-chain swap" — added keywords like "Solana
bridge"/"bridge to Robinhood Chain", reworded FAQ questions to "swap or
bridge," and the `swap-about` H2 now names all four chains instead of
just "Robinhood Chain & $PRINT."

### Shareable links also accept raw contract addresses (2026-07-29)
Dylan pushed back on symbol-only links: "idk that sounds risky shouldnt
we just use contract addresses? it would be safer and more reliable."
Correct call on reliability, but backwards on safety — symbols are
restricted to `CURATED_TOKENS` (our own hand-vetted list), so they can
never resolve to an address we haven't reviewed; a raw address would
need to trust that contract's own self-reported symbol/name (or Relay's
metadata), which is exactly what a phishing token spoofs. Landed on
both: symbols stay the safe default, addresses are an opt-in escape
hatch reusing the exact same trust boundary the picker's own paste-a-CA
box already has (`resolveCustomToken`). `lib/robinhoodTokens.ts` gained
`looksLikeEvmAddress`/`looksLikeSolanaAddress` (standalone, so a URL
param can auto-detect which chain an address belongs to without already
knowing it) plus `looksLikeAddress(chainId, q)` as the existing
chain-aware wrapper — `TokenPickerModal.tsx` dropped its own duplicate
copy in favor of this shared one. `?to=`/`?from=` in
`PrintDirectSwap.tsx`'s mount effect now try address-shape detection
first (defaulting to Robinhood Chain for `0x...` or Solana for a base58
mint, unless `&toChain=`/`&fromChain=` says otherwise) before falling
back to the curated symbol lookup. **Verification note**: the first two
rounds of live CDP testing showed a hard "Application error" client
crash (React error #423) on EVERY `/swap` load, including with zero
query params — looked like a real regression. Root cause was `pkill -f
"next start"` silently failing to kill the actual `next-server` child
process across several restarts, so a stale server from an earlier
build kept answering on the port the whole time while newer builds
never actually got served. Killing by port (`lsof -ti :4123 | xargs
kill -9`) instead of process-name pattern fixed it — once a genuinely
fresh server was running, all cases (symbol, address, chain-disambiguated,
no-params) resolved cleanly with zero exceptions.

### Balance refetch + mobile Transactions rework (2026-07-29)
Two more real reports the same session:
- **"my WETH balance didnt update to 0 after I swapped all of it."**
  The `useBalance` calls for both sides had no explicit refetch anywhere
  — a code comment even said "wagmi's own block-watching keeps EVM
  balances fresh automatically," which isn't reliable enough in
  practice. Both `doSwap()`'s and `resumeSwap()`'s `finally` blocks now
  call `refetchFromBalance()`/`refetchToBalance()` explicitly (the
  `refetch` each `useBalance` call already returns) — fires on every
  attempt regardless of outcome, not just a clean success path. Solana
  still uses the pre-existing `solBalanceNonce` nudge (wagmi can't query
  a non-EVM chain).
- **"look at the transactions section on mobile. needs a big rework for
  mobile. Its all overlapping."** Confirmed live via headless CDP at a
  real 393px width using a standalone test page built from the site's
  own compiled CSS (no wallet connection available in-session to
  populate real rows, and localStorage-seeded fake rows don't render
  either — both `txs` and `pendingResumes` restore are gated on a
  connected `address`, so a plain JS/localStorage seed without a real
  wagmi connection never shows up; building a static HTML page against
  the real `/_next/static/css/*.css` output sidestepped that entirely).
  A `.pb-tx` row's ~5 children (status dot, amount, description,
  timestamp, link chips, sometimes Resume/dismiss) were almost all
  `flex: 0 0 auto` — never shrink — on one single non-wrapping flex
  line: a pending-resume row's longer text alone overflowed its row by
  ~150px, and a long token symbol (e.g. STONKBROKER, stress-tested)
  could do the same to an ordinary completed-tx row. **Fix**: each
  row's children now group into two child divs, `.pb-tx-main` (the
  swap description) and `.pb-tx-meta` (timestamp/links, or
  Resume/dismiss) — grouped in the JSX itself, not just CSS, so the
  split works regardless of which trailing controls a given row
  happens to have. Desktop is pixel-identical to before (still one
  line — `.pb-tx-main`/`.pb-tx-meta` are just flex children of the same
  `.pb-tx` row); a new `max-width: 640px` query (matching an existing
  breakpoint already used elsewhere in this file) sets `.pb-tx` to
  `flex-wrap: wrap`, forces each group to `flex: 1 1 100%` (its own
  line), and switches `.pb-tx-hash` from `nowrap` to `normal` so long
  text wraps instead of overflowing. `.pb-tx-hash-truncate` (the raw-
  hash fallback, used when a leg's output isn't known yet) got its own
  explicit `white-space: nowrap` so its ellipsis truncation stays
  correct now that it can no longer rely on inheriting `nowrap` from
  the parent. Verified live: zero horizontal overflow across 5 rows
  (`row.scrollWidth === row.getBoundingClientRect().width` for every
  one, including the STONKBROKER stress case) at both 393px and
  1100px; screenshots confirm desktop is byte-for-byte the same layout
  as before and mobile now reads as clean two-line rows.

### Relay false-failure recovery + SOL MAX fix (2026-07-29)
Real live incident: Dylan swapped 20 SOL to CASHCAT — "it claimed it
failed but it actually worked... it didnt record the trade in
transactions." Root cause: `relay-only` (neither side touches $PRINT,
e.g. SOL → CASHCAT) had zero recovery if Relay SDK's `execute()` call
rejected — same root cause as the already-documented Solana blockhash-
expiry issue (a signed tx, or Relay's own confirmation of it, can land
AFTER our client-side wait gives up), just hitting a plan that had
never been hardened against it. `relay-to-print` already survives this
class of bug by re-checking our OWN destination ETH balance
afterward — `relay-only` has no leg of ours left to verify against
(destination token/chain is arbitrary), so the swap just got reported
as failed and silently never written to the tx feed, even though it
had genuinely landed.
- **`lib/relayLeg.ts`**: `relayRequestId(quote)` (the id was already
  extractable pre-execute — `relayTransactionUrl` just never exposed it
  raw), `checkRelayRequestStatus(requestId)` /
  `waitForRelaySuccess(requestId, opts)` — polls Relay's own
  `https://api.relay.link/requests/v2?id=<requestId>` status endpoint,
  which is ground truth independent of whether our own client-side
  `execute()` call succeeded. Endpoint + exact field shape (`status`,
  `data.inTxs[0].hash`, `data.outTxs[0].hash`,
  `data.metadata.currencyOut.amountFormatted`) verified live against a
  real successful request (`?status=success&limit=1`), not guessed —
  same investigative discipline as the earlier "REAL fund-location
  scare" incident, just automated into the actual error path instead of
  a one-off manual check. `/requests/v3` exists too (per Relay's docs)
  but requires an `x-api-key` header we don't send client-side; v2 works
  unauthenticated and is what the earlier manual incident already used
  successfully, so stuck with it rather than standing up a server route
  just to hold `RELAY_API_KEY` (already unused dead config — see
  earlier Swap section note).
- **`components/PrintDirectSwap.tsx`**: both `relay-only` (in `doSwap`)
  and `runRelayToTokenLeg2` (print-to-relay's leg 2 — identical risk,
  identical fix) now wrap `executeRelayLeg` in its own try/catch; on
  failure, poll Relay's request status via the id already known from
  the quote (present before `execute()` ever ran) before concluding the
  swap actually failed — only treated as recovered on an explicit
  `"success"` status, anything else (including "couldn't determine
  within the poll window") re-throws the original error so
  `describeError`'s existing Solana-timeout-aware messaging still
  applies. A recovered success now builds the exact same tx-feed row
  and `finalOk`/`setReceivedAmt`/etc. state the normal success path
  does, so a swap that really landed gets correctly recorded and shown
  as successful instead of a false "failed" with the trade missing from
  Transactions.
- **SOL MAX button, same session**: "clicking the SOL balance didnt
  update my trade to my full balance." `setMaxAmount()` only ever
  handled `fromToken.isNative` via wagmi's `fromBalanceData` — SOL is
  also `isNative: true`, so it fell into that branch, found
  `fromBalanceData` always empty (wagmi can't query a non-EVM chain),
  and silently no-opped. Added a dedicated Solana branch ahead of it
  using `solFromBalance`, reserving ~$1 of SOL for gas
  (`FALLBACK_GAS_RESERVE_SOL = 0.01`, same "leave a buffer" intent as
  `FALLBACK_GAS_RESERVE_ETH` — priced via the already-fetched
  `fromUsdPrice` when available, same pattern as the ETH branch's
  `ethUsd`).
- **Verification note**: build clean, live CDP smoke test on a real
  prod build (a SOL→CASHCAT `relay-only` plan resolves with zero
  console exceptions via `?from=sol&to=cashcat&fromChain=solana`). The
  actual recovery code path (`execute()` throwing mid-flight, then the
  status poll rescuing it) isn't independently re-creatable in this
  environment without a funded wallet triggering a real failure — same
  gap already noted elsewhere in this file for other unfundable-wallet
  cases. The fix targets the exact mechanism a real incident pointed
  to, using a live-verified API, rather than being an end-to-end
  reproduction.

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
  (no more pre-launch countdown/sold-out messaging needed). The
  `.contract-box` (CA + copy button) sits right under `.hero-sub` and above
  `.hero-cta-group` — moved up from below `<MoneyPrinter />` per Dylan, so
  the CA is visible before scrolling past the buy button, not after. That
  move broke on desktop (`display: inline-flex` let the box run onto the
  same line as the Buy/Chart buttons instead of its own row) — fixed with
  `display: flex; width: fit-content` (commit `399baeb`). On mobile the
  full 42-char address wrapped the box across 3 lines; fixed by rendering
  a truncated `0x6af5…9b1d` form (`.contract-short`, real address still
  copied via `CopyAddress`) below 640px, full address above it
  (`.contract-full`) — same address, just two `<code>` elements toggled by
  media query rather than truncating in JS, so no layout-shift/hydration
  mismatch risk. **`components/AddToMetaMask.tsx`** — a small icon-only
  button next to `CopyAddress` (`.mm-add-btn`, 28x28px, matches `.copy-btn`
  height) firing `wallet_watchAsset` (EIP-747) via `window.ethereum` to
  prompt "Add $PRINT to your wallet." Not actually MetaMask-exclusive —
  any injected wallet implementing EIP-747 (Rabby, Coinbase Wallet
  extension, Brave Wallet, etc.) responds to the same call via the same
  `window.ethereum` — but the icon/copy frames it as MetaMask per Dylan
  ("most people use metamask... focus on metamask"). No wagmi/RainbowKit
  dependency (the homepage isn't wrapped in that provider) — calls
  `window.ethereum.request` directly, falls back to opening
  metamask.io/download if no injected provider AND not on mobile. **Icon**:
  went through two versions before landing on the real thing. First was an
  original hand-drawn inline SVG (avoiding the trademarked logo, same
  spirit as the generic token-fallback badge in `TokenPickerModal.tsx`)
  with bat-wing-shaped ears flaring off a plain diamond — read as an
  alien/deer, not a fox (Dylan: "are u sure thats the metamask fox logo it
  looks a little weird"). Redrew it with ears on top of a tapered
  head/muzzle/nose — better, but still not the real logo, and Dylan called
  that out too with a link to the actual asset. **Now uses MetaMask's real
  fox artwork** — `public/brand/metamask-fox.svg`, pulled from Wikimedia
  Commons' mirror of the official SVG
  (`commons.wikimedia.org/wiki/File:MetaMask_Fox.svg`,
  `upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg` for the
  raw file, not the `/thumb/.../960px-*.png` raster Dylan linked). This is
  standard nominative/referential use — indicating "this button
  interoperates with MetaMask," the same category as any site's "Add to
  MetaMask" or "Download on the App Store" badge — not a claim of
  affiliation. `<img>` tag, not inlined, so it's byte-identical to the
  official asset with no hand-editing risk.
  **Mobile deep-link** (Dylan: "make it open the metamask app from safari
  on mobile, other links do this successfully" — referring to how
  RainbowKit's own MetaMask connector on `/swap` deep-links out of mobile
  Safari): mobile Safari has no injected `window.ethereum` at all, so the
  direct EIP-747 call silently has nothing to call. `isMobileUA()` detects
  iOS/Android and, when there's no injected provider, redirects to
  MetaMask's official `https://metamask.app.link/dapp/<url>` universal
  link instead of the desktop `metamask.io/download` fallback — this
  reopens the same page inside MetaMask's own in-app browser, where
  `window.ethereum` DOES exist. A `mmAddToken=1` query param survives that
  round trip so a `useEffect` on mount fires the `wallet_watchAsset`
  prompt automatically once back inside MetaMask, instead of making the
  user tap "Add to MetaMask" a second time — param is stripped via
  `history.replaceState` right after being read. **Chain guard**:
  `wallet_watchAsset` has no `chainId` param — it silently adds the token
  against whatever chain the wallet currently has active, which (per
  Dylan: "it only works if the user is already on Robinhood chain") meant
  a wallet sat on mainnet or any other chain would get a $PRINT entry
  that's really a mainnet-chain token with that address — no error, just
  a dead entry that never shows a real balance. `ensureRobinhoodChain()`
  now checks `eth_chainId` first and, if it doesn't match `0x1237`, runs
  the same `wallet_switchEthereumChain` → (on error code `4902`, meaning
  unrecognized chain) `wallet_addEthereumChain` fallback already used by
  `PrintBot.tsx`'s `addOrSwitchNetwork()` — before ever calling
  `wallet_watchAsset`. If the user rejects the switch, the whole call
  throws and surfaces as the existing "Couldn't add — try again" state,
  rather than silently adding on the wrong chain. Verified with a mocked
  `window.ethereum` (via CDP `Page.addScriptToEvaluateOnNewDocument`)
  simulating a mainnet-active wallet: confirmed `wallet_watchAsset` only
  fires after `wallet_switchEthereumChain` resolves to `0x1237`, and that
  an already-correct chain skips the switch call entirely (no extra
  prompt for the common case).
- **`<MoneyPrinter />`'s SVG reserved more empty height below the printer
  than the static artwork uses** — flagged by Dylan as "a big space under
  the graphic on mobile and desktop." First attempt at a fix (shrinking
  `viewBox` to `400 305` + `slotClip` height to `55` + the fall keyframe's
  exit `translateY` to `45px`) was WRONG and made it worse: Dylan caught it
  immediately — "looks like u cut off the bottom of the printer artwork
  and left the blank space." Root cause of that regression: the ETH bill
  graphic itself is 110 viewBox units tall (`<g id="ethBill">`, y=252–362),
  but the shrunk `slotClip` band was only 55 units — smaller than the bill
  — so the bottom half of the bill was hard-clipped at every frame,
  including at rest/full opacity, not just during the fade-out tail.
  **Reverted `viewBox`/`slotClip`/keyframe exactly back to their original
  values** (`400 430` / height `180` / `translateY(150px)`) — the
  animation itself was never the problem. The actual dead space was
  `.hero`'s own `padding-bottom: 72px` stacking on top of the next
  `section`'s `padding-top: 84px` (156px combined) on top of the SVG's own
  ~55–80px of internal idle buffer below the resting bill — trimmed just
  `.hero`'s bottom padding to `28px` (pure empty CSS space, verified via
  live `getBoundingClientRect()` measurement, zero risk to the artwork)
  instead of touching the SVG's geometry at all. Net: full uncropped
  artwork, ~130px less trailing gap, confirmed via CDP screenshots across
  multiple points in the animation loop (not just one frame) before
  shipping this time.
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
- `components/RoadmapTimeline.tsx`: Phase 03 "The Buy Bot" (Beta Testing =
  active/yellow, etc.); GemPad Presale item softened to upcoming, no live link.
  See RWA Pools section above for the 2026-07-25 phase reorder (RWA Pools
  now Phase 02, Multisend folded into a single Buy Bot milestone).

## Mobile CSS gotcha (recurring)
Media-query rules don't add specificity — a later, equal-specificity base rule
overrides an earlier `@media` override (source order wins). This shadowed the
mobile `.pb-head h1` and the `.pb-tile-wd` withdraw buttons. Fix at the base
rule (e.g. `clamp()`), or raise the override's specificity.

**Any focused text `<input>` under 16px font-size triggers iOS Safari's
auto-zoom-on-focus** — the whole page zooms in, not just the input. Caught
on `/swap`'s `TokenPickerModal`: its search box is `autoFocus`, so the zoom
fired the instant the modal opened ("when u click the switch currency it
zooms in a little" — not from an explicit tap into the field, from the
modal opening at all). Fixed by setting `.tp-search` to a flat `16px`. For
inputs that need to stay genuinely tiny for a design reason (`.swap-slip-
custom input`, the editable custom-slippage %, sized to match its 7%/10%
sibling pills) — set the real `font-size: 16px` to stop the zoom, then
`transform: scale(...)` back down to the old visual size instead of
letting it render bigger than its neighbors; `transform-origin: right
center` keeps the right-aligned text anchored. True mobile screenshots
(CDP device emulation at 393px, not headless `--screenshot`'s ~800px
default) are what actually caught this — see "True mobile screenshots"
above.

**A sidebar with zero function on mobile still costs real width** (fixed,
then later fully replaced — see "Chain picker" below). `TokenPickerModal`'s
chain sidebar (a single static "Robinhood Chain" row — no chain-switching
was wired up yet) was eating ~110px of a ~360px-wide modal on a real
phone, squeezing the token list and truncating the search placeholder
("paste ac…"). First fix: `display: none` below 520px. Superseded
entirely on 2026-07-25 when the sidebar itself was replaced with a top
pill row (Dylan preferred that layout outright, not just as a mobile
patch) — see "Chain picker" in the Swap section.

---

## Related memory files
`~/.claude/projects/-Users-dylanrhodes-Documents-hoodprinter/memory/`:
`hoodprinter-github-vercel`, `hoodprinter-onchain`, `hoodprinter-buy-stats`,
`hoodprinter-airdrop-signups`, `hoodprinter-rwa-pools`, `hoodprinter-swap-relay`,
`always-push-to-github`.
