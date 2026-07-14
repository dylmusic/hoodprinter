import Image from "next/image";
import MoneyPrinter from "@/components/MoneyPrinter";
import CopyAddress from "@/components/CopyAddress";
import SiteNav from "@/components/SiteNav";
import LaunchCountdown from "@/components/LaunchCountdown";
import { siteConfig } from "@/site.config";

const faqs = [
  {
    q: "What is HOODPrinter?",
    a: (
      <>
        HOODPrinter (<strong>$PRINT</strong>) is a community token on Robinhood
        Chain that pays its holders in ETH. A <strong>5% tax</strong> on every
        buy, sell, and transfer is converted and distributed proportionally to
        all holders as ETH rewards — the &ldquo;printing.&rdquo;
      </>
    ),
  },
  {
    q: "How do I earn ETH by holding $PRINT?",
    a: (
      <>
        Just hold. Every transaction feeds the printer, and the printer pays
        out ETH straight to your wallet — <strong>no claiming, no staking,
        no farming</strong>. The more $PRINT you hold and the more the market
        trades, the more ETH you receive.
      </>
    ),
  },
  {
    q: "What does the Buy Bot have to do with $PRINT?",
    a: (
      <>
        The Buy Bot is $PRINT&rsquo;s first utility — auto-buy any Robinhood
        Chain token in one click from a dedicated in-browser wallet. Hold
        $PRINT in that wallet and it earns <strong>ETH reflections</strong>{" "}
        like any other holder, and the bot spends that ETH on more buys.
        Every buy also levels your wallet up toward rewards and airdrop rank.
        It&rsquo;s live in beta at{" "}
        <a href="/print">hoodprinter.xyz/print</a>.
      </>
    ),
  },
  {
    q: "Why Robinhood Chain?",
    a: (
      <>
        Robinhood Chain is an Arbitrum-built Ethereum L2 with ~100&nbsp;ms
        blocks, sub-cent gas, and <strong>ETH as the native gas token</strong>.
        Fast and cheap enough for a reflection token to actually work, and
        it&rsquo;s where the next wave of onchain users is arriving. $PRINT is
        the printer that greets them.
      </>
    ),
  },
  {
    q: "Do I need a special wallet?",
    a: (
      <>
        Any EVM wallet (MetaMask, Rabby, Coinbase Wallet…) works. Add
        Robinhood Chain with chain ID <strong>4663</strong> — the network
        details are in the How&nbsp;To&nbsp;Buy section above.
      </>
    ),
  },
  {
    q: "What are the taxes and supply?",
    a: (
      <>
        Total supply is <strong>1,000,000,000 $PRINT</strong>, fixed forever.
        The only mechanic is a <strong>5% tax</strong> on buys, sells, and
        transfers: 4% is printed back to holders as ETH, 1% keeps the
        liquidity pool and printer maintenance funded.
      </>
    ),
  },
  {
    q: "Is the liquidity locked?",
    a: (
      <>
        Yes — liquidity will be locked at launch and the lock link published
        on our socials and verifiable on the Robinhood Chain explorer.
      </>
    ),
  },
  {
    q: "Is HOODPrinter affiliated with Robinhood?",
    a: (
      <>
        <strong>No.</strong> HOODPrinter is an independent community project
        that happens to live on Robinhood Chain, the same way tokens on Base
        aren&rsquo;t affiliated with Coinbase. Not an offer of securities, not
        financial advice.
      </>
    ),
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: `${siteConfig.url}/logo.png`,
      description: siteConfig.description,
      sameAs: [siteConfig.twitter, siteConfig.telegram],
    },
    {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is HOODPrinter?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "HOODPrinter ($PRINT) is a community token on Robinhood Chain that pays its holders in ETH. A 5% tax on every buy, sell, and transfer is converted and distributed proportionally to all holders as ETH rewards.",
          },
        },
        {
          "@type": "Question",
          name: "How do I earn ETH by holding $PRINT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Just hold. Every transaction feeds the printer, and the printer pays out ETH straight to your wallet — no claiming, no staking, no farming.",
          },
        },
        {
          "@type": "Question",
          name: "What does the Buy Bot have to do with $PRINT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The Buy Bot is $PRINT's first utility — auto-buy any Robinhood Chain token in one click from a dedicated in-browser wallet. Hold $PRINT in that wallet and it earns ETH reflections like any other holder, and the bot spends that ETH on more buys.",
          },
        },
        {
          "@type": "Question",
          name: "Is HOODPrinter affiliated with Robinhood?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. HOODPrinter is an independent community project that lives on Robinhood Chain. It is not affiliated with, endorsed by, or connected to Robinhood Markets, Inc.",
          },
        },
      ],
    },
  ],
};

export default function Home() {
  const { chain, presaleActive, presaleLink } = siteConfig;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {presaleActive ? (
        <a
          className="announce-bar"
          href={presaleLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          🖨️ $PRINT Fair Launch — Jul 15, 6PM UTC on BasedBid
          <span className="announce-arrow">→</span>
        </a>
      ) : (
        <a className="announce-bar" href="/airdrop">
          🖨️ Sign Up For FREE Pre-Launch Airdrop
          <span className="announce-arrow">→</span>
        </a>
      )}
      <SiteNav variant="home" />

      <header className="hero">
        <div className="container">
          <h1>
            Hold <span className="green">$PRINT</span>.
            <br />
            Get paid <span className="green">ETH</span>.
          </h1>
          <p className="hero-sub">
            HOODPrinter is the money printer of Robinhood Chain. Every trade
            feeds the machine, and the machine pays ETH to holders — nonstop,
            automatically, forever. When we print, we print ETH.
          </p>
          {presaleActive && <LaunchCountdown />}
          <div className="hero-ctas">
            {presaleActive ? (
              <a
                className="btn btn-primary"
                href={presaleLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join the $PRINT Fair Launch
              </a>
            ) : (
              <a className="btn btn-primary" href="/print">
                Level up before $PRINT drops
              </a>
            )}
            <a className="btn btn-ghost" href="#how-it-works">
              How it works
            </a>
          </div>

          <MoneyPrinter />

          <div className="contract-box">
            <span className="label">Contract</span>
            <code>{siteConfig.contractAddress}</code>
            <CopyAddress address={siteConfig.contractAddress} />
          </div>
        </div>
      </header>

      <section id="how-it-works">
        <div className="container">
          <p className="section-kicker">How It Works</p>
          <h2 className="section-title">Three steps. Zero effort.</h2>
          <p className="section-sub">
            No staking. No claiming. No farming. The printer does the work —
            ETH lands in your wallet just for holding.
          </p>
          <div className="grid-3">
            <div className="card">
              <span className="step-num">1</span>
              <h3>Buy $PRINT</h3>
              <p>
                Swap ETH for $PRINT on Robinhood Chain. Your tokens are your
                share of the printer — the more you hold, the bigger your cut
                of every payout.
              </p>
            </div>
            <div className="card">
              <span className="step-num">2</span>
              <h3>Hold</h3>
              <p>
                Every buy, sell, and transfer carries a <strong>5% tax</strong>{" "}
                that feeds the printer. You don&rsquo;t lock anything,
                you don&rsquo;t press anything. You just hold.
              </p>
            </div>
            <div className="card">
              <span className="step-num">3</span>
              <h3>The printer pays ETH</h3>
              <p>
                The printer converts the tax to <strong>ETH</strong> and
                distributes it to every holder, proportional to their bag —
                straight to your wallet. Brrr.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="tokenomics">
        <div className="container">
          <p className="section-kicker">Tokenomics</p>
          <h2 className="section-title">Simple enough to fit on a bill.</h2>
          <p className="section-sub">
            One billion tokens, one job: print ETH. No team allocation games,
            no hidden mint functions.
          </p>

          <div className="stats-row">
            <div className="stat">
              <div className="value">1B</div>
              <div className="label">Total supply — fixed</div>
            </div>
            <div className="stat">
              <div className="value">5%</div>
              <div className="label">Tax on buys, sells &amp; transfers</div>
            </div>
            <div className="stat">
              <div className="value">ETH</div>
              <div className="label">Rewards paid in — not tokens</div>
            </div>
            <div className="stat">
              <div className="value">0</div>
              <div className="label">Claims, stakes or lockups needed</div>
            </div>
          </div>

          <div className="card tax-split">
            <h3>Where the 5% goes</h3>
            <div className="tax-bar" aria-hidden="true">
              <div style={{ width: "80%", background: "#00c805" }} />
              <div style={{ width: "20%", background: "#0b4d1e" }} />
            </div>
            <div className="tax-legend">
              <span>
                <span className="dot" style={{ background: "#00c805" }} />
                4% — printed to holders as ETH
              </span>
              <span>
                <span className="dot" style={{ background: "#0b4d1e" }} />
                1% — liquidity &amp; printer maintenance
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="utility">
        <div className="container">
          <p className="section-kicker">Utility</p>
          <h2 className="section-title">Reflections that reload.</h2>
          <p className="section-sub">
            $PRINT pays you ETH for holding. The Buy Bot is where that ETH
            goes to work — the printer&rsquo;s first tool, live in beta today.
          </p>
          <div className="grid-3">
            <div className="card">
              <h3>
                The Buy Bot <span className="nav-beta">BETA</span>
              </h3>
              <p>
                Auto-buy <strong>any Robinhood Chain token</strong> in one
                click from a dedicated in-browser wallet. No pair addresses,
                no setup — pick a token, set your amount, let it rip.
              </p>
            </div>
            <div className="card">
              <h3>Load it with $PRINT</h3>
              <p>
                Hold $PRINT in your bot wallet and the <strong>5% tax</strong>{" "}
                pays it ETH like any other holder. The bot spends those
                reflections on auto-buys — a bag that refuels itself.
              </p>
            </div>
            <div className="card">
              <h3>Level up as you print</h3>
              <p>
                Every buy counts. Climb <strong>Bronze → Diamond</strong> on
                real, on-chain-verified volume — your rank feeds upcoming
                rewards and the $PRINT airdrop.
              </p>
            </div>
          </div>
          <div className="hero-ctas" style={{ marginTop: 28, justifyContent: "center" }}>
            <a className="btn btn-primary" href="/print">
              Try the Buy Bot
            </a>
          </div>
        </div>
      </section>

      <section id="how-to-buy">
        <div className="container">
          <p className="section-kicker">How To Buy</p>
          <h2 className="section-title">Get on Robinhood Chain, get $PRINT.</h2>
          <p className="section-sub">
            Robinhood Chain is an Ethereum L2 — ETH is the gas token, so one
            bridge is all it takes.
          </p>

          <div className="grid-2">
            <div className="card">
              <span className="step-num">1</span>
              <h3>Set up a wallet</h3>
              <p>
                Use any EVM wallet — MetaMask, Rabby, Coinbase Wallet. Add
                Robinhood Chain using the network details below, or let the
                DEX add it for you.
              </p>
            </div>
            <div className="card">
              <span className="step-num">2</span>
              <h3>Get ETH</h3>
              <p>
                Buy ETH on any exchange and withdraw to your wallet on
                Ethereum mainnet (or Arbitrum). ETH is used for gas and for
                the swap.
              </p>
            </div>
            <div className="card">
              <span className="step-num">3</span>
              <h3>Bridge to Robinhood Chain</h3>
              <p>
                Bridge your ETH via the{" "}
                <a
                  href={chain.bridgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Arbitrum bridge
                </a>{" "}
                and select Robinhood Chain as the destination. Gas is
                sub-cent once you&rsquo;re there.
              </p>
            </div>
            <div className="card">
              <span className="step-num">4</span>
              {presaleActive ? (
                <>
                  <h3>Join the fair launch on BasedBid</h3>
                  <p>
                    Head to the{" "}
                    <a
                      href={presaleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      $PRINT fair launch on BasedBid
                    </a>
                    , connect your wallet, and buy in at the same price as
                    everyone else — no early allocations. When the clock hits
                    zero, the printing starts.
                  </p>
                </>
              ) : (
                <>
                  <h3>Swap for $PRINT</h3>
                  <p>
                    Open the{" "}
                    <a
                      href={siteConfig.buyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      official swap link
                    </a>
                    , paste the contract address, set slippage to at least 7%
                    (the 5% tax plus wiggle room), and swap. Welcome to the
                    print run.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h3>Robinhood Chain network details</h3>
            <table className="net-table">
              <tbody>
                <tr>
                  <td>Network name</td>
                  <td>{chain.name}</td>
                </tr>
                <tr>
                  <td>Chain ID</td>
                  <td>{chain.chainId}</td>
                </tr>
                <tr>
                  <td>Currency</td>
                  <td>{chain.currency}</td>
                </tr>
                <tr>
                  <td>RPC URL</td>
                  <td>{chain.rpcUrl}</td>
                </tr>
                <tr>
                  <td>Block explorer</td>
                  <td>
                    <a
                      href={chain.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {chain.explorerUrl}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="faq">
        <div className="container">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Questions, answered.</h2>
          <p className="section-sub">
            Everything you need to know before the printer starts working for
            you.
          </p>
          <div className="faq-list">
            {faqs.map((f) => (
              <details className="faq-item" key={f.q}>
                <summary>{f.q}</summary>
                <div className="faq-body">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <Image
                src="/brand/logo-icon.svg?v=2"
                alt="HOODPrinter logo"
                width={40}
                height={40}
                unoptimized
              />
              <span>
                HOODPrinter <span style={{ color: "#00c805" }}>$PRINT</span>
              </span>
            </div>
            <div className="footer-socials">
              <a className="footer-media-link" href="/media">
                Media Kit
              </a>
              <a
                href={siteConfig.twitter}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href={siteConfig.telegram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.5.5 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </a>
            </div>
          </div>
          <p className="footer-disclaimer">
            HOODPrinter is an independent community project.{" "}
            <strong>
              Not affiliated with, endorsed by, or connected to Robinhood
              Markets, Inc.
            </strong>{" "}
            in any way. $PRINT is a meme token with no intrinsic value and no
            expectation of financial return. Nothing on this site is financial
            advice. Crypto assets are volatile — never spend money you
            can&rsquo;t afford to lose.
          </p>
          <p className="footer-copy">
            © {new Date().getFullYear()} HOODPrinter. Printed with pride on{" "}
            {chain.name}.
          </p>
        </div>
      </footer>
    </>
  );
}
