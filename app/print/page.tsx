import type { Metadata } from "next";
import PrintBot from "@/components/PrintBot";
import PlatformStatsNote from "@/components/PlatformStatsNote";

const title = "Buy Bot — Auto-Buy Any Robinhood Chain Token";
const description =
  "The HOOD Printer Buy Bot: auto-buy any token on Robinhood Chain (Uniswap V2 & V3) from a throwaway in-browser wallet. Create real buy volume with one click. Beta now live.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/print" },
  openGraph: {
    title: `HOOD Printer ${title}`,
    description,
    url: "https://hoodprinter.xyz/print",
    type: "website",
    images: [
      {
        url: "/brand/og-print.png?v=1",
        width: 1200,
        height: 630,
        alt: "HOOD Printer Buy Bot — auto-buy any Robinhood Chain token",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: `HOOD Printer ${title}`,
    description,
    images: ["/brand/og-print.png?v=1"],
  },
};

export default function PrintPage() {
  return (
    <main className="pb-page">
      <div className="pb-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
        <h1>
          Robinhood Chain <span className="green">Buy Bot</span>
        </h1>
        <PlatformStatsNote />
        <p>Auto-buy any token · Uniswap V2</p>
        <p className="pb-tagline">
          Hold <span className="green">$PRINT</span> to automatically buy any
          token with your ETH rewards.
        </p>
        <p className="pb-tagline pb-tagline-sub">
          Use HOOD Printer to create automatic buy volume for any project on
          Robinhood.
        </p>
      </div>
      <PrintBot />
    </main>
  );
}
