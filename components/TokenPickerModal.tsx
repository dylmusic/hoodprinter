"use client";

import { useEffect, useMemo, useState } from "react";
import { CURATED_TOKENS, resolveCustomToken, type RhToken } from "@/lib/robinhoodTokens";

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
  exclude?: string; // address already selected on the other side, greyed out
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// `size` lets this render both inside the modal's row list (bigger) and
// inside the swap card's small token pill (18px) without separate markup.
export function TokenIcon({ token, size = 28 }: { token: RhToken; size?: number }) {
  const style = { width: size, height: size };
  if (token.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tp-row-icon" style={style} src={token.logo} alt="" />;
  }
  if (token.isNative) {
    return (
      <span className="tp-row-icon tp-row-icon-eth" style={style}>
        <svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="12,2 20,12 12,16 4,12" fill="#8A92B2" />
          <polygon points="12,2 12,16 4,12" fill="#62688F" />
          <polygon points="12,22 20,13 12,17 4,13" fill="#8A92B2" />
          <polygon points="12,22 12,17 4,13" fill="#62688F" />
        </svg>
      </span>
    );
  }
  return (
    <span className="tp-row-icon tp-row-icon-fallback" style={style}>
      {token.symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function TokenPickerModal({ open, onClose, onSelect, exclude }: Props) {
  const [query, setQuery] = useState("");
  const [customToken, setCustomToken] = useState<RhToken | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCustomToken(null);
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
    const q = query.trim().toLowerCase();
    if (!q) return CURATED_TOKENS;
    return CURATED_TOKENS.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q
    );
  }, [query]);

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

            <div className="tp-results">
              {customLoading && <div className="tp-empty">Looking up token…</div>}
              {customToken && (
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
              {results.map((t) => {
                const disabled = exclude?.toLowerCase() === t.address.toLowerCase();
                return (
                  <button
                    key={t.address}
                    type="button"
                    className="tp-row"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
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
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
