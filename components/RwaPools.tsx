"use client";

import { useState } from "react";
import { RWA_POOLS, RWA_OVERVIEW } from "@/lib/rwaPools";
import { siteConfig, PRESALE_ACTIVE, PRESALE_LINK } from "@/site.config";

const fmtEth = (n: number) => n.toFixed(4);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function TickerTape() {
  const strip = [...RWA_POOLS, ...RWA_POOLS, ...RWA_POOLS];
  return (
    <div className="rwa-ticker" aria-hidden="true">
      <div className="rwa-ticker-track">
        {strip.map((p, i) => (
          <span className="rwa-ticker-item" key={`${p.symbol}-${i}`}>
            <span className="rwa-ticker-dot" style={{ background: p.accent }} />
            <span className="rwa-ticker-sym">{p.symbol}</span>
            <span className="rwa-ticker-pair">/PRINT</span>
            <span className="rwa-ticker-status">PRE-LAUNCH</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RwaPools() {
  const [modal, setModal] = useState<{ symbol: string; action: "Deposit" | "Withdraw" } | null>(
    null
  );

  return (
    <>
      <TickerTape />

      <section className="rwa-overview">
        <div className="rwa-ov-tile">
          <span className="rwa-ov-live">
            <span className="pb-live-dot" /> LIVE
          </span>
          <span className="rwa-ov-label">ETH Rewards</span>
          <span className="rwa-ov-value">{fmtEth(RWA_OVERVIEW.ethDistributed)}<em> ETH</em></span>
        </div>
        <div className="rwa-ov-tile">
          <span className="rwa-ov-live">
            <span className="pb-live-dot" /> LIVE
          </span>
          <span className="rwa-ov-label">TVL</span>
          <span className="rwa-ov-value">{fmtEth(RWA_OVERVIEW.totalValueLockedEth)}<em> ETH</em></span>
        </div>
        <div className="rwa-ov-tile">
          <span className="rwa-ov-live">
            <span className="pb-live-dot" /> LIVE
          </span>
          <span className="rwa-ov-label">Pools Live</span>
          <span className="rwa-ov-value">
            {RWA_OVERVIEW.poolsLive}<em> / {RWA_OVERVIEW.poolsPlanned}</em>
          </span>
        </div>
        <div className="rwa-ov-tile">
          <span className="rwa-ov-live">
            <span className="pb-live-dot" /> LIVE
          </span>
          <span className="rwa-ov-label">RWA Assets</span>
          <span className="rwa-ov-value">{RWA_POOLS.length}</span>
        </div>
      </section>

      <div className="rwa-grid">
        {RWA_POOLS.map((pool) => (
          <div
            className="rwa-card"
            key={pool.symbol}
            style={{ ["--rwa-accent" as string]: pool.accent }}
          >
            <span className="rwa-card-corner rwa-corner-tl" />
            <span className="rwa-card-corner rwa-corner-br" />
            <div className="rwa-card-head">
              <span className="rwa-pair">
                <span className="rwa-chip">{pool.symbol.slice(0, 1)}</span>
                $PRINT<span className="rwa-slash">/</span>
                {pool.symbol}
              </span>
              <span className="rwa-soon-badge">Launching soon</span>
            </div>
            <p className="rwa-card-sub">{pool.name} Stock Token</p>

            <div className="rwa-stat-row">
              <span>Pool TVL</span>
              <strong>{fmtEth(pool.tvlEth)} ETH</strong>
            </div>
            <div className="rwa-stat-row">
              <span>Your position</span>
              <strong>{fmtEth(0)} ETH</strong>
            </div>
            <div className="rwa-stat-row">
              <span>ETH earned</span>
              <strong>{fmtEth(pool.ethDistributed)} ETH</strong>
            </div>
            <div className="rwa-stat-row">
              <span>APR</span>
              <strong>{pool.apr === null ? "—" : `${pool.apr}%`}</strong>
            </div>

            <div className="rwa-card-actions">
              {PRESALE_ACTIVE ? (
                <>
                  <a
                    className="btn btn-primary rwa-btn"
                    href={PRESALE_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-fairlaunch
                  >
                    Deposit
                  </a>
                  <a
                    className="btn btn-ghost rwa-btn"
                    href={PRESALE_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-fairlaunch
                  >
                    Withdraw
                  </a>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary rwa-btn"
                    onClick={() => setModal({ symbol: pool.symbol, action: "Deposit" })}
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost rwa-btn"
                    onClick={() => setModal({ symbol: pool.symbol, action: "Withdraw" })}
                  >
                    Withdraw
                  </button>
                </>
              )}
            </div>

            <a
              className="rwa-token-link"
              href={`${siteConfig.chain.explorerUrl}/address/${pool.tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title={pool.tokenAddress}
            >
              {pool.symbol} token: {short(pool.tokenAddress)} ↗
            </a>
          </div>
        ))}
      </div>

      {modal && (
        <div
          className="flm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rwa-modal-title"
          onClick={() => setModal(null)}
        >
          <div className="flm-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="flm-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="flm-emoji" aria-hidden="true">🚧</div>
            <h3 className="flm-title" id="rwa-modal-title">
              $PRINT/{modal.symbol} is coming soon
            </h3>
            <p className="flm-body">
              This pool hasn&rsquo;t been deployed yet — {modal.action.toLowerCase()}s open once
              we seed the first $PRINT/RWA pools. Join our Telegram to know the second it goes
              live.
            </p>
            <a
              className="flm-btn flm-tg"
              href={siteConfig.telegram}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">✈️</span> Join the Telegram
            </a>
            <button type="button" className="flm-btn flm-go" onClick={() => setModal(null)}>
              Got it
            </button>
            <span className="flm-note">Beta dashboard · every number above is real, currently zero</span>
          </div>
        </div>
      )}
    </>
  );
}
