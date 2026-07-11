"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ethers } from "ethers";
import Leaderboard from "@/components/Leaderboard";
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
const V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
// Uniswap V3 on Robinhood Chain. There is no standalone SwapRouter02 deployed —
// swaps go through the Universal Router (verified on-chain from live swaps).
const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const UNIVERSAL_ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
// WETH is fixed on Robinhood Chain (= router.WETH()); every pool pairs against
// it, so we never need a user-supplied LP pair address.
const WETH_ADDR = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const V3_FEE_TIERS = [10000, 3000, 500, 100];
// Rough gas a swap burns (real ~131k for V2; a bit more for V3/taxed) — used
// only to warn when a buy is so small that fees eat a big share of it.
const GAS_UNITS_ESTIMATE = 200000n;
const GAS_WARN_PCT = 10; // warn when est. fees ≥ this % of the buy amount
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002"; // UR: keep in router
const ZERO = "0x0000000000000000000000000000000000000000";

// $PRINT — always shown; holding it drips ETH rewards to the wallet.
const PRINT_TOKEN = siteConfig.contractAddress;
// $PRINT has a 5% transfer tax; buys need >=7% slippage to clear it.
const PRINT_MIN_SLIPPAGE = 7;

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
];
const V2_FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const V3_FACTORY_ABI = [
  "function getPool(address,address,uint24) view returns (address)",
];
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

// Which venue a token trades on. Resolved once when the loop starts.
type Route = { kind: "v2" } | { kind: "v3"; fee: number };

// Wallet ranks by all-time buy count — a little level-up game under My stats.
type Tier = { name: string; at: number; emoji: string; color: string };
const ROOKIE_TIER: Tier = { name: "Rookie", at: 0, emoji: "⚡", color: "#8b93a7" };
const TIERS: Tier[] = [
  { name: "Bronze", at: 100, emoji: "🥉", color: "#cd7f32" },
  { name: "Silver", at: 1000, emoji: "🥈", color: "#cbd3dc" },
  { name: "Gold", at: 10000, emoji: "🥇", color: "#ffd24a" },
  { name: "Platinum", at: 100000, emoji: "🏆", color: "#6ad0ff" },
  { name: "Diamond", at: 1000000, emoji: "💎", color: "#b9f2ff" },
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const PK_STORAGE_KEY = "hoodprint_burner_pk";
const SETTINGS_STORAGE_KEY = "hoodprint_settings";
// Last wallet ADDRESS reported to /api/wallet (creation-funnel telemetry).
// Only the derived address is ever sent — never the private key.
const WALLET_REPORTED_KEY = "hoodprint:wallet_reported";

// Fire-and-forget: tell the backend this wallet address exists (new wallet,
// imported key, or one recovered from a returning user's localStorage). The
// localStorage flag dedupes per device; the server dedupes globally (ZADD NX),
// so worst case a re-report is a harmless no-op. Never blocks the UI.
function reportWalletCreated(addr: string) {
  if (typeof window === "undefined" || !addr) return;
  try {
    if (localStorage.getItem(WALLET_REPORTED_KEY) === addr) return;
    localStorage.setItem(WALLET_REPORTED_KEY, addr);
  } catch {
    /* storage blocked — still report; the server side dedupes */
  }
  fetch("/api/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr }),
  }).catch(() => {
    /* telemetry is best-effort */
  });
}
const RECENTS_STORAGE_KEY = "hoodprint_recent_tokens";

type RecentToken = { ca: string; sym: string };
type LogLevel = "info" | "ok" | "err";

// Pinned tokens — always shown first in the quick-select row, never removable.
const CASHCAT_TOKEN = "0x020bfC650A365f8BB26819deAAbF3E21291018b4";
const PINNED_TOKENS: RecentToken[] = [
  { ca: PRINT_TOKEN, sym: "PRINT" },
  { ca: CASHCAT_TOKEN, sym: "CASHCAT" },
];
// Always-available default tokens, shown after any user-selected recents.
const DEFAULT_RECENTS: RecentToken[] = [
  { ca: "0xf2915d1e3c1b0c769d0c756ec43f1c1f6c99cd03", sym: "ARROW" },
  { ca: "0x8e62f281f282686fca6dcb39288069a93fc23f1c", sym: "HOODRAT" },
  { ca: "0xd7321801caae694090694ff55a9323139f043b88", sym: "JUGGERNAUT" },
];
const RECENTS_CAP = 6; // user-selected recents (defaults are always shown too)
const PINNED_ADDRS = PINNED_TOKENS.filter((t) => t.ca).map((t) =>
  t.ca.toLowerCase()
);


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
  const [amount, setAmount] = useState("0.0002");
  const [interval, setIntervalSecs] = useState("3");
  const [randomize, setRandomize] = useState("50");
  const [slippage, setSlippage] = useState("2");
  const [pk, setPk] = useState("");
  const [burnerAddr, setBurnerAddr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [ethBal, setEthBal] = useState<string | null>(null);
  const [tokBal, setTokBal] = useState<string | null>(null);
  const [tokSym, setTokSym] = useState("PRINT");
  const [printBal, setPrintBal] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [recents, setRecents] = useState<RecentToken[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(true);

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ t: string; msg: string; level: LogLevel }[]>(
    []
  );

  // Transaction feed — the actual buys, each linkable to the block explorer.
  type TxRow = {
    hash: string;
    nonce: number;
    amt: string;
    status: "pending" | "ok" | "fail";
    t: string;
  };
  const [txs, setTxs] = useState<TxRow[]>([]);
  const addTx = (row: TxRow) =>
    setTxs((prev) => [row, ...prev].slice(0, 25));
  const setTxStatus = (hash: string, status: "ok" | "fail") =>
    setTxs((prev) =>
      prev.map((r) => (r.hash === hash ? { ...r, status } : r))
    );

  // Branded, on-site modal — replaces all browser alert()/confirm() popups.
  type ModalAction = {
    label: string;
    onClick?: () => void;
    variant?: "primary" | "danger" | "ghost";
    keepOpen?: boolean; // don't auto-close on click (used for multi-step flows)
  };
  type ModalState = {
    icon?: string;
    title: string;
    body: ReactNode;
    actions: ModalAction[];
    input?: { placeholder?: string }; // when set, a text field is rendered
  } | null;
  const [modal, setModal] = useState<ModalState>(null);
  // Value for the modal's text field (branded replacement for window.prompt).
  const [promptValue, setPromptValue] = useState("");
  const promptValueRef = useRef(""); // latest value, readable inside action closures

  const showAlert = (body: ReactNode, title = "Heads up", icon = "⚠️") =>
    setModal({ icon, title, body, actions: [{ label: "Got it", variant: "primary" }] });

  // Branded text prompt. Calls onSubmit(value) when confirmed with non-empty input.
  const showPrompt = (
    body: ReactNode,
    onSubmit: (value: string) => void,
    opts?: {
      title?: string;
      confirmLabel?: string;
      icon?: string;
      placeholder?: string;
      initial?: string;
    }
  ) => {
    const init = opts?.initial ?? "";
    setPromptValue(init);
    promptValueRef.current = init;
    setModal({
      icon: opts?.icon ?? "✏️",
      title: opts?.title ?? "Enter a value",
      body,
      input: { placeholder: opts?.placeholder },
      actions: [
        { label: "Cancel", variant: "ghost" },
        {
          label: opts?.confirmLabel ?? "Continue",
          variant: "primary",
          onClick: () => onSubmit(promptValueRef.current.trim()),
        },
      ],
    });
  };

  const showConfirm = (
    body: ReactNode,
    onConfirm: () => void,
    opts?: { title?: string; confirmLabel?: string; icon?: string; danger?: boolean }
  ) =>
    setModal({
      icon: opts?.icon ?? "❔",
      title: opts?.title ?? "Please confirm",
      body,
      actions: [
        { label: "Cancel", variant: "ghost" },
        {
          label: opts?.confirmLabel ?? "Continue",
          variant: opts?.danger ? "danger" : "primary",
          onClick: onConfirm,
        },
      ],
    });

  const runModalAction = (a: ModalAction) => {
    if (!a.keepOpen) setModal(null);
    a.onClick?.();
  };

  // live monitor
  const [buys, setBuys] = useState(0);
  const [ethSpent, setEthSpent] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [nextAt, setNextAt] = useState(0);
  const [startTok, setStartTok] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // personal counters (server-verified, all-time). Platform totals live in
  // <PlatformStatsNote /> under the page title.
  const [myBuys, setMyBuys] = useState<number | null>(null);
  const [myEth, setMyEth] = useState<number | null>(null);

  // trending tokens — top by platform ETH volume
  const [trending, setTrending] = useState<
    { ca: string; sym: string | null; buys: number; eth: number }[]
  >([]);

  // live gas price (wei) for the "buy too low" warning
  const [gasPriceWei, setGasPriceWei] = useState<bigint | null>(null);
  // live ETH/USD price so hourly costs can be shown in dollars
  const [ethUsd, setEthUsd] = useState<number | null>(null);

  // "add token by CA" popup
  const [addOpen, setAddOpen] = useState(false);
  const [addCa, setAddCa] = useState("");
  const [addErr, setAddErr] = useState("");

  // transient "Copied!" feedback when the wallet address is tapped
  const [copiedAddr, setCopiedAddr] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  // Spam mode: reserve nonces locally so rapid-fire sends don't collide, and
  // reuse one signer + cached WETH path so each tick does minimal RPC work.
  const nonceRef = useRef<number | null>(null);
  const signerRef = useRef<ethers.Wallet | null>(null);
  const wethRef = useRef<string | null>(null);
  const routeRef = useRef<Route | null>(null); // v2 vs v3, resolved at loop start
  const failStreakRef = useRef(0); // consecutive failures → stop + warn
  const monitorRef = useRef<HTMLDivElement>(null);
  const trendRowRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, level: LogLevel = "info") =>
    setLog((l) =>
      [{ t: new Date().toLocaleTimeString(), msg, level }, ...l].slice(0, 200)
    );

  // Restore the burner + saved settings from this device.
  useEffect(() => {
    // Funnel top: count this /print landing (daily bucket, no wallet, no PII).
    fetch("/api/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "visit" }),
    }).catch(() => {
      /* telemetry is best-effort */
    });
    try {
      const saved = localStorage.getItem(PK_STORAGE_KEY);
      if (saved) setPk(saved); // pk-sync effect derives + reports the address
    } catch {
      /* storage blocked */
    }
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      if (typeof s.token === "string") setToken(s.token);
      // Collapse trade settings if they've already configured a token.
      if (typeof s.token === "string" && s.token.trim()) setSettingsOpen(false);
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
    try {
      const r = JSON.parse(localStorage.getItem(RECENTS_STORAGE_KEY) || "[]");
      if (Array.isArray(r)) {
        setRecents(
          r
            .filter(
              (x) =>
                x &&
                typeof x.ca === "string" &&
                !PINNED_ADDRS.includes(x.ca.toLowerCase())
            )
            .slice(0, RECENTS_CAP)
        );
      }
    } catch {
      /* no recents */
    }
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function saveSettings(overrides?: Partial<Record<string, string>>) {
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
        ...overrides,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage blocked */
    }
  }

  // Select a token and persist it immediately so a reload keeps it. Routing
  // (V2 vs V3, WETH) is auto-detected on start — no pair address needed.
  function pickToken(ca: string) {
    if (runningRef.current)
      return showAlert(
        "Stop buying before switching to a different token.",
        "Buying is active"
      );
    setToken(ca);
    saveSettings({ token: ca });
  }

  function openAddToken() {
    if (runningRef.current)
      return showAlert(
        "Stop buying before switching to a different token.",
        "Buying is active"
      );
    setAddCa("");
    setAddErr("");
    setAddOpen(true);
  }

  function confirmAddToken() {
    const ca = addCa.trim();
    if (!ethers.isAddress(ca)) {
      setAddErr("That doesn't look like a valid contract address.");
      return;
    }
    setAddOpen(false);
    addRecent(ca);
    pickToken(ca);
  }

  // Keep the derived deposit address + local backup in sync with the key.
  // This runs for every way a wallet lands here — freshly generated, imported,
  // or restored from localStorage on load — so it's also where we report the
  // ADDRESS to the creation funnel (backfills existing users on next visit).
  useEffect(() => {
    const addr = deriveAddr(pk);
    setBurnerAddr(addr);
    try {
      if (addr) localStorage.setItem(PK_STORAGE_KEY, normalizeKey(pk));
    } catch {
      /* storage blocked */
    }
    if (addr) reportWalletCreated(addr);
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

  // Fast clock for the countdown/uptime, only while running.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  // On mobile, gently auto-scroll the trending row so people notice it can be
  // swiped. Ping-pongs very slowly and bows out permanently the moment the user
  // touches it. Skipped when the row fits or reduced-motion is requested.
  useEffect(() => {
    const el = trendRowRef.current;
    if (!el) return;
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.scrollWidth - el.clientWidth < 24) return; // nothing to reveal

    let raf = 0;
    let stopped = false;
    let dir = 1;
    let last = performance.now();
    const SPEED = 14; // px per second — deliberately slow

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });

    const tick = (t: number) => {
      if (stopped) return;
      const dt = (t - last) / 1000;
      last = t;
      const max = el.scrollWidth - el.clientWidth;
      let next = el.scrollLeft + dir * SPEED * dt;
      if (next >= max) {
        next = max;
        dir = -1;
      } else if (next <= 0) {
        next = 0;
        dir = 1;
      }
      el.scrollLeft = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return stop;
  }, [trending]);

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
      setPrintBal(null);
      return;
    }
    try {
      const provider = readProvider();
      const eth = await provider.getBalance(burnerAddr);
      setEthBal(ethers.formatEther(eth));
      // $PRINT balance (always shown)
      try {
        const printErc = new ethers.Contract(PRINT_TOKEN, ERC20_ABI, provider);
        const pb = await printErc.balanceOf(burnerAddr);
        setPrintBal(ethers.formatUnits(pb, 18));
      } catch {
        setPrintBal(null);
      }
      if (!ethers.isAddress(token.trim())) {
        setTokBal(null);
        setTokSym("PRINT");
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
      addRecent(token.trim(), s);
    } catch {
      /* rpc hiccup / token not live yet */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burnerAddr, token]);

  // Poll every 10s so the wallet + monitor stay current.
  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 10000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  // Personal totals — private, uncached, and only change when *this* wallet
  // buys (we also refresh right after each buy), so poll it slowly.
  const refreshStats = useCallback(async () => {
    if (!burnerAddr) return;
    try {
      const res = await fetch(`/api/stats?wallet=${burnerAddr}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const s = await res.json();
      if (s.wallet) {
        setMyBuys(s.wallet.buys ?? 0);
        setMyEth(s.wallet.eth ?? 0);
      }
    } catch {
      /* best-effort */
    }
  }, [burnerAddr]);

  useEffect(() => {
    refreshStats();
    const id = setInterval(refreshStats, 45000);
    return () => clearInterval(id);
  }, [refreshStats]);

  // Trending tokens — CDN-cached leaderboard, cheap to poll.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats?top=8");
        if (!res.ok) return;
        const s = await res.json();
        if (alive && Array.isArray(s.top)) setTrending(s.top);
      } catch {
        /* best-effort */
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Keep a live gas price so we can warn on tiny buys.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const fd = await readProvider().getFeeData();
        if (alive && fd.gasPrice) setGasPriceWei(fd.gasPrice);
      } catch {
        /* best-effort */
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live ETH/USD price so hourly costs can be shown in dollars. Best-effort —
  // if it fails we just don't render the USD line.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const j = await res.json();
        const p = Number(j?.ethereum?.usd);
        if (alive && Number.isFinite(p) && p > 0) setEthUsd(p);
      } catch {
        /* best-effort — USD line just stays hidden */
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // $PRINT has a 5% transfer tax, so a normal ~2% slippage floor reverts every
  // buy. Whenever $PRINT is the selected token, enforce at least 7% slippage
  // (5% tax + headroom). Only ever raises it — a higher manual value is kept.
  useEffect(() => {
    if (
      token.trim().toLowerCase() === PRINT_TOKEN.toLowerCase() &&
      parseFloat(slippage || "0") < PRINT_MIN_SLIPPAGE
    ) {
      setSlippage(String(PRINT_MIN_SLIPPAGE));
      saveSettings({ slippage: String(PRINT_MIN_SLIPPAGE) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Estimated gas cost (ETH) and its share of the current buy amount.
  const gasCostEth = gasPriceWei
    ? Number(GAS_UNITS_ESTIMATE * gasPriceWei) / 1e18
    : 0;
  const buyNum = parseFloat(amount || "0");
  const gasPct =
    gasCostEth > 0 && buyNum > 0 ? (gasCostEth / buyNum) * 100 : 0;
  const showGasWarn = gasPct >= GAS_WARN_PCT;

  // Rough hourly cost at the current amount + interval. Randomize is symmetric
  // (±%) so it averages out and doesn't change the expected spend.
  const intervalNum = parseFloat(interval || "0");
  const buysPerHour = intervalNum > 0 ? 3600 / intervalNum : 0;
  const spendPerHour = buyNum > 0 ? buyNum * buysPerHour : 0;
  const gasPerHour = gasCostEth * buysPerHour;
  const totalPerHour = spendPerHour + gasPerHour;
  const showHourly = buysPerHour > 0 && buyNum > 0;
  // USD conversions (only shown when the price fetch succeeded).
  const usd = (eth: number) => (ethUsd ? eth * ethUsd : null);
  const fmtUsd = (v: number) =>
    v >= 1
      ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : `$${v.toFixed(2)}`;
  // Runway: how long the current wallet balance lasts at this total burn rate.
  const ethBalNum = parseFloat(ethBal || "0");
  const runwayHours =
    totalPerHour > 0 && ethBalNum > 0 ? ethBalNum / totalPerHour : 0;
  const runwayMs = runwayHours * 3600 * 1000;

  // Rank the wallet by its all-time buy count — a little game to level up.
  const myBuysN = myBuys ?? 0;
  const reachedTier = TIERS.reduce(
    (acc, t, i) => (myBuysN >= t.at ? i : acc),
    -1
  );
  const currentTier =
    reachedTier >= 0 ? TIERS[reachedTier] : ROOKIE_TIER;
  const nextTier = TIERS[reachedTier + 1] ?? null;
  const tierFloor = reachedTier >= 0 ? TIERS[reachedTier].at : 0;
  const tierPct = nextTier
    ? Math.min(
        100,
        ((myBuysN - tierFloor) / (nextTier.at - tierFloor)) * 100
      )
    : 100;

  function openGasWarning() {
    const pctRounded = Math.round(gasPct);
    showAlert(
      gasPct >= 100 ? (
        <>
          At <strong>{amount} ETH</strong> per buy, estimated gas (~
          {gasCostEth.toFixed(6)} ETH) costs <strong>more than the buy
          itself</strong>. Raise your buy amount so most of your spend actually
          buys tokens.
        </>
      ) : (
        <>
          Buy amount very low — about{" "}
          <strong>{pctRounded}% of each spend goes to gas fees</strong> (~
          {gasCostEth.toFixed(6)} ETH per buy at current network rates). Raise
          the buy amount to keep more of it buying tokens.
        </>
      ),
      "Gas warning",
      "⛽"
    );
  }

  function loadPastedKey() {
    if (runningRef.current) return showAlert("Stop the loop before switching wallets.");
    const addr = deriveAddr(pastedKey);
    if (!addr) return showAlert("That private key is not valid.");
    setShowKey(false);
    setPk(pastedKey.trim());
    setPastedKey("");
    addLog(`Wallet loaded: ${addr}`, "ok");
  }

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  // Remember a token in the recents row (newest first). Pinned tokens are
  // handled separately and never enter recents.
  function addRecent(ca: string, sym?: string) {
    const a = ca.trim();
    if (!ethers.isAddress(a)) return;
    if (PINNED_ADDRS.includes(a.toLowerCase())) return;
    const label = sym && sym !== "TOKEN" ? sym : shortAddr(a);
    setRecents((prev) => {
      if (
        prev[0] &&
        prev[0].ca.toLowerCase() === a.toLowerCase() &&
        prev[0].sym === label
      ) {
        return prev; // already at front, no change
      }
      const next = [
        { ca: a, sym: label },
        ...prev.filter((x) => x.ca.toLowerCase() !== a.toLowerCase()),
      ].slice(0, RECENTS_CAP);
      try {
        localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }

  function generateWallet() {
    if (runningRef.current)
      return showAlert("Stop the loop before switching wallets.");
    const create = () => {
      const w = ethers.Wallet.createRandom();
      setShowKey(false);
      setPk(w.privateKey);
      addLog(`New burner wallet generated: ${w.address}`, "ok");
    };
    if (pk.trim()) {
      showConfirm(
        <>
          This replaces the current burner wallet. Make sure you&apos;ve
          withdrawn its funds and backed up its key first.
        </>,
        create,
        { title: "Replace wallet?", confirmLabel: "Generate new", danger: true }
      );
    } else {
      create();
    }
  }

  // Step 1 — warn, and require a key download before deletion is even offered.
  function forgetWallet() {
    if (runningRef.current)
      return showAlert(
        "Stop the buy loop before forgetting the wallet.",
        "Loop is running"
      );
    setModal({
      icon: "🔥",
      title: "Forget this wallet?",
      body: (
        <>
          This permanently erases the private key from this device. If you
          haven&apos;t saved it, any ETH or tokens still in the wallet are{" "}
          <strong>lost forever</strong> — there is no recovery.
          <br />
          <br />
          Download a backup first, then you can delete it.
        </>
      ),
      actions: [
        { label: "Cancel", variant: "ghost" },
        {
          label: "⬇ Download backup",
          variant: "primary",
          keepOpen: true,
          onClick: () => {
            downloadKey();
            setModal({
              icon: "✅",
              title: "Backup downloaded",
              body: (
                <>
                  Your key backup was saved. Only delete if you&apos;ve stored
                  that file somewhere safe — this <strong>cannot be undone</strong>.
                </>
              ),
              actions: [
                { label: "Cancel", variant: "ghost" },
                {
                  label: "Delete permanently",
                  variant: "danger",
                  onClick: eraseWallet,
                },
              ],
            });
          },
        },
      ],
    });
  }

  function eraseWallet() {
    try {
      localStorage.removeItem(PK_STORAGE_KEY);
    } catch {
      /* noop */
    }
    setPk("");
    setShowKey(false);
    addLog("Burner wallet erased from this device (key backup downloaded)", "info");
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(() => addLog(`${label} copied`));
  }

  function copyBurnerAddr() {
    if (!burnerAddr) return;
    navigator.clipboard?.writeText(burnerAddr);
    addLog("Wallet address copied");
    setCopiedAddr(true);
    window.setTimeout(() => setCopiedAddr(false), 1400);
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

  // Figure out where a token trades: a Uniswap V2 pair, or a V3 pool (and which
  // fee tier). This is what lets the bot handle V2 and V3 transparently.
  async function detectRoute(
    provider: ethers.Provider,
    tokenAddr: string,
    weth: string
  ): Promise<Route | null> {
    const v2 = new ethers.Contract(V2_FACTORY, V2_FACTORY_ABI, provider);
    try {
      const pairAddr: string = await v2.getPair(tokenAddr, weth);
      if (pairAddr && pairAddr !== ZERO) return { kind: "v2" };
    } catch {
      /* fall through to v3 */
    }
    const v3 = new ethers.Contract(V3_FACTORY, V3_FACTORY_ABI, provider);
    for (const fee of V3_FEE_TIERS) {
      try {
        const pool: string = await v3.getPool(tokenAddr, weth, fee);
        if (pool && pool !== ZERO) {
          const code = await provider.getCode(pool);
          if (code && code.length > 2) return { kind: "v3", fee };
        }
      } catch {
        /* try next tier */
      }
    }
    return null;
  }

  // Build Universal Router calldata for an ETH→token V3 exact-in swap. This
  // replicates the exact input layout the Robinhood Universal Router expects
  // (WRAP_ETH → V3_SWAP_EXACT_IN, with its extra trailing bytes field).
  function buildV3Calldata(
    recipient: string,
    fee: number,
    tokenAddr: string,
    weth: string,
    valueWei: bigint
  ): string {
    const w = (x: ethers.BigNumberish) => ethers.toBeHex(x, 32).slice(2);
    const wa = (a: string) => ethers.zeroPadValue(a, 32).slice(2);
    const wrap = "0x" + wa(ADDRESS_THIS) + w(valueWei); // WRAP_ETH(recipient=router, amount)
    const path = ethers
      .solidityPacked(["address", "uint24", "address"], [weth, fee, tokenAddr])
      .slice(2); // 43 bytes
    const pathPad = path + "0".repeat(128 - path.length); // pad to 2 words
    // recipient, amountIn, amountOutMin(0), pathOffset(0xc0), payerIsUser(0),
    // 2ndBytesOffset(0x120), pathLen(0x2b), path, emptyBytesLen(0)
    const v3 =
      "0x" +
      wa(recipient) +
      w(valueWei) +
      w(0) +
      w(0xc0) +
      w(0) +
      w(0x120) +
      w(0x2b) +
      pathPad +
      w(0);
    const iface = new ethers.Interface(UNIVERSAL_ROUTER_ABI);
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    return iface.encodeFunctionData("execute", ["0x0b00", [wrap, v3], deadline]);
  }

  // Build Universal Router calldata for an ETH→token V2 exact-in swap
  // (WRAP_ETH → V2_SWAP_EXACT_IN), matching this chain's UR input layout.
  function buildV2Calldata(
    recipient: string,
    tokenAddr: string,
    weth: string,
    valueWei: bigint,
    minOut: bigint
  ): string {
    const w = (x: ethers.BigNumberish) => ethers.toBeHex(x, 32).slice(2);
    const wa = (a: string) => ethers.zeroPadValue(a, 32).slice(2);
    const wrap = "0x" + wa(ADDRESS_THIS) + w(valueWei);
    // recipient, amountIn, amountOutMin, pathOffset(0xc0), payerIsUser(0),
    // 2ndBytesOffset(0x120), pathLen(2), path[0]=WETH, path[1]=token, emptyLen(0)
    const v2 =
      "0x" +
      wa(recipient) +
      w(valueWei) +
      w(minOut) +
      w(0xc0) +
      w(0) +
      w(0x120) +
      w(2) +
      wa(weth) +
      wa(tokenAddr) +
      w(0);
    const iface = new ethers.Interface(UNIVERSAL_ROUTER_ABI);
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    return iface.encodeFunctionData("execute", ["0x0b08", [wrap, v2], deadline]);
  }

  // For V2, quote via the classic router and apply slippage; V3 uses no floor
  // (tiny spam buys — price impact is negligible on 0.0002 ETH).
  async function quoteV2MinOut(
    provider: ethers.Provider,
    weth: string,
    tokenAddr: string,
    valueWei: bigint
  ): Promise<bigint> {
    try {
      const r = new ethers.Contract(DEFAULT_ROUTER, ROUTER_ABI, provider);
      const amounts = await (r.getAmountsOut as any)(valueWei, [weth, tokenAddr]);
      const quoted: bigint = amounts[amounts.length - 1];
      const slipBps = BigInt(Math.round(parseFloat(slippage || "0") * 100));
      return (quoted * (10000n - slipBps)) / 10000n;
    } catch {
      return 0n;
    }
  }

  // Broadcast a buy with an explicit nonce and return as soon as it hits the
  // mempool — no waiting for confirmation. Everything goes through the Universal
  // Router, which handles both V2 and V3, so no LP pair address is ever needed.
  async function sendBuyNoWait(
    signer: ethers.Wallet,
    provider: ethers.Provider,
    amountEth: string,
    nonce: number
  ): Promise<ethers.TransactionResponse> {
    const to = signer.address;
    const valueWei = ethers.parseEther(amountEth);
    const route = routeRef.current || { kind: "v2" };
    const tokenAddr = token.trim();

    let data: string;
    if (route.kind === "v3") {
      data = buildV3Calldata(to, route.fee, tokenAddr, WETH_ADDR, valueWei);
    } else {
      const minOut = await quoteV2MinOut(provider, WETH_ADDR, tokenAddr, valueWei);
      data = buildV2Calldata(to, tokenAddr, WETH_ADDR, valueWei, minOut);
    }
    return signer.sendTransaction({
      to: UNIVERSAL_ROUTER,
      data,
      value: valueWei,
      nonce,
    });
  }

  // Report a confirmed buy to the shared platform counters (fire-and-forget).
  // The server re-verifies the tx on-chain, so a failed post just means it
  // won't be counted — never blocks or breaks the buy loop.
  async function reportBuy(wallet: string, txHash: string, boughtToken?: string) {
    try {
      await fetch("/api/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // token = the CA this buy targeted. The server only trusts it after
        // finding a matching Transfer to the buyer in the receipt logs.
        body: JSON.stringify({ wallet, txHash, sym: tokSym, token: boughtToken }),
      });
      refreshStats();
    } catch {
      /* stats are best-effort */
    }
  }

  // ---- network ----
  async function addOrSwitchNetwork() {
    const eth = (window as any).ethereum;
    if (!eth) return showAlert("No wallet found. Install MetaMask.");
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

  // ---- private-key loop (randomized delay + amount) ----
  function normalizeKey(k: string) {
    const t = k.trim();
    return t.startsWith("0x") ? t : "0x" + t;
  }

  // After several failures in a row, stop and tell the user instead of
  // spinning silently (e.g. a token with no V2 liquidity, or a V3-only token).
  const FAIL_LIMIT = 5;
  // Anonymous churn telemetry — no wallet attached, fire-and-forget.
  function reportFail(type: "buy_fail" | "buy_stop") {
    fetch("/api/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    }).catch(() => {});
  }
  function noteFailure() {
    failStreakRef.current += 1;
    reportFail("buy_fail");
    if (failStreakRef.current >= FAIL_LIMIT && runningRef.current) {
      reportFail("buy_stop");
      stopLoop();
      showAlert(
        <>
          {FAIL_LIMIT} buys in a row failed, so we stopped. Common causes:{" "}
          <strong>not enough ETH for gas</strong>, the pool has{" "}
          <strong>too little liquidity</strong>, or slippage is too low for a
          taxed token. Double-check your balance and settings, then try again.
        </>,
        "Buying failed"
      );
    }
  }

  async function doBuy() {
    const wallet = signerRef.current;
    const provider = wallet?.provider;
    if (!wallet || !provider || nonceRef.current == null) return;

    // Reserve this tx's nonce SYNCHRONOUSLY (before any await) so back-to-back
    // sends never grab the same one.
    const myNonce = nonceRef.current;
    nonceRef.current = myNonce + 1;

    const pct = parseFloat(randomize || "0");
    const amt = fmtAmount(Math.max(0, jitter(parseFloat(amount || "0"), pct)));
    // Capture the CA now — the confirm callback below runs later, and the
    // user could have picked a different token by then.
    const boughtToken = token.trim();

    try {
      const tx = await sendBuyNoWait(wallet, provider, amt, myNonce);
      addTx({
        hash: tx.hash,
        nonce: myNonce,
        amt,
        status: "pending",
        t: new Date().toLocaleTimeString(),
      });
      // Confirm + count in the background; don't block the next send.
      tx.wait()
        .then((rec) => {
          if (rec && rec.status === 1) {
            failStreakRef.current = 0;
            setBuys((b) => b + 1);
            setEthSpent((e) => e + parseFloat(amt));
            setTxStatus(tx.hash, "ok");
            reportBuy(wallet.address, tx.hash, boughtToken);
            // Nudge the platform ticker immediately at our real buy rate.
            window.dispatchEvent(
              new CustomEvent("hoodprint:buy", {
                detail: { amt: parseFloat(amt) },
              })
            );
          } else {
            setTxStatus(tx.hash, "fail");
            noteFailure();
          }
        })
        .catch(() => {
          setTxStatus(tx.hash, "fail");
          noteFailure();
        });
    } catch (e: any) {
      const msg = `${e.shortMessage || e.message || e}`;
      addLog(`Send #${myNonce} failed: ${msg}`, "err");
      // Out of ETH → stop cleanly and tell the user, don't keep spinning.
      if (
        e.code === "INSUFFICIENT_FUNDS" ||
        /insufficient funds/i.test(msg)
      ) {
        handleOutOfFunds();
        return;
      }
      noteFailure();
      // A failed broadcast leaves a nonce gap that would stall later txs —
      // resync from the chain so the loop self-heals.
      try {
        nonceRef.current = await provider.getTransactionCount(
          wallet.address,
          "pending"
        );
      } catch {
        /* will retry next tick */
      }
    }
  }

  function handleOutOfFunds() {
    if (!runningRef.current) return;
    stopLoop();
    showAlert(
      <>
        Your wallet ran out of ETH, so buying stopped. Deposit more ETH into the
        deposit address to keep going — your progress and settings are saved.
      </>,
      "Out of ETH"
    );
  }

  function scheduleNext() {
    if (!runningRef.current) return;
    const pct = parseFloat(randomize || "0");
    const baseSecs = Math.max(0.1, parseFloat(interval || "60"));
    const secs = Math.max(0.1, jitter(baseSecs, pct));
    addLog(`Next buy in ${secs.toFixed(2)}s`);
    setNextAt(Date.now() + secs * 1000);
    timerRef.current = setTimeout(async () => {
      await doBuy();
      scheduleNext();
    }, secs * 1000);
  }

  async function startLoop() {
    if (runningRef.current) return;
    // $PRINT isn't tradable yet — explain instead of failing silently.
    if (token.trim().toLowerCase() === PRINT_TOKEN.toLowerCase()) {
      showConfirm(
        <>
          You can auto-buy any other Robinhood Chain token right now — but{" "}
          <strong>$PRINT goes live shortly</strong>. Every buy still counts:
          keep printing to <strong>level up</strong> and rank higher for the{" "}
          $PRINT airdrop. Join our Telegram to catch the launch?
        </>,
        () => window.open(siteConfig.telegram, "_blank", "noopener"),
        {
          icon: "🖨️",
          title: "$PRINT is coming soon!",
          confirmLabel: "Join Telegram",
        }
      );
      return;
    }
    if (!pk.trim()) return showAlert("Load a wallet first.");
    if (!ethers.isAddress(token.trim()))
      return showAlert("Enter a valid token address in trade settings.");
    let addr = "";
    try {
      addr = new ethers.Wallet(normalizeKey(pk)).address;
    } catch {
      return showAlert("That private key is not valid.");
    }
    const pct = parseFloat(randomize || "0");
    addLog(
      `Loop started — ${addr} · ~${amount} ETH every ~${interval}s, randomized ±${pct}%`,
      "ok"
    );
    // Prepare the persistent signer, cache the WETH path, and sync the nonce
    // once up front so each tick can fire fast without redundant RPC calls.
    const provider = readProvider();
    const wallet = new ethers.Wallet(normalizeKey(pk), provider);
    signerRef.current = wallet;
    wethRef.current = WETH_ADDR;

    // Pre-flight — surface obvious blockers as a popup instead of quietly
    // starting a timer that never buys.
    const buyWei = ethers.parseEther(amount || "0");
    if (buyWei <= 0n)
      return showAlert("Set a buy amount greater than 0.", "Check settings");

    // Does a pool exist? (also tells us V2 vs V3)
    let route: Route | null;
    try {
      route = await detectRoute(provider, token.trim(), WETH_ADDR);
    } catch {
      return showAlert("Could not reach the RPC to start. Try again.");
    }
    if (!route) {
      return showAlert(
        <>
          We couldn&apos;t find a Uniswap V2 or V3 pool for this token on
          Robinhood Chain. Double-check the token address.
        </>,
        "No pool found"
      );
    }

    // Enough ETH? Need more than one buy plus gas, or it can't even start.
    let balWei: bigint;
    try {
      balWei = await provider.getBalance(addr);
    } catch {
      return showAlert("Could not reach the RPC to start. Try again.");
    }
    const gasBuffer = GAS_UNITS_ESTIMATE * (gasPriceWei ?? 100000000n);
    if (balWei <= buyWei + gasBuffer) {
      return showAlert(
        <>
          This wallet holds <strong>{fmtBal(ethers.formatEther(balWei))} ETH</strong>
          , which isn&apos;t enough for a <strong>{amount} ETH</strong> buy plus
          gas. Deposit more ETH into the deposit address, then start.
        </>,
        "Not enough ETH"
      );
    }

    routeRef.current = route;
    addLog(
      route.kind === "v3"
        ? `Route: Uniswap V3 (${route.fee / 10000}% fee tier)`
        : "Route: Uniswap V2",
      "ok"
    );
    try {
      nonceRef.current = await provider.getTransactionCount(addr, "pending");
    } catch (e: any) {
      return showAlert("Could not reach the RPC to start: " + (e.message || e));
    }

    saveSettings();
    failStreakRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    window.dispatchEvent(
      new CustomEvent("hoodprint:running", { detail: true })
    );
    setBuys(0);
    setEthSpent(0);
    setTxs([]);
    setStartedAt(Date.now());
    setStartTok(tokBal != null ? parseFloat(tokBal) : 0);
    // Scroll all the way to the top of the page.
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    );
    doBuy(); // fire immediately (don't await — spam mode)
    scheduleNext();
  }

  function stopLoop() {
    runningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    signerRef.current = null;
    nonceRef.current = null;
    wethRef.current = null;
    routeRef.current = null;
    setRunning(false);
    window.dispatchEvent(
      new CustomEvent("hoodprint:running", { detail: false })
    );
    addLog("Loop stopped", "info");
  }

  // ---- withdraw (sweep the burner) ----
  function runWithdraw(kind: "eth" | "tok", dest: string, tokenAddr?: string) {
    if (kind === "eth") return withdrawEth(dest);
    return withdrawToken(dest, tokenAddr);
  }

  // One-tap withdraw from a balance tile: use the saved destination, or ask
  // for one via the branded modal (no browser prompt).
  function quickWithdraw(kind: "eth" | "tok", tokenAddr?: string) {
    const dest = withdrawTo.trim();
    if (ethers.isAddress(dest)) {
      void runWithdraw(kind, dest, tokenAddr);
      return;
    }
    showPrompt(
      "Where should we send your funds? Paste the wallet address to withdraw to.",
      (value) => {
        if (!ethers.isAddress(value)) {
          return showAlert("That address is not valid.");
        }
        setWithdrawTo(value);
        saveSettings({ withdrawTo: value });
        void runWithdraw(kind, value, tokenAddr);
      },
      {
        title: "Withdraw to",
        confirmLabel: "Withdraw",
        icon: "💸",
        placeholder: "0x… destination address",
        initial: withdrawTo,
      }
    );
  }

  async function withdrawEth(to?: string) {
    const dest = (to ?? withdrawTo).trim();
    if (!ethers.isAddress(dest)) return showAlert("Enter a valid destination address.");
    if (!deriveAddr(pk)) return showAlert("No burner wallet loaded.");
    try {
      const provider = readProvider();
      const wallet = new ethers.Wallet(normalizeKey(pk), provider);
      const bal = await provider.getBalance(wallet.address);
      const fee = await provider.getFeeData();
      const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
      // Leave ~5x a plain transfer's gas so the withdrawal itself lands AND a
      // little dust remains — never sweep the wallet fully dry.
      const reserve = gasPrice * 21000n * 5n;
      if (bal <= reserve)
        return showAlert(
          <>
            Balance is <strong>{fmtBal(ethers.formatEther(bal))} ETH</strong> —
            too low to cover the withdrawal&apos;s gas fee. Nothing was sent.
          </>,
          "Not enough to withdraw"
        );
      const value = bal - reserve;
      addLog(
        `Withdrawing ${ethers.formatEther(value)} ETH → ${dest} (leaving ~${ethers.formatEther(reserve)} for gas)…`
      );
      const tx = await wallet.sendTransaction({ to: dest, value });
      addLog(`Sent: ${tx.hash}`);
      await tx.wait();
      addLog("✅ ETH withdrawn", "ok");
      refreshBalances();
    } catch (e: any) {
      addLog("ETH withdraw failed: " + (e.shortMessage || e.message || e), "err");
    }
  }

  async function withdrawToken(to?: string, tokenAddr?: string) {
    const dest = (to ?? withdrawTo).trim();
    if (!ethers.isAddress(dest)) return showAlert("Enter a valid destination address.");
    if (!deriveAddr(pk)) return showAlert("No burner wallet loaded.");
    const ca = (tokenAddr || token).trim();
    if (!ethers.isAddress(ca)) return showAlert("No valid token to withdraw.");
    try {
      const provider = readProvider();
      const wallet = new ethers.Wallet(normalizeKey(pk), provider);
      const erc = new ethers.Contract(ca, ERC20_ABI, wallet);
      const [bal, dec, sym] = await Promise.all([
        erc.balanceOf(wallet.address),
        erc.decimals().catch(() => 18),
        erc.symbol().catch(() => "TOKEN"),
      ]);
      if (bal === 0n) return showAlert("No token balance to withdraw.");
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

  const usedAddrs = new Set(recents.map((r) => r.ca.toLowerCase()));
  const defaultsToShow = DEFAULT_RECENTS.filter(
    (d) => !usedAddrs.has(d.ca.toLowerCase())
  );
  const upMs = startedAt ? now - startedAt : 0;
  const countdown = Math.max(0, (nextAt - now) / 1000);
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
      {trending.length > 0 && (
        <div className="pb-trending">
          <span className="pb-trending-label">🔥 Trending</span>
          <div className="pb-trend-row" ref={trendRowRef}>
            {trending.map((t) => (
              <button
                key={t.ca}
                className="pb-trend"
                title={`${t.ca} — ${t.buys} buys`}
                onClick={() => pickToken(t.ca)}
                disabled={running}
              >
                <span className="pb-trend-sym">{t.sym || shortAddr(t.ca)}</span>
                <span className="pb-trend-vol">{fmtBal(t.eth)} Ξ</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
              {countdown <= 0 ? "Buying…" : `${countdown.toFixed(1)}s`}
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
            {showHourly && (
              <div>
                <div className="pb-ms-num">{totalPerHour.toFixed(4)}</div>
                <div className="pb-ms-label">
                  ETH / hr
                  {usd(totalPerHour) != null
                    ? ` · ${fmtUsd(usd(totalPerHour)!)}`
                    : ""}
                </div>
              </div>
            )}
            {runwayMs > 0 && (
              <div>
                <div className="pb-ms-num">{fmtDur(runwayMs)}</div>
                <div className="pb-ms-label">Runway left</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Single control panel */}
      <section className="pb-card">
        {burnerAddr ? (
          <div className="pb-wallet-live">
            <div className="pb-wl-top">
              <div className="pb-wl-id">
                <span className="pb-dot" />
                <button
                  type="button"
                  className="pb-addr-copy"
                  onClick={copyBurnerAddr}
                  title="Copy wallet address"
                >
                  <code>{shortAddr(burnerAddr)}</code>
                  <span className="pb-addr-copyicon">
                    {copiedAddr ? "Copied!" : "⧉"}
                  </span>
                </button>
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
              <div className="pb-print-tile">
                <button
                  className="pb-help"
                  onClick={() => setShowHelp((s) => !s)}
                  aria-label="What is $PRINT?"
                >
                  ?
                </button>
                <div className="pb-balnum">{printBal == null ? "…" : fmtBal(printBal)}</div>
                <div className="pb-ballabel">$PRINT</div>
                <button
                  className="pb-tile-wd"
                  onClick={() => quickWithdraw("tok", PRINT_TOKEN)}
                >
                  Withdraw
                </button>
                {showHelp && (
                  <div className="pb-help-pop">
                    <button
                      className="pb-help-close"
                      onClick={() => setShowHelp(false)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                    Hold <strong>$PRINT</strong> here and use the ETH rewards to
                    auto-buy any token. You can even buy more $PRINT.
                  </div>
                )}
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

            <div className="pb-recents">
              {PINNED_TOKENS.filter((t) => ethers.isAddress(t.ca)).map((t) => (
                <button
                  key={t.ca}
                  className="pb-recent pinned"
                  title={t.ca}
                  onClick={() => pickToken(t.ca)}
                  disabled={running}
                >
                  {t.sym}
                </button>
              ))}
              {recents.map((r) => (
                <button
                  key={r.ca}
                  className="pb-recent"
                  title={r.ca}
                  onClick={() => pickToken(r.ca)}
                  disabled={running}
                >
                  {r.sym}
                </button>
              ))}
              {defaultsToShow.map((r) => (
                <button
                  key={r.ca}
                  className="pb-recent"
                  title={r.ca}
                  onClick={() => pickToken(r.ca)}
                  disabled={running}
                >
                  {r.sym}
                </button>
              ))}
              <button
                className="pb-recent pb-addtoken"
                title="Add a token by contract address"
                onClick={openAddToken}
                disabled={running}
              >
                +
              </button>
            </div>

            {!running && (
              <button
                className="pb-primary pb-bigstart pb-quickstart"
                onClick={startLoop}
                disabled={!burnerAddr}
              >
                {!burnerAddr
                  ? "Generate a wallet first"
                  : `Start buying${
                      ethers.isAddress(token.trim()) ? " " + tokSym : ""
                    }`}
              </button>
            )}

            <div className="pb-mystats">
              <span className="pb-mystats-label">My stats</span>
              <span>
                <strong>{(myBuys ?? 0).toLocaleString("en-US")}</strong> buys
              </span>
              <span className="pb-mystats-sep">·</span>
              <span>
                <strong>{fmtBal(myEth ?? 0)}</strong> ETH volume
              </span>
            </div>

            <div className="pb-level">
              <div className="pb-level-top">
                <span
                  className="pb-level-badge"
                  style={{
                    color: currentTier.color,
                    borderColor: currentTier.color,
                  }}
                >
                  {currentTier.emoji} {currentTier.name}
                </span>
                <span className="pb-level-next">
                  {nextTier ? (
                    <>
                      {myBuysN.toLocaleString("en-US")} /{" "}
                      {nextTier.at.toLocaleString("en-US")} →{" "}
                      <span style={{ color: nextTier.color }}>
                        {nextTier.emoji} {nextTier.name}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: currentTier.color }}>
                      MAX RANK — Diamond 💎
                    </span>
                  )}
                </span>
              </div>
              <div className="pb-level-bar">
                <div
                  className="pb-level-fill"
                  style={{ width: `${tierPct}%` }}
                />
              </div>
              <div className="pb-level-note">
                Level up to earn rewards.{" "}
                <span className="pb-level-soon">Coming soon.</span>
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
              onBlur={() => saveSettings()}
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
              Generate a dedicated wallet in your browser, then deposit ETH to
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

        <details
          className="pb-sub pb-settings"
          open={settingsOpen}
          onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
        >
          <summary>
            Trade settings
            {ethers.isAddress(token.trim()) ? ` · ${tokSym}` : ""}
          </summary>
          <label style={{ marginTop: 10 }}>Token to buy</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => saveSettings()}
            placeholder="0x… token contract address"
            disabled={running}
            title={running ? "Stop buying to change the token" : undefined}
          />
          <label>Slippage %</label>
          <input
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            onBlur={() => saveSettings()}
          />
          <button className="pb-ghost" onClick={addOrSwitchNetwork}>
            Add / switch MetaMask to {CHAIN.name}
          </button>
        </details>

        <div className="pb-autobuy">
          <div className="pb-row">
            <div>
              <label>Buy amount (ETH)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => saveSettings()}
              />
              {showGasWarn && (
                <button
                  type="button"
                  className="pb-gaswarn"
                  onClick={openGasWarning}
                  title="Estimated fees are a large share of this buy"
                >
                  ⛽ Gas warning
                </button>
              )}
            </div>
            <div>
              <label>Buy every (s)</label>
              <input
                value={interval}
                onChange={(e) => setIntervalSecs(e.target.value)}
                onBlur={() => saveSettings()}
              />
            </div>
            <div>
              <label>Randomize ±%</label>
              <input
                value={randomize}
                onChange={(e) => setRandomize(e.target.value)}
                onBlur={() => saveSettings()}
              />
            </div>
          </div>

          {showHourly && (
            <div className="pb-hourly">
              <div className="pb-hourly-item">
                <span className="pb-hourly-num">{spendPerHour.toFixed(5)}</span>
                {usd(spendPerHour) != null && (
                  <span className="pb-hourly-usd">
                    ≈ {fmtUsd(usd(spendPerHour)!)}
                  </span>
                )}
                <span className="pb-hourly-label">ETH spend / hr</span>
              </div>
              <div className="pb-hourly-item">
                <span className="pb-hourly-num">
                  {gasPriceWei ? gasPerHour.toFixed(5) : "…"}
                </span>
                {gasPriceWei && usd(gasPerHour) != null && (
                  <span className="pb-hourly-usd">
                    ≈ {fmtUsd(usd(gasPerHour)!)}
                  </span>
                )}
                <span className="pb-hourly-label">ETH gas / hr</span>
              </div>
              <div className="pb-hourly-item pb-hourly-total">
                <span className="pb-hourly-num">{totalPerHour.toFixed(5)}</span>
                {usd(totalPerHour) != null && (
                  <span className="pb-hourly-usd">
                    ≈ {fmtUsd(usd(totalPerHour)!)}
                  </span>
                )}
                <span className="pb-hourly-label">ETH total / hr</span>
              </div>
            </div>
          )}
          {showHourly && (
            <p className="pb-hourly-note">
              Estimate at ~{Math.round(buysPerHour).toLocaleString("en-US")} buys/hr
              {gasPriceWei ? " · gas at current network rate" : ""}
              {runwayMs > 0 && (
                <>
                  {" · "}your balance lasts ~
                  <strong>{fmtDur(runwayMs)}</strong>
                </>
              )}
              .
            </p>
          )}
        </div>

      </section>

      <Leaderboard me={burnerAddr} />

      <section className="pb-card">
        <h2>Transactions</h2>
        <div className="pb-txs">
          {txs.length === 0 && (
            <div className="pb-log-empty">
              No transactions yet — start buying to see them land here.
            </div>
          )}
          {txs.map((tx) => (
            <a
              key={tx.hash}
              className={`pb-tx ${tx.status}`}
              href={`${CHAIN.explorer}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`nonce ${tx.nonce} · ${tx.status}`}
            >
              <span className="pb-tx-status" />
              <span className="pb-tx-amt">{tx.amt} ETH</span>
              <span className="pb-tx-hash">
                {tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}
              </span>
              <span className="pb-tx-t">{tx.t}</span>
              <span className="pb-tx-arrow">↗</span>
            </a>
          ))}
        </div>
      </section>

      {addOpen && (
        <div
          className="pb-modal-overlay"
          onClick={() => setAddOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-icon">➕</div>
            <h3 className="pb-modal-title">Add a token</h3>
            <div className="pb-modal-body">
              Paste any Robinhood Chain token&apos;s contract address.
            </div>
            <input
              className="pb-modal-input"
              value={addCa}
              onChange={(e) => {
                setAddCa(e.target.value);
                setAddErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmAddToken()}
              placeholder="0x… contract address"
              autoFocus
              spellCheck={false}
            />
            {addErr && <div className="pb-modal-err">{addErr}</div>}
            <div className="pb-modal-actions">
              <button
                className="pb-modal-btn ghost"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
              <button className="pb-modal-btn primary" onClick={confirmAddToken}>
                Add & select
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div
          className="pb-modal-overlay"
          onClick={() => setModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            {modal.icon && <div className="pb-modal-icon">{modal.icon}</div>}
            <h3 className="pb-modal-title">{modal.title}</h3>
            <div className="pb-modal-body">{modal.body}</div>
            {modal.input && (
              <input
                className="pb-modal-input"
                value={promptValue}
                placeholder={modal.input.placeholder}
                autoFocus
                spellCheck={false}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  promptValueRef.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const confirmAction = modal.actions.find(
                      (a) => a.variant === "primary"
                    );
                    if (confirmAction) runModalAction(confirmAction);
                  }
                }}
              />
            )}
            <div className="pb-modal-actions">
              {modal.actions.map((a, i) => (
                <button
                  key={i}
                  className={`pb-modal-btn ${a.variant || "ghost"}`}
                  onClick={() => runModalAction(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
