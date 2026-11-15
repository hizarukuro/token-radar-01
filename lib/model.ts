// The token radar's model, second build: one sealed snapshot of the protocol universe in,
// one ranked board out — priced by a size curve that was tested blind against the snapshot's
// own traded tokens, with every farm plan netted to a verdict.
//
// The board ranks protocols that record no token yet by what a launch would be worth if their
// record stayed as it is. The first build of this radar priced them with a flat category
// multiple (a category's median market-cap/TVL, shrunk to the global median). This build
// replaces that core with what the snapshot's own evidence supports, and proves it in the
// open, inside this program, on every run:
//
//   peers        = the traded protocols with a market cap and a TVL whose ratio
//                  mcap/TVL lies in (0, 10] — the same universe the flat model calibrated
//                  on (121 of the snapshot's 758 protocols). Ratios past 10 are dropped:
//                  a handful of records carry a cap hundreds of times their TVL.
//   size curve   = the least-squares line log10(mcap) = a + b x log10(TVL / $100M) over
//                  the peers. On this snapshot a = 7.1031, b = 0.5831: a protocol is worth
//                  about $12.7M at $100M of TVL, and each further 10x of TVL multiplies
//                  value by about 3.8x, not 10x — big protocols are worth less per dollar.
//   implied      = 10 ^ (a + b x log10(TVL / $100M)), rounded, from the curve alone.
//
// Why the curve alone: the program replays the contest blind before it prices anything.
// Leave-one-out over the 121 peers (refit without each token, then price it) and a time
// split (fit on the 42 peers listed before 2024, price the 48 listed since) both say the
// same thing — every factor the first build or a richer model adds on top of the curve
// makes the blind test worse, so none of them ships:
//
//   model                              LOO median miss   within 3x   time-split miss
//   flat category multiple (v1)             x5.12          37%           x4.45
//   size curve                              x3.09          49%           x2.82
//   size curve + category offset            x3.49          45%           x3.27
//   size curve + growth                     x3.41          49%           x2.93
//   size curve + seasoning                  x3.31          48%           x2.90
//   size curve + offset + growth + seas.    x3.51          45%           x3.37
//
// (The dashboard's Method page prints this table from the run's own backtest object; the
// numbers above are what this snapshot produces.) The curve's blind residuals also set each
// row's honesty band: the P10-P90 range of the leave-one-out log-residuals, applied to the
// row's implied value. A point price from a model that misses by x3 is a claim; a band is
// a measurement.
//
// The universe is accounted for in full, nothing dropped in silence:
//   758 scanned -> 416 already tokenised (kept apart, shown at the market's own values)
//   -> 342 pre-token -> 144 set aside by a named rule (a product category of a traded
//   token, a versioned name, a wrapped/staked product name) -> 198 priced: the snapshot's
//   40-protocol watchlist plus every other genuine pre-token protocol, at any TVL.
//
// Every priced row carries a farm plan whose steps are specific to the protocol's own
// mechanism, and the plan is netted on stated assumptions (see FARM below): the expected
// slice of a launch allocation for a $1,000 position, minus the plan's fees, minus the
// T-bill yield that capital would have earned, over the plan's active hours — ending in a
// verdict, FARM, THIN or SKIP. No protocol name is ever special-cased: the same functions
// score, band, plan and judge every row, and every figure comes out of the snapshot.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The peer universe's frame: a traded protocol prices the curve when its ratio is sane. */
export const PEER_RATIO_CAP = 10;

/** The farm plan's stated assumptions: the dashboard's Method page prints them verbatim. */
export const FARM = {
  /** The position every plan is costed for. */
  reference_capital_usd: 1000,
  /** The share of a launch's implied value assumed to reach depositors, pro-rata by TVL. */
  airdrop_share: 0.1,
  /** What idle capital earns instead: a T-bill yield, charged against every plan. */
  tbill_apy: 0.045,
  /** A plan is FARM when its net clears this many dollars... */
  farm_net_min_usd: 5,
  /** ...and pays at least this much per active hour. Below that but positive is THIN. */
  farm_per_hour_min_usd: 2,
};

/** Gas for one on-chain action, in dollars, by the chain a protocol names first. */
export const GAS_USD: Record<string, number> = {
  Ethereum: 9.0,
  Arbitrum: 0.6,
  Base: 0.35,
  Optimism: 0.45,
  Polygon: 0.25,
  Binance: 0.4,
  Avalanche: 0.7,
  Solana: 0.05,
  Tron: 1.2,
  Sui: 0.1,
  Linea: 0.4,
  Scroll: 0.4,
  Mantle: 0.4,
  Sonic: 0.3,
  Berachain: 0.4,
  'Hyperliquid L1': 0.1,
  Bitcoin: 1.5,
};
export const GAS_DEFAULT_USD = 1.5;

/** The fitted size curve: log10(mcap) = a + b x log10(TVL / $100M), over the peer universe. */
export interface CurveFit {
  a: number;
  b: number;
  peers: number;
  base_at_100m_usd: number;
}

/** One stage of the blind-test ablation: leave-one-out and time-split, median miss and within-3x. */
export interface BacktestStage {
  name: string;
  shipped: boolean;
  loo_median_miss: number;
  loo_within_2x: number;
  loo_within_3x: number;
  ts_median_miss: number;
  ts_within_2x: number;
  ts_within_3x: number;
}

/** The whole blind test the program runs before pricing: stages, splits and the band quantiles. */
export interface Backtest {
  peer_count: number;
  dated_peers: number;
  ts_fit_count: number;
  ts_test_count: number;
  ts_cutoff: string;
  stages: BacktestStage[];
  band_q10: number;
  band_q25: number;
  band_q75: number;
  band_q90: number;
  /** The shipped stage's leave-one-out residual deciles, for the Method page's histogram. */
  band_deciles: number[];
  /** How the peer universe was drawn from the traded records: the fit's own funnel. */
  fit_funnel: { with_cap_tvl: number; zero_cap: number; negative_cap: number; extreme_ratio: number };
}

/** A farm plan's economics on the stated assumptions, and its verdict. */
export interface FarmEconomics {
  capital_usd: number;
  slice_usd: number;
  fees_usd: number;
  gas_fees_usd: number;
  fee_pct: number;
  tbill_usd: number;
  net_usd: number;
  work_hours: number;
  per_hour_usd: number;
  hold_days: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A farm step before it is flattened to the board's string form. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_base_usd: number;
    band_low_usd: number;
    band_high_usd: number;
    age_days: number | null;
  };
  farm: FarmEconomics;
  farm_steps: string[];
  play: string;
}

/** One category's residuals on the fitted curve: what the offset stage saw, and shrank. */
export interface CategoryResidual {
  category: string | null;
  peers: number;
  mean_residual: number;
  offset: number;
}

/** A traded peer near a board row, for the detail view's "against traded peers" table. */
export interface PeerRef {
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** The dashboard's view of one row: the board row's figures plus its farm plan and peers. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  watchlist: boolean;
  play: string;
  farm: FarmEconomics;
  farm_steps: string[];
  peers: PeerRef[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
  in_universe: boolean;
}

/** A pre-token protocol the radar set aside, with the rule that set it aside. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  rule: string;
  reason: string;
}

/** The universe accounting, counted in the open. */
export interface Funnel {
  scanned: number;
  traded: number;
  pre_token: number;
  set_aside: number;
  priced: number;
  watchlist: number;
  early: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  curve: CurveFit;
  backtest: Backtest;
  funnel: Funnel;
  farm_assumptions: typeof FARM;
  gas_usd: Record<string, number>;
  gas_default_usd: number;
  protocols_size: number;
  pre_token_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_residuals: CategoryResidual[];
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
  /** The traded peers the curve was fitted on, for the Method page's scatter: [tvl, mcap]. */
  scatter_peers: [number, number][];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted list, by nearest rank. */
function quantile(sorted: number[], q: number): number {
  return sorted[clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1)]!;
}

// ---------------------------------------------------------------- the peer universe and the curve

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The peer universe: traded protocols whose record can price a launch — a market cap and a
 * TVL, with a ratio in (0, PEER_RATIO_CAP]. The flat model calibrated on exactly this set,
 * so the blind test compares the two cores on identical evidence.
 */
export function peerUniverse(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => {
    if (p.mcap_usd === null || p.tvl_usd <= 0) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio > 0 && ratio <= PEER_RATIO_CAP;
  });
}

const logTvl = (p: SnapshotProtocol): number => Math.log10(p.tvl_usd / 1e8);
const logCap = (p: SnapshotProtocol): number => Math.log10(p.mcap_usd!);

/** The least-squares size curve over a set of peers: log10(mcap) = a + b x log10(TVL/$100M). */
export function fitCurve(peers: SnapshotProtocol[]): CurveFit {
  const n = peers.length;
  const mx = peers.reduce((s, p) => s + logTvl(p), 0) / n;
  const my = peers.reduce((s, p) => s + logCap(p), 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of peers) {
    sxy += (logTvl(p) - mx) * (logCap(p) - my);
    sxx += (logTvl(p) - mx) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  return { a: round4(a), b: round4(b), peers: n, base_at_100m_usd: Math.round(10 ** a) };
}

/** The curve's price for one TVL, before rounding: 10^(a + b x log10(TVL/$100M)). */
function curveValue(fit: CurveFit, tvlUsd: number): number {
  return 10 ** (fit.a + fit.b * Math.log10(tvlUsd / 1e8));
}

/**
 * Category offsets on the curve, for the ablation: each category's mean residual, shrunk
 * toward zero by n/(n+4), stated only when the category has at least 3 peers. The shipped
 * model does not use them — the blind test below is why — but the test measures them fairly.
 */
function categoryOffsets(peers: SnapshotProtocol[], fit: CurveFit): Map<string | null, number> {
  const residuals = new Map<string | null, number[]>();
  for (const p of peers) {
    const r = logCap(p) - Math.log10(curveValue(fit, p.tvl_usd));
    const list = residuals.get(p.category) ?? [];
    list.push(r);
    residuals.set(p.category, list);
  }
  const out = new Map<string | null, number>();
  for (const [category, rs] of residuals) {
    if (rs.length < 3) continue;
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
    out.set(category, (rs.length * mean) / (rs.length + 4));
  }
  return out;
}

// ------------------------------------------------- the flat model, kept for the blind test only

/** The first build's constants, frozen: the ablation's flat stage is the v1 model as shipped. */
const FLAT = { growth_weight: 0.5, shrink_peers: 4, min_category_peers: 3, multiple_floor: 0.02, multiple_cap: 1.5 };

/** The v1 calibration: per-category median mcap/TVL, shrunk to the global median. */
function flatCalibrate(peers: SnapshotProtocol[]): { global: number; byCategory: Map<string | null, number> } {
  const ratios = new Map<string | null, number[]>();
  const all: number[] = [];
  for (const p of peers) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const list = ratios.get(p.category) ?? [];
    list.push(ratio);
    ratios.set(p.category, list);
  }
  const globalMedian = median(all);
  const global = clamp(globalMedian, FLAT.multiple_floor, FLAT.multiple_cap);
  const byCategory = new Map<string | null, number>();
  for (const [category, rs] of ratios) {
    const med = median(rs);
    const shrunk = (rs.length * med + FLAT.shrink_peers * globalMedian) / (rs.length + FLAT.shrink_peers);
    byCategory.set(category, rs.length < FLAT.min_category_peers ? global : clamp(shrunk, FLAT.multiple_floor, FLAT.multiple_cap));
  }
  return { global, byCategory };
}

function growthMult(p: SnapshotProtocol, weight: number): number {
  const g = clamp(finite(p.change_7d, 0), -60, 120);
  return 1 + (g / 100) * weight;
}

function seasoningMult(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  return 0.6 + (clamp(age, 0, 1095) / 1095) * 0.4;
}

/** The v1 model's price for one peer, under a calibration fitted without it. */
function flatPrice(p: SnapshotProtocol, asOf: string, cal: { global: number; byCategory: Map<string | null, number> }): number {
  const multiple = cal.byCategory.get(p.category) ?? cal.global;
  return Math.max(1, Math.round(p.tvl_usd * multiple * growthMult(p, FLAT.growth_weight) * seasoningMult(p, asOf)));
}

/** A curve-stage price: the curve, optionally with offset, growth and seasoning switched on. */
function stagePrice(
  p: SnapshotProtocol,
  asOf: string,
  fit: CurveFit,
  offsets: Map<string | null, number> | null,
  growth: boolean,
  seasoning: boolean,
): number {
  let v = curveValue(fit, p.tvl_usd);
  if (offsets !== null) v *= 10 ** (offsets.get(p.category) ?? 0);
  if (growth) v *= growthMult(p, FLAT.growth_weight);
  if (seasoning) v *= seasoningMult(p, asOf);
  return Math.max(1, Math.round(v));
}

// ---------------------------------------------------------------- the blind test

/** How wrong a set of predictions is: the median fold miss and the share inside 3x. */
function missStats(preds: [number, number][]): { medianMiss: number; within2: number; within3: number } {
  const misses = preds.map(([pred, actual]) => Math.max(pred / actual, actual / pred)).sort((a, b) => a - b);
  const share = (cap: number): number => round3(preds.filter(([pred, actual]) => Math.max(pred / actual, actual / pred) <= cap).length / preds.length);
  return { medianMiss: round2(median(misses)), within2: share(2), within3: share(3) };
}

interface StageDef {
  name: string;
  shipped: boolean;
  price: (held: SnapshotProtocol, train: SnapshotProtocol[], asOf: string) => number;
}

const STAGES: StageDef[] = [
  {
    name: 'Flat category multiple (the v1 model)',
    shipped: false,
    price: (held, train, asOf) => flatPrice(held, asOf, flatCalibrate(train)),
  },
  {
    name: 'Size curve',
    shipped: true,
    price: (held, train) => stagePrice(held, '', fitCurve(train), null, false, false),
  },
  {
    name: 'Size curve + category offset',
    shipped: false,
    price: (held, train) => {
      const fit = fitCurve(train);
      return stagePrice(held, '', fit, categoryOffsets(train, fit), false, false);
    },
  },
  {
    name: 'Size curve + growth',
    shipped: false,
    price: (held, train, asOf) => stagePrice(held, asOf, fitCurve(train), null, true, false),
  },
  {
    name: 'Size curve + seasoning',
    shipped: false,
    price: (held, train, asOf) => stagePrice(held, asOf, fitCurve(train), null, false, true),
  },
  {
    name: 'Size curve + offset + growth + seasoning',
    shipped: false,
    price: (held, train, asOf) => {
      const fit = fitCurve(train);
      return stagePrice(held, asOf, fit, categoryOffsets(train, fit), true, true);
    },
  },
];

/**
 * The blind test, run in full on every program run: each stage is replayed leave-one-out
 * over the whole peer universe and on a time split (fit on peers listed before the cutoff,
 * priced on peers listed since). The shipped stage's leave-one-out residuals set the band.
 */
export function runBacktest(snapshot: Snapshot): Backtest {
  const peers = peerUniverse(snapshot.protocols);
  const asOf = snapshot.as_of;
  const cutoff = '2024-01-01';
  const dated = peers.filter((p) => p.listed_at !== null);
  const fitSet = dated.filter((p) => p.listed_at! < cutoff);
  const testSet = dated.filter((p) => p.listed_at! >= cutoff);
  const stages: BacktestStage[] = STAGES.map((stage) => {
    const loo = missStats(peers.map((held) => [stage.price(held, peers.filter((p) => p !== held), asOf), held.mcap_usd!]));
    const ts = missStats(testSet.map((held) => [stage.price(held, fitSet, asOf), held.mcap_usd!]));
    return {
      name: stage.name,
      shipped: stage.shipped,
      loo_median_miss: loo.medianMiss,
      loo_within_2x: loo.within2,
      loo_within_3x: loo.within3,
      ts_median_miss: ts.medianMiss,
      ts_within_2x: ts.within2,
      ts_within_3x: ts.within3,
    };
  });
  const shipped = STAGES.find((s) => s.shipped)!;
  const residuals = peers
    .map((held) => Math.log10(shipped.price(held, peers.filter((p) => p !== held), asOf) / held.mcap_usd!))
    .sort((a, b) => a - b);
  const withCapTvl = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  return {
    peer_count: peers.length,
    dated_peers: dated.length,
    ts_fit_count: fitSet.length,
    ts_test_count: testSet.length,
    ts_cutoff: cutoff,
    stages,
    band_q10: round3(quantile(residuals, 0.1)),
    band_q25: round3(quantile(residuals, 0.25)),
    band_q75: round3(quantile(residuals, 0.75)),
    band_q90: round3(quantile(residuals, 0.9)),
    band_deciles: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((q) => round3(quantile(residuals, q))),
    fit_funnel: {
      with_cap_tvl: withCapTvl.length,
      zero_cap: withCapTvl.filter((p) => p.mcap_usd === 0).length,
      negative_cap: withCapTvl.filter((p) => p.mcap_usd! < 0).length,
      extreme_ratio: withCapTvl.filter((p) => p.mcap_usd! / p.tvl_usd > PEER_RATIO_CAP).length,
    },
  };
}

/** The shipped model's price and honesty band for one pre-token protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  fit: CurveFit,
  backtest: Backtest,
): { implied: number; low: number; high: number } {
  const implied = clamp(Math.round(curveValue(fit, protocol.tvl_usd)), 1, 1e14);
  const low = clamp(Math.round(implied * 10 ** backtest.band_q10), 1, 1e14);
  const high = clamp(Math.round(implied * 10 ** backtest.band_q90), 1, 1e14);
  return { implied, low, high };
}

// ---------------------------------------------------------------- the universe, accounted for

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of another protocol, or an exchange. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped product may begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Why a pre-token protocol is set aside, or null when it is a genuine launch candidate: the
 * same rule the house's watchlist states, applied to the whole universe at any TVL, with
 * the reason named so the dashboard's Set aside view can show its work.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  const rule = setAsideRule(p);
  if (rule === null) return null;
  if (rule === 'product-category') {
    return `a ${p.category} product — a wrapped, staked, bridged or exchange form of a token that already trades, so it has no launch of its own coming`;
  }
  if (rule === 'versioned-name') return 'a versioned name — a later release of another protocol, priced with its parent rather than on its own';
  if (rule === 'wrapped-staked-word') return 'its name marks it as a wrapped or staked form of an asset that already trades';
  return "an exchange's own product — its value rides on the exchange, not on a launch of its own";
}

/** The set-aside rule that claims a pre-token protocol, or null: product-category, versioned-name, wrapped-staked-word, exchange-prefix. */
export function setAsideRule(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'product-category';
  if (VERSIONED.test(p.name)) return 'versioned-name';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'wrapped-staked-word';
  const firstWord = p.name.split(/\s+/)[0] ?? '';
  if (EXCHANGE_PREFIXES.includes(firstWord)) return 'exchange-prefix';
  return null;
}

/** Whether a protocol is a genuine launch candidate: pre-token, and no set-aside rule claims it. */
export function isGenuineCandidate(p: SnapshotProtocol): boolean {
  return isPreToken(p) && setAsideReason(p) === null;
}

// ---------------------------------------------------------------- farm plans, netted

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one action on the protocol's first chain. */
function gasFor(p: SnapshotProtocol): number {
  return GAS_USD[chainOf(p)] ?? GAS_DEFAULT_USD;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Dollars as the plans print them: cents under a thousand, whole dollars above. */
function money(n: number): string {
  const v = Math.abs(n) >= 1000 ? Math.round(n) : round2(n);
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })}`;
}

/** One step being drafted: its text and cost/time, plus the gas, fee and minutes it feeds the netting. */
interface StepDraft extends FarmStep {
  gas: number;
  fee: number;
  minutes: number;
}

/** The mechanism a protocol is farmed through, from its category. */
function playFor(p: SnapshotProtocol): string {
  const c = p.category ?? '';
  if (c === 'Risk Curators') return 'curator';
  if (c === 'Onchain Capital Allocator') return 'allocator';
  if (c === 'Yield Aggregator' || c === 'Yield') return 'vault';
  if (c === 'Lending' || c === 'Uncollateralized Lending' || c === 'Collateral Markets') return 'lending';
  if (c === 'CDP' || c === 'CDP Manager' || c === 'Dual-Token Stablecoin') return 'cdp';
  if (c === 'Dexs') return 'dex';
  if (c === 'Derivatives' || c === 'Options' || c === 'Options Vault' || c === 'Interest Rate Derivatives') return 'derivatives';
  if (c === 'Prediction Market') return 'prediction';
  if (c === 'Basis Trading') return 'basis';
  if (c === 'RWA') return 'rwa';
  if (c === 'Chain') return 'chain';
  if (c === 'Stablecoin Wrapper') return 'wrapper';
  if (c === 'Insurance') return 'insurance';
  if (c === 'Payments' || c === 'Crypto Card Issuer') return 'payments';
  return 'deposit';
}

/** The play's four middle steps and its exit, in the protocol's own terms. */
function playSteps(play: string, p: SnapshotProtocol, chain: string, capital: number): { steps: [string, string, string, string]; exit: string; feePct: number; midGas: number } {
  const n = p.name;
  const cap = money(capital);
  switch (play) {
    case 'curator':
      return {
        steps: [
          `Deposit ${cap} of USDC into a ${n} vault on ${chain} — pick the vault whose mandate and underlying markets you can name, and keep the vault shares.`,
          `Read the curator's allocation page for that vault: which lending markets hold the money, and what the curator earns for steering it.`,
          `Check the vault's redemption queue and withdrawal terms before you add another cent; a queue that is growing is the risk, not the yield.`,
          `Rebalance or top up the position once a week so the deposit is active in more than one allocation snapshot.`,
        ],
        exit: 'redeeming the vault shares through the queue',
        feePct: 0.001, midGas: 0,
      };
    case 'allocator':
      return {
        steps: [
          `Deposit ${cap} of USDC into a ${n} allocation vault on ${chain} and keep the shares; the allocator steers it across lending markets for you.`,
          `Read where the allocator currently places the vault's money and what would make it move — that policy is the product you are farming.`,
          `Check the vault's withdrawal terms and any lock-up before sizing up; an allocator you cannot leave is a position, not a farm.`,
          `Top up or shift vaults once a week so the position is live across several reallocation cycles.`,
        ],
        exit: 'withdrawing from the vault after its notice period',
        feePct: 0.001, midGas: 0,
      };
    case 'vault':
      return {
        steps: [
          `Deposit ${cap} of USDC into ${n}'s main vault on ${chain} and keep the vault shares; the strategy compounds the underlying yield.`,
          `Read the strategy page: which pools or markets the vault is in today, and what it earned over the last month after its own fees.`,
          `Check what the shares are redeemable for and how long redemption takes; a share you cannot price is a share you cannot exit.`,
          `Top up the vault once a week so the balance is present in every weekly snapshot the protocol takes.`,
        ],
        exit: 'redeeming the vault shares for the underlying',
        feePct: 0.001, midGas: 0,
      };
    case 'lending':
      return {
        steps: [
          `Supply ${cap} of USDC to ${n} on ${chain} as collateral and leave the position open.`,
          `Borrow a small amount — no more than a fifth of the collateral — against it, hold it a few days, then repay in full; the round trip is the qualifying activity.`,
          `Keep the health factor comfortably high and set a liquidation alert: a farmed position that gets liquidated loses more than any launch pays.`,
          `Repeat the small borrow-and-repay cycle once a week so the account shows real, repeated use.`,
        ],
        exit: 'repaying any borrow and withdrawing the collateral',
        feePct: 0.001, midGas: 2,
      };
    case 'cdp':
      return {
        steps: [
          `Lock ${cap} of collateral in a ${n} vault on ${chain} and mint its stablecoin against it — no more than half the collateral's value.`,
          `Hold or use the minted stablecoin inside the protocol's own markets so the mint is working, not idle.`,
          `Watch the collateral ratio weekly and keep a buffer above liquidation; top up collateral rather than letting the vault be sold.`,
          `Repay a slice and re-mint once a week so the vault shows continuing, deliberate use.`,
        ],
        exit: 'repaying the stablecoin debt and unlocking the collateral',
        feePct: 0.001, midGas: 1,
      };
    case 'dex':
      return {
        steps: [
          `Provide ${cap} of liquidity to ${n}'s main USDC pool on ${chain}, split across the pair, and keep the position open.`,
          `Claim the trading fees the position earns once they are worth more than the gas to claim them.`,
          `Check the position's range and impermanent loss weekly; a pool whose price has left your liquidity idle is earning nothing.`,
          `Add or remove a small slice of liquidity once a week so the position is active across several fee snapshots.`,
        ],
        exit: 'removing the liquidity and swapping back to USDC',
        feePct: 0.003, midGas: 1,
      };
    case 'derivatives':
      return {
        steps: [
          `Deposit ${cap} of USDC as margin on ${n} and open one small position, hedged or delta-neutral where the venue allows it.`,
          `Roll or adjust the position once so the account shows a second, deliberate trade rather than a single deposit.`,
          `Watch the funding rate and your margin ratio: funding paid away week after week is this farm's real cost, not the gas.`,
          `Trade a small amount once a week so the account's volume is spread across the whole qualifying window.`,
        ],
        exit: 'closing the position and withdrawing the margin',
        feePct: 0.002, midGas: 1,
      };
    case 'prediction':
      return {
        steps: [
          `Fund a ${n} account with ${cap} of USDC on ${chain}.`,
          `Place one position in a liquid market you can state a view on, sized so being wrong costs little.`,
          `Read the market's resolution rules before the event, not after: an oracle dispute can hold a winning position for weeks.`,
          `Place one further position each week so the account trades through the whole window, and settle each market as it resolves.`,
        ],
        exit: 'settling resolved markets and withdrawing the balance',
        feePct: 0.002, midGas: 1,
      };
    case 'basis':
      return {
        steps: [
          `Deposit ${cap} of USDC into ${n}'s basis vault on ${chain} and keep the shares; the vault holds the spot leg and shorts the future.`,
          `Read the vault's current funding capture and which venues hold the short leg before you size up.`,
          `Check the funding rate the vault is earning weekly: when funding turns negative the vault pays to hold its hedge, and that is your cost.`,
          `Top up once a week so the deposit spans several funding settlements.`,
        ],
        exit: 'redeeming the vault shares after the funding cycle settles',
        feePct: 0.001, midGas: 0,
      };
    case 'rwa':
      return {
        steps: [
          `Subscribe ${cap} to ${n}'s yield asset on ${chain}, completing any whitelist or eligibility step the issuer requires first.`,
          `Hold the asset in the farming wallet so the accrual and the holding period are both visible on-chain.`,
          `Read the issuer's redemption terms and the asset's underlying report; off-chain yield is a promise, and its paperwork is the risk.`,
          `Check the accrual and any new issuance window once a week, and top up only inside a window the issuer itself opens.`,
        ],
        exit: 'redeeming through the issuer at its stated window',
        feePct: 0.001, midGas: 0,
      };
    case 'chain':
      return {
        steps: [
          `Bridge ${cap} of USDC to ${chain} through ${n}'s canonical route and keep the funds on the chain.`,
          `Use two of the chain's own applications — a swap and a lending deposit — so the wallet reads as a resident, not a passer-by.`,
          `Keep a small balance of the chain's gas token and never bridge out mid-window; a wallet that leaves reads as a farmer, not a user.`,
          `Make one transaction a week on the chain so activity spans the whole qualifying period.`,
        ],
        exit: 'bridging the funds back once the window closes',
        feePct: 0.002, midGas: 2,
      };
    case 'wrapper':
      return {
        steps: [
          `Mint ${cap} of ${n}'s wrapped stable asset on ${chain} against the underlying stablecoin and hold the wrapped version.`,
          `Use the wrapped asset in one of the protocol's own markets so the holding is active, not parked.`,
          `Read the redemption path and its queue before sizing up; a wrapper is only as good as its way back to the underlying.`,
          `Mint or redeem a small slice once a week so the wallet shows continuing use of the wrapper.`,
        ],
        exit: 'redeeming the wrapped asset for the underlying',
        feePct: 0.001, midGas: 1,
      };
    case 'insurance':
      return {
        steps: [
          `Buy ${cap} of cover from ${n} on ${chain} against a position you actually hold, and keep the policy for its full term.`,
          `Read the policy's exclusions and claims process before relying on it; cover that cannot be claimed is a donation.`,
          `Renew or extend the cover once during the window so the wallet shows a second, deliberate purchase.`,
          `Check the pool's capacity and claims record once a week; a pool paying claims late is a pool to leave.`,
        ],
        exit: 'letting the policy lapse at the end of its term',
        feePct: 0.002, midGas: 0,
      };
    case 'payments':
      return {
        steps: [
          `Open a ${n} account and fund it with ${cap} of USDC on ${chain}.`,
          `Route one real payment or card transaction through it, however small, so the account is used as intended.`,
          `Read the fee schedule and the cashback or rewards terms before routing anything larger; the spread is the cost of this farm.`,
          `Make one payment a week through the account so its activity spans the whole window.`,
        ],
        exit: 'withdrawing the remaining balance',
        feePct: 0.001, midGas: 1,
      };
    default:
      return {
        steps: [
          `Deposit ${cap} of USDC into ${n}'s main product on ${chain} and keep the position open.`,
          `Make the protocol's second core action as well — the one its own documentation leads with — so the wallet shows real use, not a parked deposit.`,
          `Read the withdrawal terms and any lock-up before sizing up; a deposit you cannot leave on your own schedule is the risk.`,
          `Repeat one qualifying action a week so the activity is spread across the whole window.`,
        ],
        exit: 'withdrawing the deposit',
        feePct: 0.001, midGas: 1,
      };
  }
}

/**
 * A protocol's farm plan: seven steps — wallet, the play's four mechanism steps, the hold,
 * and the netting — each costed from the chain's gas and the play's fees, and a verdict
 * computed from the same numbers the steps carry. Nothing is boilerplate: the middle steps
 * are the protocol's own mechanism, and the last step shows the arithmetic.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number): { steps: FarmStep[]; economics: FarmEconomics; play: string } {
  const chain = chainOf(p);
  const gas = gasFor(p);
  const capital = FARM.reference_capital_usd;
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const play = playSteps(playFor(p), p, chain, capital);
  const gasCost = (actions: number): string => (actions === 0 ? 'no gas — it is reading, not transacting' : `${money(actions * gas)} of gas on ${chain}`);
  const drafts: StepDraft[] = [
    {
      text: `Use a fresh wallet that holds only the ${money(capital)} you plan to farm ${p.name} with, fund it on ${chain}, and keep its seed phrase offline.`,
      cost: gasCost(1),
      time: '10 minutes',
      gas: gas,
      fee: 0,
      minutes: 10,
    },
    { text: play.steps[0], cost: gasCost(2), time: '15 minutes to set up', gas: 2 * gas, fee: 0, minutes: 15 },
    { text: play.steps[1], cost: gasCost(play.midGas), time: '15 minutes', gas: play.midGas * gas, fee: 0, minutes: 15 },
    { text: play.steps[2], cost: gasCost(0), time: '10 minutes', gas: 0, fee: 0, minutes: 10 },
    {
      text: play.steps[3],
      cost: `${gasCost(weeks)} across the hold`,
      time: `10 minutes a week for ${weeks} weeks`,
      gas: weeks * gas,
      fee: 0,
      minutes: 10 * weeks,
    },
    {
      text: `Hold the position for at least ${hold} days, checking ${p.name}'s own points or rewards page weekly, and claim only from a link the protocol itself publishes.`,
      cost: 'no gas to look, and never pay to claim',
      time: `5 minutes a week for ${weeks} weeks`,
      gas: 0,
      fee: 0,
      minutes: 5 * weeks,
    },
  ];
  const fees = drafts.reduce((s, d) => s + d.gas + d.fee, 0) + capital * play.feePct;
  const workMinutes = drafts.reduce((s, d) => s + d.minutes, 0) + 5;
  const slice = FARM.airdrop_share * implied * (capital / p.tvl_usd);
  const tbill = capital * FARM.tbill_apy * (hold / 365);
  const net = slice - fees - tbill;
  const workHours = workMinutes / 60;
  const perHour = net / workHours;
  const verdict: FarmEconomics['verdict'] = net >= FARM.farm_net_min_usd && perHour >= FARM.farm_per_hour_min_usd ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  const economics: FarmEconomics = {
    capital_usd: capital,
    slice_usd: round2(slice),
    fees_usd: round2(fees),
    gas_fees_usd: round2(drafts.reduce((s, d) => s + d.gas + d.fee, 0)),
    fee_pct: play.feePct,
    tbill_usd: round2(tbill),
    net_usd: round2(net),
    work_hours: round2(workHours),
    per_hour_usd: round2(perHour),
    hold_days: hold,
    verdict,
  };
  drafts.push({
    text:
      `Add it up before you commit: on ${money(capital)} the expected slice is ${money(slice)}, fees −${money(fees)}, T-bill yield forgone −${money(tbill)}, ` +
      `net ${net >= 0 ? '+' : '−'}${money(Math.abs(net))} for ${workHours.toFixed(1)} hours of work (${perHour >= 0 ? '+' : '−'}${money(Math.abs(perHour))} an hour) — verdict ${verdict}. ` +
      `Exit by ${play.exit} once any allocation lands.`,
    cost: 'nothing to run the numbers',
    time: '5 minutes',
    gas: 0,
    fee: 0,
    minutes: 5,
  });
  return { steps: drafts.map(({ text, cost, time }) => ({ text, cost, time })), economics, play: playFor(p) };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The traded peers nearest a protocol by TVL, for the detail view's peer table. */
function nearestPeers(p: SnapshotProtocol, peers: SnapshotProtocol[]): PeerRef[] {
  const x = Math.log10(p.tvl_usd);
  return [...peers]
    .sort((a, b) => Math.abs(Math.log10(a.tvl_usd) - x) - Math.abs(Math.log10(b.tvl_usd) - x) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 3)
    .map((q) => ({ name: q.name, tvl_usd: q.tvl_usd, mcap_usd: q.mcap_usd!, ratio: round2(q.mcap_usd! / q.tvl_usd) }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const peers = peerUniverse(snapshot.protocols);
  const fit = fitCurve(peers);
  const backtest = runBacktest(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its record looks like.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // And every other genuine pre-token protocol is priced too, at any TVL: the universe is
  // the radar's subject, and what is not priced is set aside by a named rule, in the open.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isGenuineCandidate(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { implied, low, high } = impliedValue(p, fit, backtest);
    const plan = farmPlan(p, age, implied);
    return { p, age, implied, low, high, plan };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: { curve_base_usd: s.implied, band_low_usd: s.low, band_high_usd: s.high, age_days: s.age },
    farm: s.plan.economics,
    farm_steps: s.plan.steps.map(stepText),
    play: s.plan.play,
  }));
}

/** Every category's mean residual on the fitted curve and its shrunk offset, for the Method page. */
export function categoryResiduals(peers: SnapshotProtocol[], fit: CurveFit): CategoryResidual[] {
  const offsets = categoryOffsets(peers, fit);
  const byCategory = new Map<string | null, number[]>();
  for (const p of peers) {
    const r = logCap(p) - Math.log10(curveValue(fit, p.tvl_usd));
    const list = byCategory.get(p.category) ?? [];
    list.push(r);
    byCategory.set(p.category, list);
  }
  return [...byCategory.entries()]
    .map(([category, rs]) => ({
      category,
      peers: rs.length,
      mean_residual: round3(rs.reduce((s, v) => s + v, 0) / rs.length),
      offset: round3(offsets.get(category) ?? 0),
    }))
    .sort((a, b) => b.peers - a.peers || String(a.category).localeCompare(String(b.category)));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round2(p.mcap_usd / p.tvl_usd) : null,
      in_universe: p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd <= PEER_RATIO_CAP,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const peers = peerUniverse(snapshot.protocols);
  const aside = snapshot.protocols
    .map((p) => ({ p, reason: setAsideReason(p), rule: setAsideRule(p) }))
    .filter((x) => x.reason !== null)
    .sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1))
    .map(({ p, reason, rule }) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, rule: rule!, reason: reason! }));
  const traded = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    curve: fitCurve(peers),
    backtest: runBacktest(snapshot),
    funnel: {
      scanned: snapshot.protocols.length,
      traded,
      pre_token: snapshot.protocols.length - traded,
      set_aside: aside.length,
      priced: board.length,
      watchlist: snapshot.watchlist.length,
      early: board.filter((r) => !watch.has(r.slug)).length,
    },
    category_residuals: categoryResiduals(peers, fitCurve(peers)),
    farm_assumptions: FARM,
    gas_usd: GAS_USD,
    gas_default_usd: GAS_DEFAULT_USD,
    protocols_size: snapshot.protocols.length,
    pre_token_size: snapshot.protocols.length - traded,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      band_low_usd: r.model.band_low_usd,
      band_high_usd: r.model.band_high_usd,
      watchlist: watch.has(r.slug),
      play: r.play,
      farm: r.farm,
      farm_steps: r.farm_steps,
      peers: nearestPeers(r, peers),
    })),
    live,
    set_aside: aside,
    scatter_peers: [...peers].sort((a, b) => a.tvl_usd - b.tvl_usd).map((p) => [p.tvl_usd, p.mcap_usd!]),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows: the gate takes 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board names a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${byRank[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
