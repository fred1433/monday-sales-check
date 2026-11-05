// The page only displays what the API returns. Every figure, date and account comes from src/core.js on the server.
const BASE = location.pathname.replace(/[^/]*$/, '');
const API = BASE + 'api/';
const SAMPLE = 'mi-w44b';
const params = new URLSearchParams(location.search);
const ui = {
  role: params.get('role') === 'mi-sales' ? 'mi-sales' : 'leadership',
  extras: [],
  data: null,
  shown: 0,
  ohioTries: [],
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x) => (x === null || x === undefined ? null : `${x > 0 ? '+' : x < 0 ? '-' : ''}${Math.abs(x).toFixed(1)}%`);
const dow = (label) => label.slice(0, 3);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function url(path, extra = {}) {
  const q = new URLSearchParams({ role: ui.role, ...extra });
  if (ui.extras.length && !('files' in extra)) q.set('files', ui.extras.join(','));
  return `${API}${path}?${q}`;
}
async function call(path, extra) {
  const res = await fetch(url(path, extra), { cache: 'no-store' });
  const type = res.headers.get('Content-Type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function refresh() {
  const r = await call('state');
  if (!r.ok) { $('verdict-word').textContent = 'The figure could not be loaded.'; return; }
  ui.data = r.body;
  render();
}

function render() {
  const d = ui.data;
  document.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === d.role.id)));
  const mi = d.markets.find((m) => m.code === 'MI');
  renderFocus(mi.focus);
  renderReceipt(d.imports, mi.focus);
  renderAccounts(mi.focus);
  renderAside(mi);
  renderQuestions(d.answers.filter((a) => a.market === 'MI'), 'questions', 'answer');
  renderOhio(d);
  renderCoverage(d);
}

function renderFocus(f) {
  $('product').textContent = `${f.label}. Partner sell-in, week of Oct 26 to Nov 1, 2026.`;
  const ready = f.status === 'ready';
  const fig = document.querySelector('.figure');
  fig.classList.toggle('is-pending', !ready);
  animateCount(f.qty);
  const last = f.covered.length ? f.byDay.find((x) => x.date === f.covered[f.covered.length - 1]).label : '';
  $('count-cap').textContent = ready ? `${f.units}, full week` : `${f.units} through ${last}`;
  if (f.status === 'pending') {
    const miss = f.byDay.filter((x) => !x.covered);
    const span = miss.length > 1 ? `${dow(miss[0].label)}-${dow(miss[miss.length - 1].label)}` : dow(miss[0].label);
    $('verdict-word').textContent = 'Not yet.';
    $('verdict-status').textContent = `Weekly change pending · ${span} missing`;
    $('verdict-why').textContent = `${f.covered.length} of 7 days are in. Last week closed at ${n(f.prevQty)} ${f.units}, and a change now would compare part of a week with a whole one.`;
  } else if (f.status === 'provisional') {
    $('verdict-word').textContent = 'Not yet.';
    $('verdict-status').textContent = 'Weekly change provisional: a partner line has no format';
    $('verdict-why').textContent = 'Every day is in, but one line could still change the total.';
  } else {
    $('verdict-word').textContent = 'Yes.';
    $('verdict-status').textContent = `The week is closed: ${n(f.qty)} ${f.units}, ${pct(f.changePct)} on last week's ${n(f.prevQty)}.`;
    $('verdict-why').textContent = `Every day from ${f.byDay[0].label} to ${f.byDay[6].label} is declared by a partner file.`;
  }
  const btn = $('load');
  const loaded = ui.extras.includes(SAMPLE);
  btn.textContent = loaded ? 'Load the same file again' : 'Load sample partner file';
  btn.classList.toggle('again', loaded);
  renderRail(f);
}

function animateCount(to) {
  const el = $('count'); const from = ui.shown;
  ui.shown = to;
  if (reduce || from === to || from === 0) { el.textContent = n(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700); const e = 1 - Math.pow(1 - k, 3);
    el.textContent = n(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderRail(f, rail = $('rail'), row = $('files-row')) {
  const max = Math.ceil((Math.max(f.prevQty, f.qty, 1) * 1.12) / 100) * 100;
  const P = (x) => `${(x / max) * 100}%`;
  if (!rail.dataset.built) {
    rail.innerHTML = f.byDay.map((_, i) => `<div class="seg" data-i="${i}"><div class="seg-in"><span class="seg-day"></span><span class="seg-qty"></span></div></div>`).join('')
      + '<div class="gap"><span></span></div><div class="mark"><span></span></div>';
    rail.dataset.built = '1';
  }
  let cum = 0;
  const freshNames = (ui.data.imports || []).map((i) => i.name);
  const isFresh = (day) => day.declaredBy.some((x) => freshNames.includes(x));
  f.byDay.forEach((day, i) => {
    const seg = rail.querySelector(`.seg[data-i="${i}"]`);
    const w = day.covered ? Math.max(day.qty, 0) : 0;
    seg.style.left = P(cum); seg.style.width = P(w);
    seg.classList.toggle('fresh', isFresh(day));
    const wide = (w / max) > 0.055;
    seg.querySelector('.seg-day').textContent = wide ? dow(day.label) : '';
    seg.querySelector('.seg-qty').textContent = wide ? n(day.qty) : '';
    cum += w;
  });
  const missing = f.byDay.filter((x) => !x.covered);
  const gap = rail.querySelector('.gap');
  if (missing.length) {
    gap.style.display = 'flex'; gap.style.left = P(cum); gap.style.right = '0';
    gap.querySelector('span').textContent = `${missing.map((x) => dow(x.label)).join(', ')} not in any partner file yet`;
  } else gap.style.display = 'none';
  const mark = rail.querySelector('.mark');
  mark.style.left = P(f.prevQty);
  mark.classList.toggle('flip', f.prevQty / max > 0.7);
  mark.querySelector('span').textContent = `Last week closed at ${n(f.prevQty)}`;
  rail.dataset.missing = missing.map((x) => x.date).join(',');
  rail.setAttribute('aria-label', `${n(f.qty)} ${f.units} counted across ${f.covered.length} of 7 days, against ${n(f.prevQty)} last week.`);
  // Brackets under the rail: which partner file declares which days.
  const groups = []; let at = 0;
  f.byDay.forEach((day) => {
    const w = day.covered ? Math.max(day.qty, 0) : 0;
    const name = day.declaredBy[day.declaredBy.length - 1];
    if (name) {
      const g = groups[groups.length - 1];
      if (g && g.name === name) { g.w += w; g.last = day; } else groups.push({ name, start: at, w, first: day, last: day, fresh: isFresh(day) });
    }
    at += w;
  });
  row.innerHTML = groups.map((g, i) => `<div class="bracket${g.fresh ? ' fresh' : ''}${(g.start + g.w) / max > 0.62 ? ' end' : ''}" style="left:${P(g.start)};width:${P(g.w)}"><span>${esc(g.name)}, ${esc(dow(g.first.label))} to ${esc(dow(g.last.label))}</span></div>`).join('');
}

function rowLink(r, text) {
  return `<button type="button" class="linkish" data-row="${esc(r.file)}|${esc(r.tab)}|${esc(r.row)}">${esc(text)}</button>`;
}

function renderReceipt(imports, f) {
  const box = $('receipt');
  if (!imports.length) { box.hidden = true; return; }
  const last = imports[imports.length - 1];
  box.hidden = false;
  if (last.already) {
    box.innerHTML = `<p>Loaded again: ${esc(last.name)} was already imported, so nothing changed. Still ${n(f.qty)} ${esc(f.units)}.</p>`;
    return;
  }
  const items = [
    ...last.duplicates.map((d) => `<li>${rowLink(d, `Row ${d.row}`)}: invoice ${esc(d.doc)} was already in an earlier file, skipped.</li>`),
    ...last.rejected.map((r) => `<li>${rowLink(r, `Row ${r.row}`)}: “${esc(r.item)}” set aside. ${esc(r.reason)}.</li>`),
  ];
  const pl = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  box.innerHTML = `<p>Added ${esc(last.name)}: ${pl(last.rowsRead, 'row', 'rows')} read. ${last.counted} counted, ${pl(last.credits, 'credit note', 'credit notes')} netted, ${pl(last.duplicates.length, 're-sent invoice', 're-sent invoices')} skipped, ${pl(last.rejected.length, 'row', 'rows')} set aside.</p><ul>${items.join('')}</ul>`;
}

function renderAccounts(f) {
  const ready = f.status === 'ready';
  $('acct-rows').innerHTML = f.accounts.map((a) => {
    const c = ready ? pct(a.changePct) : 'pending';
    const cls = ready ? (a.changePct < 0 ? 'down' : 'up') : 'muted';
    return `<tr><td><button type="button" class="acct-btn" data-account="${esc(a.code)}">${esc(a.code)}</button></td><td class="num">${n(a.qty)}</td><td class="num">${n(a.prevQty)}</td><td class="num ${cls}">${c}</td></tr>`;
  }).join('') + `<tr class="total"><td style="padding:11px 0;font-weight:700">All accounts</td><td class="num"><strong>${n(f.qty)}</strong></td><td class="num"><strong>${n(f.prevQty)}</strong></td><td class="num ${ready ? 'up' : 'muted'}"><strong>${ready ? pct(f.changePct) : 'pending'}</strong></td></tr>`;
}

function renderAside(m) {
  $('products').innerHTML = m.products.filter((p) => p.sku !== m.focus.sku).map((p) =>
    `<li>${esc(p.label)}: ${n(p.qty)} ${esc(p.units)}${p.status === 'ready' ? ', week closed' : ' so far'}</li>`).join('');
  const tills = m.tills.map((t) => {
    const held = t.held.map((h) => `${rowLink(h, `1 line held: “${h.item}”`)}, no format, so it waits for a person.`).join(' ');
    return `<li>Till export from retailer ${esc(t.account)}: ${n(t.qty)} five-packs sold to shoppers this week. This is sell-through: shown here, never added to the partner figure. ${held} ${t.dropped.length ? `${esc(t.dropped.join(' and '))} were dropped before storage.` : ''}</li>`;
  });
  const md = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const panels = m.panels.map((p) => `<li>Market panel extract: about ${n(p.units)} units estimated for ${esc(p.segment.toLowerCase())}, ${md(p.period.start)} to ${md(p.period.end)}. A market-level projection, never added to accounts.</li>`);
  $('apart').innerHTML = [...tills, ...panels].join('');
}

function renderQuestions(list, qId, aId) {
  const avail = list.filter((a) => a.available);
  $(qId).innerHTML = avail.map((a) => `<button type="button" class="q-btn" data-answer="${esc(a.id)}" data-target="${aId}">${esc(a.question)}</button>`).join('');
  $(aId).innerHTML = '';
}

async function showAnswer(id, target) {
  const box = $(target);
  box.innerHTML = '<p class="muted">Opening the prepared answer.</p>';
  const r = await call(`answer/${id}`);
  if (!r.ok) { box.innerHTML = `<div class="refusal"><p><span class="badge-no">Refused by the server (${r.status}).</span> ${esc(r.body.message)}</p></div>`; return; }
  const a = r.body;
  box.innerHTML = `<div class="answer"><p class="answer-label">${esc(a.label)}</p>${a.sentences.map((s) => `<div class="answer-g"><p class="answer-s">${esc(s.text)}</p>${s.evidence.length ? `<div class="ev">${s.evidence.map((e) => `<button type="button" data-row="${esc(e.file)}|${esc(e.tab)}|${esc(e.row)}">${esc(e.name)}, ${esc(e.tab)}, row ${esc(e.row)}</button>`).join('')}</div>` : ''}</div>`).join('')}${a.notes.map((x) => `<p class="answer-note">${esc(x)}</p>`).join('')}<p class="basis">How it was counted: ${esc(a.basis)}</p></div>`;
}

function renderOhio(d) {
  const oh = d.markets.find((m) => m.code === 'OH');
  const body = $('ohio-body');
  if (oh) {
    const f = oh.focus;
    body.innerHTML = `<p class="aside">Leadership sees every market. The Michigan sales role sees only Michigan, and the server enforces it on every request, not just on screen.</p>
    <div class="ohio-grid"><div>
      <p class="ohio-fig">${n(f.qty)}</p><p class="ohio-cap">${esc(f.units)}, same product, Ohio partner file. The week is closed, ${pct(f.changePct)} on last week's ${n(f.prevQty)}.</p>
      <div class="rail-wrap small"><div class="rail" id="oh-rail" role="img" aria-label="Ohio week, every day declared"></div><div class="files-row" id="oh-files"></div></div>
      <ul class="plain">${f.accounts.map((a) => `<li><button type="button" class="linkish" data-account="${esc(a.code)}">${esc(a.code)}</button>: ${n(a.qty)} ${esc(f.units)}, last week ${n(a.prevQty)}</li>`).join('')}</ul>
    </div><div>
      <div id="oh-questions"></div><div id="oh-answer" aria-live="polite"></div>
      <p class="aside" style="margin-top:22px">Now switch to Michigan sales and try to open any of this.</p>
      <button type="button" class="try" data-switch="mi-sales">View as Michigan sales</button>
    </div></div>`;
    renderQuestions(d.answers.filter((a) => a.market === 'OH'), 'oh-questions', 'oh-answer');
    renderRail(f, $('oh-rail'), $('oh-files'));
    return;
  }
  const tries = [
    { key: 'account', label: 'Open account OH-005', path: 'account/OH-005' },
    { key: 'answer', label: 'Ask how Ohio closed the week', path: 'answer/ohio-close' },
    { key: 'export', label: 'Export Ohio rows', path: 'export.csv', extra: { market: 'OH' } },
  ];
  body.innerHTML = `<div class="refusal"><p><strong>Ohio is outside the Michigan sales role.</strong> For this session the server never reads an Ohio file, so the page has nothing to hide: there is no Ohio data in it.</p></div>
  <div class="tries">${tries.map((t) => `<button type="button" class="try" data-try="${t.key}">${esc(t.label)}</button>`).join('')}</div>
  <ul class="try-out" id="try-out" aria-live="polite">${ui.ohioTries.join('')}</ul>
  <p class="aside" style="margin-top:18px"><button type="button" class="linkish" data-switch="leadership">Back to Leadership</button></p>`;
  body.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', async () => {
    const t = tries.find((x) => x.key === b.dataset.try);
    const r = await call(t.path, t.extra || {});
    const raw = url(t.path, t.extra || {});
    const line = r.ok ? `<li>${esc(t.label)}: unexpected answer ${r.status}.</li>`
      : `<li>${esc(t.label)}: <span class="badge-no">refused by the server (${r.status})</span>. ${esc(r.body.message)} <a href="${esc(raw)}" target="_blank" rel="noopener">Open the raw request</a></li>`;
    ui.ohioTries.unshift(line);
    $('try-out').innerHTML = ui.ohioTries.join('');
  }));
}

function renderCoverage(d) {
  $('tool-for').textContent = `Showing the sources the ${d.role.label} role can read`;
  const kind = { 'sell-in': 'Partner sell-in', 'sell-through': 'Till sell-through', panel: 'Market panel' };
  const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
  $('cov-rows').innerHTML = d.coverage.map((c) => `<tr>
    <td data-l="Source">${esc(c.label)}</td><td data-l="Kind">${kind[c.kind]}</td>
    <td data-l="Covers through">${day(c.through)}</td><td data-l="Expected">${day(c.expected)}${c.lagNote ? `<br><span class="muted">${esc(c.lagNote)}</span>` : ''}</td>
    <td data-l="Status">${c.status === 'late' ? `<span class="late">${c.daysBehind} days late</span>` : 'On time'}</td></tr>`).join('');
}

// ---------- Drawer ----------
const drawer = $('drawer');
function openDrawer(html) {
  $('drawer-body').innerHTML = html;
  if (!drawer.open) drawer.showModal();
}
drawer.addEventListener('close', () => { ui.fromAccount = null; if (location.hash) history.replaceState(null, '', location.pathname + location.search); });
$('drawer-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); });

async function openAccount(code) {
  history.replaceState(null, '', `${location.pathname}${location.search}#account=${encodeURIComponent(code)}`);
  openDrawer('<p class="muted">Opening the account.</p>');
  const r = await call(`account/${encodeURIComponent(code)}`);
  if (!r.ok) {
    openDrawer(`<h2 class="d-title" id="drawer-title">${esc(code)}</h2><div class="refusal"><p><span class="badge-no">Refused by the server (${r.status}).</span> ${esc(r.body.message)}</p></div><p class="dropnote">Viewing as ${esc(ui.data.role.label)}. The request went to the server with this role and came back empty.</p>`);
    return;
  }
  const a = r.body;
  const line = (x) => `<li><span>${esc(x.dateLabel)}</span><span>${rowLink(x, `${x.doc}, ${x.tab} row ${x.row}`)}<br><span class="muted">${esc(x.name)}</span></span><span class="q">${x.qty > 0 ? '' : '-'}${n(Math.abs(x.qty))}</span></li>`;
  const cur = a.rows.filter((x) => x.week === 'this'); const prev = a.rows.filter((x) => x.week === 'prev');
  openDrawer(`<h2 class="d-title" id="drawer-title">${esc(a.code)}</h2>
    <p class="d-sub">${esc(a.marketName)}, ${esc(a.label)}. This week ${n(a.qty)}${a.status === 'ready' ? '' : ' so far'}, last week ${n(a.prevQty)}. Select a row to open it in its file.</p>
    <h3>This week</h3><ul class="rows">${cur.map(line).join('') || '<li><span></span><span class="muted">No rows yet</span><span></span></li>'}</ul>
    ${a.skipped.length ? `<h3>Skipped</h3><ul class="rows">${a.skipped.map((s) => `<li><span>Re-sent</span><span>${rowLink(s, `${s.doc}, ${s.tab} row ${s.row}`)}<br><span class="muted">Already counted from ${esc(s.first.name)}, row ${esc(s.first.row)}</span></span><span class="q">0</span></li>`).join('')}</ul>` : ''}
    <h3>Last week</h3><ul class="rows">${prev.map(line).join('')}</ul>`);
}

const COLS = 'ABCDEFGHIJ';
async function openRow(file, tab, row) {
  openDrawer('<p class="muted">Opening the file.</p>');
  const r = await call('row', { file, tab, row });
  if (!r.ok) { openDrawer(`<div class="refusal"><p><span class="badge-no">Refused by the server (${r.status}).</span> ${esc(r.body.message)}</p></div>`); return; }
  const x = r.body;
  const width = Math.max(x.cells.length, x.header ? x.header.cells.length : 0, 1);
  const cells = (arr) => Array.from({ length: width }, (_, i) => `<td>${esc(arr[i] ?? '')}</td>`).join('');
  let rows = '';
  if (x.header) {
    rows += `<tr class="hdr"><th class="rn" scope="row">${x.header.row}</th>${cells(x.header.cells)}</tr>`;
    if (x.row > x.header.row + 1) rows += `<tr><th class="rn" scope="row">...</th>${cells([])}</tr>`;
  }
  rows += `<tr class="hit"><th class="rn" scope="row">${x.row}</th>${cells(x.cells)}</tr>`;
  const kinds = { 'sell-in': 'Partner sell-in file', 'sell-through': 'Retailer till export', panel: 'Market panel extract' };
  const back = ui.fromAccount ? `<p class="dropnote"><button type="button" class="linkish" data-account="${esc(ui.fromAccount)}">Back to ${esc(ui.fromAccount)}</button></p>` : '';
  openDrawer(`<h2 class="d-title" id="drawer-title">${esc(x.name)}</h2>
    <p class="d-sub">${kinds[x.kind]}. Tab ${esc(x.tab)}, row ${x.row}. Fictional sample file.</p>
    <div class="sheet"><table><thead><tr><th></th>${Array.from({ length: width }, (_, i) => `<th scope="col">${COLS[i]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="tabs">${x.tabs.map((t) => `<span class="${t === x.tab ? 'on' : ''}">${esc(t)}</span>`).join('')}</div></div>
    <p class="outcome">${esc(x.outcome)}</p>
    ${x.dropped && x.dropped.length ? `<p class="dropnote">${esc(x.dropped.join(' and '))} were dropped when this export was read, so they were never stored and cannot be shown.</p>` : ''}${back}`);
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.account) { ui.fromAccount = null; openAccount(t.dataset.account); }
  else if (t.dataset.row) {
    const [f, tab, row] = t.dataset.row.split('|');
    ui.fromAccount = t.closest('#drawer') && location.hash.startsWith('#account=') ? decodeURIComponent(location.hash.slice(9)) : null;
    openRow(f, tab, row);
  }
  else if (t.dataset.answer) showAnswer(t.dataset.answer, t.dataset.target);
  else if (t.dataset.role || t.dataset.switch) setRole(t.dataset.role || t.dataset.switch, Boolean(t.dataset.switch));
});
$('load').addEventListener('click', async () => {
  ui.extras.push(SAMPLE);
  await refresh();
});

async function setRole(role, scroll) {
  if (role === ui.role) return;
  ui.role = role; ui.ohioTries = [];
  if (drawer.open) drawer.close();
  const q = new URLSearchParams(location.search);
  if (role === 'leadership') q.delete('role'); else q.set('role', role);
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
  await refresh();
  if (scroll) $('ohio').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

(async () => {
  await refresh();
  const m = location.hash.match(/^#account=([A-Za-z0-9-]+)$/);
  if (m) openAccount(decodeURIComponent(m[1]).toUpperCase());
})();
