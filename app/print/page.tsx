import type { Metadata } from "next";
import PrintBot from "@/components/PrintBot";

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
          $PRINT <span className="green">Buy Bot</span>
        </h1>
        <p>Robinhood Chain · Uniswap V2</p>
      </div>
      <PrintBot />
    </main>
  );
}
