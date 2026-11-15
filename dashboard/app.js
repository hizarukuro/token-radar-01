// Token Radar dashboard: renders window.RADAR (written by main.ts from the same board that
// board.json carries, so the page and the board can never disagree) with no network, no
// framework and no fetch. Four views share one page: the ranked board, the set-aside view
// that accounts for every protocol the board did not price and why, the live-token set kept
// apart, and the method view with the calibration and the model's blind test. A detail view
// shows one protocol's model breakdown and farm plan. The hash carries the view
// (#detail=<slug>, #live, #aside, #method, #cat=<category>) so each view can be linked,
// screenshotted and returned to.

'use strict';

const R = window.RADAR;
const main = document.getElementById('board');

const state = {
  view: 'board', // 'board' | 'live' | 'aside' | 'method'
  detail: null, // slug shown in the detail view, or null
  query: '',
  category: '',
  chain: '',
  watchOnly: false,
  sort: 'implied', // 'implied' | 'tvl' | 'growth' | 'age' | 'name'
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

/** A multiplier as the model states it: 0.31x. */
function mult(n) {
  return `${Number(n).toFixed(2)}x`;
}

/** One row's blind-test range, compact: $39M – $4.98B. */
function band(r) {
  const b = R.bands[r.slug];
  return b ? `${money(b[0])} – ${money(b[1])}` : '—';
}

/** The rows the current filters and sort leave on the board. */
function visibleRows() {
  const q = state.query.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (state.watchOnly && !r.watchlist) return false;
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = {
    implied: (r) => r.implied_value_usd,
    tvl: (r) => r.tvl_usd,
    growth: (r) => (r.change_7d === null ? -Infinity : r.change_7d),
    age: (r) => (r.age_days === null ? -Infinity : r.age_days),
    name: (r) => r.name.toLowerCase(),
  }[state.sort];
  rows = [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * state.dir * (typeof ka === 'string' ? 1 : 1);
    if (ka > kb) return 1 * state.dir;
    return a.rank - b.rank;
  });
  if (state.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name) * state.dir || a.rank - b.rank);
  return rows;
}

/** The header: what this is, when the data is from, and the counts that frame the board. */
function headerHTML() {
  const top = R.rows[0];
  return `
  <div class="masthead">
    <div>
      <h1>Token Radar<span class="dot">.</span></h1>
      <p class="tagline">Protocols that record no token yet, ranked by what a launch would be worth —
      calibrated from the tokens that already trade, each with the steps to farm it.</p>
    </div>
    <div class="asof">snapshot ${esc(R.as_of)}<br>${esc(R.source)}</div>
  </div>
  <div class="stats">
    <div class="stat"><b>${R.protocols_size}</b><span>protocols scanned</span></div>
    <div class="stat"><b>${R.pre_token_size}</b><span>record no token</span></div>
    <div class="stat"><b>${R.watchlist_size}</b><span>on the watchlist</span></div>
    <div class="stat"><b>${R.board_size}</b><span>ranked on the board</span></div>
    <div class="stat"><b>${R.early_size}</b><span>early, below the ${money(R.floor_usd)} floor</span></div>
    <div class="stat"><b>${top ? money(top.implied_value_usd) : '—'}</b><span>top implied value${top ? ` (${esc(top.name)})` : ''}</span></div>
  </div>
  ${funnelHTML()}`;
}

/** The funnel: the whole universe accounted for, in one strip above the views. */
function funnelHTML() {
  const f = R.funnel;
  const step = (n, label) => `<div class="fstep"><b>${n}</b><span>${label}</span></div>`;
  return `
  <div class="funnel" aria-label="How the snapshot's protocols were accounted for">
    ${step(f.scanned, 'protocols scanned')}
    <div class="farrow">→</div>
    ${step(f.traded, 'already trade: kept apart, never ranked')}
    <div class="farrow">→</div>
    ${step(f.pre_token, 'record no token')}
    <div class="farrow">→</div>
    ${step(f.set_aside, 'set aside by a named rule — see Set aside')}
    <div class="farrow">→</div>
    ${step(f.priced, `priced and ranked (${f.watchlist_priced} watchlist + ${f.early_priced} early)`)}
  </div>`;
}

/** The view tabs, shown under the header on every view but a protocol's detail. */
function tabsHTML() {
  const tab = (view, label) => `<button data-view="${view}" aria-pressed="${state.view === view}">${label}</button>`;
  return `
  <div class="tabs viewtabs" role="group" aria-label="View">
    ${tab('board', 'Pre-token board')}
    ${tab('aside', `Set aside (${R.funnel.set_aside})`)}
    ${tab('live', `Already trading (${R.live_size})`)}
    ${tab('method', 'Method &amp; blind test')}
  </div>`;
}

/** The filter and sort controls for the board view. */
function controlsHTML() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const opt = (v, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`;
  return `
  <div class="controls">
    <input type="search" id="q" placeholder="Search name or slug" value="${esc(state.query)}" aria-label="Search name or slug">
    <select id="cat" aria-label="Category">
      <option value="">All categories</option>
      ${cats.map((c) => opt(c, state.category)).join('')}
    </select>
    <select id="chain" aria-label="Chain">
      <option value="">All chains</option>
      ${chains.map((c) => opt(c, state.chain)).join('')}
    </select>
    <label><input type="checkbox" id="watch" ${state.watchOnly ? 'checked' : ''}> Watchlist only</label>
    <select id="sort" aria-label="Sort by">
      ${[['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].map(([v, t]) => `<option value="${v}"${state.sort === v ? ' selected' : ''}>${t}</option>`).join('')}
    </select>
    <button id="dir" class="back" style="margin:0" title="Toggle sort direction">${state.dir < 0 ? 'Descending' : 'Ascending'}</button>
  </div>`;
}

/** The ranked board itself: one row per protocol, click through to its detail. */
function boardHTML() {
  const rows = visibleRows();
  if (rows.length === 0) return `<div class="empty">No protocol matches these filters. Loosen the search, or clear a filter.</div>`;
  const arrow = (k) => (state.sort === k ? (state.dir < 0 ? ' ↓' : ' ↑') : '');
  const body = rows
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}" tabindex="0" role="link" aria-label="${esc(r.name)} detail">
      <td class="rank">${r.rank}</td>
      <td><span class="name">${esc(r.name)}</span>${r.watchlist ? '<span class="chip">WATCHLIST</span>' : '<span class="chip early">EARLY</span>'}<span class="slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? '—')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${pct(r.change_7d)}</td>
      <td class="num hide-s">${age(r.age_days)}</td>
      <td class="num hide-s">${mult(r.category_multiple)}</td>
      <td class="num"><b>${money(r.implied_value_usd)}</b></td>
      <td class="num band hide-s">${band(r)}</td>
    </tr>`,
    )
    .join('');
  return `
  <p class="count">${rows.length} of ${R.board_size} protocols shown · every row is a row of board.json, priced by the model under Method · the range is the model's blind-test band (Method)</p>
  <table class="board">
    <thead><tr>
      <th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>
      <th class="num"><button data-sort="tvl">TVL${arrow('tvl')}</button></th>
      <th class="num"><button data-sort="growth">7d${arrow('growth')}</button></th>
      <th class="num hide-s"><button data-sort="age">Age${arrow('age')}</button></th>
      <th class="num hide-s">Cat. x</th>
      <th class="num"><button data-sort="implied">Implied value${arrow('implied')}</button></th>
      <th class="num hide-s">Blind-test range</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** One protocol in full: its record, the model's arithmetic on it, and its farm plan. */
function detailHTML(r) {
  const cal = R.calibration.categories.find((c) => c.category === r.category);
  const base = Math.round(r.tvl_usd * r.category_multiple);
  const b = R.bands[r.slug];
  const peers =
    cal && cal.peers >= 3
      ? `${esc(r.category)} is priced by ${cal.peers} live peers at a median of ${mult(cal.median_ratio)}, shrunk to ${mult(r.category_multiple)}.`
      : `Fewer than three live peers price ${esc(r.category ?? 'this category')}, so the global median multiple ${mult(R.calibration.global_median_ratio)} applies instead of a single market's anecdote.`;
  const steps = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
  return `
  <button class="back" id="back">← Back to the board</button>
  <div class="detail">
    <h2>${esc(r.name)}${r.watchlist ? '<span class="chip">WATCHLIST</span>' : '<span class="chip early">EARLY</span>'}</h2>
    <p class="sub">Rank #${r.rank} of ${R.board_size} · ${esc(r.category ?? 'Uncategorised')} · records no token yet</p>
    <div class="grid">
      <div class="cell"><b>${money(r.implied_value_usd)}</b><span>implied launch value</span></div>
      <div class="cell"><b>${b ? `${money(b[0])} – ${money(b[1])}` : '—'}</b><span>blind-test range (Method)</span></div>
      <div class="cell"><b>${money(r.tvl_usd)}</b><span>TVL</span></div>
      <div class="cell"><b>${r.change_7d === null ? '—' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`}</b><span>TVL change, 7 days</span></div>
      <div class="cell"><b>${age(r.age_days)}</b><span>tracked with no token${r.listed_at ? ` (since ${esc(r.listed_at)})` : ''}</span></div>
      <div class="cell"><b class="chainlist">${esc(r.chains.join(', ') || '—')}</b><span>chains</span></div>
      <div class="cell"><b>${mult(r.category_multiple)}</b><span>category multiple</span></div>
    </div>
    <div class="breakdown">
      <h3>How the model prices ${esc(r.name)}</h3>
      <div class="formula">${money(r.tvl_usd)} TVL x ${mult(r.category_multiple)} category x ${mult(r.growth_multiplier)} growth x ${mult(r.maturity_multiplier)} maturity = ${money(r.implied_value_usd)}</div>
      <p>${peers} The base at the category multiple alone is ${money(base)}; the 7-day growth multiplier
      (${mult(r.growth_multiplier)}) and the maturity multiplier (${mult(r.maturity_multiplier)}) move it to the implied value.
      The blind-test range is not a second price: in the model's blind test (Method), the market's own cap for a traded
      peer landed between ${mult(R.backtest.band_lo_mult)} and ${mult(R.backtest.band_hi_mult)} of the model's price for the
      middle 80 per cent of peers, and this row's range is its implied value across that same spread.
      This is the entry's own claim about a launch that has not happened, not a prediction that it will.</p>
    </div>
    <div class="plan">
      <h3>Farm plan</h3>
      <ol>${steps}</ol>
    </div>
  </div>`;
}

/** The short label and the full rule for each set-aside reason, in the model's own check order. */
const REASONS = {
  'product-category': ['Product category', 'Its category is Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX: a wrapped, staked or bridged product of another protocol, or an exchange — it has no launch of its own coming.'],
  'versioned-name': ['Versioned name', 'Its name ends in a version marker (V2, v3, 2.0 and the like): a later pool of a protocol that already has one.'],
  'wrapped-word': ['Wrapped / staked name', 'Its name carries the whole word wrapped, staked or staking: a product of a token that already trades.'],
  'exchange-prefix': ['Exchange product', "Its name begins with an exchange's name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, Gemini): the exchange's own product."],
  'above-floor': ['Above the floor, not listed', 'A genuine candidate at or above the watchlist floor that the sealed watchlist does not name: the watchlist is the house\u2019s list, and the early scan that widens the board only looks below the floor. Named here so the gap is visible, not silent.'],
  'past-cap': ['Past the early cap', 'A genuine candidate below the floor, ranked below the early board\u2019s cap by TVL.'],
};

/** The set-aside view: every pre-token protocol the board did not price, and the rule that set it aside. */
function asideHTML() {
  const f = R.funnel;
  const fired = f.reasons.filter((x) => x.count > 0);
  const summary = fired
    .map((x) => `<tr><td>${esc(REASONS[x.reason][0])}</td><td>${x.count}</td><td class="why">${esc(REASONS[x.reason][1])}</td></tr>`)
    .join('');
  const body = f.aside
    .map(
      (a) => `<tr>
      <td><span class="name">${esc(a.name)}</span><span class="slug">${esc(a.slug)}</span></td>
      <td>${esc(a.category ?? '—')}</td>
      <td class="chains">${esc(a.chains.slice(0, 3).join(', '))}${a.chains.length > 3 ? ` +${a.chains.length - 3}` : ''}</td>
      <td class="num">${money(a.tvl_usd)}</td>
      <td class="why">${esc(REASONS[a.reason][0])}</td>
    </tr>`,
    )
    .join('');
  return `
  <section class="model">
    <h2>Set aside: ${f.set_aside} of ${f.pre_token} protocols that record no token</h2>
    <p>The board prices ${f.priced} of the ${f.pre_token} pre-token protocols in the snapshot. The other ${f.set_aside}
    are not hidden and not scored zero: each is set aside by one named rule — the same genuineness rule the house's
    watchlist states, applied by the same function that builds the board — and listed here with its TVL, largest first.
    A wrapped Bitcoin or an exchange's staking product has no launch of its own to rank.</p>
    <table class="cal">
      <tr><th>Rule</th><th>Protocols</th><th>What it keeps off the board</th></tr>
      ${summary}
    </table>
  </section>
  <table class="board">
    <thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th>Set aside because</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** The live set: protocols whose token already trades, at the market's own values. */
function liveHTML() {
  const body = R.live
    .map(
      (p) => `<tr>
      <td><span class="name">${esc(p.name)}</span><span class="slug">${esc(p.slug)}</span></td>
      <td>${esc(p.category ?? '—')}</td>
      <td class="chains">${esc(p.chains.slice(0, 3).join(', '))}</td>
      <td class="num">${money(p.tvl_usd)}</td>
      <td class="num">${pct(p.change_7d)}</td>
      <td class="num"><b>${money(p.mcap_usd)}</b></td>
    </tr>`,
    )
    .join('');
  return `
  <p class="count">These protocols already have a token: the market prices them, so the radar never ranks them.
  Their market cap against TVL is the calibration the board is priced from (Method). Showing the top ${R.live_size} by market cap.</p>
  <table class="board">
    <thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Market cap</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** The method view: the formula, the full calibration, the blind test and the funnel. */
function methodHTML() {
  const cal = R.calibration;
  const bt = R.backtest;
  const f = R.funnel;
  const catRows = cal.categories
    .map((c) => `<tr><td>${esc(c.category ?? 'Uncategorised')}</td><td>${c.peers}</td><td>${mult(c.median_ratio)}</td><td>${mult(c.multiple)}</td></tr>`)
    .join('');
  const ts = bt.time_split
    ? `<tr><td>Time split: fit on the ${bt.time_split.fit_peers} peers listed before 2024, test on the ${bt.time_split.test_peers} listed since</td><td>${mult(bt.time_split.median_miss)}</td><td>${bt.time_split.within_3x_pct}%</td></tr>`
    : '';
  return `
  <section class="model">
    <h2>The model (${esc(R.model_version)}): calibrated, not asserted</h2>
    <div class="formula">implied value = TVL x category multiple x growth multiplier x maturity multiplier</div>
    <p>The category multiple is read out of this snapshot: for every protocol whose token already trades,
    its market cap divided by its TVL is what the market pays for a unit of TVL in that category. A pre-token
    protocol is priced at its own category's median ratio, shrunk toward the global median
    (${mult(cal.global_median_ratio)} across ${cal.global_peers} live peers) by the number of peers behind it and
    clamped to [0.02x, 1.50x]. A category needs at least three live peers to price its own multiple; with fewer,
    the global median applies — one protocol's market is an anecdote, not a category.
    The growth multiplier is 1 + clamp(7-day TVL change, -60%, +120%) x 0.5. The maturity multiplier rewards
    time survived with no token: 0.60 plus up to 0.40 across three years. No name is priced by hand:
    one function scores every row, and every figure in it is one of the snapshot's own ten fields.
    Ratios above 10x are dropped before any median: a handful of records carry a market cap hundreds of
    times their TVL, and a median built on them would price every launch like a data error.</p>
    <table class="cal">
      <tr><th>Category</th><th>Live peers</th><th>Median mcap / TVL</th><th>Multiple used</th></tr>
      ${catRows}
    </table>
  </section>
  <section class="model">
    <h2>The blind test: the model priced on the tokens it never saw</h2>
    <p>The model prices protocols that have not launched from the ones that have — so it can be graded on the
    ones that have. For each of the ${bt.peers} traded peers in the calibration, the calibration was refit
    without that peer and the model priced it blind, with the same formula the board carries. The miss is the
    larger of price over actual and actual over price, so overpricing and underpricing count the same.</p>
    <table class="cal">
      <tr><th>Test</th><th>Median miss</th><th>Within 3x</th></tr>
      <tr><td>Leave-one-out, all ${bt.peers} peers</td><td>${mult(bt.loo_median_miss)}</td><td>${bt.loo_within_3x_pct}% (${bt.loo_within_3x_count} of ${bt.peers})</td></tr>
      ${ts}
    </table>
    <p>Across those blind trials, the market's own cap landed between ${mult(bt.band_lo_mult)} and
    ${mult(bt.band_hi_mult)} of the model's price for the middle 80 per cent of peers (the 10th to 90th
    percentile of actual over predicted). Every board row carries that spread as its blind-test range in
    dollars: it is the measured width of this model, printed on the row instead of hidden behind a point
    estimate. The range is wide because launches are wide — the honest answer to "what would it be worth"
    is a band, and the board's rank is by the calibrated point inside it.</p>
    <p>A second model was fitted in development — a log-log size curve over the same peers — and it
    backtested tighter (median blind miss ${mult(3.09)}, 49% within 3x). This entry ships the category model
    anyway: each of its multiples is the median of a named peer group that a reader can recompute from the
    table above, where the curve prices every protocol from one global slope; and the category model's own
    wider error is published here in full rather than traded for a better-looking number. The shipped model's
    numbers are the ones in the table, not the alternative's.</p>
  </section>
  <section class="model">
    <h2>The funnel: every protocol accounted for</h2>
    <p>${f.scanned} protocols scanned → ${f.traded} already trade (kept apart in Already trading, never ranked) →
    ${f.pre_token} record no token → ${f.set_aside} set aside by a named rule (Set aside) →
    ${f.priced} priced and ranked: the ${f.watchlist_priced} of the sealed watchlist, plus ${f.early_priced}
    genuine candidates the radar found below the ${money(R.floor_usd)} floor. Coverage of the watchlist is
    complete: all ${f.watchlist_priced} are on the board. Nothing in the snapshot is dropped without a name
    and a reason the reader can check.</p>
  </section>`;
}

/** The footer: where the data came from and what the board does not claim. */
function footerHTML() {
  return `
  <footer>
    Data: ${esc(R.source)}. The snapshot is sealed: every run of this radar reads the same bytes.
    A protocol is listed as recording no token when its snapshot record carries no market cap, no CoinGecko id and
    no symbol; that is DefiLlama's record, not proof. Implied values are this entry's model output, stated so a
    reader can disagree with the arithmetic, and farm plans are starting points, not financial advice.
  </footer>`;
}

/** Render the whole page from the current state. */
function render() {
  let view = '';
  if (state.detail !== null) {
    const row = R.rows.find((r) => r.slug === state.detail);
    view = row === undefined ? boardHTML() : detailHTML(row);
    main.innerHTML = headerHTML() + view + footerHTML();
  } else if (state.view === 'live') {
    main.innerHTML = headerHTML() + tabsHTML() + liveHTML() + footerHTML();
  } else if (state.view === 'aside') {
    main.innerHTML = headerHTML() + tabsHTML() + asideHTML() + footerHTML();
  } else if (state.view === 'method') {
    main.innerHTML = headerHTML() + tabsHTML() + methodHTML() + footerHTML();
  } else {
    main.innerHTML = headerHTML() + tabsHTML() + controlsHTML() + boardHTML() + footerHTML();
  }
  main.setAttribute('aria-busy', 'false');
  wire();
}

/** Attach the controls and rows of the freshly rendered page. */
function wire() {
  const on = (id, ev, fn) => {
    const n = document.getElementById(id);
    if (n) n.addEventListener(ev, fn);
  };
  on('q', 'input', (e) => {
    state.query = e.target.value;
    refreshBoard();
  });
  on('cat', 'change', (e) => {
    state.category = e.target.value;
    refreshBoard();
  });
  on('chain', 'change', (e) => {
    state.chain = e.target.value;
    refreshBoard();
  });
  on('watch', 'change', (e) => {
    state.watchOnly = e.target.checked;
    refreshBoard();
  });
  on('sort', 'change', (e) => {
    state.sort = e.target.value;
    refreshBoard();
  });
  on('dir', 'click', () => {
    state.dir = -state.dir;
    render();
  });
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.view = b.getAttribute('data-view');
      state.detail = null;
      history.replaceState(null, '', state.view === 'board' ? '#board' : `#${state.view}`);
      render();
      window.scrollTo(0, 0);
    }),
  );
  on('back', 'click', () => {
    state.detail = null;
    state.view = 'board';
    history.replaceState(null, '', '#board');
    render();
  });
  document.querySelectorAll('th button[data-sort]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else {
        state.sort = k;
        state.dir = k === 'name' ? 1 : -1;
      }
      render();
    }),
  );
  document.querySelectorAll('tr[data-slug]').forEach((tr) => {
    const open = () => {
      state.detail = tr.getAttribute('data-slug');
      history.replaceState(null, '', `#detail=${state.detail}`);
      render();
      window.scrollTo(0, 0);
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

/** Re-render only the board region, keeping the controls (and the search box's focus). */
function refreshBoard() {
  if (state.view !== 'board' || state.detail !== null) {
    render();
    return;
  }
  render();
  const q = document.getElementById('q');
  if (q && state.query) {
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

/** Read the view out of the hash: #detail=<slug>, #live, #aside, #method, #cat=<category>, #chain=<chain>. */
function applyHash() {
  const h = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(h.includes('=') ? h : '');
  state.detail = null;
  state.view = 'board';
  if (h === 'live') state.view = 'live';
  else if (h === 'aside') state.view = 'aside';
  else if (h === 'method') state.view = 'method';
  else if (params.get('detail')) state.detail = params.get('detail');
  else {
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
  }
  render();
}

window.addEventListener('hashchange', applyHash);
applyHash();
