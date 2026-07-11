"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/site.config";

const X_LAUNCH_POST =
  "https://x.com/HOODPrinterxyz/status/2075759741217739206";

type Result = { rank: number; tier: "big" | "small" | "waitlist"; already: boolean };

export default function AirdropForm() {
  const [address, setAddress] = useState("");
  const [telegram, setTelegram] = useState("");
  const [joinedTelegram, setJoinedTelegram] = useState(false);
  const [gempadChecked, setGempadChecked] = useState("");
  const [presaleEth, setPresaleEth] = useState("");
  const [xFollowed, setXFollowed] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [count, setCount] = useState<number | null>(null);

  // Live signup count for the "you'll be #N" framing.
  useEffect(() => {
    let alive = true;
    fetch("/api/airdrop")
      .then((r) => r.json())
      .then((j) => {
        if (alive && typeof j.count === "number") setCount(j.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      return setError("Enter a valid Robinhood Chain (0x…) address.");
    }
    if (telegram.trim().replace(/^@+/, "").length < 2) {
      return setError("Enter your Telegram username.");
    }
    if (!joinedTelegram) return setError("You must join the Telegram to qualify.");
    if (!gempadChecked) return setError("Answer the GemPad presale question.");
    if (!presaleEth) return setError("Answer the presale amount question.");
    if (!xFollowed) return setError("Answer the X follow + repost question.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/airdrop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          telegram: telegram.trim(),
          joinedTelegram: true,
          gempadChecked,
          presaleEth,
          xFollowed: xFollowed === "yes",
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error || "Something went wrong. Try again.");
      } else {
        setResult({ rank: j.rank, tier: j.tier, already: j.already });
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const { rank, tier, already } = result;
    const tierMsg =
      tier === "big"
        ? "You made the BIG airdrop 🎉"
        : tier === "small"
        ? "You made the SMALL airdrop 🎉"
        : "You're on the waitlist — spots may still open up.";
    return (
      <div className="adf adf-success">
        <div className="adf-success-icon">🖨️</div>
        <h3>{already ? "You're already on the list" : "You're on the drop list!"}</h3>
        <div className="adf-rank">
          #{rank.toLocaleString("en-US")}
          <span>your spot</span>
        </div>
        <p className="adf-tiermsg">{tierMsg}</p>
        <p className="adf-success-sub">
          Keep an eye on the{" "}
          <a href={siteConfig.telegram} target="_blank" rel="noopener noreferrer">
            Telegram
          </a>{" "}
          for the drop. Want to climb the ranks meanwhile?{" "}
          <a href="/print">Run the buy bot →</a>
        </p>
      </div>
    );
  }

  return (
    <form className="adf" onSubmit={submit}>
      {count != null && (
        <p className="adf-count">
          <strong>{count.toLocaleString("en-US")}</strong> already on the list —
          you&rsquo;ll be <strong>#{(count + 1).toLocaleString("en-US")}</strong>.
        </p>
      )}

      <div className="adf-field">
        <label htmlFor="adf-addr">
          Robinhood Chain ETH address <span className="adf-req">*</span>
        </label>
        <input
          id="adf-addr"
          className="adf-input"
          placeholder="0x…"
          value={address}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setAddress(e.target.value)}
        />
        <span className="adf-help">Where your $PRINT will be airdropped.</span>
      </div>

      <div className="adf-field">
        <label htmlFor="adf-tg">
          Telegram username <span className="adf-req">*</span>
        </label>
        <input
          id="adf-tg"
          className="adf-input"
          placeholder="@yourhandle"
          value={telegram}
          autoComplete="off"
          onChange={(e) => setTelegram(e.target.value)}
        />
      </div>

      <div className="adf-field">
        <span className="adf-qlabel">
          Did you join our Telegram? <span className="adf-req">*</span>
        </span>
        <a
          className="adf-qlink"
          href={siteConfig.telegram}
          target="_blank"
          rel="noopener noreferrer"
        >
          {siteConfig.telegram.replace("https://", "")}
        </a>
        <label className="adf-check">
          <input
            type="checkbox"
            checked={joinedTelegram}
            onChange={(e) => setJoinedTelegram(e.target.checked)}
          />
          <span>Yes, I joined</span>
        </label>
      </div>

      <div className="adf-field">
        <span className="adf-qlabel">
          Did you check out the presale on GemPad? <span className="adf-req">*</span>
        </span>
        <a
          className="adf-qlink"
          href={siteConfig.presaleLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          View the GemPad presale ↗
        </a>
        <div className="adf-opts">
          {[
            { v: "considering", label: "Yes. I'm considering buying some." },
            { v: "farming", label: "No. I'm just here to farm the airdrop." },
          ].map((o) => (
            <label key={o.v} className={`adf-opt ${gempadChecked === o.v ? "on" : ""}`}>
              <input
                type="radio"
                name="gempad"
                checked={gempadChecked === o.v}
                onChange={() => setGempadChecked(o.v)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="adf-field">
        <span className="adf-qlabel">
          How much ETH will you put into presale? <span className="adf-req">*</span>
        </span>
        <div className="adf-opts">
          {[
            { v: "0", label: "0 ETH — i am literally poor, sorry. please give me airdrop" },
            { v: "0.01", label: "0.01 ETH — i want to test it out" },
            { v: "0.1", label: "0.1 ETH — i want in for real" },
            { v: "0.3", label: "0.3 ETH — max buying this b*tch" },
          ].map((o) => (
            <label key={o.v} className={`adf-opt ${presaleEth === o.v ? "on" : ""}`}>
              <input
                type="radio"
                name="presale"
                checked={presaleEth === o.v}
                onChange={() => setPresaleEth(o.v)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="adf-field">
        <span className="adf-qlabel">
          Did you follow on X and repost our launch? <span className="adf-req">*</span>
        </span>
        <a
          className="adf-qlink"
          href={X_LAUNCH_POST}
          target="_blank"
          rel="noopener noreferrer"
        >
          Follow + repost this ↗
        </a>
        <div className="adf-opts">
          {[
            { v: "yes", label: "Yes." },
            { v: "no", label: "No, I don't care." },
          ].map((o) => (
            <label key={o.v} className={`adf-opt ${xFollowed === o.v ? "on" : ""}`}>
              <input
                type="radio"
                name="xfollow"
                checked={xFollowed === o.v}
                onChange={() => setXFollowed(o.v)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="adf-error">{error}</p>}

      <button className="adf-submit" type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Get on the drop list"}
      </button>
    </form>
  );
}
