"use client";

import { useEffect, useMemo, useState } from "react";
import { CHAINS, PINNED_TOKENS, isSolanaChain, resolveCustomToken, tokenKey, tokensForChain, type RhToken } from "@/lib/robinhoodTokens";

// Styled after Relay's own "Select Token" modal (search box + result list,
// icon/symbol/name/truncated-address rows) so switching between this and
// the Relay-embedded parts of the site feels like one product.
//
// Chain picker (top pill row, lib/robinhoodTokens.ts CHAINS): shipped
// 2026-07-25 as layout-only (Base/Solana rendered but inert, "Soon" badge)
// ahead of the actual cross-chain routing + wallet work. That work shipped
// 2026-07-28 (Dylan: "enable base, SOL, ETH") — all four chains are now
// real, clickable, and change which token list is shown (`browseChainId`
// below), same pattern proven in the dylmusic project's own multi-chain
// token picker. See components/PrintDirectSwap.tsx route-planner comments
// for how a non-Robinhood-chain pick actually routes: any leg touching
// $PRINT still always goes through our own pool, never Relay, no matter
// which chain the other side of the swap is on.
type Props = {
  open: boolean;
  chainId: number; // the side's current token chain — seeds browseChainId when the modal opens
  onClose: () => void;
  onSelect: (token: RhToken) => void;
};

function shortAddr(a: string) {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Custom-paste detection: EVM chains look for a "0x..." address (existing
// pattern); Solana mint addresses are base58 (no 0/O/I/l), typically
// 32-44 chars, with no distinguishing prefix — length+charset is the best
// available heuristic short of attempting a resolve on every keystroke.
function looksLikeAddress(chainId: number, q: string): boolean {
  if (isSolanaChain(chainId)) return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
  return q.length >= 8 && /^0x/i.test(q);
}

// `size` lets this render both inside the modal's row list (bigger) and
// inside the swap card's small token pill (18px) without separate markup.
export function TokenIcon({ token, size = 28 }: { token: RhToken; size?: number }) {
  const style = { width: size, height: size };
  // Logo URLs are third-party (CoinGecko/GeckoTerminal, via Relay's
  // /currencies/v2 lookup) — one of them (JUGGERNAUT's) turned out to
  // already 403 despite being hardcoded from a real API response, so any
  // broken image falls through to the generic badge below instead of
  // showing a broken-image glyph.
  const [broken, setBroken] = useState(false);
  if (token.logo && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tp-row-icon" style={style} src={token.logo} alt="" onError={() => setBroken(true)} />;
  }
  if (token.isNative) {
    return (
      <span className="tp-row-icon tp-row-icon-eth" style={style}>
        <svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,2 20,12 12,16 4,12" fill="#00c805" />
          <polygon points="12,2 12,16 4,12" fill="#068a0a" />
          <polygon points="12,22 20,13 12,17 4,13" fill="#00c805" />
          <polygon points="12,22 12,17 4,13" fill="#068a0a" />
        </svg>
      </span>
    );
  }
  // Generic "no logo found" badge — an original mark (not a reproduction of
  // any real project's logo), in the same green-circle language as every
  // other badge on this page, used instead of plain text initials since
  // Dylan liked how the RWA tokens' real (Relay-sourced) logos looked
  // uniform and wanted every logo-less token to default to something in
  // that style rather than a flat "AB" initials circle.
  return (
    <span className="tp-row-icon tp-row-icon-fallback" style={style}>
      <svg width="62%" height="62%" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3c3 2.5 5 5.5 5 8.5A5 5 0 0 1 7 11.5C7 8.5 9 5.5 12 3z"
          fill="currentColor"
        />
        <path d="M12 21v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function TokenPickerModal({ open, chainId, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [customToken, setCustomToken] = useState<RhToken | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  // "RWAs" pinned pill is a category filter, not a direct token pick — toggles
  // the results list to the tokenized-stock roster (our own /rwa pools first,
  // then the broader Robinhood-issued market list) instead of picking one.
  // RWA tokens only exist on Robinhood Chain — switching chains while this
  // filter is active correctly shows an empty list (tokensForChain), not a
  // stale Robinhood-only list under a different chain's pill.
  const [rwaFilter, setRwaFilter] = useState(false);
  // Which chain's tokens are currently being browsed — seeded from the
  // side's current token on open, then freely switchable via the pills
  // without affecting the OTHER side's token/chain at all.
  const [browseChainId, setBrowseChainId] = useState(chainId);

  useEffect(() => {
    if (open) setBrowseChainId(chainId);
  }, [open, chainId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCustomToken(null);
      setRwaFilter(false);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    setCustomToken(null);
    if (!looksLikeAddress(browseChainId, q)) return;
    setCustomLoading(true);
    const timer = setTimeout(() => {
      resolveCustomToken(browseChainId, q)
        .then((t) => setCustomToken(t))
        .finally(() => setCustomLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query, browseChainId]);

  const pool = useMemo(() => tokensForChain(browseChainId, rwaFilter), [browseChainId, rwaFilter]);
  const pinned = useMemo(() => PINNED_TOKENS[browseChainId] ?? [], [browseChainId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q
    );
  }, [query, pool]);

  if (!open) return null;

  return (
    <div className="tp-overlay" onClick={onClose}>
      <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tp-head">
          <h3>Select Token</h3>
          <button type="button" className="tp-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="tp-body">
          <div className="tp-chains">
            <span className="tp-chains-label">Select Chain</span>
            <div className="tp-chains-row">
              {CHAINS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`tp-chain-pill${c.id === browseChainId ? " active" : ""}${c.enabled ? "" : " disabled"}`}
                  disabled={!c.enabled}
                  aria-current={c.id === browseChainId ? "true" : undefined}
                  onClick={() => {
                    setBrowseChainId(c.id);
                    setQuery("");
                    if (rwaFilter && c.id !== CHAINS[0].id) setRwaFilter(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="tp-chain-pill-icon" src={c.icon} alt="" />
                  {c.name}
                  {!c.enabled && <span className="tp-chain-pill-soon">Soon</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="tp-token-side">
            <input
              className="tp-search"
              type="text"
              placeholder="Search for a token or paste address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />

            <div className="tp-pinned-row">
              {pinned.map((t) => (
                <button
                  key={tokenKey(t)}
                  type="button"
                  className="tp-pinned-pill"
                  onClick={() => {
                    onSelect(t);
                    onClose();
                  }}
                >
                  <TokenIcon token={t} size={20} />
                  {t.symbol}
                </button>
              ))}
              {/* RWA tokens only exist on Robinhood Chain — the toggle is only shown while browsing it. */}
              {browseChainId === CHAINS[0].id && (
                <button
                  type="button"
                  className={`tp-pinned-pill tp-pinned-pill-rwa${rwaFilter ? " active" : ""}`}
                  onClick={() => {
                    setRwaFilter((v) => !v);
                    setQuery("");
                  }}
                >
                  RWAs
                  <span className="tp-pinned-badge">NEW</span>
                </button>
              )}
            </div>

            <div className="tp-results">
              {customLoading && <div className="tp-empty">Looking up token…</div>}
              {customToken && !results.some((r) => r.address.toLowerCase() === customToken.address.toLowerCase()) && (
                <button
                  type="button"
                  className="tp-row"
                  onClick={() => {
                    onSelect(customToken);
                    onClose();
                  }}
                >
                  <TokenIcon token={customToken} />
                  <span className="tp-row-text">
                    <strong>{customToken.symbol}</strong>
                    <span>
                      {customToken.name} {shortAddr(customToken.address)}
                    </span>
                  </span>
                </button>
              )}
              {!customLoading && !customToken && results.length === 0 && (
                <div className="tp-empty">No token found.</div>
              )}
              {results.map((t) => (
                <button
                  key={tokenKey(t)}
                  type="button"
                  className="tp-row"
                  onClick={() => {
                    // If this token is already selected on the other side,
                    // PrintDirectSwap.tsx's selectToken() just swaps the two
                    // sides instead of no-oping — clicking it is always a
                    // valid, useful action here, never blocked.
                    onSelect(t);
                    onClose();
                  }}
                >
                  <TokenIcon token={t} />
                  <span className="tp-row-text">
                    <strong>{t.symbol}</strong>
                    <span>{t.isNative ? t.name : `${t.name} ${shortAddr(t.address)}`}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
