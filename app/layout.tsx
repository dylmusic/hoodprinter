import type { Metadata } from "next";
import { siteConfig } from "@/site.config";
import "./globals.css";

const defaultTitle = `${siteConfig.name} (${siteConfig.symbol}) — ${siteConfig.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: defaultTitle,
    template: `%s | ${siteConfig.name} (${siteConfig.symbol})`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "HOODPrinter",
    "$PRINT",
    "PRINT token",
    "Robinhood Chain",
    "Robinhood Chain buy bot",
    "auto buy bot",
    "crypto volume bot",
    "ETH rewards token",
    "reflection token",
    "meme coin",
    "ETH reflections",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: defaultTitle,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/brand/og.png?v=3",
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@HOODPrinterxyz",
    creator: "@HOODPrinterxyz",
    title: defaultTitle,
    description: siteConfig.description,
    images: ["/brand/og.png?v=3"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
