import type { Metadata } from "next";
import Image from "next/image";
import NavSocials from "@/components/NavSocials";
import { siteConfig } from "@/site.config";

const FORM_EMBED_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd0FemJeYIe5IXHKTIyoRWy0DDw_Dud4EU4UIGon72gj0Uxaw/viewform?embedded=true";

const airdropTitle = "$PRINT Airdrop — First Come, First Served";
const airdropDescription =
  "Big airdrop for the first 100 Telegram users, small airdrop for the first 1,000. Register now — the printer will find you.";

export const metadata: Metadata = {
  title: "Airdrop",
  description: airdropDescription,
  alternates: {
    canonical: "/airdrop",
  },
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
      <nav className="nav">
        <div className="container nav-inner">
          <a href="/" className="nav-logo">
            <Image
              src="/brand/logo-icon.svg?v=2"
              alt="HOODPrinter logo"
              width={36}
              height={36}
              unoptimized
            />
            HOODPrinter
          </a>
          <NavSocials />
          <div className="nav-links">
            <a href="/">Home</a>
            <a href="/roadmap">Roadmap</a>
            <a className="btn btn-primary" href="/print">
              Level Up
            </a>
          </div>
        </div>
      </nav>

      <header className="hero airdrop-hero">
        <div className="container">
          <span className="hero-kicker">$PRINT Airdrop</span>
          <h1>
            Get on the <span className="green">drop list</span>.
          </h1>
          <p className="hero-sub">
            Fill out the form below and the printer will find you. First come,
            first served — join the{" "}
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
            <iframe
              src={FORM_EMBED_URL}
              title="$PRINT airdrop registration form"
              loading="lazy"
            >
              Loading…
            </iframe>
          </div>

          <p className="airdrop-fallback">
            Form not loading?{" "}
            <a
              href="https://forms.gle/of1oajsbLLBMq167A"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open it in a new tab
            </a>
            .
          </p>
        </div>
      </header>
    </>
  );
}
