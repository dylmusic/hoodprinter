"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { siteConfig } from "@/site.config";
import { BUYROUTER_ADDRESS, BUYROUTER_ABI } from "@/lib/buyrouter";

/**
 * Admin panel for the HOODPrinter Buy Router (testing sandbox).
 *  - Status: owner, operator, on-chain stats, contract balances.
 *  - Operator quick-sweeps (signed by the in-browser burner) — can only ever
 *    send the contract's airdrops TO THE OWNER, so they're zero-risk.
 *  - Owner controls (signed via MetaMask) — set operator, transfer ownership,
 *    sweep anywhere, and a generic owner-call for claiming airdrops.
 */

const RPC = siteConfig.chain.rpcUrl;
const EXPLORER = siteConfig.chain.explorerUrl;
const CHAIN_ID = siteConfig.chain.chainId; // 4663
const PK_STORAGE_KEY = "hoodprint_burner_pk";
const ADDR_STORAGE_KEY = "hoodprint_buyrouter_addr";
const ERC20_MIN = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

type Snapshot = {
  owner: string;
  operator: string;
  totalBuys: string;
  totalEthRouted: string;
  uniqueBuyers: string;
  ethBalance: string;
};

const box: React.CSSProperties = {
  margin: "1.5rem auto 0",
  maxWidth: 720,
  padding: "1rem 1.1rem",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  fontSize: "0.9rem",
};
const btn: React.CSSProperties = {
  padding: "0.5rem 0.9rem",
  borderRadius: 999,
  border: "1px solid rgba(120,220,150,0.5)",
  background: "rgba(60,180,100,0.14)",
  color: "var(--green)",
  fontWeight: 700,
  fontSize: "0.82rem",
  cursor: "pointer",
};
const btnAmber: React.CSSProperties = {
  ...btn,
  border: "1px solid rgba(245,196,81,0.5)",
  background: "rgba(245,196,81,0.12)",
  color: "#f5c451",
};
const inp: React.CSSProperties = {
  flex: "1 1 260px",
  minWidth: 0,
  padding: "0.45rem 0.65rem",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  fontSize: "0.82rem",
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 8,
};

export default function BuyRouterAdmin() {
  const [router, setRouter] = useState<string>(BUYROUTER_ADDRESS || "");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState<string>("");

  // operator sweep inputs
  const [sweepTok, setSweepTok] = useState("");
  // owner control inputs
  const [connected, setConnected] = useState<string>("");
  const [newOperator, setNewOperator] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [ownerSweepTok, setOwnerSweepTok] = useState("");
  const [ownerSweepTo, setOwnerSweepTo] = useState("");
  const [callTarget, setCallTarget] = useState("");
  const [callValue, setCallValue] = useState("");
  const [callData, setCallData] = useState("");

  // Resolve router address (canonical pin, else locally-deployed).
  useEffect(() => {
    if (BUYROUTER_ADDRESS) return;
    const read = () => {
      try {
        const a = localStorage.getItem(ADDR_STORAGE_KEY);
        if (a && ethers.isAddress(a)) setRouter(a);
      } catch {
        /* ignore */
      }
    };
    read();
    const id = setInterval(read, 4000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!router || !ethers.isAddress(router)) return;
    try {
      const p = new ethers.JsonRpcProvider(RPC);
      const c = new ethers.Contract(router, BUYROUTER_ABI, p);
      const [owner, operator, tb, te, ub, bal] = await Promise.all([
        c.owner(),
        c.operator(),
        c.totalBuys(),
        c.totalEthRouted(),
        c.uniqueBuyers(),
        p.getBalance(router),
      ]);
      setSnap({
        owner: String(owner),
        operator: String(operator),
        totalBuys: tb.toString(),
        totalEthRouted: ethers.formatEther(te),
        uniqueBuyers: ub.toString(),
        ethBalance: ethers.formatEther(bal),
      });
    } catch (e: any) {
      setMsg("Read failed: " + (e.shortMessage || e.message || e));
    }
  }, [router]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
  }, [refresh]);

  // ---- operator (burner) actions ----
  function burnerSigner(): ethers.Wallet {
    let k = "";
    try {
      k = localStorage.getItem(PK_STORAGE_KEY) || "";
    } catch {
      /* ignore */
    }
    if (!k) throw new Error("No in-browser wallet found on this device.");
    if (!k.startsWith("0x")) k = "0x" + k;
    return new ethers.Wallet(k, new ethers.JsonRpcProvider(RPC));
  }

  async function operatorSweepEth() {
    setMsg("");
    setBusy("op-eth");
    try {
      const c = new ethers.Contract(router, BUYROUTER_ABI, burnerSigner());
      const tx = await c.sweepETH();
      setMsg("Sweeping ETH → owner… " + tx.hash);
      await tx.wait();
      setMsg("✅ ETH swept to owner.");
      refresh();
    } catch (e: any) {
      setMsg("Failed: " + (e.shortMessage || e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function operatorSweepToken() {
    setMsg("");
    if (!ethers.isAddress(sweepTok.trim())) {
      setMsg("Enter a valid token address to sweep.");
      return;
    }
    setBusy("op-tok");
    try {
      const c = new ethers.Contract(router, BUYROUTER_ABI, burnerSigner());
      const tx = await c.sweepToken(sweepTok.trim());
      setMsg("Sweeping token → owner… " + tx.hash);
      await tx.wait();
      setMsg("✅ Token swept to owner.");
      refresh();
    } catch (e: any) {
      setMsg("Failed: " + (e.shortMessage || e.message || e));
    } finally {
      setBusy("");
    }
  }

  // ---- owner (MetaMask) actions ----
  async function metaMaskContract(): Promise<ethers.Contract> {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask not detected.");
    // Ensure the right chain.
    const hexId = "0x" + CHAIN_ID.toString(16);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (e: any) {
      if (e && e.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: "Robinhood Chain",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC],
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else {
        throw e;
      }
    }
    const bp = new ethers.BrowserProvider(eth);
    const signer = await bp.getSigner();
    setConnected(await signer.getAddress());
    return new ethers.Contract(router, BUYROUTER_ABI, signer);
  }

  async function ownerAction(
    tag: string,
    fn: (c: ethers.Contract) => Promise<ethers.ContractTransactionResponse>
  ) {
    setMsg("");
    setBusy(tag);
    try {
      const c = await metaMaskContract();
      const tx = await fn(c);
      setMsg("Submitted via MetaMask… " + tx.hash);
      await tx.wait();
      setMsg("✅ Done.");
      refresh();
    } catch (e: any) {
      setMsg("Failed: " + (e.shortMessage || e.message || e));
    } finally {
      setBusy("");
    }
  }

  if (!router) {
    return (
      <div style={box}>
        <strong>Buy Router admin</strong> — deploy the router above first, then
        the admin controls appear here.
      </div>
    );
  }

  const isOwnerConnected =
    connected && snap && connected.toLowerCase() === snap.owner.toLowerCase();

  return (
    <div style={box}>
      <div style={{ fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>
        🖨️ Buy Router — admin
      </div>

      {/* status */}
      {snap ? (
        <div style={{ fontSize: "0.82rem", color: "#b8c0cc", lineHeight: 1.7 }}>
          <div>
            Contract:{" "}
            <a
              href={`${EXPLORER}/address/${router}?tab=read_write_contract`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#8b93a7" }}
            >
              {router.slice(0, 10)}…{router.slice(-8)} ↗
            </a>
          </div>
          <div>Owner: <code>{snap.owner}</code></div>
          <div>Operator (burner): <code>{snap.operator}</code></div>
          <div>
            On-chain: <strong>{snap.totalBuys}</strong> buys ·{" "}
            <strong>{Number(snap.totalEthRouted).toFixed(5)}</strong> ETH routed ·{" "}
            <strong>{snap.uniqueBuyers}</strong> buyers
          </div>
          <div>
            Contract ETH balance: <strong>{Number(snap.ethBalance).toFixed(6)}</strong>
          </div>
        </div>
      ) : (
        <div style={{ color: "#8b93a7" }}>Loading…</div>
      )}

      {/* operator quick sweeps (burner) */}
      <div style={{ marginTop: 14, fontWeight: 700, color: "#fff" }}>
        Quick sweep (one-click, no MetaMask) — always sends to the owner
      </div>
      <div style={row}>
        <button
          style={btn}
          onClick={operatorSweepEth}
          disabled={busy === "op-eth"}
          type="button"
        >
          {busy === "op-eth" ? "Sweeping…" : "Sweep ETH → owner"}
        </button>
        <input
          style={inp}
          placeholder="Token address to sweep → owner"
          value={sweepTok}
          onChange={(e) => setSweepTok(e.target.value)}
        />
        <button
          style={btn}
          onClick={operatorSweepToken}
          disabled={busy === "op-tok"}
          type="button"
        >
          {busy === "op-tok" ? "Sweeping…" : "Sweep token → owner"}
        </button>
      </div>

      {/* owner controls (MetaMask) */}
      <div style={{ marginTop: 16, fontWeight: 700, color: "#fff" }}>
        Owner controls (signed in MetaMask with your main wallet)
      </div>
      {connected && (
        <div
          style={{
            fontSize: "0.78rem",
            color: isOwnerConnected ? "var(--green)" : "#f5c451",
            marginTop: 4,
          }}
        >
          Connected: {connected.slice(0, 8)}…{connected.slice(-6)}{" "}
          {isOwnerConnected ? "(owner ✓)" : "(not the owner — actions will revert)"}
        </div>
      )}
      <div style={row}>
        <input
          style={inp}
          placeholder="New operator address (e.g. the burner)"
          value={newOperator}
          onChange={(e) => setNewOperator(e.target.value)}
        />
        <button
          style={btnAmber}
          onClick={() =>
            ownerAction("set-op", (c) => c.setOperator(newOperator.trim()))
          }
          disabled={busy === "set-op"}
          type="button"
        >
          Set operator
        </button>
      </div>
      <div style={row}>
        <input
          style={inp}
          placeholder="Token to sweep"
          value={ownerSweepTok}
          onChange={(e) => setOwnerSweepTok(e.target.value)}
        />
        <input
          style={inp}
          placeholder="Destination address"
          value={ownerSweepTo}
          onChange={(e) => setOwnerSweepTo(e.target.value)}
        />
        <button
          style={btnAmber}
          onClick={async () => {
            // sweep the full token balance to an arbitrary address
            const p = new ethers.JsonRpcProvider(RPC);
            const erc = new ethers.Contract(ownerSweepTok.trim(), ERC20_MIN, p);
            const bal = await erc.balanceOf(router);
            ownerAction("sweep-to", (c) =>
              c.sweepTokenTo(ownerSweepTok.trim(), ownerSweepTo.trim(), bal)
            );
          }}
          disabled={busy === "sweep-to"}
          type="button"
        >
          Sweep token → address
        </button>
      </div>
      <div style={row}>
        <input
          style={inp}
          placeholder="New owner address (transfer ownership)"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
        />
        <button
          style={btnAmber}
          onClick={() =>
            ownerAction("xfer", (c) => c.transferOwnership(newOwner.trim()))
          }
          disabled={busy === "xfer"}
          type="button"
        >
          Transfer ownership
        </button>
      </div>

      {/* advanced: owner call (claim airdrops) */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", color: "#8b93a7", fontSize: "0.82rem" }}>
          Advanced: claim an airdrop (owner call)
        </summary>
        <div style={row}>
          <input
            style={inp}
            placeholder="Target contract"
            value={callTarget}
            onChange={(e) => setCallTarget(e.target.value)}
          />
          <input
            style={{ ...inp, flex: "0 0 120px" }}
            placeholder="ETH value (0)"
            value={callValue}
            onChange={(e) => setCallValue(e.target.value)}
          />
        </div>
        <div style={row}>
          <input
            style={inp}
            placeholder="Calldata (0x…)"
            value={callData}
            onChange={(e) => setCallData(e.target.value)}
          />
          <button
            style={btnAmber}
            onClick={() =>
              ownerAction("call", (c) =>
                c.ownerCall(
                  callTarget.trim(),
                  ethers.parseEther(callValue.trim() || "0"),
                  callData.trim() || "0x"
                )
              )
            }
            disabled={busy === "call"}
            type="button"
          >
            Owner call
          </button>
        </div>
      </details>

      {msg && (
        <div style={{ marginTop: 10, fontSize: "0.8rem", color: "#cdd5df" }}>
          {msg}
        </div>
      )}
    </div>
  );
}
