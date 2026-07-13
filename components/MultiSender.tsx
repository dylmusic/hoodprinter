"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { siteConfig } from "@/site.config";

/**
 * /multisend — disperse-style bulk sender for any Robinhood Chain token.
 * Contract-free: fires plain ERC-20 transfer() txs back-to-back with locally
 * reserved nonces (the Buy Bot's spam-mode pattern), in confirmation waves.
 * Uses the SAME dedicated in-browser wallet as the Buy Bot (shared
 * localStorage key) — the private key never leaves the browser.
 */

const RPC = siteConfig.chain.rpcUrl;
const EXPLORER = siteConfig.chain.explorerUrl;
const PRINT_TOKEN = siteConfig.contractAddress;
const PK_STORAGE_KEY = "hoodprint_burner_pk"; // shared with PrintBot
const WALLET_REPORTED_KEY = "hoodprint:wallet_reported";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// Quick-select row — same look/idea as the Buy Bot's. PRINT + CASHCAT pinned,
// then the user's recent tokens from the Buy Bot (shared localStorage key),
// then the curated defaults. Custom CAs go straight in the input below.
const RECENTS_STORAGE_KEY = "hoodprint_recent_tokens"; // shared with PrintBot
type QuickToken = { ca: string; sym: string };
const PINNED_TOKENS: QuickToken[] = [
  { ca: PRINT_TOKEN, sym: "PRINT" },
  { ca: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", sym: "CASHCAT" },
];
const DEFAULT_TOKENS: QuickToken[] = [
  { ca: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03", sym: "ARROW" },
  { ca: "0x8e62f281f282686fca6dcb39288069a93fc23f1c", sym: "HOODRAT" },
  { ca: "0xd7321801caae694090694ff55a9323139f043b88", sym: "JUGGERNAUT" },
];

// How many in-flight confirmations we track at once. Sends happen in waves of
// this size: fire all, wait for all, tally, continue. Keeps RPC polling sane
// while still clearing thousands of transfers in minutes on ~100ms blocks.
const WAVE_SIZE = 25;

const ADDR_RE = /0x[0-9a-fA-F]{40}/;
const AMT_RE = /(?:^|[\s,;])(\d+(?:\.\d+)?)(?:$|[\s,;])/;

type Row = { to: string; amt: string };
type Failure = Row & { reason: string };
type Phase = "idle" | "confirm" | "sending" | "done";

function reportWalletCreated(addr: string) {
  if (typeof window === "undefined" || !addr) return;
  try {
    if (localStorage.getItem(WALLET_REPORTED_KEY) === addr) return;
    localStorage.setItem(WALLET_REPORTED_KEY, addr);
  } catch {
    /* storage blocked — server side dedupes anyway */
  }
  fetch("/api/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr }),
  }).catch(() => {});
}

function fmtBal(v: string | null, dp = 4): string {
  if (v == null) return "…";
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

function shortErr(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/trading not started/i.test(m)) return "trading not started";
  if (/insufficient funds/i.test(m)) return "not enough ETH for gas";
  if (/nonce/i.test(m)) return "nonce conflict";
  return m.slice(0, 90);
}

export default function MultiSender() {
  // ---- wallet (shared with the Buy Bot) ----
  const [pk, setPk] = useState("");
  const [addr, setAddr] = useState<string | null>(null);
  const [ethBal, setEthBal] = useState<string | null>(null);
  const [importVal, setImportVal] = useState("");
  const [copied, setCopied] = useState(false);

  // ---- token ----
  const [ca, setCa] = useState("");
  const [tok, setTok] = useState<{
    symbol: string;
    decimals: number;
    balance: string;
  } | null>(null);
  const [tokErr, setTokErr] = useState("");
  const [tokLoading, setTokLoading] = useState(false);
  const [recents, setRecents] = useState<QuickToken[]>([]);

  // ---- recipients ----
  const [listText, setListText] = useState("");
  const [defaultAmt, setDefaultAmt] = useState("");

  // ---- run state ----
  const [phase, setPhase] = useState<Phase>("idle");
  const [preflightErr, setPreflightErr] = useState("");
  const [sent, setSent] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const stopRef = useRef(false);

  const provider = useMemo(() => new ethers.JsonRpcProvider(RPC), []);

  // Restore the shared wallet + the Buy Bot's recent tokens.
  useEffect(() => {
    // Funnel: count this /multisend landing (daily bucket, no PII).
    fetch("/api/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "visit", page: "multisend" }),
    }).catch(() => {});
    try {
      const saved = localStorage.getItem(PK_STORAGE_KEY);
      if (saved) setPk(saved.startsWith("0x") ? saved : "0x" + saved);
    } catch {
      /* storage blocked */
    }
    try {
      const skip = new Set(
        [...PINNED_TOKENS, ...DEFAULT_TOKENS].map((t) => t.ca.toLowerCase())
      );
      const r = JSON.parse(localStorage.getItem(RECENTS_STORAGE_KEY) || "[]");
      if (Array.isArray(r)) {
        setRecents(
          r
            .filter(
              (t: QuickToken) =>
                t &&
                typeof t.ca === "string" &&
                ethers.isAddress(t.ca) &&
                typeof t.sym === "string" &&
                !skip.has(t.ca.toLowerCase())
            )
            .slice(0, 6)
        );
      }
    } catch {
      /* no recents */
    }
  }, []);

  // Derive + persist + report the address whenever the key changes.
  useEffect(() => {
    if (!pk.trim()) {
      setAddr(null);
      return;
    }
    try {
      const a = new ethers.Wallet(pk.trim()).address;
      setAddr(a);
      try {
        localStorage.setItem(PK_STORAGE_KEY, pk.trim());
      } catch {}
      reportWalletCreated(a);
    } catch {
      setAddr(null);
    }
  }, [pk]);

  // Balances.
  const refreshBalances = async () => {
    if (!addr) return;
    try {
      setEthBal(ethers.formatEther(await provider.getBalance(addr)));
    } catch {}
    if (tok && ethers.isAddress(ca.trim())) {
      try {
        const erc = new ethers.Contract(ca.trim(), ERC20_ABI, provider);
        const b = await erc.balanceOf(addr);
        setTok((t) => (t ? { ...t, balance: ethers.formatUnits(b, t.decimals) } : t));
      } catch {}
    }
  };
  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, ca, tok?.decimals]);

  function generateWallet() {
    if (pk.trim()) return;
    const w = ethers.Wallet.createRandom();
    setPk(w.privateKey);
  }

  function importKey() {
    const t = importVal.trim();
    if (!t) return;
    const k = t.startsWith("0x") ? t : "0x" + t;
    try {
      new ethers.Wallet(k); // validate
      setPk(k);
      setImportVal("");
    } catch {
      setTokErr(""); // not a token error — reuse nothing; show inline below
      setImportVal("");
      setPreflightErr("That private key doesn't look valid.");
    }
  }

  async function loadToken(pick?: string) {
    const a = (pick ?? ca).trim();
    if (pick) setCa(pick);
    setTok(null);
    setTokErr("");
    if (!ethers.isAddress(a)) {
      setTokErr("That doesn't look like a valid contract address.");
      return;
    }
    setTokLoading(true);
    try {
      const erc = new ethers.Contract(a, ERC20_ABI, provider);
      const [symbol, decimals, bal] = await Promise.all([
        erc.symbol() as Promise<string>,
        erc.decimals() as Promise<bigint>,
        addr ? (erc.balanceOf(addr) as Promise<bigint>) : Promise.resolve(0n),
      ]);
      const dec = Number(decimals);
      setTok({
        symbol: String(symbol).slice(0, 16),
        decimals: dec,
        balance: ethers.formatUnits(bal, dec),
      });
    } catch {
      setTokErr("Couldn't read that contract — is it an ERC-20 on Robinhood Chain?");
    } finally {
      setTokLoading(false);
    }
  }

  // ---- parse the pasted list ----
  const parsed = useMemo(() => {
    const rows: Row[] = [];
    const invalid: string[] = [];
    let needAmt = 0; // valid address, but no per-line amount and no default set
    let selfSkipped = 0; // your own sending wallet — a self-send just wastes gas
    const self = addr ? addr.toLowerCase() : null;
    const seen = new Set<string>();
    let dupes = 0;
    const lines = listText
      .split(/[\n;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const m = line.match(ADDR_RE);
      if (!m || !ethers.isAddress(m[0])) {
        invalid.push(line);
        continue;
      }
      const to = m[0];
      const key = to.toLowerCase();
      if (self && key === self) {
        selfSkipped++;
        continue;
      }
      if (seen.has(key)) {
        dupes++;
        continue;
      }
      const rest = line.replace(m[0], " ");
      const am = rest.match(AMT_RE);
      const amt = am ? am[1] : defaultAmt.trim();
      if (!amt || !(parseFloat(amt) > 0)) {
        // The address is fine — it just has no amount to send. Only count it as
        // truly unparseable if the line carried its own bad amount; a bare
        // address with an empty default just needs the default field filled in.
        if (am) invalid.push(line);
        else needAmt++;
        continue;
      }
      seen.add(key);
      rows.push({ to, amt });
    }
    let total = 0;
    for (const r of rows) total += parseFloat(r.amt);
    return { rows, invalid, needAmt, selfSkipped, dupes, total };
  }, [listText, defaultAmt, addr]);

  const ready =
    !!addr && !!tok && parsed.rows.length > 0 && phase !== "sending";

  // ---- send engine: waves of fire-and-forget transfers ----
  async function startSend() {
    if (!addr || !tok || !parsed.rows.length) return;
    setPreflightErr("");

    const wallet = new ethers.Wallet(pk.trim(), provider);
    const erc = new ethers.Contract(ca.trim(), ERC20_ABI, wallet);

    // Preflight: token balance covers the total.
    let totalUnits = 0n;
    let rows: (Row & { units: bigint })[];
    try {
      rows = parsed.rows.map((r) => {
        const units = ethers.parseUnits(r.amt, tok.decimals);
        totalUnits += units;
        return { ...r, units };
      });
    } catch {
      setPreflightErr("One of the amounts has more decimals than the token allows.");
      return;
    }
    const bal = (await erc.balanceOf(addr)) as bigint;
    if (bal < totalUnits) {
      setPreflightErr(
        `Not enough ${tok.symbol}: sending ${fmtBal(
          ethers.formatUnits(totalUnits, tok.decimals)
        )} but the wallet holds ${fmtBal(ethers.formatUnits(bal, tok.decimals))}.`
      );
      return;
    }

    // Estimate gas on the first transfer — this is also where a token that
    // blocks transfers (e.g. $PRINT before trading starts, unless the sender
    // is fee-excluded) fails loudly instead of burning gas N times.
    let gasLimit: bigint;
    try {
      const est = (await erc.transfer.estimateGas(rows[0].to, rows[0].units)) as bigint;
      gasLimit = (est * 13n) / 10n; // +30% headroom (dividend trackers vary)
    } catch (e) {
      const r = shortErr(e);
      setPreflightErr(
        r === "trading not started"
          ? `${tok.symbol} transfers revert before trading starts. The token owner must call excludeFromFee(${addr}, true) on the sending wallet first.`
          : `A test transfer would fail: ${r}`
      );
      return;
    }
    // Fee strategy mirrors the Buy Bot: pay via EIP-1559 fields with real
    // base-fee headroom. A bare legacy `gasPrice` pinned at the current base
    // fee gets rejected the instant the base fee ticks up over a multi-minute
    // run ("max fee per gas less than block base fee"). You still only pay
    // base + priority, so the generous 3× cap is free insurance, and gas is
    // sub-cent on this chain anyway.
    const feeData = await provider.getFeeData();
    const baseGuess = feeData.maxFeePerGas ?? feeData.gasPrice ?? 100000000n;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1000000n;
    const maxFeePerGas = baseGuess * 3n;
    const ethNeeded = gasLimit * maxFeePerGas * BigInt(rows.length);
    const ethHave = await provider.getBalance(addr);
    if (ethHave < ethNeeded) {
      setPreflightErr(
        `Not enough ETH for gas: ~${ethers.formatEther(ethNeeded)} needed for ${
          rows.length
        } transfers, wallet has ${fmtBal(ethers.formatEther(ethHave), 6)}.`
      );
      return;
    }

    // Go.
    setPhase("sending");
    setSent(0);
    setConfirmed(0);
    setFailures([]);
    setLastTx(null);
    stopRef.current = false;

    let nonce = await provider.getTransactionCount(addr, "pending");
    const fails: Failure[] = [];
    let okCount = 0;

    for (let i = 0; i < rows.length && !stopRef.current; i += WAVE_SIZE) {
      const wave = rows.slice(i, i + WAVE_SIZE);
      const inFlight = wave.map(async (r) => {
        const myNonce = nonce++;
        try {
          const tx = await erc.transfer(r.to, r.units, {
            nonce: myNonce,
            gasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
          setSent((s) => s + 1);
          setLastTx(tx.hash);
          const rec = await tx.wait();
          if (rec && rec.status === 1) {
            okCount++;
            setConfirmed((c) => c + 1);
          } else fails.push({ to: r.to, amt: r.amt, reason: "reverted" });
        } catch (e) {
          fails.push({ to: r.to, amt: r.amt, reason: shortErr(e) });
        }
      });
      await Promise.allSettled(inFlight);
      // Resync the nonce between waves in case anything failed to land.
      try {
        nonce = await provider.getTransactionCount(addr, "pending");
      } catch {}
    }

    setFailures(fails);
    setPhase("done");
    refreshBalances();

    // Usage telemetry: one fire-and-forget report per completed run.
    fetch("/api/multisend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: addr,
        token: ca.trim(),
        sym: tok.symbol,
        recipients: rows.length,
        confirmed: okCount,
        failed: fails.length,
        amount: parsed.total,
      }),
    }).catch(() => {});
  }

  function retryFailures() {
    setListText(failures.map((f) => `${f.to}, ${f.amt}`).join("\n"));
    setPhase("idle");
  }

  const copyAddr = async () => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const isPrint = ca.trim().toLowerCase() === PRINT_TOKEN.toLowerCase();

  return (
    <div className="ms-wrap">
      {/* ---- wallet ---- */}
      <div className="pb-card">
        <h2>1 · Sending wallet</h2>
        {addr ? (
          <>
            <button className="pb-addr ms-addr" onClick={copyAddr} type="button">
              {addr}
              <span className="pb-addr-copyicon">{copied ? "✓ copied" : "⧉"}</span>
            </button>
            <div className="ms-bals">
              <span>
                <strong>{fmtBal(ethBal, 5)}</strong> ETH
              </span>
              {tok && (
                <span>
                  <strong>{fmtBal(tok.balance)}</strong> {tok.symbol}
                </span>
              )}
            </div>
            <p className="pb-hint">
              This is the same dedicated in-browser wallet as the Buy Bot on
              this device. Fund it with the token you&rsquo;re sending plus a
              little ETH for gas. Back up / manage the key on the{" "}
              <a href="/print">Buy Bot page</a> — it never leaves your browser.
            </p>
          </>
        ) : (
          <>
            <p className="pb-hint">
              No wallet on this device yet. Generate one (shared with the Buy
              Bot), or paste a private key.
            </p>
            <div className="ms-inline">
              <button className="pb-primary" onClick={generateWallet} type="button">
                Generate wallet
              </button>
              <input
                type="password"
                placeholder="…or paste a private key"
                value={importVal}
                onChange={(e) => setImportVal(e.target.value)}
              />
              <button className="pb-mini" onClick={importKey} type="button">
                Import
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---- token ---- */}
      <div className="pb-card">
        <h2>2 · Token to send</h2>
        <div className="pb-recents ms-recents">
          {PINNED_TOKENS.map((t) => (
            <button
              key={t.ca}
              type="button"
              className="pb-recent pinned"
              title={t.ca}
              onClick={() => loadToken(t.ca)}
              disabled={phase === "sending"}
            >
              {t.sym}
            </button>
          ))}
          {[...recents, ...DEFAULT_TOKENS].map((t) => (
            <button
              key={t.ca}
              type="button"
              className="pb-recent"
              title={t.ca}
              onClick={() => loadToken(t.ca)}
              disabled={phase === "sending"}
            >
              {t.sym}
            </button>
          ))}
        </div>
        <div className="ms-inline">
          <input
            placeholder="Token contract address (0x…)"
            value={ca}
            onChange={(e) => setCa(e.target.value)}
            spellCheck={false}
          />
          <button className="pb-mini" onClick={() => loadToken()} disabled={tokLoading} type="button">
            {tokLoading ? "Loading…" : "Load"}
          </button>
        </div>
        {tokErr && <p className="ms-err">{tokErr}</p>}
        {tok && (
          <p className="pb-hint">
            Loaded <strong>{tok.symbol}</strong> ({tok.decimals} decimals) —
            wallet holds <strong>{fmtBal(tok.balance)}</strong>.
          </p>
        )}
        {isPrint && (
          <div className="ms-note">
            <strong>$PRINT notes:</strong> wallet-to-wallet sends carry{" "}
            <strong>no tax</strong> (the 5% only hits DEX buys/sells). But
            before trading starts, transfers <strong>revert</strong> unless
            the sending wallet is fee-excluded — the token owner must call{" "}
            <code>excludeFromFee(sender, true)</code> first. The preflight
            check below will catch it either way.
          </div>
        )}
      </div>

      {/* ---- recipients ---- */}
      <div className="pb-card">
        <h2>3 · Recipients</h2>
        <p className="pb-hint">
          One per line: <code>address</code> or <code>address, amount</code>.
          Commas, tabs, or spaces all work — a Blockscout holders CSV pastes
          straight in. Lines without an amount use the default.
        </p>
        <textarea
          className="ms-list"
          rows={8}
          spellCheck={false}
          placeholder={
            "0xabc…123, 1000\n0xdef…456, 2500\n0x789…abc        ← uses default amount"
          }
          value={listText}
          onChange={(e) => setListText(e.target.value)}
        />
        <div className="ms-inline">
          <label htmlFor="ms-default">
            Default amount per wallet{tok ? ` (${tok.symbol})` : ""}
          </label>
          <input
            id="ms-default"
            placeholder="e.g. 1000"
            value={defaultAmt}
            onChange={(e) => setDefaultAmt(e.target.value)}
            inputMode="decimal"
          />
        </div>
        {listText.trim() && (
          <div className="ms-parse">
            <span className="ms-ok">{parsed.rows.length} valid</span>
            {parsed.dupes > 0 && <span>· {parsed.dupes} duplicates skipped</span>}
            {parsed.selfSkipped > 0 && (
              <span className="ms-warn">
                · skipped your own wallet (a self-send just wastes gas)
              </span>
            )}
            {parsed.needAmt > 0 && (
              <span className="ms-warn">
                · {parsed.needAmt} need an amount — set a default above
              </span>
            )}
            {parsed.invalid.length > 0 && (
              <span className="ms-bad">· {parsed.invalid.length} unparseable</span>
            )}
            {tok && parsed.rows.length > 0 && (
              <span>
                · total <strong>{fmtBal(String(parsed.total))} {tok.symbol}</strong>
              </span>
            )}
          </div>
        )}
        {parsed.invalid.length > 0 && (
          <details className="ms-invalid">
            <summary>Show unparseable lines</summary>
            <pre>{parsed.invalid.slice(0, 50).join("\n")}</pre>
          </details>
        )}
      </div>

      {/* ---- send ---- */}
      <div className="pb-card">
        <h2>4 · Send</h2>
        {preflightErr && <p className="ms-err">{preflightErr}</p>}

        {phase === "idle" && (
          <button
            className="pb-primary ms-go"
            disabled={!ready}
            onClick={() => setPhase("confirm")}
            type="button"
          >
            {ready
              ? `Review: send to ${parsed.rows.length} wallets`
              : "Complete the steps above"}
          </button>
        )}

        {phase === "confirm" && tok && (
          <div className="ms-confirm">
            <p>
              Send <strong>{fmtBal(String(parsed.total))} {tok.symbol}</strong>{" "}
              to <strong>{parsed.rows.length} wallets</strong> in{" "}
              {parsed.rows.length} transactions from{" "}
              <code>{addr?.slice(0, 8)}…{addr?.slice(-6)}</code>. This can&rsquo;t
              be undone once transfers land.
            </p>
            <div className="ms-inline">
              <button className="pb-primary ms-go" onClick={startSend} type="button">
                Confirm &amp; send
              </button>
              <button className="pb-mini" onClick={() => setPhase("idle")} type="button">
                Back
              </button>
            </div>
          </div>
        )}

        {(phase === "sending" || phase === "done") && (
          <div className="ms-progress">
            <div className="ms-bar">
              <div
                className="ms-bar-fill"
                style={{
                  width: `${
                    parsed.rows.length
                      ? Math.round(
                          ((confirmed + failures.length) / parsed.rows.length) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="ms-parse">
              <span>{sent} sent</span>
              <span className="ms-ok">· {confirmed} confirmed</span>
              {failures.length > 0 && (
                <span className="ms-bad">· {failures.length} failed</span>
              )}
              <span>· of {parsed.rows.length}</span>
            </div>
            {lastTx && (
              <p className="pb-hint">
                Latest tx:{" "}
                <a href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noopener noreferrer">
                  {lastTx.slice(0, 18)}…
                </a>
              </p>
            )}
            {phase === "sending" && (
              <button
                className="pb-mini ms-stop"
                onClick={() => (stopRef.current = true)}
                type="button"
              >
                Stop after this wave
              </button>
            )}
            {phase === "done" && (
              <div className="ms-inline">
                <span className="ms-ok">
                  Done — {confirmed}/{parsed.rows.length} confirmed.
                </span>
                {failures.length > 0 && (
                  <button className="pb-mini" onClick={retryFailures} type="button">
                    Load {failures.length} failures for retry
                  </button>
                )}
                <button className="pb-mini" onClick={() => setPhase("idle")} type="button">
                  New send
                </button>
              </div>
            )}
            {failures.length > 0 && (
              <details className="ms-invalid">
                <summary>Failed transfers</summary>
                <pre>
                  {failures
                    .slice(0, 100)
                    .map((f) => `${f.to}  ${f.amt}  — ${f.reason}`)
                    .join("\n")}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
