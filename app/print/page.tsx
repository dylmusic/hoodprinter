import type { Metadata } from "next";
import PrintBot from "@/components/PrintBot";
import PlatformStatsNote from "@/components/PlatformStatsNote";

// Unlisted: keep it out of search engines and social previews.
export const metadata: Metadata = {
  title: "Print",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function PrintPage() {
  return (
    <main className="pb-page">
      <div className="pb-head">
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
