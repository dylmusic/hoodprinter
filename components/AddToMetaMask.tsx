"use client";

import { useState } from "react";

type Props = {
  address: string;
  symbol: string;
  decimals: number;
  image: string;
};

type Status = "idle" | "added" | "error";

/**
 * wallet_watchAsset (EIP-747) is implemented by whichever wallet injects
 * window.ethereum -- not MetaMask-exclusive -- but the fox icon/label frame
 * it as "Add to MetaMask" since that's who most visitors are using.
 */
export default function AddToMetaMask({ address, symbol, decimals, image }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  async function addToken() {
    const eth = (window as any).ethereum;
    if (!eth?.request) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const added = await eth.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address,
            symbol,
            decimals,
            image: `${window.location.origin}${image}`,
          },
        },
      });
      setStatus(added ? "added" : "idle");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <button
      className="mm-add-btn"
      onClick={addToken}
      type="button"
      aria-label="Add $PRINT to MetaMask"
      title={
        status === "added"
          ? "Added!"
          : status === "error"
          ? "Couldn't add — try again"
          : "Add to MetaMask"
      }
    >
      <svg width="15" height="15" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M3 4 L14 12 L11 16 L4 12.5 Z" fill="#E2761B" stroke="#E2761B" strokeWidth="1" strokeLinejoin="round" />
        <path d="M29 4 L18 12 L21 16 L28 12.5 Z" fill="#E2761B" stroke="#E2761B" strokeWidth="1" strokeLinejoin="round" />
        <path d="M16 9 L22 15 L20 25 L16 28 L12 25 L10 15 Z" fill="#F6851B" stroke="#D2691E" strokeWidth="1" strokeLinejoin="round" />
        <path d="M16 15 L19 18 L17.5 24 L16 25.5 L14.5 24 L13 18 Z" fill="#FDE9D0" />
        <circle cx="13.4" cy="17.6" r="1" fill="#1a1a1a" />
        <circle cx="18.6" cy="17.6" r="1" fill="#1a1a1a" />
      </svg>
      {status === "added" && <span className="mm-add-tip">Added!</span>}
    </button>
  );
}
