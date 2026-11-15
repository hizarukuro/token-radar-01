// The radar's accounting of itself: where every protocol in the snapshot went, and how the
// model in lib/model.ts scores when it is tested blind against the tokens that already trade.
//
// Nothing here prices a row. buildBoard in lib/model.ts writes the board exactly as it always
// has; this file only replays that board's own selection rules to name the protocols the
// board set aside and why, and re-runs the model's own calibration with one peer left out at
// a time to measure its error. The dashboard renders both, so the reader sees the whole
// universe the radar scanned and the model's measured miss, not only its ranked answer.

import {
  MODEL,
  calibrate,
  impliedValue,
  isGenuineCandidate,
  isPreToken,
  type BoardRow,
  type Snapshot,
  type SnapshotProtocol,
} from './model.ts';

/** Why a pre-token protocol is not on the board: the first of the radar's own rules that sets it aside. */
export type AsideReason = 'product-category' | 'versioned-name' | 'wrapped-word' | 'exchange-prefix' | 'above-floor' | 'past-cap';

/** One protocol the board set aside, with the rule that set it aside. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: AsideReason;
}

/** The whole universe, accounted for: scanned, already trading, priced, set aside and why. */
export interface Funnel {
  scanned: number;
  traded: number;
  pre_token: number;
  priced: number;
  watchlist_priced: number;
  early_priced: number;
  set_aside: number;
  reasons: { reason: AsideReason; count: number }[];
  aside: AsideRow[];
}

/** The model tested blind: leave-one-out over its own calibration peers, and a time split. */
export interface Backtest {
  peers: number;
  loo_median_miss: number;
  loo_within_3x_count: number;
  loo_within_3x_pct: number;
  band_lo_mult: number;
  band_hi_mult: number;
  time_split: { fit_peers: number; test_peers: number; median_miss: number; within_3x_pct: number } | null;
}

/** Everything this file adds to the dashboard's data: the funnel, the blind test, the bands. */
export interface Analysis {
  funnel: Funnel;
  backtest: Backtest;
  /** Per board row, the blind-test range in dollars: [low, high] around the implied value. */
  bands: Record<string, [number, number]>;
}

// The selection predicates of isGenuineCandidate in lib/model.ts, restated so each set-aside
// can name the rule that caught it. The self-check in buildAnalysis proves on every run that
// these restatements agree with isGenuineCandidate itself on every protocol, so the funnel
// can never drift from the rule the board actually applied.
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The first genuineness rule a pre-token protocol fails, or null when it is a genuine candidate. */
function failedRule(p: SnapshotProtocol): AsideReason | null {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'product-category';
  if (VERSIONED.test(p.name)) return 'versioned-name';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'wrapped-word';
  const firstWord = p.name.split(/\s+/)[0] ?? '';
  if (EXCHANGE_PREFIXES.includes(firstWord)) return 'exchange-prefix';
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round1 = (n: number): number => Math.round(n * 10) / 10;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a non-empty list, linear between the two nearest ranks. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** The protocols the calibration reads as peers: a market cap and a TVL, ratio inside the cap. */
function peersOf(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => {
    if (p.mcap_usd === null || p.tvl_usd <= 0) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio > 0 && ratio <= MODEL.ratio_cap;
  });
}

/**
 * The funnel: replay the board's selection over the snapshot and account for every protocol.
 * Refuses (throws) rather than publish an accounting that disagrees with the board itself.
 */
export function buildFunnel(snapshot: Snapshot, board: BoardRow[]): Funnel {
  const priced = new Set(board.map((r) => r.slug));
  const watch = new Set(snapshot.watchlist);
  const aside: AsideRow[] = [];
  let preToken = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    preToken++;
    // The restated predicates must agree with the model's own rule on every protocol.
    if ((failedRule(p) === null) !== isGenuineCandidate(p)) {
      throw new Error(`token radar: the funnel's rules disagree with the model on ${p.slug}`);
    }
    if (priced.has(p.slug)) continue;
    const failed = failedRule(p);
    const reason: AsideReason = failed ?? (p.tvl_usd >= snapshot.floor_usd ? 'above-floor' : 'past-cap');
    aside.push({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, reason });
  }
  if (priced.size + aside.length !== preToken) {
    throw new Error(`token radar: the funnel accounts for ${priced.size + aside.length} of ${preToken} pre-token protocols`);
  }
  aside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const order: AsideReason[] = ['product-category', 'versioned-name', 'wrapped-word', 'exchange-prefix', 'above-floor', 'past-cap'];
  const reasons = order.map((reason) => ({ reason, count: aside.filter((a) => a.reason === reason).length }));
  return {
    scanned: snapshot.protocols.length,
    traded: snapshot.protocols.length - preToken,
    pre_token: preToken,
    priced: priced.size,
    watchlist_priced: board.filter((r) => watch.has(r.slug)).length,
    early_priced: board.filter((r) => !watch.has(r.slug)).length,
    set_aside: aside.length,
    reasons,
    aside,
  };
}

/**
 * The blind test: price every calibration peer with a calibration that never saw it, and
 * record the miss. The band is where the market's own answer landed, against the model's
 * price, for the middle 80 per cent of those blind trials (the P10 to P90 of the ratio).
 */
export function buildBacktest(snapshot: Snapshot): Backtest {
  const peers = peersOf(snapshot.protocols);
  const misses: number[] = [];
  const ratios: number[] = [];
  for (const p of peers) {
    const cal = calibrate(snapshot.protocols.filter((q) => q !== p));
    const { implied } = impliedValue(p, snapshot.as_of, cal);
    misses.push(Math.max(implied / p.mcap_usd!, p.mcap_usd! / implied));
    ratios.push(p.mcap_usd! / implied);
  }
  const within = misses.filter((m) => m <= 3).length;
  // The time split: fit on the peers listed before 2024, test on the ones listed since.
  const fit = peers.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const test = peers.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  let timeSplit: Backtest['time_split'] = null;
  if (fit.length > 0 && test.length > 0) {
    const cal = calibrate(fit);
    const splitMisses = test.map((p) => {
      const { implied } = impliedValue(p, snapshot.as_of, cal);
      return Math.max(implied / p.mcap_usd!, p.mcap_usd! / implied);
    });
    timeSplit = {
      fit_peers: fit.length,
      test_peers: test.length,
      median_miss: round2(median(splitMisses)),
      within_3x_pct: round1((100 * splitMisses.filter((m) => m <= 3).length) / splitMisses.length),
    };
  }
  return {
    peers: peers.length,
    loo_median_miss: round2(median(misses)),
    loo_within_3x_count: within,
    loo_within_3x_pct: round1((100 * within) / misses.length),
    band_lo_mult: round3(quantile(ratios, 0.1)),
    band_hi_mult: round3(quantile(ratios, 0.9)),
    time_split: timeSplit,
  };
}

/** The funnel, the blind test and every board row's blind-test range in dollars. */
export function buildAnalysis(snapshot: Snapshot, board: BoardRow[]): Analysis {
  const funnel = buildFunnel(snapshot, board);
  const backtest = buildBacktest(snapshot);
  const bands: Record<string, [number, number]> = {};
  for (const r of board) {
    bands[r.slug] = [
      Math.max(1, Math.round(r.implied_value_usd * backtest.band_lo_mult)),
      Math.max(1, Math.round(r.implied_value_usd * backtest.band_hi_mult)),
    ];
  }
  return { funnel, backtest, bands };
}
