import type { Metadata } from "next";
import Image from "next/image";
import NavSocials from "@/components/NavSocials";
import RoadmapTimeline from "@/components/RoadmapTimeline";
import { siteConfig } from "@/site.config";

const roadmapTitle = "Roadmap — The HOODPrinter Master Plan";
const roadmapDescription =
  "From Gempad presale to $1,000,000 of ETH printed to holders: LP locked, DexScreener, CoinGecko/CMC, DAO, and a major CEX listing.";

export const metadata: Metadata = {
  title: "Roadmap",
  description: roadmapDescription,
  alternates: {
    canonical: "/roadmap",
  },
  openGraph: {
    title: roadmapTitle,
    description: roadmapDescription,
    url: "/roadmap",
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: "/brand/og-roadmap.png",
        width: 1200,
        height: 630,
        alt: "The HOODPrinter roadmap — road to the million-dollar print run",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    title: roadmapTitle,
    description: roadmapDescription,
    images: ["/brand/og-roadmap.png"],
  },
};

export default function Roadmap() {
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
            <a href="/airdrop">Airdrop</a>
            <a
              className="btn btn-primary"
              href={siteConfig.presaleLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join Presale
            </a>
          </div>
        </div>
      </nav>

      <header className="hero rm-hero">
        <div className="container">
          <span className="hero-kicker">The Master Plan</span>
          <h1>
            Road to the <span className="green">million-dollar</span>
            <br />
            print run.
          </h1>
          <p className="hero-sub">
            Every milestone on the way from presale to $1,000,000 of ETH
            printed to holders. Scroll through the plan — updated as the
            printer progresses.
          </p>
        </div>
      </header>

      <section className="rm-section">
        <div className="container">
          <RoadmapTimeline />
        </div>
      </section>
    </>
  );
}
