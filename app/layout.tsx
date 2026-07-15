import type { Metadata } from "next";
import Script from "next/script";
import {
  siteConfig,
  GA_MEASUREMENT_ID,
  GOOGLE_SITE_VERIFICATION,
} from "@/site.config";
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
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
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
      <body>
        {children}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
