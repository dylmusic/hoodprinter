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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/metamask-fox.svg" width={16} height={16} alt="" aria-hidden="true" />
      {status === "added" && <span className="mm-add-tip">Added!</span>}
    </button>
  );
}
