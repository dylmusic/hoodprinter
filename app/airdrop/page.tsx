import type { Metadata } from "next";
import Image from "next/image";
import { siteConfig } from "@/site.config";

const FORM_EMBED_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd0FemJeYIe5IXHKTIyoRWy0DDw_Dud4EU4UIGon72gj0Uxaw/viewform?embedded=true";

export const metadata: Metadata = {
  title: "Airdrop — HOODPrinter",
  description:
    "Register for the $PRINT airdrop. Fill out the form and the printer will find you.",
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
          <div className="nav-links">
            <a href="/">Home</a>
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

      <header className="hero airdrop-hero">
        <div className="container">
          <span className="hero-kicker">$PRINT Airdrop</span>
          <h1>
            Get on the <span className="green">drop list</span>.
          </h1>
          <p className="hero-sub">
            Fill out the form below and the printer will find you. One entry
            per wallet — winners announced on X and Telegram.
          </p>

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
