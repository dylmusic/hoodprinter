"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/site.config";

type Props = {
  address: string;
  symbol: string;
  decimals: number;
  image: string;
};

type Status = "idle" | "added" | "error";

// Query param that survives the MetaMask deep-link round trip (see below)
// so the in-app browser knows to fire the prompt as soon as it loads.
const AUTO_PARAM = "mmAddToken";

const CHAIN_ID_HEX = "0x" + siteConfig.chain.chainId.toString(16); // 0x1237

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// wallet_watchAsset has no chainId param -- it always adds the token
// against whichever chain the wallet currently has active. Adding $PRINT
// while sat on mainnet (or any other chain) silently creates a token entry
// that will never show a real balance. Same switch/add pattern already
// used in PrintBot.tsx's addOrSwitchNetwork().
async function ensureRobinhoodChain(eth: any) {
  const currentChainId = await eth.request({ method: "eth_chainId" });
  if (typeof currentChainId === "string" && currentChainId.toLowerCase() === CHAIN_ID_HEX) {
    return;
  }
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (e: any) {
    if (e?.code === 4902 || /Unrecognized chain/i.test(e?.message || "")) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: siteConfig.chain.name,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [siteConfig.chain.rpcUrl],
            blockExplorerUrls: [siteConfig.chain.explorerUrl],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

async function watchPrint(address: string, symbol: string, decimals: number, image: string) {
  const eth = (window as any).ethereum;
  if (!eth?.request) return false;
  await ensureRobinhoodChain(eth);
  const added = await eth.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: { address, symbol, decimals, image: `${window.location.origin}${image}` },
    },
  });
  return !!added;
}

/**
 * wallet_watchAsset (EIP-747) is implemented by whichever wallet injects
 * window.ethereum -- not MetaMask-exclusive -- but the fox icon/label frame
 * it as "Add to MetaMask" since that's who most visitors are using.
 *
 * Mobile Safari has no injected wallet at all, so tapping this normally does
 * nothing useful there. Instead we deep-link into the MetaMask app via its
 * official metamask.app.link universal link, which reopens this same page
 * inside MetaMask's own in-app browser (where window.ethereum DOES exist) --
 * the same category of mobile deep-link RainbowKit's own MetaMask connector
 * uses for /swap's wallet-connect flow, just called directly here since this
 * button doesn't need RainbowKit's full connector stack for one EIP-747 call.
 */
export default function AddToMetaMask({ address, symbol, decimals, image }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  // Landed back here via the deep link below, now inside MetaMask's own
  // in-app browser -- fire the prompt automatically instead of making the
  // user tap "Add to MetaMask" a second time.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(AUTO_PARAM) !== "1") return;
    url.searchParams.delete(AUTO_PARAM);
    window.history.replaceState({}, "", url.toString());

    if (!(window as any).ethereum?.request) return;
    watchPrint(address, symbol, decimals, image)
      .then((added) => {
        setStatus(added ? "added" : "idle");
        setTimeout(() => setStatus("idle"), 1800);
      })
      .catch(() => {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 1800);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addToken() {
    const eth = (window as any).ethereum;

    if (eth?.request) {
      try {
        const added = await watchPrint(address, symbol, decimals, image);
        setStatus(added ? "added" : "idle");
      } catch {
        setStatus("error");
      }
      setTimeout(() => setStatus("idle"), 1800);
      return;
    }

    if (isMobileUA()) {
      const target = new URL(window.location.href);
      target.searchParams.set(AUTO_PARAM, "1");
      const dappUrl = target.href.replace(/^https?:\/\//, "");
      window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
      return;
    }

    window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
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
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        {/* ears */}
        <path d="M11 3 L6 13 L15 11 Z" fill="#E2761B" />
        <path d="M21 3 L26 13 L17 11 Z" fill="#E2761B" />
        {/* head, tapering to a snout */}
        <path
          d="M16 9 C21 9 25 13 25 18 C25 22.5 20.5 26.5 16 29.5 C11.5 26.5 7 22.5 7 18 C7 13 11 9 16 9 Z"
          fill="#F6851B"
        />
        {/* muzzle */}
        <path
          d="M16 16 C18.5 16 20.3 18.3 20.3 20.6 C20.3 23.1 18.3 25.6 16 27.8 C13.7 25.6 11.7 23.1 11.7 20.6 C11.7 18.3 13.5 16 16 16 Z"
          fill="#FEF3E0"
        />
        {/* eyes */}
        <circle cx="13" cy="19.4" r="1.1" fill="#1a1a1a" />
        <circle cx="19" cy="19.4" r="1.1" fill="#1a1a1a" />
        {/* nose */}
        <path d="M16 24.4 L17.2 25.9 L16 27 L14.8 25.9 Z" fill="#1a1a1a" />
      </svg>
      {status === "added" && <span className="mm-add-tip">Added!</span>}
    </button>
  );
}
