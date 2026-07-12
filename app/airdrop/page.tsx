import type { Metadata } from "next";
import AirdropForm from "@/components/AirdropForm";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

const airdropTitle = "$PRINT Airdrop & Whitelist — First Come, First Served";
const airdropDescription =
  "The $PRINT airdrop signup list is the pre-launch whitelist. Big airdrop for the first 100 Telegram users, small airdrop for the first 1,000. Register now — the printer will find you.";

export const metadata: Metadata = {
  title: "Airdrop & Whitelist — Free $PRINT, First Come First Served",
  description: airdropDescription,
  alternates: {
    canonical: "/airdrop",
  },
  keywords: [
    "$PRINT airdrop",
    "$PRINT whitelist",
    "Robinhood Chain airdrop",
    "Robinhood Chain whitelist",
    "presale whitelist",
    "free crypto airdrop",
    "Robinhood Chain free tokens",
    "airdrop signup",
    "whitelist signup",
    "HOODPrinter airdrop",
    "HOODPrinter whitelist",
    "PRINT token airdrop",
  ],
  openGraph: {
    title: airdropTitle,
    description: airdropDescription,
    url: "/airdrop",
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: "/brand/og-airdrop.png",
        width: 1200,
        height: 630,
        alt: "$PRINT Airdrop — big drop for the first 100 Telegram users",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: airdropTitle,
    description: airdropDescription,
    images: ["/brand/og-airdrop.png"],
  },
};

export default function Airdrop() {
  return (
    <>
      <SiteNav />

      <header className="hero airdrop-hero">
        <div className="container">
          <span className="hero-kicker">$PRINT Airdrop &amp; Whitelist</span>
          <h1>
            Get on the <span className="green">whitelist</span>.
          </h1>
          <p className="hero-sub">
            Fill out the form below and the printer will find you. The airdrop
            signup list <em>is</em> the pre-launch whitelist — first come, first
            served. Join the{" "}
            <a
              href={siteConfig.telegram}
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram
            </a>{" "}
            to qualify.
          </p>

          <div className="stats-row airdrop-tiers">
            <div className="stat">
              <div className="value">BIG</div>
              <div className="label">Airdrop for the first 100 Telegram users</div>
            </div>
            <div className="stat">
              <div className="value">SMALL</div>
              <div className="label">Airdrop for the first 1,000 Telegram users</div>
            </div>
          </div>

          <div className="airdrop-form-wrap">
            <AirdropForm />
          </div>
        </div>
      </header>
    </>
  );
}
