"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from "@solana/spl-token";
import { NATIVE_SOL } from "@/lib/robinhoodTokens";

// Same public RPC used for the swap wallet adapter (lib/relayLeg.ts) —
// see the comment there for why Solana's own public endpoint was swapped
// out (403s under real traffic).
const SOLANA_RPC_URL = "https://solana-rpc.publicnode.com";
let cachedConnection: Connection | null = null;
function getConnection(): Connection {
  if (!cachedConnection) cachedConnection = new Connection(SOLANA_RPC_URL);
  return cachedConnection;
}

/**
 * Balance for the swap card's "You pay"/"You receive" top-right pill —
 * added after Dylan flagged it was missing for Solana tokens ("solana
 * balance doesnt show in the top right where it should"). Native SOL is a
 * plain lamports balance; SPL tokens (USDC/USDG on Solana) need their
 * Associated Token Account, which may not exist yet for a wallet that's
 * never held that token — a missing ATA is a normal "balance: 0" state,
 * not an error, so both known not-found cases resolve to 0 rather than
 * throwing.
 */
export async function getSolanaBalance(ownerAddress: string, tokenAddress: string, decimals: number): Promise<number | null> {
  try {
    const connection = getConnection();
    const owner = new PublicKey(ownerAddress);
    if (tokenAddress === NATIVE_SOL) {
      const lamports = await connection.getBalance(owner);
      return lamports / 10 ** decimals;
    }
    const mint = new PublicKey(tokenAddress);
    const ata = await getAssociatedTokenAddress(mint, owner);
    try {
      const account = await getAccount(connection, ata);
      return Number(account.amount) / 10 ** decimals;
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError || e instanceof TokenInvalidAccountOwnerError) return 0;
      throw e;
    }
  } catch {
    return null;
  }
}

/**
 * Lightweight direct-Phantom connect (window.solana), same pattern proven
 * live in the dylmusic project's own Solana swap page — deliberately not
 * the full @solana/wallet-adapter-react stack (multi-wallet UI, adapter
 * registry) for a first pass. Swap for the full adapter later if
 * multi-Solana-wallet support matters; Phantom alone covers the large
 * majority of Solana users today.
 */
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  // Phantom's own documented method for signing + broadcasting a
  // transaction in one prompt — this is exactly the shape
  // @reservoir0x/relay-svm-wallet-adapter's adaptSolanaWallet needs.
  signAndSendTransaction: (transaction: unknown, options?: unknown) => Promise<{ signature: string }>;
}

function getPhantom(): PhantomProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const anyWindow = window as unknown as { solana?: PhantomProvider };
  return anyWindow.solana?.isPhantom ? anyWindow.solana : undefined;
}

export function useSolanaWallet() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const provider = getPhantom();
    if (!provider) return;
    if (provider.publicKey) {
      setAddress(provider.publicKey.toString());
      return;
    }
    // Phantom doesn't populate `publicKey` on page load just because the
    // site was approved in a previous session — it needs an explicit
    // connect() call, which is why a real click "instantly populates" with
    // no prompt (Dylan: "my phantom is already connected... if my phantom
    // is already connected... just populate"). `onlyIfTrusted: true` is
    // Phantom's own documented eager-reconnect flag: it silently resolves
    // for a previously-approved site and silently rejects (no prompt, no
    // error surfaced) for one that was never approved, so this is safe to
    // fire unconditionally on mount.
    provider.connect({ onlyIfTrusted: true }).then((res) => setAddress(res.publicKey.toString())).catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    const provider = getPhantom();
    if (!provider) {
      window.open("https://phantom.app/download", "_blank");
      return;
    }
    const res = await provider.connect();
    setAddress(res.publicKey.toString());
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getPhantom();
    if (provider) await provider.disconnect();
    setAddress(null);
  }, []);

  return { address, connect, disconnect, hasPhantom: !!getPhantom(), getProvider: getPhantom };
}
