import type { Metadata } from "next";
import PrintBotTesting from "@/components/PrintBotTesting";
import PlatformStatsNote from "@/components/PlatformStatsNote";
import PreLaunchFlag from "@/components/PreLaunchFlag";
import SiteNav from "@/components/SiteNav";

// Internal sandbox for the contract-routed Buy Bot. NOT indexed, NOT in the
// sitemap, NOT linked in nav — it exists only to test the HOODPrinter Buy Router
// path without touching the live /print bot.
export const metadata: Metadata = {
  title: "Buy Bot (Testing) — HOODPrinter",
  description: "Internal testing sandbox for the contract-routed Buy Bot.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/print-testing" },
};

export default function PrintTestingPage() {
  return (
    <>
      <SiteNav />
      <PreLaunchFlag />
      <main className="pb-page">
        <div
          style={{
            margin: "0 auto 1rem",
            maxWidth: 720,
            padding: "0.6rem 0.9rem",
            borderRadius: 10,
            border: "1px solid rgba(245,196,81,0.5)",
            background: "rgba(245,196,81,0.12)",
            color: "#f5c451",
            fontWeight: 700,
            textAlign: "center",
            fontSize: "0.9rem",
          }}
        >
          🧪 TESTING SANDBOX — this is a private copy of the Buy Bot that routes
          buys through the HOODPrinter Buy Router contract. Not linked publicly.
        </div>
        <div className="pb-head">
          <a className="pb-logo-link" href="/" aria-label="Back to HOOD Printer home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pb-logo" src="/logo.png" alt="HOOD Printer" />
          </a>
          <h1>
            Robinhood Chain <span className="green">Buy Bot</span>{" "}
            <span style={{ color: "#f5c451" }}>· Testing</span>
          </h1>
          <PlatformStatsNote />
          <p>Auto-buy any token on Robinhood Chain — via the Buy Router contract</p>
        </div>
        <PrintBotTesting />
      </main>
    </>
  );
}
