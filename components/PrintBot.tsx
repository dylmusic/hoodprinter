"use client";

import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { siteConfig } from "@/site.config";

/**
 * Private $PRINT buy bot for Robinhood Chain (Uniswap V2).
 * Unlisted tool — not linked anywhere, noindex. Two modes:
 *  - MetaMask: one-click manual buys, no key exposure (confirm each tx in MM).
 *  - Local key: burner private key signs an unattended interval buy loop.
 * The key never leaves the browser; txs go straight to the Robinhood Chain RPC.
 */

// --- Robinhood Chain ---
const CHAIN = {
  chainIdDec: siteConfig.chain.chainId, // 4663
  chainIdHex: "0x" + siteConfig.chain.chainId.toString(16), // 0x1237
  name: siteConfig.chain.name,
  rpc: siteConfig.chain.rpcUrl,
  explorer: siteConfig.chain.explorerUrl,
};

// Uniswap V2 on Robinhood Chain (verified against developers.uniswap.org, Jul 2026)
const DEFAULT_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

type LogLevel = "info" | "ok" | "err";

export default function PrintBot() {
  const [token, setToken] = useState<string>(siteConfig.contractAddress);
  const [router, setRouter] = useState<string>(DEFAULT_ROUTER);
  const [pair, setPair] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [interval, setIntervalSecs] = useState("60");
  const [randomize, setRandomize] = useState("30");
  const [slippage, setSlippage] = useState("20");
  const [pk, setPk] = useState("");

  const [mmAccount, setMmAccount] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ t: string; msg: string; level: LogLevel }[]>(
    []
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);

  const addLog = (msg: string, level: LogLevel = "info") =>
    setLog((l) =>
      [{ t: new Date().toLocaleTimeString(), msg, level }, ...l].slice(0, 200)
    );

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ---- helpers ----
  // Uniformly jitter a base value by ±pct%. pct=0 returns the base unchanged.
  function jitter(base: number, pct: number) {
    if (!pct || pct <= 0) return base;
    return base * (1 + (Math.random() * 2 - 1) * (pct / 100));
  }

  function fmtAmount(n: number) {
    return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  function readProvider() {
    return new ethers.JsonRpcProvider(CHAIN.rpc, {
      chainId: CHAIN.chainIdDec,
      name: CHAIN.name,
    });
  }

  async function resolveWeth(provider: ethers.Provider): Promise<string> {
    // Prefer deriving from the actual LP pair (the non-$PRINT side).
    if (pair.trim()) {
      const p = new ethers.Contract(pair.trim(), PAIR_ABI, provider);
      const [t0, t1] = await Promise.all([p.token0(), p.token1()]);
      const tk = token.trim().toLowerCase();
      const weth = [t0, t1].find((a: string) => a.toLowerCase() !== tk);
      if (!weth) throw new Error("LP pair does not include the token address");
      return weth;
    }
    // Fall back to the router's declared wrapped-native token.
    const r = new ethers.Contract(router.trim(), ROUTER_ABI, provider);
    return await r.WETH();
  }

  async function buildBuy(
    signer: ethers.Signer,
    provider: ethers.Provider,
    to: string,
    amountEth: string
  ) {
    const valueWei = ethers.parseEther(amountEth);
    const weth = await resolveWeth(provider);
    const path = [weth, token.trim()];
    const r = new ethers.Contract(router.trim(), ROUTER_ABI, signer);

    // Quote, then apply slippage. Token transfer-tax means we receive less than
    // quoted, so slippage must exceed the buy tax (~5%). Default 20%.
    let minOut = 0n;
    try {
      const amounts = await (r.getAmountsOut as any)(valueWei, path);
      const quoted: bigint = amounts[amounts.length - 1];
      const slipBps = BigInt(Math.round(parseFloat(slippage || "0") * 100));
      minOut = (quoted * (10000n - slipBps)) / 10000n;
    } catch {
      addLog("getAmountsOut failed — sending with minOut=0 (no price floor)", "err");
      minOut = 0n;
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;
    return { r, valueWei, path, minOut, deadline, to };
  }

  async function sendBuy(
    signer: ethers.Signer,
    provider: ethers.Provider,
    amountEth: string
  ) {
    const to = await signer.getAddress();
    const { r, valueWei, minOut, path, deadline } = await buildBuy(
      signer,
      provider,
      to,
      amountEth
    );
    addLog(`Buying with ${amountEth} ETH → min ${ethers.formatUnits(minOut, 18)} tokens…`);
    const tx = await (
      r.swapExactETHForTokensSupportingFeeOnTransferTokens as any
    )(minOut, path, to, deadline, { value: valueWei });
    addLog(`Sent: ${tx.hash}`, "info");
    const rec = await tx.wait();
    if (rec && rec.status === 1) {
      addLog(`✅ Confirmed in block ${rec.blockNumber} — ${tx.hash}`, "ok");
    } else {
      addLog(`⚠️ Tx reverted — ${tx.hash}`, "err");
    }
  }

  // ---- network ----
  async function addOrSwitchNetwork() {
    const eth = (window as any).ethereum;
    if (!eth) return alert("No wallet found. Install MetaMask.");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN.chainIdHex }],
      });
    } catch (e: any) {
      if (e.code === 4902 || /Unrecognized chain/i.test(e.message || "")) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN.chainIdHex,
              chainName: CHAIN.name,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [CHAIN.rpc],
              blockExplorerUrls: [CHAIN.explorer],
            },
          ],
        });
      } else {
        throw e;
      }
    }
    addLog(`Wallet set to ${CHAIN.name}`, "ok");
  }

  // ---- MetaMask mode ----
  async function connectMetaMask() {
    try {
      const eth = (window as any).ethereum;
      if (!eth) return alert("No wallet found. Install MetaMask.");
      await eth.request({ method: "eth_requestAccounts" });
      await addOrSwitchNetwork();
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      setMmAccount(await signer.getAddress());
      addLog("MetaMask connected", "ok");
    } catch (e: any) {
      addLog("Connect failed: " + (e.message || e), "err");
    }
  }

  async function buyOnceMetaMask() {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      await sendBuy(signer, provider, amount.trim());
    } catch (e: any) {
      addLog("Buy failed: " + (e.shortMessage || e.message || e), "err");
    } finally {
      busyRef.current = false;
    }
  }

  // ---- private-key loop (randomized delay + amount) ----
  function normalizeKey(k: string) {
    const t = k.trim();
    return t.startsWith("0x") ? t : "0x" + t;
  }

  async function doBuy() {
    if (busyRef.current) {
      addLog("Previous buy still pending — skipping");
      return;
    }
    busyRef.current = true;
    try {
      const pct = parseFloat(randomize || "0");
      const baseAmt = parseFloat(amount || "0");
      const amt = fmtAmount(Math.max(0, jitter(baseAmt, pct)));
      const provider = readProvider();
      const wallet = new ethers.Wallet(normalizeKey(pk), provider);
      await sendBuy(wallet, provider, amt);
    } catch (e: any) {
      addLog("Buy failed: " + (e.shortMessage || e.message || e), "err");
    } finally {
      busyRef.current = false;
    }
  }

  function scheduleNext() {
    if (!runningRef.current) return;
    const pct = parseFloat(randomize || "0");
    const baseSecs = Math.max(5, parseInt(interval || "60", 10));
    const secs = Math.max(5, Math.round(jitter(baseSecs, pct)));
    addLog(`Next buy in ${secs}s`);
    timerRef.current = setTimeout(async () => {
      await doBuy();
      scheduleNext();
    }, secs * 1000);
  }

  async function startLoop() {
    if (runningRef.current) return;
    if (!pk.trim()) return alert("Enter the burner private key first.");
    let addr = "";
    try {
      addr = new ethers.Wallet(normalizeKey(pk)).address;
    } catch {
      return alert("That private key is not valid.");
    }
    const pct = parseFloat(randomize || "0");
    addLog(
      `Loop started — ${addr} · ~${amount} ETH every ~${interval}s, randomized ±${pct}%`,
      "ok"
    );
    runningRef.current = true;
    setRunning(true);
    await doBuy(); // fire immediately
    scheduleNext();
  }

  function stopLoop() {
    runningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    addLog("Loop stopped", "info");
  }

  async function checkBalances() {
    try {
      const provider = readProvider();
      let addr = mmAccount;
      if (!addr && pk.trim()) addr = new ethers.Wallet(normalizeKey(pk)).address;
      if (!addr) return alert("Connect MetaMask or enter a key first.");
      const [eth, tokenC] = [
        await provider.getBalance(addr),
        new ethers.Contract(token.trim(), ERC20_ABI, provider),
      ];
      let sym = "TOKEN";
      let dec = 18;
      let bal = 0n;
      try {
        [sym, dec, bal] = await Promise.all([
          tokenC.symbol(),
          tokenC.decimals(),
          tokenC.balanceOf(addr),
        ]);
      } catch {
        /* token may not be live yet */
      }
      addLog(
        `${addr.slice(0, 6)}…${addr.slice(-4)} — ${ethers.formatEther(
          eth
        )} ETH · ${ethers.formatUnits(bal, dec)} ${sym}`,
        "ok"
      );
    } catch (e: any) {
      addLog("Balance check failed: " + (e.message || e), "err");
    }
  }

  return (
    <div className="pb">
      <div className="pb-warn">
        ⚠️ <strong>Unlisted tool.</strong> Use a burner wallet only. In
        private-key mode the key stays in your browser and is used solely to
        sign transactions sent directly to the {CHAIN.name} RPC — it is never
        uploaded anywhere. Close this tab to clear it.
      </div>

      <section className="pb-card">
        <h2>1 · Config</h2>
        <label>Token ($PRINT)</label>
        <input value={token} onChange={(e) => setToken(e.target.value)} />
        <label>Uniswap V2 Router (Robinhood Chain)</label>
        <input value={router} onChange={(e) => setRouter(e.target.value)} />
        <label>LP / Pair address (recommended — auto-detects WETH)</label>
        <input
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          placeholder="0x… paste the $PRINT/WETH pair once you have it"
        />
        <div className="pb-row">
          <div>
            <label>Slippage %</label>
            <input value={slippage} onChange={(e) => setSlippage(e.target.value)} />
          </div>
          <div>
            <label>Base buy amount (ETH)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <button className="pb-ghost" onClick={addOrSwitchNetwork}>
          Add / switch to {CHAIN.name}
        </button>
        <button className="pb-ghost" onClick={checkBalances}>
          Check wallet balance
        </button>
      </section>

      <section className="pb-card">
        <h2>2a · MetaMask (manual, no key)</h2>
        <p className="pb-hint">
          One click per buy — MetaMask asks you to confirm each one. Best for
          hand-timed buys.
        </p>
        {mmAccount ? (
          <div className="pb-ok">Connected: {mmAccount}</div>
        ) : (
          <button className="pb-primary" onClick={connectMetaMask}>
            Connect MetaMask
          </button>
        )}
        {mmAccount && (
          <button className="pb-primary" onClick={buyOnceMetaMask}>
            Buy now ({amount} ETH)
          </button>
        )}
      </section>

      <section className="pb-card">
        <h2>2b · Auto loop (burner private key)</h2>
        <p className="pb-hint">
          Signs and fires a buy on a randomized timer with no popups. Requires a
          throwaway key funded with ETH on {CHAIN.name}.
        </p>
        <label>Burner private key</label>
        <input
          type="password"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          placeholder="0x…"
          autoComplete="off"
        />
        <div className="pb-row">
          <div>
            <label>Buy every (seconds)</label>
            <input
              value={interval}
              onChange={(e) => setIntervalSecs(e.target.value)}
            />
          </div>
          <div>
            <label>Randomize ±% (time &amp; amount)</label>
            <input
              value={randomize}
              onChange={(e) => setRandomize(e.target.value)}
            />
          </div>
        </div>
        <p className="pb-hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Each buy jitters both the delay and the ETH amount by up to ±
          {parseFloat(randomize || "0") || 0}% around your base values — e.g.{" "}
          {interval || "60"}s ±{randomize || "0"}% and {amount || "0"} ETH ±
          {randomize || "0"}%. Set 0 for fixed.
        </p>
        <div className="pb-loopbtns" style={{ marginTop: 4 }}>
          {running ? (
            <button className="pb-stop" onClick={stopLoop}>
              Stop
            </button>
          ) : (
            <button className="pb-primary" onClick={startLoop}>
              Start loop
            </button>
          )}
        </div>
      </section>

      <section className="pb-card">
        <h2>Activity</h2>
        <div className="pb-log">
          {log.length === 0 && <div className="pb-log-empty">No activity yet.</div>}
          {log.map((l, i) => (
            <div key={i} className={`pb-log-line ${l.level}`}>
              <span className="pb-log-t">{l.t}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
