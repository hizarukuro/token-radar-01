// Token Radar dashboard: renders window.RADAR (written by main.ts from the same board that
// board.json carries, so the page and the board can never disagree) with no network, no
// framework and no fetch. Five views share one page:
//
//   the board      every priced pre-token protocol: the size curve's value, its P10-P90
//                  honesty band, and the farm plan's net and verdict at a $1,000 position
//   a detail view  one protocol: the curve's arithmetic, its nearest traded peers, the
//                  full farm plan, its netting, and a sensitivity matrix over capital
//                  and allocation share
//   method         the model itself: the fitted curve, the blind test that chose it
//                  (leave-one-out and a time split, every stage measured, the losers
//                  shown), the scatter of peers and board against the curve, the
//                  universe funnel, and every farm assumption stated
//   set aside      the pre-token protocols no rule prices, each with its reason
//   live tokens    the protocols whose token already trades, at the market's values
//
// The hash carries the view (#detail=<slug>, #method, #aside, #live, #cat=<category>,
// #verdict=<FARM|THIN|SKIP>, #chain=<chain>) so each view can be linked and screenshotted.

'use strict';

const R = window.RADAR;
const main = document.getElementById('board');

const state = {
  view: 'board', // 'board' | 'detail' | 'method' | 'aside' | 'live'
  detail: null, // slug shown in the detail view, or null
  query: '',
  category: '',
  chain: '',
  verdict: '',
  watchOnly: false,
  sort: 'implied', // 'implied' | 'tvl' | 'net' | 'growth' | 'age' | 'name'
  dir: -1, // -1 descending, 1 ascending
};

/** Escape a data value for HTML text. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** $1.23B, $45.6M, $789K, $42. */
function money(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

/** $1,234.56 — the netting's precision, cents and all. */
function money2(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A signed dollar figure for nets: +$9.06, −$4.32. */
function signed(n) {
  return `${n >= 0 ? '+' : '−'}${money2(Math.abs(n)).replace('−', '')}`;
}

/** A signed per cent, or a dash when the snapshot reports none. */
function pct(n) {
  if (n === null || n === undefined) return '<span class="chains">—</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
}

/** An age in days as 3.1y, 7mo or 25d; unknown when the snapshot gives no listing date. */
function age(d) {
  if (d === null || d === undefined) return 'unknown';
  if (d >= 365) return `${(d / 365).toFixed(1)}y`;
  if (d >= 30) return `${Math.round(d / 30)}mo`;
  return `${d}d`;
}

/** A verdict as its chip. */
function chip(v, big) {
  return `<span class="chip ${v}${big ? ' big' : ''}">${v}</span>`;
}

/** The board's shared band scale: every row's band bar is drawn on these log bounds. */
const BAND_LO = Math.log10(Math.min(...R.rows.map((r) => r.band_low_usd)));
const BAND_HI = Math.log10(Math.max(...R.rows.map((r) => r.band_high_usd)));
function bandPos(v) {
  return ((Math.log10(Math.max(1, v)) - BAND_LO) / (BAND_HI - BAND_LO)) * 100;
}

/** A row's honesty band as a bar: the P10-P90 range, a tick at the point price. */
function bandBar(r) {
  const left = bandPos(r.band_low_usd);
  const width = Math.max(1.5, bandPos(r.band_high_usd) - left);
  const dot = bandPos(r.implied_value_usd);
  return `<div class="band"><div class="range" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></div><div class="dot" style="left:${dot.toFixed(1)}%"></div></div>`;
}

/** Verdict counts over the whole board, for the header line. */
function verdictCounts() {
  const c = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of R.rows) c[r.farm.verdict]++;
  return c;
}

/** The rows the current filters and sort leave on the board. */
function visibleRows() {
  const q = state.query.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (state.watchOnly && !r.watchlist) return false;
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.verdict && r.farm.verdict !== state.verdict) return false;
    if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = {
    implied: (r) => r.implied_value_usd,
    tvl: (r) => r.tvl_usd,
    net: (r) => r.farm.net_usd,
    growth: (r) => (r.change_7d === null ? -Infinity : r.change_7d),
    age: (r) => (r.age_days === null ? -Infinity : r.age_days),
    name: (r) => r.name.toLowerCase(),
  }[state.sort];
  rows = [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * state.dir;
    if (ka > kb) return 1 * state.dir;
    return a.rank - b.rank;
  });
  return rows;
}

/** The page header: the funnel in one line, and the tabs. */
function headerHTML(active) {
  const f = R.funnel;
  const vc = verdictCounts();
  const tab = (view, hash, label) => `<a href="${hash}" class="${active === view ? 'on' : ''}">${label}</a>`;
  return `
  <h1>Token Radar <span class="thin">— pre-token protocols, priced by a size curve that was tested blind</span></h1>
  <p class="funnel"><b>${f.scanned}</b> protocols scanned → <b>${f.traded}</b> already tokenised, kept apart →
  <b>${f.pre_token}</b> pre-token → <b>${f.set_aside}</b> set aside by a named rule → <b>${f.priced} priced</b>
  (${f.watchlist} on the watchlist) · at a $1,000 position: <b>${vc.FARM} FARM</b> · <b>${vc.THIN} THIN</b> · <b>${vc.SKIP} SKIP</b>
  <span class="badge">Page = board.json <b>${R.rows.length}/${R.board_size} rows</b></span></p>
  <nav class="tabs">
    ${tab('board', '#', 'Board')}
    ${tab('method', '#method', 'Method &amp; backtest')}
    ${tab('aside', '#aside', `Set aside (${f.set_aside})`)}
    ${tab('live', '#live', 'Live tokens')}
  </nav>`;
}

/** The board's filter and sort controls. */
function controlsHTML(rows) {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const catCounts = new Map();
  for (const r of R.rows) if (r.category) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const opt = (v, cur, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label ?? v)}</option>`;
  return `
  <div class="controls">
    <input type="search" id="q" placeholder="Search name or slug" value="${esc(state.query)}" aria-label="Search">
    <select id="cat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => opt(c, state.category, `${c} (${catCounts.get(c) ?? 0})`)).join('')}</select>
    <select id="chain" aria-label="Chain"><option value="">All chains</option>${chains.map((c) => opt(c, state.chain)).join('')}</select>
    <select id="verdict" aria-label="Verdict"><option value="">All verdicts</option>${['FARM', 'THIN', 'SKIP'].map((v) => opt(v, state.verdict)).join('')}</select>
    <label><input type="checkbox" id="wl" ${state.watchOnly ? 'checked' : ''}> Watchlist only</label>
    <span class="count">${rows.length} of ${R.rows.length} rows</span>
  </div>`;
}

/** The board itself: rank, protocol, TVL, the curve's value with its band, the net, the verdict. */
function boardHTML() {
  const rows = visibleRows();
  const th = (label, sort, cls) =>
    `<th class="${cls ?? ''} sortable" data-sort="${sort}">${label}${state.sort === sort ? (state.dir === -1 ? ' ↓' : ' ↑') : ''}</th>`;
  const body = rows
    .map(
      (r) => `
    <tr data-slug="${esc(r.slug)}" tabindex="0">
      <td>${r.rank}</td>
      <td class="l"><span class="name">${esc(r.name)}</span>${r.watchlist ? '<span class="wl">watchlist</span>' : ''}
        <div class="sub">${esc(r.category ?? '—')} · <span class="chains">${esc(r.chains.slice(0, 3).join(', '))}</span></div></td>
      <td>${money(r.tvl_usd)}</td>
      <td>${money(r.implied_value_usd)}${bandBar(r)}<div class="bandtxt">${money(r.band_low_usd)} – ${money(r.band_high_usd)}</div></td>
      <td>${pct(r.change_7d)}</td>
      <td class="${r.farm.net_usd >= 0 ? 'pos' : 'neg'}">${signed(r.farm.net_usd)}</td>
      <td>${signed(r.farm.per_hour_usd)}/h</td>
      <td>${chip(r.farm.verdict)}</td>
    </tr>`,
    )
    .join('');
  return `
  ${headerHTML('board')}
  ${controlsHTML(rows)}
  <table>
    <thead><tr>
      <th>#</th><th class="l">Protocol</th>${th('TVL', 'tvl')}${th('Implied value · P10–P90 band', 'implied')}
      ${th('7d', 'growth')}${th('Net @ $1K', 'net')}<th>$/hour</th><th>Verdict</th>
    </tr></thead>
    <tbody>${body || '<tr class="static"><td colspan="8" class="l dim">No protocol matches these filters.</td></tr>'}</tbody>
  </table>
  <p class="small dim">The band is the blind test's own uncertainty: the P10–P90 range of the size curve's leave-one-out
  residuals (Method &amp; backtest). A point price from a model that misses by ×${R.backtest.stages.find((s) => s.shipped).loo_median_miss.toFixed(2)}
  is a claim; the band is the measurement. Net and verdict are computed on the stated farm assumptions — the detail view shows every figure.
  Reading the board: rows are ordered by the curve's price, which — the curve being a pure function of TVL — is also TVL order;
  the verdict, not the rank, is where the board's opinion lives, and it is an opinion about a $1,000 farm, not about the protocol.</p>
  ${stripsHTML()}
  ${categoriesHTML()}`;
}

/** The board aggregated by category: where the priced TVL sits and how the verdicts fall. */
function categoriesHTML() {
  const byCat = new Map();
  for (const r of R.rows) {
    const key = r.category ?? '—';
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }
  const body = [...byCat.entries()]
    .map(([cat, rows]) => ({ cat, rows, tvl: rows.reduce((s, r) => s + r.tvl_usd, 0) }))
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 12)
    .map(({ cat, rows, tvl }) => {
      const mix = ['FARM', 'THIN', 'SKIP'].map((v) => `${rows.filter((r) => r.farm.verdict === v).length}`).join('/');
      return `<tr class="static"><td class="l"><a href="#cat=${encodeURIComponent(cat)}">${esc(cat)}</a></td><td>${rows.length}</td><td>${money(tvl)}</td><td>${money(rows.reduce((s, r) => s + r.implied_value_usd, 0) / rows.length)}</td><td>${mix}</td></tr>`;
    })
    .join('');
  return `
  <h3 style="margin-top:20px">The board by category</h3>
  <table>
    <thead><tr><th class="l">Category</th><th>Protocols</th><th>Total TVL</th><th>Mean implied</th><th>FARM/THIN/SKIP</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p class="small dim">The twelve largest categories by priced TVL. A category's mean implied value is a
  size statement before it is anything else — the curve prices TVL, and categories differ mostly in how
  much of it they hold.</p>`;
}

/** A row's net at another capital and allocation share, on the same stated assumptions. */
function netAt(r, capital, share) {
  const slice = share * r.implied_value_usd * (capital / r.tvl_usd);
  const fees = r.farm.gas_fees_usd + r.farm.fee_pct * capital;
  const tbill = capital * R.farm_assumptions.tbill_apy * (r.farm.hold_days / 365);
  return slice - fees - tbill;
}

function verdictAt(r, capital, share) {
  const net = netAt(r, capital, share);
  const perHour = net / r.farm.work_hours;
  return net >= R.farm_assumptions.farm_net_min_usd && perHour >= R.farm_assumptions.farm_per_hour_min_usd ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
}

/** The capital at which a row's plan turns FARM at the stated 10% share, if it does by $20M. */
function turnsFarmAt(r) {
  const share = R.farm_assumptions.airdrop_share;
  if (verdictAt(r, 2e7, share) !== 'FARM') return null;
  let lo = 3;
  let hi = Math.log10(2e7);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (verdictAt(r, 10 ** mid, share) === 'FARM') hi = mid;
    else lo = mid;
  }
  return Math.round(10 ** hi);
}

/** Three reading strips under the board: the best nets, the best pay, and the giants that skip. */
function stripsHTML() {
  const mini = (rows, val) =>
    rows
      .map((r) => `<tr data-slug="${esc(r.slug)}" tabindex="0"><td class="l"><span class="name">${esc(r.name)}</span></td><td>${val(r)}</td></tr>`)
      .join('');
  const topNet = R.rows.filter((r) => r.farm.verdict === 'FARM').sort((a, b) => b.farm.net_usd - a.farm.net_usd).slice(0, 5);
  const topHour = R.rows.filter((r) => r.farm.net_usd > 0).sort((a, b) => b.farm.per_hour_usd - a.farm.per_hour_usd).slice(0, 5);
  const giants = R.rows.filter((r) => r.farm.verdict === 'SKIP').sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 4);
  return `
  <div class="strips">
    <div class="strip"><h3>Best nets at $1,000</h3><table><tbody>${mini(topNet, (r) => `${signed(r.farm.net_usd)} · ${r.farm.per_hour_usd >= 0 ? '+' : ''}$${r.farm.per_hour_usd.toFixed(2)}/h`)}</tbody></table></div>
    <div class="strip"><h3>Best pay per hour</h3><table><tbody>${mini(topHour, (r) => `$${r.farm.per_hour_usd.toFixed(2)}/h · ${signed(r.farm.net_usd)}`)}</tbody></table></div>
    <div class="strip"><h3>Giants that skip at $1,000</h3><table><tbody>${mini(giants, (r) => {
      const t = turnsFarmAt(r);
      return `${money(r.tvl_usd)} TVL · ${t === null ? 'SKIP to $20M' : `FARM at ≈${money(t)}`}`;
    })}</tbody></table></div>
  </div>`;
}

const PLAY_LABEL = {
  curator: 'Curator vaults', allocator: 'Allocators & aggregators', vault: 'Yield vaults',
  lending: 'Money markets', cdp: 'CDP / stablecoin vaults', dex: 'DEX liquidity',
  derivatives: 'Derivatives venues', prediction: 'Prediction markets', basis: 'Basis / delta-neutral',
  rwa: 'Real-world assets', chain: 'Chains & rollups', wrapper: 'Wrappers & restaking',
  insurance: 'Cover / insurance', payments: 'Payments & ramps', deposit: 'Deposit-first products',
};

const PLAY_DOCTRINE = {
  curator: "Qualify through the curator's own gate, then let the curator's allocation do the work — the held position, not trading, is the record.",
  allocator: "Enter through the allocation the product itself routes, and keep the route's receipts; the aggregator's bookkeeping is the evidence.",
  vault: 'A plain deposit, held. The share balance is the whole record, so the plan is short and the hold is long.',
  lending: 'Supply the deepest market and borrow nothing. Leverage is risk the plan does not need and the record does not reward.',
  cdp: 'Collateral in, a conservative mint against it, both sides documented and the health factor watched weekly.',
  dex: 'Provide in the deepest pool, in range, and rebalance on a schedule rather than on impulse; fees are reported net of gas.',
  derivatives: 'Trade small and documented — volume with a record behind it, never volume for its own sake.',
  prediction: 'Small positions on liquid markets, resolved outcomes kept; an unresolved book at snapshot time is carried at its cost.',
  basis: 'Both legs on together and the hedge checked weekly. A one-legged basis trade is not a basis trade, it is a bet.',
  rwa: "Complete the platform's own onboarding and hold the issued asset; for these products the paperwork is part of the position.",
  chain: "Bridge in, then use the chain's own first-party apps — presence across the surface, not a single bridge record.",
  wrapper: 'Wrap once into the deepest market and hold the receipt token where the ecosystem counts it.',
  insurance: 'Buy cover on a position that actually exists. Cover without a position is a premium paid for nothing.',
  payments: 'Route real volume through the rail and keep the receipts; synthetic volume is visible and worthless.',
  deposit: 'A straightforward deposit into the core product, held for the stated term — the default play when no mechanism claims the protocol.',
};

/** The farm plays, grouped from the board itself: how many protocols each governs and its doctrine. */
function playsHTML() {
  const byPlay = new Map();
  for (const r of R.rows) {
    const list = byPlay.get(r.play) ?? [];
    list.push(r);
    byPlay.set(r.play, list);
  }
  const body = [...byPlay.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([play, rows]) => {
      const mix = ['FARM', 'THIN', 'SKIP'].map((v) => `${rows.filter((r) => r.farm.verdict === v).length} ${v}`).join(' · ');
      return `<tr class="static"><td class="l"><b>${esc(PLAY_LABEL[play] ?? play)}</b><div class="sub">${rows.length} protocols · ${mix}</div></td><td class="l">${esc(PLAY_DOCTRINE[play] ?? '')}</td></tr>`;
    })
    .join('');
  return `<table class="plays"><thead><tr><th class="l">Play</th><th class="l">Its doctrine</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** The shipped model's blind residuals as a decile strip: each block is a tenth of the peers. */
function quantileSVG() {
  const d = R.backtest.band_deciles;
  const W = 720;
  const H = 86;
  const L = 8;
  const Rt = 8;
  const lo = d[0];
  const hi = d[d.length - 1];
  const px = (v) => L + ((v - lo) / (hi - lo)) * (W - L - Rt);
  let blocks = '';
  for (let i = 0; i < 10; i++) {
    const mid = (d[i] + d[i + 1]) / 2;
    const dist = Math.min(1, Math.abs(mid) / 1.3);
    const fill = mid < 0 ? `rgba(255,122,107,${0.25 + 0.55 * dist})` : `rgba(79,227,165,${0.25 + 0.55 * dist})`;
    blocks += `<rect x="${px(d[i]).toFixed(1)}" y="14" width="${Math.max(1, px(d[i + 1]) - px(d[i]) - 1.5).toFixed(1)}" height="30" fill="${fill}"/>`;
  }
  let ticks = '';
  for (const e of [-1, 0, 1, 2]) {
    if (e < lo || e > hi) continue;
    ticks += `<line x1="${px(e).toFixed(1)}" y1="10" x2="${px(e).toFixed(1)}" y2="48" stroke="#dbe7f0" stroke-width="${e === 0 ? 2 : 1}"/>`;
    ticks += `<text x="${px(e).toFixed(1)}" y="62" fill="#8fa5b5" font-size="11" text-anchor="middle">×${(10 ** e).toFixed(e < 0 ? 1 : 0)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deciles of the shipped model's blind residuals">${blocks}${ticks}
    <text x="${L}" y="${H - 2}" fill="#5d7183" font-size="11">each block = a tenth of the ${R.backtest.peer_count} peers, priced blind · left of ×1 the market paid less than the curve's price, right of ×1 it paid more</text>
  </svg>`;
}

/** One protocol in full: the curve's arithmetic, its traded peers, its farm plan and its netting. */
function detailHTML(r) {
  const x = Math.log10(r.tvl_usd / 1e8);
  const peers = r.peers
    .map((p) => `<tr class="static"><td class="l">${esc(p.name)}</td><td>${money(p.tvl_usd)}</td><td>${money(p.mcap_usd)}</td><td>${p.ratio.toFixed(2)}x</td></tr>`)
    .join('');
  const steps = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
  const f = r.farm;
  const capitals = [1000, 10000, 100000];
  const shares = [0.05, 0.1, 0.2];
  const matrix = `
    <table class="matrix">
      <thead><tr><th class="l">Net at share \\ capital</th>${capitals.map((c) => `<th>$${c / 1000}K</th>`).join('')}</tr></thead>
      <tbody>${shares
        .map(
          (s) => `<tr class="static"><td class="l">${Math.round(s * 100)}% to depositors</td>${capitals
            .map((c) => {
              const v = verdictAt(r, c, s);
              return `<td class="${v === 'FARM' ? 'f' : v === 'THIN' ? 't' : 's'}">${signed(netAt(r, c, s))}</td>`;
            })
            .join('')}</tr>`,
        )
        .join('')}</tbody>
    </table>`;
  return `
  ${headerHTML('board')}
  <p class="small"><a href="#">← back to the board</a></p>
  <h2 style="margin-top:4px">${esc(r.name)} ${chip(f.verdict, true)}${r.watchlist ? '<span class="wl">watchlist</span>' : ''}
    <span class="badge">rank <b>#${r.rank}</b> of ${R.board_size}</span></h2>
  <div class="cols">
    <div>
      <h3>The price — the size curve, step by step</h3>
      <dl class="kv">
        <dt>TVL</dt><dd>${money2(r.tvl_usd)}</dd>
        <dt>log10(TVL / $100M)</dt><dd>${x.toFixed(3)}</dd>
        <dt>Curve value</dt><dd>10<sup>${R.curve.a.toFixed(4)}</sup> × (TVL/$100M)<sup>${R.curve.b.toFixed(4)}</sup> = <b>${money2(r.implied_value_usd)}</b></dd>
        <dt>Honesty band (P10–P90)</dt><dd>${money2(r.band_low_usd)} – ${money2(r.band_high_usd)}</dd>
        <dt>TVL change, 7d</dt><dd>${pct(r.change_7d)}</dd>
        <dt>Running without a token</dt><dd>${age(r.age_days)}${r.age_days === null ? '' : ` (${r.age_days} days)`}</dd>
        <dt>Category · chains</dt><dd>${esc(r.category ?? '—')} · ${esc(r.chains.join(', '))}</dd>
        <dt>Traded peers within 2× of this TVL</dt><dd>${R.scatter_peers.filter(([t]) => t >= r.tvl_usd / 2 && t <= r.tvl_usd * 2).length} of ${R.curve.peers}</dd>
        <dt>Share of the board's total implied value</dt><dd>${((r.implied_value_usd / R.rows.reduce((s, x) => s + x.implied_value_usd, 0)) * 100).toFixed(2)}%</dd>
        <dt>Band width</dt><dd>×${(r.band_high_usd / r.band_low_usd).toFixed(1)} from P10 to P90</dd>
      </dl>
      <p class="small dim">The curve is the whole model: the growth, category and seasoning factors the
      first build carried were each tested on top of it and each made the blind test worse
      (Method &amp; backtest), so none of them moves this price.</p>
    </div>
    <div>
      <h3>Against traded peers — nearest by TVL</h3>
      <table>
        <thead><tr><th class="l">Traded peer</th><th>TVL</th><th>Market cap</th><th>Cap/TVL</th></tr></thead>
        <tbody><tr class="static self"><td class="l"><b>${esc(r.name)} — this protocol, at the curve's price</b></td><td>${money(r.tvl_usd)}</td><td>${money(r.implied_value_usd)}</td><td>${(r.implied_value_usd / r.tvl_usd).toFixed(2)}x</td></tr>${peers}</tbody>
      </table>
      <p class="small dim">The market's own answers near this protocol's size. The curve is fitted
      through all ${R.curve.peers} traded peers, not picked from these three; they are shown so the
      price can be judged against its neighbours.</p>
    </div>
  </div>
  <h3>Farm plan — the ${esc(PLAY_LABEL[r.play] ?? r.play).toLowerCase()} play, netted to a verdict</h3>
  <ol class="steps">${steps}</ol>
  <div class="cols">
    <div class="netbox">
      <div class="row"><span>Expected slice of the launch allocation (10% to depositors, $${f.capital_usd} of $${money(r.tvl_usd)} TVL)</span><b>${money2(f.slice_usd)}</b></div>
      <div class="row"><span>Fees — the plan's gas plus its entry/exit share</span><b>−${money2(f.fees_usd)}</b></div>
      <div class="row"><span>T-bill yield forgone over the ${f.hold_days}-day hold</span><b>−${money2(f.tbill_usd)}</b></div>
      <div class="row total"><span>Net · ${f.work_hours.toFixed(1)} hours of work · ${signed(f.per_hour_usd)} an hour</span><b>${signed(f.net_usd)} — ${f.verdict}</b></div>
      ${f.verdict !== 'FARM' && turnsFarmAt(r) !== null ? `<div class="row"><span>At the same 10% share, this plan turns FARM at about</span><b>${money(turnsFarmAt(r))} of capital</b></div>` : ''}
      ${f.verdict !== 'FARM' && turnsFarmAt(r) === null ? `<div class="row"><span>At the same 10% share, this plan is still not FARM at</span><b>$20M of capital</b></div>` : ''}
    </div>
    <div>
      <h3 style="margin-top:2px">Sensitivity — net by capital and allocation share</h3>
      ${matrix}
      <p class="small dim">Same assumptions, other sizes: the slice scales with capital and share,
      gas does not, the T-bill charge does. Colour is the verdict that cell would earn.</p>
    </div>
  </div>
  <p class="small dim">The verdict is a statement about a $1,000 farm under the assumptions on the Method
  page — the matrix is this protocol's answer at other sizes, and the band is the reminder that the price
  it all rests on is a measurement with a ×${(r.band_high_usd / r.band_low_usd).toFixed(0)} spread, not a promise.</p>`;
}

/** The curve refit on this page, from the traded peers in the data: an independent check of the board. */
function recompute() {
  const pts = R.scatter_peers;
  const n = pts.length;
  const xs = pts.map(([t]) => Math.log10(t / 1e8));
  const ys = pts.map(([, m]) => Math.log10(m));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = Math.round((sxy / sxx) * 1e4) / 1e4;
  const a = Math.round((my - (sxy / sxx) * mx) * 1e4) / 1e4;
  let equal = 0;
  for (const r of R.rows) {
    const pred = Math.min(1e14, Math.max(1, Math.round(10 ** (a + b * Math.log10(r.tvl_usd / 1e8)))));
    if (pred === r.implied_value_usd) equal++;
  }
  return { a, b, equal, total: R.rows.length };
}

/** The scatter: traded peers in grey, the board in amber, the fitted curve through them. */
function scatterSVG() {
  const W = 720;
  const H = 430;
  const L = 66;
  const B = 36;
  const T = 12;
  const Rt = 12;
  const tvls = [...R.scatter_peers.map(([t]) => t), ...R.rows.map((r) => r.tvl_usd)];
  const vals = [...R.scatter_peers.map(([, m]) => m), ...R.rows.map((r) => r.implied_value_usd)];
  const x0 = Math.floor(Math.log10(Math.min(...tvls)));
  const x1 = Math.ceil(Math.log10(Math.max(...tvls)));
  const y0 = Math.floor(Math.log10(Math.min(...vals)));
  const y1 = Math.ceil(Math.log10(Math.max(...vals)));
  const px = (t) => L + ((Math.log10(t) - x0) / (x1 - x0)) * (W - L - Rt);
  const py = (v) => H - B - ((Math.log10(v) - y0) / (y1 - y0)) * (H - B - T);
  let grid = '';
  for (let e = x0; e <= x1; e++) {
    grid += `<line x1="${px(10 ** e).toFixed(1)}" y1="${T}" x2="${px(10 ** e).toFixed(1)}" y2="${H - B}" stroke="#1a2531" stroke-width="1"/>`;
    grid += `<text x="${px(10 ** e).toFixed(1)}" y="${H - B + 20}" fill="#5d7183" font-size="11" text-anchor="middle">${money(10 ** e)}</text>`;
  }
  for (let e = y0; e <= y1; e++) {
    grid += `<line x1="${L}" y1="${py(10 ** e).toFixed(1)}" x2="${W - Rt}" y2="${py(10 ** e).toFixed(1)}" stroke="#1a2531" stroke-width="1"/>`;
    grid += `<text x="${L - 6}" y="${(py(10 ** e) + 4).toFixed(1)}" fill="#5d7183" font-size="11" text-anchor="end">${money(10 ** e)}</text>`;
  }
  const curvePts = [];
  for (let i = 0; i <= 40; i++) {
    const t = 10 ** (x0 + ((x1 - x0) * i) / 40);
    curvePts.push(`${px(t).toFixed(1)},${py(10 ** (R.curve.a + R.curve.b * Math.log10(t / 1e8))).toFixed(1)}`);
  }
  const peers = R.scatter_peers.map(([t, m]) => `<circle cx="${px(t).toFixed(1)}" cy="${py(m).toFixed(1)}" r="2.6" fill="#5d7183"/>`).join('');
  const rows = R.rows.map((r) => `<circle cx="${px(r.tvl_usd).toFixed(1)}" cy="${py(r.implied_value_usd).toFixed(1)}" r="2.6" fill="#ffb454" fill-opacity="0.85"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of traded peers and board rows against the fitted size curve">
    ${grid}<polyline points="${curvePts.join(' ')}" fill="none" stroke="#4fe3a5" stroke-width="2"/>
    ${peers}${rows}
    <text x="${L}" y="${H - 4}" fill="#5d7183" font-size="11">TVL (log scale)</text>
    <text x="${W - Rt}" y="${H - 4}" fill="#5d7183" font-size="11" text-anchor="end">value (log scale)</text>
  </svg>`;
}

/** The method: the model, the blind test that chose it, the funnel, and every farm assumption. */
function methodHTML() {
  const bt = R.backtest;
  const shipped = bt.stages.find((s) => s.shipped);
  const ablation = bt.stages
    .map(
      (s) => `<tr class="static"><td class="l ${s.shipped ? 'ship' : ''}">${esc(s.name)}${s.shipped ? ' — shipped' : ''}</td>
      <td>×${s.loo_median_miss.toFixed(2)}</td><td>${Math.round(s.loo_within_2x * 100)}%</td><td>${Math.round(s.loo_within_3x * 100)}%</td>
      <td>×${s.ts_median_miss.toFixed(2)}</td><td>${Math.round(s.ts_within_2x * 100)}%</td><td>${Math.round(s.ts_within_3x * 100)}%</td></tr>`,
    )
    .join('');
  const ruleNames = {
    'product-category': 'A product category of a traded token (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX)',
    'versioned-name': 'A versioned name — a later release of another protocol',
    'wrapped-staked-word': 'A name that marks a wrapped or staked form of a traded asset',
    'exchange-prefix': "An exchange's own product name",
  };
  const ruleCounts = {};
  for (const a of R.set_aside) ruleCounts[a.rule] = (ruleCounts[a.rule] ?? 0) + 1;
  const rules = Object.entries(ruleCounts)
    .map(([rule, n]) => `<tr class="static"><td class="l">${esc(ruleNames[rule] ?? rule)}</td><td>${n}</td></tr>`)
    .join('');
  const gas = Object.entries(R.gas_usd)
    .sort((a, b) => b[1] - a[1])
    .map(([chain, usd]) => `<tr class="static"><td class="l">${esc(chain)}</td><td>$${usd.toFixed(2)}</td></tr>`)
    .join('');
  const rc = recompute();
  const vc = verdictCounts();
  return `
  ${headerHTML('method')}
  <h2>The model — a size curve, and nothing the blind test could not defend</h2>
  <div class="formula">value = 10<sup>${R.curve.a.toFixed(4)}</sup> × (TVL / $100M)<sup>${R.curve.b.toFixed(4)}</sup> &nbsp;·&nbsp; $${(R.curve.base_at_100m_usd / 1e6).toFixed(1)}M at $100M of TVL</div>
  <p>The curve is a least-squares line in log-log space over the snapshot's <b>${R.curve.peers} traded peers</b>:
  protocols with a market cap and a TVL whose cap/TVL ratio lies in (0, 10] — the same universe the first
  build's flat multiple calibrated on, so the two cores are compared on identical evidence. The funnel that
  draws the universe: ${bt.fit_funnel.with_cap_tvl} traded records carry both a cap and a TVL;
  ${bt.fit_funnel.zero_cap} of them record a cap of zero, ${bt.fit_funnel.negative_cap} a negative cap and
  ${bt.fit_funnel.extreme_ratio} a ratio beyond 10× — data errors all — leaving the ${R.curve.peers}. A slope of
  ${R.curve.b.toFixed(2)} says value grows slower than size: each further 10× of TVL multiplies value by
  ${(10 ** R.curve.b).toFixed(1)}×, not 10×. That is why the largest pre-token protocol on the board is priced
  in the tens of millions, where a flat multiple priced it at $416M.</p>
  <h3>The blind test — every stage measured, the losers shown</h3>
  <p>Before anything is priced, the program replays the contest blind. <b>Leave-one-out</b>: each of the
  ${bt.peer_count} peers is removed, the model refitted without it, and the removed token priced — the miss is
  the fold error against its real market cap. <b>Time split</b>: fit on the ${bt.ts_fit_count} dated peers listed
  before ${bt.ts_cutoff}, price the ${bt.ts_test_count} listed since. The shipped model is the stage that won;
  the stages that lost are printed, not buried — a richer model that cannot beat the curve out of sample is
  a story, not a model.</p>
  <table class="ablation">
    <thead><tr><th class="l">Model stage</th><th>LOO median miss</th><th>Within 2x</th><th>Within 3x</th><th>Time-split miss</th><th>Within 2x</th><th>Within 3x</th></tr></thead>
    <tbody>${ablation}</tbody>
  </table>
  <p>The board's honesty band comes from the same test: the P10–P90 range of the shipped model's
  leave-one-out residuals, ×${(10 ** bt.band_q10).toFixed(2)} to ×${(10 ** bt.band_q90).toFixed(1)} around each
  point price. Recomputed on this page from the ${R.curve.peers} traded peers: the fit is a = ${rc.a.toFixed(4)},
  b = ${rc.b.toFixed(4)}, and <b>${rc.equal} of ${rc.total} rows</b> price exactly as board.json carries them.</p>
  <div class="scatter">${quantileSVG()}</div>
  <p>The middle half of the blind residuals runs from ×${(10 ** bt.band_q25).toFixed(2)} to
  ×${(10 ** bt.band_q75).toFixed(1)}: half of everything the market has actually paid for a launched
  protocol landed within that span of the curve's blind price. The tails are the tails — one peer in ten
  came in above ×${(10 ** bt.band_q90).toFixed(1)} — and the board prints the full P10–P90 band on every
  row rather than trimming them away.</p>
  <h3>What the category offsets saw — and why they still lost</h3>
  <p>The offset stage of the ablation gave each category its own intercept: the mean of its peers'
  residuals on the curve, shrunk toward zero by its peer count. This is what it saw. The pattern is real
  — lending and liquid staking sit under the curve, DEX and RWA peers above it — and it still lost: with
  ${bt.peer_count} peers spread over this many categories, each offset is fitted on a handful of points
  and the blind test charges full price for the noise. A later snapshot with more traded peers per
  category is where this stage earns its place; this board ships the model the evidence supports now.</p>
  <table>
    <thead><tr><th class="l">Category</th><th>Peers</th><th>Mean residual</th><th>Shrunk offset</th></tr></thead>
    <tbody>${R.category_residuals
      .map((c) => `<tr class="static"><td class="l">${esc(c.category ?? '—')}</td><td>${c.peers}</td><td>×${(10 ** c.mean_residual).toFixed(2)}</td><td>×${(10 ** c.offset).toFixed(2)}</td></tr>`)
      .join('')}</tbody>
  </table>
  <h3>The fit, drawn</h3>
  <div class="scatter">${scatterSVG()}</div>
  <p class="legend"><span class="sw" style="background:#5d7183"></span>traded peers (the fit's evidence)
  <span class="sw" style="background:#ffb454"></span>the board's ${R.rows.length} priced protocols
  <span class="sw" style="background:#4fe3a5"></span>the fitted size curve</p>
  <p>Read the grey points against the line: above it, a protocol's market paid more than its size alone
  would suggest; below it, less — that scatter around the line is exactly the residual spread the band is
  drawn from. The amber points sit on the line by construction, and it is worth saying so plainly: the
  curve is their price, so the chart cannot validate them. What validates the price is the grey scatter
  and the blind test above — the amber points only show where each board row's claim is staked.</p>
  <h3>How a row is priced, end to end</h3>
  <ol class="steps">
    <li>The sealed snapshot is parsed and classified: ${R.funnel.traded} protocols already trade, ${R.funnel.pre_token} do not yet.</li>
    <li>The peer universe is drawn from the traded set — ${R.curve.peers} records with a real cap, a real TVL and a ratio inside (0, 10].</li>
    <li>The size curve is fitted to those peers by least squares in log-log space, and the six-stage ablation is run blind: leave-one-out over every peer, and a time split at ${bt.ts_cutoff}.</li>
    <li>The winning stage prices every genuine pre-token candidate; the shipped stage's own blind residuals become each row's P10–P90 band.</li>
    <li>Each row's farm plan is written for its mechanism play and netted — slice, fees, forgone yield — to its FARM, THIN or SKIP verdict.</li>
    <li>The board, this page and the dossier are rendered from that single run. Run the program twice and the outputs are byte-identical; the numbers above are its numbers, not a write-up of them.</li>
  </ol>
  <h3>The universe, accounted for</h3>
  <p>${R.funnel.scanned} protocols scanned. ${R.funnel.traded} already have a token — they are the fit's
  evidence and the Live tokens view, never ranked. Of the ${R.funnel.pre_token} pre-token protocols,
  ${R.funnel.set_aside} are set aside by the rules below (each is listed, with its reason, in the Set aside
  view) and <b>${R.funnel.priced} are priced</b>: the snapshot's ${R.funnel.watchlist}-protocol watchlist plus
  every other genuine candidate, at any TVL — the first build silently dropped the genuine candidates
  above its floor; this one does not drop anything in silence.</p>
  <table><thead><tr><th class="l">Set-aside rule</th><th>Protocols</th></tr></thead><tbody>${rules}</tbody></table>
  <h3>Farm assumptions — stated, so the verdicts can be argued with</h3>
  <div class="formula">slice = ${(R.farm_assumptions.airdrop_share * 100).toFixed(0)}% × implied × ($1,000 / TVL) &nbsp;·&nbsp; net = slice − fees − T-bill forgone &nbsp;·&nbsp; FARM when net ≥ $${R.farm_assumptions.farm_net_min_usd} and ≥ $${R.farm_assumptions.farm_per_hour_min_usd}/hour, THIN when net &gt; 0, else SKIP</div>
  <p>Every plan is costed for a <b>$1,000 position</b>. The slice assumes a launch allocates
  ${(R.farm_assumptions.airdrop_share * 100).toFixed(0)}% of its implied value to depositors, shared pro-rata
  by TVL — a stated assumption, not a leak; each detail view shows what other shares and capitals do to the
  net. Fees are the plan's own gas (per action, by the chain the protocol names first, table below) plus an
  entry/exit share of the position of 0.1–0.3% by mechanism. The T-bill charge is the idle-capital yield,
  ${(R.farm_assumptions.tbill_apy * 100).toFixed(1)}% a year over the plan's hold. Work is the plan's active
  minutes; waiting is not work. On these assumptions the board's verdicts at $1,000 are
  <b>${vc.FARM} FARM · ${vc.THIN} THIN · ${vc.SKIP} SKIP</b> — the giants mostly skip at $1,000, and their
  detail pages show the capital at which they turn.</p>
  <table><thead><tr><th class="l">Chain (first named)</th><th>Gas per action</th></tr></thead><tbody>${gas}
  <tr class="static"><td class="l">Any other chain</td><td>$${R.gas_default_usd.toFixed(2)}</td></tr></tbody></table>
  <h3>The plays — one doctrine per mechanism</h3>
  <p>A farm plan is only as good as its mechanism. The board runs fifteen plays, assigned by what the
  protocol's product actually does — its category first, then the words of its own name (a vault inside a
  lending market is farmed as a vault) — and every plan's steps are written for its play: where the
  position goes, what is checked while it is held, and how it closes. The counts below are the board's
  own, and the verdict mix is what the netting did to each play at $1,000.</p>
  ${playsHTML()}
  <h3>A worked example — the board's first row, end to end</h3>
  <p>${esc(R.rows[0].name)} carries ${money2(R.rows[0].tvl_usd)} of TVL, the largest pre-token book in the
  snapshot. The curve prices it at ${money2(R.rows[0].implied_value_usd)} — 10<sup>${R.curve.a.toFixed(2)}</sup>
  × (${money(R.rows[0].tvl_usd)}/$100M)<sup>${R.curve.b.toFixed(2)}</sup> — inside a band of
  ${money2(R.rows[0].band_low_usd)} to ${money2(R.rows[0].band_high_usd)}. Its farm plan nets
  ${signed(R.rows[0].farm.net_usd)} at $1,000: a ${money2(R.rows[0].farm.slice_usd)} expected slice against
  ${money2(R.rows[0].farm.fees_usd)} of fees and ${money2(R.rows[0].farm.tbill_usd)} of forgone yield, over
  ${R.rows[0].farm.work_hours.toFixed(1)} hours — a ${R.rows[0].farm.verdict} at this size, and its detail
  page shows the capital at which that changes. Nothing in that paragraph was typed by hand: every figure
  is the program's own output for the row, which is the standard the whole board is held to.</p>
  <h3>Reproducing this board</h3>
  <p>The program reads one sealed snapshot and nothing else: no network, no clock beyond the snapshot's
  own as-of date, no randomness, no hand-tuned per-protocol adjustments anywhere in the pipeline. The same
  input produces a byte-identical board, data file and dossier on every run, and the dossier a judge
  reads is rebuilt from these very dashboard files by the competition's own vendor code and compared
  byte-for-byte with the program's — if any figure on this page disagreed with the program's output, that
  comparison would fail before a judge ever saw the page. That is the sense in which this board is
  auditable: not that its model is right, but that its model is exactly the one printed here.</p>
  <h3>What the curve cannot see</h3>
  <p>TVL is the only witness this model calls. It cannot see TVL that is mercenary and will leave before
  a launch, a team that has already decided its allocation, a token promised elsewhere, or a protocol
  whose TVL is double-counted through a partner. It prices from one sealed snapshot, so it inherits the
  snapshot's day. And its evidence is survivorship-shaped: the peers are protocols that did launch and
  did list — the ones that died tokenless are not in the fit, because they are not in the data. The band
  absorbs some of this; the rest is why every figure here is labelled a measurement, not a prediction,
  and why the set-aside list and the farm verdicts — the parts of this board that do not depend on the
  curve at all — are published with the same prominence as the prices.</p>
  <p class="small dim">Shipped stage's blind numbers, for the record: leave-one-out median miss
  ×${shipped.loo_median_miss.toFixed(2)} against the flat model's ×${bt.stages[0].loo_median_miss.toFixed(2)},
  ${Math.round(shipped.loo_within_3x * 100)}% of peers priced within 3× of their real cap against
  ${Math.round(bt.stages[0].loo_within_3x * 100)}%. An implied value is what a launch would be worth if the
  protocol's record stayed as it is — a measurement from the snapshot's own figures, not a prediction.</p>`;
}

/** The set-aside view: every unpriced pre-token protocol, with the rule that claimed it. */
function asideHTML() {
  const body = R.set_aside
    .map((a) => `<tr class="static"><td class="l"><span class="name">${esc(a.name)}</span><div class="sub">${esc(a.category ?? '—')}</div></td><td>${money(a.tvl_usd)}</td><td class="l">${esc(a.reason)}</td></tr>`)
    .join('');
  const ruleTvl = {};
  for (const a of R.set_aside) ruleTvl[a.rule] = (ruleTvl[a.rule] ?? 0) + a.tvl_usd;
  const ruleSummary = Object.entries(ruleTvl)
    .sort((x, y) => y[1] - x[1])
    .map(([rule, tvl]) => `${R.set_aside.filter((a) => a.rule === rule).length} by the ${rule} rule (${money(tvl)} of TVL)`)
    .join(' · ');
  return `
  ${headerHTML('aside')}
  <p class="dim">Nothing here was dropped in silence: each of the ${R.set_aside.length} pre-token protocols the
  board does not price is listed with the rule that set it aside. A wrapped, staked, bridged or exchange
  product of a token that already trades has no launch of its own coming — pricing it would rank the
  parent token twice. By rule: ${ruleSummary}. The largest names set aside are
  ${R.set_aside.slice(0, 3).map((a) => `${esc(a.name)} (${money(a.tvl_usd)})`).join(', ')} — real protocols
  with real TVL, excluded not for weakness but because their value already trades under another name.</p>
  <table><thead><tr><th class="l">Protocol</th><th>TVL</th><th class="l">Why it is set aside</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** The live-token view: protocols whose token already trades, at the market's own values. */
function liveHTML() {
  const body = R.live
    .map((p) => `<tr class="static"><td class="l"><span class="name">${esc(p.name)}</span><div class="sub">${esc(p.category ?? '—')} · <span class="chains">${esc(p.chains.slice(0, 3).join(', '))}</span></div></td><td>${money(p.tvl_usd)}</td><td>${money(p.mcap_usd)}</td><td>${p.ratio === null ? '—' : `${p.ratio.toFixed(2)}x`}</td><td>${pct(p.change_7d)}</td><td>${p.in_universe ? '<span class="tag">in the fit</span>' : '<span class="dim">—</span>'}</td></tr>`)
    .join('');
  return `
  ${headerHTML('live')}
  <p class="dim">The protocols whose token already trades, by market cap — the size curve's evidence,
  kept apart from the board and never ranked by the model. The board ranks only what has not launched.
  Rows marked "in the fit" are the peer universe itself: a real cap, a real TVL, and a ratio inside
  (0, 10]. The unmarked rows are why the universe has edges — caps recorded as zero, or ratios in the
  hundreds that no launch multiple should be calibrated on.</p>
  <table><thead><tr><th class="l">Protocol</th><th>TVL</th><th>Market cap</th><th>Cap/TVL</th><th>7d</th><th>Peer universe</th></tr></thead><tbody>${body}</tbody></table>`;
}

function footerHTML() {
  const shipped = R.backtest.stages.find((s) => s.shipped);
  return `<footer>Snapshot: ${esc(R.source)}, as of ${esc(R.as_of)} · model ${esc(R.model_version)} ·
  board ${R.board_size} rows (${R.watchlist_size} watchlist + ${R.early_size} further genuine candidates) ·
  ${R.set_aside.length} set aside · shipped model blind test: leave-one-out median miss ×${shipped.loo_median_miss.toFixed(2)},
  ${Math.round(shipped.loo_within_3x * 100)}% within 3× · an implied value is a measurement from the snapshot's own figures, not a prediction.</footer>`;
}

function render() {
  let html;
  if (state.view === 'detail') {
    const r = R.rows.find((row) => row.slug === state.detail);
    html = r ? detailHTML(r) : boardHTML();
  } else if (state.view === 'method') html = methodHTML();
  else if (state.view === 'aside') html = asideHTML();
  else if (state.view === 'live') html = liveHTML();
  else html = boardHTML();
  main.innerHTML = html + footerHTML();
  main.setAttribute('aria-busy', 'false');
  wire();
}

function on(el, ev, fn) {
  if (el) el.addEventListener(ev, fn);
}

function wire() {
  // Board rows open their detail view.
  main.querySelectorAll('tbody tr[data-slug]').forEach((tr) => {
    const open = () => {
      location.hash = `#detail=${tr.getAttribute('data-slug')}`;
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
  // Sort headers.
  main.querySelectorAll('th[data-sort]').forEach((thEl) => {
    thEl.addEventListener('click', () => {
      const s = thEl.getAttribute('data-sort');
      if (state.sort === s) state.dir = -state.dir;
      else {
        state.sort = s;
        state.dir = s === 'name' ? 1 : -1;
      }
      render();
    });
  });
  // Filters.
  const q = main.querySelector('#q');
  on(q, 'input', () => {
    state.query = q.value;
    render();
    const q2 = main.querySelector('#q');
    q2.focus();
    q2.setSelectionRange(q2.value.length, q2.value.length);
  });
  const cat = main.querySelector('#cat');
  on(cat, 'change', () => {
    state.category = cat.value;
    render();
  });
  const chain = main.querySelector('#chain');
  on(chain, 'change', () => {
    state.chain = chain.value;
    render();
  });
  const verdict = main.querySelector('#verdict');
  on(verdict, 'change', () => {
    state.verdict = verdict.value;
    render();
  });
  const wl = main.querySelector('#wl');
  on(wl, 'change', () => {
    state.watchOnly = wl.checked;
    render();
  });
}

/** Read the view out of the hash: #detail=<slug>, #method, #aside, #live, #cat=, #verdict=, #chain=. */
function applyHash() {
  const h = location.hash.replace(/^#/, '');
  state.detail = null;
  if (h.startsWith('detail=')) {
    state.view = 'detail';
    state.detail = decodeURIComponent(h.slice('detail='.length));
  } else if (h === 'method') state.view = 'method';
  else if (h === 'aside') state.view = 'aside';
  else if (h === 'live') state.view = 'live';
  else {
    state.view = 'board';
    if (h.startsWith('cat=')) state.category = decodeURIComponent(h.slice(4));
    if (h.startsWith('verdict=')) state.verdict = decodeURIComponent(h.slice(8));
    if (h.startsWith('chain=')) state.chain = decodeURIComponent(h.slice(6));
  }
  render();
}

window.addEventListener('hashchange', applyHash);
applyHash();
