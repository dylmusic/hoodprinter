"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_RWA_TOKENS, CURATED_TOKENS, PINNED_TOKENS, resolveCustomToken, type RhToken } from "@/lib/robinhoodTokens";

// Styled after Relay's own "Select Token" modal (search box + result list,
// icon/symbol/name/truncated-address rows) so switching between this and
// the Relay-embedded parts of the site feels like one product. Scoped to
// Robinhood Chain only for now — no chain sidebar yet (see
// components/PrintDirectSwap.tsx route-planner comments for why: the router
// only needs Relay for legs that don't touch $PRINT, and phase 1 is
// same-chain only; a chain picker slots in here later without changing this
// modal's shape).
type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (token: RhToken) => void;
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
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

export default function TokenPickerModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [customToken, setCustomToken] = useState<RhToken | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  // "RWAs" pinned pill is a category filter, not a direct token pick — toggles
  // the results list to the tokenized-stock roster (our own /rwa pools first,
  // then the broader Robinhood-issued market list) instead of picking one.
  const [rwaFilter, setRwaFilter] = useState(false);

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
    if (q.length < 8 || !/^0x/i.test(q)) return; // only try to resolve address-looking input
    setCustomLoading(true);
    const timer = setTimeout(() => {
      resolveCustomToken(q)
        .then((t) => setCustomToken(t))
        .finally(() => setCustomLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const pool = rwaFilter ? ALL_RWA_TOKENS : CURATED_TOKENS;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q
    );
  }, [query, rwaFilter]);

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
          <div className="tp-chain-side">
            <div className="tp-chain-row active">
              <span className="tp-chain-dot" />
              Robinhood Chain
            </div>
            <p className="tp-chain-note">More chains coming soon</p>
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
              {PINNED_TOKENS.map((t) => (
                <button
                  key={t.address}
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
                  key={t.address}
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
