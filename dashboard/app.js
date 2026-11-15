// Token Radar dashboard: renders window.RADAR (written by main.ts from the same board that
// board.json carries, so the page and the board can never disagree) with no network, no
// framework and no fetch. Three views share one page: the ranked board, a detail view per
// protocol with its model breakdown and farm plan, and the live-token set kept apart.
// The hash carries the view (#detail=<slug>, #live, #cat=<category>) so each view can be
// linked, screenshotted and returned to.

'use strict';

const R = window.RADAR;
const main = document.getElementById('board');

const state = {
  view: 'board', // 'board' | 'live'
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
  </div>`;
}

/** The model panel: the formula, stated whole, and the calibration table behind it. */
function modelHTML() {
  const cal = R.calibration;
  const topCats = cal.categories.slice(0, 8);
  const catRows = topCats
    .map((c) => `<tr><td>${esc(c.category ?? 'Uncategorised')}</td><td>${c.peers}</td><td>${mult(c.median_ratio)}</td><td>${mult(c.multiple)}</td></tr>`)
    .join('');
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
    one function scores every row, and every figure in it is one of the snapshot's own ten fields.</p>
    <table class="cal">
      <tr><th>Category</th><th>Live peers</th><th>Median mcap / TVL</th><th>Multiple used</th></tr>
      ${catRows}
    </table>
  </section>`;
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
    <div class="tabs" role="group" aria-label="View">
      <button id="tab-board" aria-pressed="${state.view === 'board'}">Pre-token board</button>
      <button id="tab-live" aria-pressed="${state.view === 'live'}">Already trading (${R.live_size})</button>
    </div>
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
    </tr>`,
    )
    .join('');
  return `
  <p class="count">${rows.length} of ${R.board_size} protocols shown</p>
  <table class="board">
    <thead><tr>
      <th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>
      <th class="num"><button data-sort="tvl">TVL${arrow('tvl')}</button></th>
      <th class="num"><button data-sort="growth">7d${arrow('growth')}</button></th>
      <th class="num hide-s"><button data-sort="age">Age${arrow('age')}</button></th>
      <th class="num hide-s">Cat. x</th>
      <th class="num"><button data-sort="implied">Implied value${arrow('implied')}</button></th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** One protocol in full: its record, the model's arithmetic on it, and its farm plan. */
function detailHTML(r) {
  const cal = R.calibration.categories.find((c) => c.category === r.category);
  const base = Math.round(r.tvl_usd * r.category_multiple);
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
      <div class="cell"><b>${money(r.tvl_usd)}</b><span>TVL</span></div>
      <div class="cell"><b>${r.change_7d === null ? '—' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`}</b><span>TVL change, 7 days</span></div>
      <div class="cell"><b>${age(r.age_days)}</b><span>tracked with no token${r.listed_at ? ` (since ${esc(r.listed_at)})` : ''}</span></div>
      <div class="cell"><b>${esc(r.chains.join(', ') || '—')}</b><span>chains</span></div>
      <div class="cell"><b>${mult(r.category_multiple)}</b><span>category multiple</span></div>
    </div>
    <div class="breakdown">
      <h3>How the model prices ${esc(r.name)}</h3>
      <div class="formula">${money(r.tvl_usd)} TVL x ${mult(r.category_multiple)} category x ${mult(r.growth_multiplier)} growth x ${mult(r.maturity_multiplier)} maturity = ${money(r.implied_value_usd)}</div>
      <p>${peers} The base at the category multiple alone is ${money(base)}; the 7-day growth multiplier
      (${mult(r.growth_multiplier)}) and the maturity multiplier (${mult(r.maturity_multiplier)}) move it to the implied value.
      This is the entry's own claim about a launch that has not happened, not a prediction that it will.</p>
    </div>
    <div class="plan">
      <h3>Farm plan</h3>
      <ol>${steps}</ol>
    </div>
  </div>`;
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
  Their market cap against TVL is the calibration the board above is priced from. Showing the top ${R.live_size} by market cap.</p>
  <table class="board">
    <thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Market cap</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
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
    main.innerHTML = headerHTML() + modelHTML() + controlsHTML() + liveHTML() + footerHTML();
  } else {
    main.innerHTML = headerHTML() + modelHTML() + controlsHTML() + boardHTML() + footerHTML();
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
  on('tab-board', 'click', () => {
    state.view = 'board';
    state.detail = null;
    history.replaceState(null, '', '#board');
    render();
  });
  on('tab-live', 'click', () => {
    state.view = 'live';
    state.detail = null;
    history.replaceState(null, '', '#live');
    render();
  });
  on('back', 'click', () => {
    state.detail = null;
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

/** Read the view out of the hash: #detail=<slug>, #live, #cat=<category>, #chain=<chain>. */
function applyHash() {
  const h = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(h.includes('=') ? h : '');
  state.detail = null;
  state.view = 'board';
  if (h === 'live') state.view = 'live';
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
