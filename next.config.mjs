/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The airdrop signup list IS the pre-launch whitelist — /whitelist is an
      // alias so both terms land on the same signup page.
      { source: "/whitelist", destination: "/airdrop", permanent: true },
    ];
  },
  webpack: (config) => {
    // wagmi/connectors' barrel export pulls in a Coinbase "Base Account"
    // connector we don't use (we only use injected + walletConnect), which
    // in turn statically imports @coinbase/cdp-sdk's optional x402 payment
    // modules. Those aren't installed (nothing in our stack needs them) and
    // are only ever reached behind runtime feature checks upstream, so it's
    // safe to stub them out rather than pull in an unused SDK's dependency
    // tree just to satisfy webpack's static resolution.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;
