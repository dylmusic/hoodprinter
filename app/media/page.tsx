import type { Metadata } from "next";
import MediaKit from "@/components/MediaKit";
import SiteNav from "@/components/SiteNav";
import { siteConfig } from "@/site.config";

const mediaTitle = "Media Kit — logos, banners & memes";
const mediaDescription =
  "Everything you need to post about HOODPrinter ($PRINT): logos, PFPs, X banners, promo cards, the Buy Bot pack, and ready-to-post tweets. Grab it and let it print.";

export const metadata: Metadata = {
  title: "Media Kit",
  description: mediaDescription,
  alternates: {
    canonical: "/media",
  },
  openGraph: {
    title: mediaTitle,
    description: mediaDescription,
    url: "/media",
    siteName: siteConfig.name,
    type: "website",
    images: [
      {
        url: "/brand/og-media.png",
        width: 1200,
        height: 630,
        alt: "The HOODPrinter media kit — logos, banners, and memes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: mediaTitle,
    description: mediaDescription,
    images: ["/brand/og-media.png"],
  },
};

export default function Media() {
  return (
    <>
      <SiteNav />

      <header className="hero mk-hero">
        <div className="container">
          <span className="hero-kicker">Media Kit</span>
          <h1>
            Grab it. Post it.
            <br />
            <span className="green">Let it print.</span>
          </h1>
          <p className="hero-sub">
            Every graphic we&rsquo;ve made — meme cards, banners, the logo —
            free to use, sized for socials, in the official $PRINT green.
            Tweets included.
          </p>
          <div className="hero-ctas">
            <a
              className="btn btn-primary"
              href="/brand/hoodprinter-media-kit.zip"
              download
            >
              Download everything (.zip)
            </a>
            <a className="btn btn-ghost" href="#tweets">
              Ready-to-post tweets
            </a>
          </div>
        </div>
      </header>

      <MediaKit />

      <footer>
        <div className="container">
          <p className="footer-disclaimer">
            These assets are for posting about HOODPrinter. Don&rsquo;t use
            them to impersonate the team, fake announcements, or imply
            affiliation with Robinhood Markets, Inc. — there is none.
          </p>
          <p className="footer-copy">
            © {new Date().getFullYear()} HOODPrinter. Printed with pride on{" "}
            {siteConfig.chain.name}.
          </p>
        </div>
      </footer>
    </>
  );
}
