/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The airdrop signup list IS the pre-launch whitelist — /whitelist is an
      // alias so both terms land on the same signup page.
      { source: "/whitelist", destination: "/airdrop", permanent: true },
    ];
  },
};

export default nextConfig;
