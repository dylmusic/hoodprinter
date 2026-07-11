import type { Metadata } from "next";
import MultiSender from "@/components/MultiSender";

// Unlisted for now: noindex/nofollow, not in the sitemap, not linked from nav.
export const metadata: Metadata = {
  title: "Multisend",
  description:
    "Send any Robinhood Chain token to thousands of wallets in one run.",
  robots: { index: false, follow: false },
};

export default function MultisendPage() {
  return (
    <main className="pb-page">
      <div className="pb-head">
        <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
        </a>
        <h1>
          Robinhood Chain <span className="green">Multisend</span>
        </h1>
        <p>Send any token to thousands of wallets in one run</p>
        <p className="pb-tagline">
          Paste a list, load a token, press send — the printer does the rest.
        </p>
      </div>
      <MultiSender />
    </main>
  );
}
