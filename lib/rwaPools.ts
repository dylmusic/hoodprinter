/**
 * $PRINT/RWA pool roster — HOODPrinter deploys ETH reflections into
 * $PRINT/Stock-Token liquidity on Robinhood Chain, so holders earn ETH
 * derived from real-world-asset trading activity, not just $PRINT volume.
 *
 * `tokenAddress` is the *Robinhood-issued* Stock Token contract (Robinhood
 * Assets (Jersey) Ltd, standard ERC-20, 18 decimals) — verified live against
 * Robinhood Chain via `symbol()` on 2026-07-22. It is NOT a HOODPrinter
 * contract; it's the external RWA asset each pool will pair $PRINT against.
 * No $PRINT/RWA pair exists on-chain yet (checked via the V2 factory
 * `getPair` — zero address for every symbol below), so every stat here is 0
 * until pools are actually deployed and seeded.
 */

export type RwaPool = {
  symbol: string;
  name: string;
  tokenAddress: string;
  tvlEth: number;
  tvlPrint: number;
  ethDistributed: number;
  apr: number | null;
};

export const RWA_POOLS: RwaPool[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    tokenAddress: "0xD0601CE157Db5bDC3162Bbac2A2c8Af5320D9Eec",
    tvlEth: 0,
    tvlPrint: 0,
    ethDistributed: 0,
    apr: null,
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    tokenAddress: "0x322f0929c4625Ed5Bad873c95208D54e1c003b2D",
    tvlEth: 0,
    tvlPrint: 0,
    ethDistributed: 0,
    apr: null,
  },
  {
    symbol: "SPCX",
    name: "SpaceX",
    tokenAddress: "0x4a0E65A3EcCEc6Dbe60AE065f2E7bB85FAe35EEa",
    tvlEth: 0,
    tvlPrint: 0,
    ethDistributed: 0,
    apr: null,
  },
  {
    symbol: "AAPL",
    name: "Apple",
    tokenAddress: "0xAf3D76f1834A1D425780943C99Ea8A608F8A93F9",
    tvlEth: 0,
    tvlPrint: 0,
    ethDistributed: 0,
    apr: null,
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    tokenAddress: "0xE93237c50D904957Cf27E7b1133b510C669C2E74",
    tvlEth: 0,
    tvlPrint: 0,
    ethDistributed: 0,
    apr: null,
  },
];

export const RWA_OVERVIEW = {
  ethDistributed: 0,
  totalValueLockedEth: 0,
  poolsLive: 0,
  poolsPlanned: RWA_POOLS.length,
};
