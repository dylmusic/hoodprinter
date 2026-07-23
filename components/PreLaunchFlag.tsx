"use client";

import { useState } from "react";

/**
 * Orange flag at the top of the Buy Bot: click → branded popup (reuses the
 * pb-modal system's styles) showing the rank ladder and the "bot gas fees =
 * your airdrop value" framing.
 */

const RANKS = [
  { emoji: "🥉", name: "Bronze", txns: "100 txns", gas: "$1 gas", color: "#cd7f32" },
  { emoji: "🥈", name: "Silver", txns: "1,000 txns", gas: "$10 gas", color: "#cbd3dc" },
  { emoji: "🥇", name: "Gold", txns: "10,000 txns", gas: "$100 gas", color: "#ffd24a" },
  { emoji: "💿", name: "Platinum", txns: "100K txns", gas: "$1K gas", color: "#6ad0ff" },
  { emoji: "💎", name: "Diamond", txns: "1M txns", gas: "$10K gas", color: "#b9f2ff" },
];

export default function PreLaunchFlag() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="plf-flag" onClick={() => setOpen(true)}>
        🚀 Level up for the $PRINT airdrop — early bot users rank up
        <span className="plf-arrow">→</span>
      </button>

      {open && (
        <div
          className="pb-modal-overlay"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-icon">🖨️</div>
            <h3 className="pb-modal-title">Level up for the airdrop</h3>
            <div className="pb-modal-body">
              <p className="plf-lede">
                Early bot users rank up now and prepare for the airdrop.
                <br />
                <strong className="plf-gold">
                  BOT GAS FEES = YOUR AIRDROP VALUE
                </strong>
              </p>
              <div className="plf-ranks">
                {RANKS.map((r) => (
                  <div className="plf-rank" key={r.name}>
                    <span className="plf-rank-emoji">{r.emoji}</span>
                    <span className="plf-rank-name" style={{ color: r.color }}>
                      {r.name}
                    </span>
                    <span className="plf-rank-txns">{r.txns}</span>
                    <span className="plf-rank-gas">{r.gas}</span>
                  </div>
                ))}
              </div>
              <p className="plf-note">
                Every confirmed buy counts — rank is tracked on-chain per
                wallet. Rewards &amp; airdrop weighting land at launch.
              </p>
            </div>
            <div className="pb-modal-actions">
              <button
                type="button"
                className="pb-modal-btn primary"
                onClick={() => setOpen(false)}
              >
                Keep printing 🖨️
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
