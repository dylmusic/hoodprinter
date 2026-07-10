"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { siteConfig } from "@/site.config";

/**
 * Generic buy bot for any token on Robinhood Chain (Uniswap V2).
 * Two modes:
 *  - Burner wallet: an in-browser key signs an unattended randomized buy loop.
 *  - MetaMask: one-click manual buys, no key exposure (confirm each tx in MM).
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
  "function transfer(address to, uint256 amount) returns (bool)",
];

const PK_STORAGE_KEY = "hoodprint_burner_pk";
const SETTINGS_STORAGE_KEY = "hoodprint_settings";

type LogLevel = "info" | "ok" | "err";

// Balance formatter: comma-group big numbers, keep small amounts visible.
function fmtBal(v: string | number | null): string {
  if (v == null) return "0";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export default function PrintBot() {
  const [token, setToken] = useState<string>("");
  const [router, setRouter] = useState<string>(DEFAULT_ROUTER);
  const [pair, setPair] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [interval, setIntervalSecs] = useState("60");
  const [randomize, setRandomize] = useState("30");
  const [slippage, setSlippage] = useState("20");
  const [pk, setPk] = useState("");
  const [burnerAddr, setBurnerAddr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [ethBal, setEthBal] = useState<string | null>(null);
  const [tokBal, setTokBal] = useState<string | null>(null);
  const [tokSym, setTokSym] = useState("TOKEN");

  const [mmAccount, setMmAccount] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ t: string; msg: string; level: LogLevel }[]>(
    []
  );

  // live monitor
  const [buys, setBuys] = useState(0);
  const [ethSpent, setEthSpent] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [nextAt, setNextAt] = useState(0);
  const [startTok, setStartTok] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const monitorRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, level: LogLevel = "info") =>
    setLog((l) =>
      [{ t: new Date().toLocaleTimeString(), msg, level }, ...l].slice(0, 200)
    );

  // Restore the burner + saved settings from this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PK_STORAGE_KEY);
      if (saved) setPk(saved);
    } catch {
      /* storage blocked */
    }
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      if (typeof s.token === "string") setToken(s.token);
      if (typeof s.router === "string" && s.router) setRouter(s.router);
      if (typeof s.pair === "string") setPair(s.pair);
      if (typeof s.amount === "string" && s.amount) setAmount(s.amount);
      if (typeof s.interval === "string" && s.interval) setIntervalSecs(s.interval);
      if (typeof s.randomize === "string") setRandomize(s.randomize);
      if (typeof s.slippage === "string" && s.slippage) setSlippage(s.slippage);
      if (typeof s.withdrawTo === "string") setWithdrawTo(s.withdrawTo);
    } catch {
      /* no saved settings */
    }
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function saveSettings() {
    try {
      const s: Record<string, string> = {
        token,
        router,
        pair,
        amount,
        interval,
        randomize,
        slippage,
        withdrawTo,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage blocked */
    }
  }

  // Keep the derived deposit address + local backup in sync with the key.
  useEffect(() => {
    const addr = deriveAddr(pk);
    setBurnerAddr(addr);
    try {
      if (addr) localStorage.setItem(PK_STORAGE_KEY, normalizeKey(pk));
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pk]);

  function deriveAddr(k: string): string | null {
    const t = k.trim();
    if (!t) return null;
    try {
      return new ethers.Wallet(normalizeKey(t)).address;
    } catch {
      return null;
    }
  }

  // 1s clock for the countdown/uptime, only while running.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Warn before closing the tab while buying is active.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // Fetch the burner's live ETH + token balances.
  const refreshBalances = useCallback(async () => {
    if (!burnerAddr) {
      setEthBal(null);
      setTokBal(null);
      return;
    }
    try {
      const provider = readProvider();
      const eth = await provider.getBalance(burnerAddr);
      setEthBal(ethers.formatEther(eth));
      if (!ethers.isAddress(token.trim())) {
        setTokBal(null);
        setTokSym("TOKEN");
        return;
      }
      const erc = new ethers.Contract(token.trim(), ERC20_ABI, provider);
      const [b, d, s] = await Promise.all([
        erc.balanceOf(burnerAddr),
        erc.decimals().catch(() => 18),
        erc.symbol().catch(() => "TOKEN"),
      ]);
      setTokBal(ethers.formatUnits(b, d));
      setTokSym(s);
    } catch {
      /* rpc hiccup / token not live yet */
    }
  }, [burnerAddr, token]);

  // Poll every 10s so the wallet + monitor stay current.
  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 10000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  function loadPastedKey() {
    if (runningRef.current) return alert("Stop the loop before switching wallets.");
    const addr = deriveAddr(pastedKey);
    if (!addr) return alert("That private key is not valid.");
    setShowKey(false);
    setPk(pastedKey.trim());
    setPastedKey("");
    addLog(`Wallet loaded: ${addr}`, "ok");
  }

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  function generateWallet() {
    if (runningRef.current)
      return alert("Stop the loop before switching wallets.");
    if (
      pk.trim() &&
      !confirm(
        "This replaces the current burner wallet. Make sure you've withdrawn its funds and backed up its key. Continue?"
      )
    )
      return;
    const w = ethers.Wallet.createRandom();
    setShowKey(false);
    setPk(w.privateKey);
    addLog(`New burner wallet generated: ${w.address}`, "ok");
  }

  function forgetWallet() {
    if (runningRef.current)
      return alert("Stop the loop before forgetting the wallet.");
    if (
      !confirm(
        "Forget this wallet and clear its key from this device? Withdraw any funds first — this cannot be undone."
      )
    )
      return;
    try {
      localStorage.removeItem(PK_STORAGE_KEY);
    } catch {
      /* noop */
    }
    setPk("");
    setShowKey(false);
    addLog("Burner wallet cleared from this device", "info");
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(() => addLog(`${label} copied`));
  }

  function downloadKey() {
    if (!pk.trim() || !burnerAddr) return;
    const body = `HOODPrinter burner wallet\nAddress: ${burnerAddr}\nPrivate key: ${normalizeKey(
      pk
    )}\nChain: ${CHAIN.name} (${CHAIN.chainIdDec})\nSaved: ${new Date().toISOString()}\n`;
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/plain" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoodprinter-burner-${burnerAddr.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
    // Prefer deriving from the actual LP pair (the non-token side).
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
      return true;
    }
    addLog(`⚠️ Tx reverted — ${tx.hash}`, "err");
    return false;
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
      const ok = await sendBuy(wallet, provider, amt);
      if (ok) {
        setBuys((b) => b + 1);
        setEthSpent((e) => e + parseFloat(amt));
      }
      refreshBalances();
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
    setNextAt(Date.now() + secs * 1000);
    timerRef.current = setTimeout(async () => {
      await doBuy();
      scheduleNext();
    }, secs * 1000);
  }

  async function startLoop() {
    if (runningRef.current) return;
    if (!pk.trim()) return alert("Load a wallet first (step 1).");
    if (!ethers.isAddress(token.trim()))
      return alert("Enter a valid token address in Trade settings.");
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
    saveSettings();
    runningRef.current = true;
    setRunning(true);
    setBuys(0);
    setEthSpent(0);
    setStartedAt(Date.now());
    setStartTok(tokBal != null ? parseFloat(tokBal) : 0);
    // Bring the live monitor (top of the column) into view.
    requestAnimationFrame(() =>
      monitorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
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

  // ---- withdraw (sweep the burner) ----
  // One-tap withdraw from a balance tile: use the saved destination, or ask.
  async function quickWithdraw(kind: "eth" | "tok") {
    let dest = withdrawTo.trim();
    if (!ethers.isAddress(dest)) {
      dest = (window.prompt("Withdraw to which address?", withdrawTo) || "").trim();
      if (!dest) return;
      if (!ethers.isAddress(dest)) return alert("That address is not valid.");
      setWithdrawTo(dest);
      saveSettings();
    }
    if (kind === "eth") await withdrawEth(dest);
    else await withdrawToken(dest);
  }

  async function withdrawEth(to?: string) {
    const dest = (to ?? withdrawTo).trim();
    if (!ethers.isAddress(dest)) return alert("Enter a valid destination address.");
    if (!deriveAddr(pk)) return alert("No burner wallet loaded.");
    try {
      const provider = readProvider();
      const wallet = new ethers.Wallet(normalizeKey(pk), provider);
      const bal = await provider.getBalance(wallet.address);
      const fee = await provider.getFeeData();
      const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
      const reserve = gasPrice * 21000n * 3n; // buffer for L2 data fee
      if (bal <= reserve) return alert("ETH balance too low to cover gas.");
      const value = bal - reserve;
      addLog(`Withdrawing ${ethers.formatEther(value)} ETH → ${dest}…`);
      const tx = await wallet.sendTransaction({ to: dest, value });
      addLog(`Sent: ${tx.hash}`);
      await tx.wait();
      addLog("✅ ETH withdrawn", "ok");
      refreshBalances();
    } catch (e: any) {
      addLog("ETH withdraw failed: " + (e.shortMessage || e.message || e), "err");
    }
  }

  async function withdrawToken(to?: string) {
    const dest = (to ?? withdrawTo).trim();
    if (!ethers.isAddress(dest)) return alert("Enter a valid destination address.");
    if (!deriveAddr(pk)) return alert("No burner wallet loaded.");
    try {
      const provider = readProvider();
      const wallet = new ethers.Wallet(normalizeKey(pk), provider);
      const erc = new ethers.Contract(token.trim(), ERC20_ABI, wallet);
      const [bal, dec, sym] = await Promise.all([
        erc.balanceOf(wallet.address),
        erc.decimals().catch(() => 18),
        erc.symbol().catch(() => "TOKEN"),
      ]);
      if (bal === 0n) return alert("No token balance to withdraw.");
      addLog(`Withdrawing ${ethers.formatUnits(bal, dec)} ${sym} → ${dest}…`);
      const tx = await erc.transfer(dest, bal);
      addLog(`Sent: ${tx.hash}`);
      await tx.wait();
      addLog(`✅ ${sym} withdrawn (minus the token's transfer tax)`, "ok");
      refreshBalances();
    } catch (e: any) {
      addLog("Token withdraw failed: " + (e.shortMessage || e.message || e), "err");
    }
  }

  const upMs = startedAt ? now - startedAt : 0;
  const countdown = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const tokAcquired =
    startTok != null && tokBal != null
      ? Math.max(0, parseFloat(tokBal) - startTok)
      : 0;
  const fmtDur = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${h ? h + "h " : ""}${m}m ${ss < 10 ? "0" : ""}${ss}s`;
  };

  return (
    <div className="pb">
      <div className="pb-warn">
        ⚠️ Burner wallets only. The key is generated and stored in this browser
        and used solely to sign transactions sent straight to the {CHAIN.name}{" "}
        RPC — never uploaded.
      </div>

      {running && (
        <section className="pb-monitor" ref={monitorRef}>
          <div className="pb-mon-top">
            <div className="pb-live">
              <span className="pb-live-dot" /> LIVE · BUYING
            </div>
            <button className="pb-stop pb-mon-stop" onClick={stopLoop}>
              Stop
            </button>
          </div>
          <div className="pb-keepopen">
            ⚠️ Keep this browser window open to continue buying.
          </div>
          <div className="pb-countdown">
            <div className="pb-cd-num">
              {countdown <= 0 ? "Buying…" : `${countdown}s`}
            </div>
            <div className="pb-cd-label">until next buy</div>
          </div>
          <div className="pb-mon-stats">
            <div>
              <div className="pb-ms-num">{buys}</div>
              <div className="pb-ms-label">Buys</div>
            </div>
            <div>
              <div className="pb-ms-num">{ethSpent.toFixed(4)}</div>
              <div className="pb-ms-label">ETH spent</div>
            </div>
            <div>
              <div className="pb-ms-num">{fmtBal(tokAcquired)}</div>
              <div className="pb-ms-label">{tokSym} bought</div>
            </div>
            <div>
              <div className="pb-ms-num">{fmtDur(upMs)}</div>
              <div className="pb-ms-label">Uptime</div>
            </div>
          </div>
        </section>
      )}

      {/* 1 · Load wallet */}
      <section className="pb-card">
        <h2>1 · Load wallet</h2>
        {burnerAddr ? (
          <div className="pb-wallet-live">
            <div className="pb-wl-top">
              <div className="pb-wl-id">
                <span className="pb-dot" />
                <code>{shortAddr(burnerAddr)}</code>
                <span className="pb-net">{CHAIN.name}</span>
              </div>
              <div className="pb-wl-actions">
                <button className="pb-mini" onClick={generateWallet}>
                  New
                </button>
                <button className="pb-mini danger" onClick={forgetWallet}>
                  Forget
                </button>
              </div>
            </div>

            <div className="pb-balrow">
              <div>
                <div className="pb-balnum">{ethBal == null ? "…" : fmtBal(ethBal)}</div>
                <div className="pb-ballabel">ETH</div>
                <button
                  className="pb-tile-wd"
                  onClick={() => quickWithdraw("eth")}
                >
                  Withdraw
                </button>
              </div>
              <div>
                <div className="pb-balnum">{tokBal == null ? "0" : fmtBal(tokBal)}</div>
                <div className="pb-ballabel">{tokSym}</div>
                <button
                  className="pb-tile-wd"
                  onClick={() => quickWithdraw("tok")}
                >
                  Withdraw
                </button>
              </div>
            </div>

            <label>Deposit address — send ETH here to fund</label>
            <div className="pb-addr">
              <code>{burnerAddr}</code>
              <button
                className="pb-mini"
                onClick={() => copy(burnerAddr, "Address")}
              >
                Copy
              </button>
            </div>

            <label>Withdraw to — where the Withdraw buttons send</label>
            <input
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              onBlur={saveSettings}
              placeholder="0x… your main wallet"
            />

            <details className="pb-sub">
              <summary>Back up private key</summary>
              <div className="pb-addr" style={{ marginTop: 10 }}>
                <code>{showKey ? normalizeKey(pk) : "•".repeat(30)}</code>
                <button
                  className="pb-mini"
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <div className="pb-walletbtns">
                <button
                  className="pb-mini"
                  onClick={() => copy(normalizeKey(pk), "Private key")}
                >
                  Copy key
                </button>
                <button className="pb-mini" onClick={downloadKey}>
                  Download backup
                </button>
              </div>
            </details>
          </div>
        ) : (
          <div className="pb-wallet-empty">
            <p className="pb-hint">
              Generate a throwaway wallet in your browser, then deposit ETH to
              it. The key is created locally and saved only on this device —
              back it up before funding.
            </p>
            <button className="pb-primary" onClick={generateWallet}>
              Generate new wallet
            </button>
            <div className="pb-or">or load an existing key</div>
            <input
              type="password"
              value={pastedKey}
              onChange={(e) => setPastedKey(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
            />
            <button
              className="pb-ghost"
              onClick={loadPastedKey}
              style={{ marginTop: 8 }}
            >
              Load wallet
            </button>
          </div>
        )}
      </section>

      {/* 2 · Trade settings */}
      <section className="pb-card">
        <h2>2 · Trade settings</h2>
        <label>Token to buy</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="0x… token contract address"
        />
        <label>Uniswap V2 Router (Robinhood Chain)</label>
        <input value={router} onChange={(e) => setRouter(e.target.value)} />
        <label>LP / Pair address (recommended — auto-detects WETH)</label>
        <input
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          placeholder="0x… the token's WETH pair"
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
          Add / switch MetaMask to {CHAIN.name}
        </button>
      </section>

      <section className="pb-card">
        <h2>3 · Auto-buy loop</h2>
        <p className="pb-hint">
          Buys on a randomized timer with no popups, signed by your burner
          wallet. Fund the wallet with ETH first.
        </p>
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
          {parseFloat(randomize || "0") || 0}% — e.g. {interval || "60"}s and{" "}
          {amount || "0"} ETH, each ±{randomize || "0"}%. Set 0 for fixed.
        </p>
        <div className="pb-loopbtns" style={{ marginTop: 4 }}>
          {running ? (
            <button className="pb-stop" onClick={stopLoop}>
              Stop buying
            </button>
          ) : (
            <button
              className="pb-primary"
              onClick={startLoop}
              disabled={!burnerAddr}
            >
              {burnerAddr ? "Start buying" : "Generate a wallet first"}
            </button>
          )}
        </div>
        {!running && burnerAddr && (
          <p className="pb-hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Buying runs in this browser tab — you&rsquo;ll need to keep the
            window open while it&rsquo;s active.
          </p>
        )}
      </section>

      <section className="pb-card pb-collapse">
        <details>
          <summary>
            Prefer manual buys with MetaMask? (optional)
          </summary>
          <div style={{ marginTop: 14 }}>
            <p className="pb-hint">
              One click per buy — MetaMask confirms each one. Independent of the
              burner wallet above.
            </p>
            {mmAccount ? (
              <>
                <div className="pb-ok">Connected: {mmAccount}</div>
                <button className="pb-primary" onClick={buyOnceMetaMask}>
                  Buy now ({amount} ETH)
                </button>
              </>
            ) : (
              <button className="pb-primary" onClick={connectMetaMask}>
                Connect MetaMask
              </button>
            )}
          </div>
        </details>
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
