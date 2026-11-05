// The page only displays what the API returns. Every figure, date and account comes from src/core.js on the server.
import { createGate, isRoleRefusal } from './gate.js';

const BASE = location.pathname.replace(/[^/]*$/, '');
const API = BASE + 'api/';
const SAMPLE = 'mi-w44b';
const params = new URLSearchParams(location.search);
const gate = createGate();
const ui = {
  role: params.get('role') === 'mi-sales' ? 'mi-sales' : 'leadership',
  extras: [],
  data: null,
  shown: 0,
  ohioTries: [],
  openAnswer: { answer: null, 'oh-answer': null },
  fromAccount: null,
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x) => (x === null || x === undefined ? null : `${x > 0 ? '+' : x < 0 ? '-' : ''}${Math.abs(x).toFixed(1)}%`);
const dow = (label) => label.slice(0, 3);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const UNIT_LONG = { 'five-packs': 'five-packs shipped to retail accounts, net of credits' };

function url(path, extra = {}) {
  const q = new URLSearchParams({ role: ui.role, ...extra });
  if (ui.extras.length) q.set('files', ui.extras.join(','));
  return `${API}${path}?${q}`;
}
async function call(path, extra) {
  try {
    const res = await fetch(url(path, extra), { cache: 'no-store' });
    const type = res.headers.get('Content-Type') || '';
    const body = type.includes('json') ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { message: 'The server could not be reached.' } };
  }
}
function failure(r) {
  if (isRoleRefusal(r)) return `<div class="refusal"><p><span class="badge-no">Refused by the server (403).</span> ${esc(r.body.message)}</p></div>`;
  return `<div class="notice"><p>${esc((r.body && r.body.message) || 'The server could not answer.')} (${r.status})</p></div>`;
}

async function refresh() {
  const { fresh, value: r } = await gate.run('state', () => call('state'));
  if (!fresh) return;
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
  renderNext(mi.focus);
  renderAccounts(mi.focus);
  renderAside(mi);
  renderQuestions(d.answers.filter((a) => a.market === 'MI'), 'questions', 'answer');
  renderOhio(d);
  renderCoverage(d);
}

function renderFocus(f) {
  $('product').innerHTML = `${esc(f.label)}. Partner sell-in, week of Oct&nbsp;26 to Nov&nbsp;1,&nbsp;2026.`;
  const ready = f.status === 'ready';
  document.querySelector('.figure').classList.toggle('is-pending', !ready);
  animateCount(f.qty);
  const last = f.covered.length ? f.byDay.find((x) => x.date === f.covered[f.covered.length - 1]).label : '';
  const unit = UNIT_LONG[f.units] || f.units;
  $('count-cap').textContent = f.missing.length ? `${unit}, through ${last}` : `${unit}, full week`;
  $('verdict-issues').innerHTML = '';
  if (f.status === 'pending') {
    const miss = f.byDay.filter((x) => !x.covered);
    const span = miss.length > 1 ? `${dow(miss[0].label)}-${dow(miss[miss.length - 1].label)}` : dow(miss[0].label);
    $('verdict-word').textContent = 'Not yet.';
    $('verdict-status').textContent = `Weekly change pending · ${span} missing`;
    $('verdict-why').textContent = `${f.covered.length} of 7 days are in. Last week closed at ${n(f.prevQty)} ${f.units}, and a change now would compare part of a week with a whole one.`;
  } else if (f.status === 'provisional') {
    $('verdict-word').textContent = 'Not yet.';
    $('verdict-status').textContent = f.issueText;
    $('verdict-why').textContent = 'Every day is in, but the line below could still change the total, so the weekly change and the prepared answer wait.';
    $('verdict-issues').innerHTML = `<ul class="issues">${f.issues.map((i) => `<li>${rowLink(i, `${i.doc || 'Row'}, ${i.tab} row ${i.row}`)}: ${esc(i.reason)}${i.account ? ` (${esc(i.account)})` : ''}</li>`).join('')}</ul>`;
  } else {
    $('verdict-word').textContent = 'Yes.';
    $('verdict-status').textContent = `The week is closed: ${n(f.qty)} ${f.units}, ${pct(f.changePct)} on last week's ${n(f.prevQty)}.`;
    $('verdict-why').textContent = `Every day from ${f.byDay[0].label} to ${f.byDay[6].label} is declared by a partner file, and no partner line is left open.`;
  }
  const btn = $('load');
  const loaded = ui.extras.includes(SAMPLE);
  btn.textContent = loaded ? 'Load again' : 'Load sample partner file';
  btn.classList.toggle('again', loaded);
  renderRail(f, $('mi-rail'));
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

// Two readings: a volume bar against last week's mark, and seven equal day cells with the file that declares them.
const fileShort = (name) => {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${new Date(`${m[0]}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} file` : name;
};
function renderRail(f, box) {
  const freshNames = (ui.data.imports || []).map((i) => i.name);
  const groups = [];
  f.byDay.forEach((day, i) => {
    const name = day.declaredBy[day.declaredBy.length - 1] || null;
    const g = groups[groups.length - 1];
    if (g && g.name === name) { g.qty += day.covered ? day.qty : 0; g.to = i; } else groups.push({ name, qty: day.covered ? day.qty : 0, from: i, to: i, fresh: !!name && freshNames.includes(name) });
  });
  const files = groups.filter((g) => g.name);
  const max = Math.ceil((Math.max(f.prevQty, f.qty, 1) * 1.12) / 100) * 100;
  const P = (x) => `${(x / max) * 100}%`;
  if (!box.dataset.built) {
    box.innerHTML = `<div class="vol"><div class="vol-track">${[0, 1, 2].map((k) => `<div class="vol-seg" data-k="${k}"></div>`).join('')}</div><div class="mark"><span></span></div></div>
      <div class="days">${f.byDay.map((_, i) => `<div class="day" data-i="${i}"><span class="d"></span><span class="q"></span></div>`).join('')}</div>
      <div class="files-row"></div>`;
    box.dataset.built = '1';
  }
  let cum = 0;
  box.querySelectorAll('.vol-seg').forEach((seg, k) => {
    const g = files[k];
    const w = g ? Math.max(g.qty, 0) : 0;
    seg.style.left = P(cum); seg.style.width = P(w);
    seg.style.visibility = w > 0 ? 'visible' : 'hidden';
    seg.classList.toggle('fresh', !!g && g.fresh);
    seg.textContent = g && w / max > 0.08 ? n(g.qty) : '';
    cum += w;
  });
  const mark = box.querySelector('.mark');
  mark.style.left = P(f.prevQty);
  mark.classList.toggle('flip', f.prevQty / max > 0.6);
  mark.querySelector('span').innerHTML = `Last week closed at <strong>${n(f.prevQty)}</strong>`;
  f.byDay.forEach((day, i) => {
    const cell = box.querySelector(`.day[data-i="${i}"]`);
    const g = groups.find((x) => i >= x.from && i <= x.to);
    cell.className = `day ${day.covered ? 'covered' : 'missing'}${g && g.fresh ? ' fresh' : ''}`;
    cell.querySelector('.d').textContent = dow(day.label);
    cell.querySelector('.q').textContent = day.covered ? n(day.qty) : 'no file';
  });
  box.querySelector('.files-row').innerHTML = files.map((g) => `<div class="bracket${g.fresh ? ' fresh' : ''}" style="left:${(g.from / 7) * 100}%;width:${((g.to - g.from + 1) / 7) * 100}%"><span class="long">${esc(g.name)}</span><span class="short">${esc(fileShort(g.name))}</span></div>`).join('');
  box.setAttribute('aria-label', `${n(f.qty)} ${f.units} counted across ${f.covered.length} of 7 days, against ${n(f.prevQty)} last week.`);
}

function rowLink(r, text) {
  return `<button type="button" class="linkish" data-row="${esc(r.file)}|${esc(r.tab)}|${esc(r.row)}">${esc(text)}</button>`;
}

function renderReceipt(imports, f) {
  const box = $('receipt');
  const first = imports.find((x) => !x.already);
  if (!first) { box.hidden = true; return; }
  const again = imports.filter((x) => x.already).length;
  const pl = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const items = [
    ...first.duplicates.map((d) => `<li>${rowLink(d, `Row ${d.row}`)}: invoice ${esc(d.doc)} was already in an earlier file, skipped.</li>`),
    ...(first.replaced || []).map((d) => `<li>${rowLink(d, `Row ${d.row}`)}: invoice ${esc(d.doc)} re-sent with ${d.to} instead of ${d.from}; the correction replaces the earlier line.</li>`),
    ...first.rejected.map((r) => `<li>${rowLink(r, `Row ${r.row}`)}: “${esc(r.item)}” set aside. ${esc(r.reason)}.</li>`),
  ];
  box.hidden = false;
  box.innerHTML = `<p>Added ${esc(first.name)}: ${pl(first.rowsRead, 'row', 'rows')} read. ${first.counted} counted, ${pl(first.credits, 'credit note', 'credit notes')} netted, ${pl(first.duplicates.length, 're-sent invoice', 're-sent invoices')} skipped, ${pl(first.rejected.length, 'row', 'rows')} set aside.</p><ul>${items.join('')}</ul>${again ? `<p class="again-note">Loaded again ${again === 1 ? 'once' : `${again} times`}: the file was already imported, so nothing changed. Still ${n(f.qty)} ${esc(f.units)}.</p>` : ''}`;
}

function renderNext(f) {
  const box = $('next');
  if (!ui.extras.length) { box.innerHTML = ''; return; }
  const gain = f.status === 'ready' ? [...f.accounts].map((a) => ({ ...a, diff: a.qty - a.prevQty })).sort((a, b) => b.diff - a.diff)[0] : null;
  box.innerHTML = `${gain && gain.diff > 0 ? `<button type="button" class="next-btn" data-account="${esc(gain.code)}">See why ${esc(gain.code)} gained ${n(gain.diff)} ${esc(f.units)}</button>` : ''}
    <button type="button" class="next-btn" data-ohio-try="1">Try opening Ohio as Michigan sales</button>`;
}

function renderAccounts(f) {
  const ready = f.status === 'ready';
  const word = f.status === 'provisional' ? 'provisional' : 'pending';
  $('acct-rows').innerHTML = f.accounts.map((a) => {
    const c = ready ? pct(a.changePct) : word;
    const cls = ready ? (a.changePct < 0 ? 'down' : 'up') : 'muted';
    return `<tr><td><button type="button" class="acct-btn" data-account="${esc(a.code)}">${esc(a.code)}</button></td><td class="num">${n(a.qty)}</td><td class="num">${n(a.prevQty)}</td><td class="num ${cls}">${c}</td></tr>`;
  }).join('') + `<tr class="total"><td style="padding:11px 0;font-weight:700">All accounts</td><td class="num"><strong>${n(f.qty)}</strong></td><td class="num"><strong>${n(f.prevQty)}</strong></td><td class="num ${ready ? 'up' : 'muted'}"><strong>${ready ? pct(f.changePct) : word}</strong></td></tr>`;
}

function renderAside(m) {
  $('products').innerHTML = m.products.filter((p) => p.sku !== m.focus.sku).map((p) => {
    const issue = p.issues && p.issues.length ? ` ${p.issues.map((i) => rowLink(i, `${i.doc}, ${i.tab} row ${i.row}`)).join(' ')}: ${esc(p.issues[0].reason.toLowerCase())}, so this product stays provisional.` : '';
    return `<li>${esc(p.label)}: ${n(p.qty)} ${esc(p.units)}${p.status === 'ready' ? ', week closed.' : p.status === 'provisional' ? ' counted.' : ' so far.'}${issue}</li>`;
  }).join('');
  const tills = m.tills.map((t) => {
    const held = t.held.map((h) => `${rowLink(h, `1 line held: “${h.item}”`)}, no format, so it waits for a person.`).join(' ');
    return `<li>POS export from retailer ${esc(t.account)}: ${n(t.qty)} five-packs sold to shoppers this week. This is sell-through: shown here, never added to the partner figure. ${held} ${t.dropped.length ? 'Customer phone and loyalty ID are excluded from the reporting data.' : ''}</li>`;
  });
  const md = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const panels = m.panels.map((p) => `<li>Market panel extract: about ${n(p.units)} units estimated for ${esc(p.segment.toLowerCase())}, ${md(p.period.start)} to ${md(p.period.end)}. A market-level projection, never added to accounts.</li>`);
  $('apart').innerHTML = [...tills, ...panels].join('');
}

function renderQuestions(list, qId, aId) {
  const avail = list.filter((a) => a.available);
  $(qId).innerHTML = avail.map((a) => `<button type="button" class="q-btn" data-answer="${esc(a.id)}" data-target="${aId}">${esc(a.question)}</button>`).join('');
  const open = ui.openAnswer[aId];
  if (open && avail.some((a) => a.id === open)) showAnswer(open, aId, true);
  else { ui.openAnswer[aId] = null; $(aId).innerHTML = ''; }
}

async function showAnswer(id, target, quiet) {
  const box = $(target);
  ui.openAnswer[target] = id;
  if (!quiet) box.innerHTML = '<p class="muted">Opening the prepared answer.</p>';
  const { fresh, value: r } = await gate.run(`answer-${target}`, () => call(`answer/${id}`));
  if (!fresh || !$(target)) return;
  if (!r.ok) { $(target).innerHTML = failure(r); return; }
  const a = r.body;
  $(target).innerHTML = `<div class="answer"><p class="answer-label">${esc(a.label)}</p>${a.sentences.map((s) => `<div class="answer-g"><p class="answer-s">${esc(s.text)}</p>${s.evidence.length ? `<div class="ev">${s.evidence.map((e) => `<button type="button" data-row="${esc(e.file)}|${esc(e.tab)}|${esc(e.row)}">${esc(e.name)}, ${esc(e.tab)}, row ${esc(e.row)}</button>`).join('')}</div>` : ''}</div>`).join('')}${a.notes.map((x) => `<p class="answer-note">${esc(x)}</p>`).join('')}<p class="basis">How it was counted: ${esc(a.basis)}</p></div>`;
}

const TRIES = [
  { key: 'account', label: 'Open account OH-005', path: 'account/OH-005' },
  { key: 'answer', label: 'Ask how Ohio closed the week', path: 'answer/ohio-close' },
  { key: 'row', label: 'Open an Ohio file row', path: 'row', extra: { file: 'oh-w44', tab: 'Sales', row: '5' } },
  { key: 'export', label: 'Export Ohio rows', path: 'export.csv', extra: { market: 'OH' } },
];
async function runTry(key) {
  const t = TRIES.find((x) => x.key === key);
  const { fresh, value: r } = await gate.run(`try-${key}`, () => call(t.path, t.extra || {}));
  if (!fresh) return;
  const raw = url(t.path, t.extra || {});
  const line = r.ok ? `<li>${esc(t.label)}: the server answered ${r.status}.</li>`
    : isRoleRefusal(r) ? `<li>${esc(t.label)}: <span class="badge-no">refused by the server (403)</span>. ${esc(r.body.message)} <a href="${esc(raw)}" target="_blank" rel="noopener">Open the raw request</a></li>`
      : `<li>${esc(t.label)}: ${esc(r.body.message || 'no answer')} (${r.status}).</li>`;
  ui.ohioTries.unshift(line);
  if ($('try-out')) $('try-out').innerHTML = ui.ohioTries.join('');
}

function renderOhio(d) {
  const oh = d.markets.find((m) => m.code === 'OH');
  const body = $('ohio-body');
  if (oh) {
    const f = oh.focus;
    body.innerHTML = `<p class="aside">Leadership sees every market. For the Michigan sales role the server reads no Ohio file at all, whatever the page asks for.</p>
    <div class="ohio-grid"><div>
      <p class="ohio-fig">${n(f.qty)}</p><p class="ohio-cap">${esc(UNIT_LONG[f.units] || f.units)}, same product, Ohio partner file. The week is closed, ${pct(f.changePct)} on last week's ${n(f.prevQty)}.</p>
      <div class="rail-wrap small" id="oh-rail" role="img"></div>
      <ul class="plain">${f.accounts.map((a) => `<li><button type="button" class="linkish" data-account="${esc(a.code)}">${esc(a.code)}</button>: ${n(a.qty)} ${esc(f.units)}, last week ${n(a.prevQty)}</li>`).join('')}</ul>
    </div><div>
      <div id="oh-questions"></div><div id="oh-answer" aria-live="polite"></div>
      <p class="aside" style="margin-top:22px">Now switch to Michigan sales and try to open any of this.</p>
      <button type="button" class="try" data-switch="mi-sales">View as Michigan sales</button>
    </div></div>`;
    renderQuestions(d.answers.filter((a) => a.market === 'OH'), 'oh-questions', 'oh-answer');
    renderRail(f, $('oh-rail'));
    return;
  }
  body.innerHTML = `<div class="refusal"><p><strong>Ohio is outside the Michigan sales role.</strong> For this session the server never reads an Ohio file, so the page has nothing to hide: there is no Ohio data in it.</p>
    <p class="role-why">Here the role travels in the request because sign-in is simulated. At Rove it would come from the Workspace identity, never from the URL.</p></div>
  <div class="tries">${TRIES.map((t) => `<button type="button" class="try" data-try="${t.key}">${esc(t.label)}</button>`).join('')}</div>
  <ul class="try-out" id="try-out" aria-live="polite">${ui.ohioTries.join('')}</ul>
  <p class="aside" style="margin-top:18px"><button type="button" class="linkish" data-switch="leadership">Back to Leadership</button></p>`;
}

function renderCoverage(d) {
  $('tool-for').textContent = `Showing the sources the ${d.role.label} role can read`;
  const kind = { 'sell-in': 'Partner sell-in', 'sell-through': 'POS sell-through', panel: 'Market panel' };
  const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
  $('cov-rows').innerHTML = d.coverage.map((c) => `<tr>
    <td data-l="Source">${esc(c.label)}</td><td data-l="Kind">${kind[c.kind]}</td>
    <td data-l="Covers through">${day(c.through)}</td><td data-l="Needed for Monday">${day(c.expected)}${c.lagNote ? `<br><span class="muted">${esc(c.lagNote)}</span>` : ''}</td>
    <td data-l="Status">${c.status === 'missing' ? `<span class="late">${esc(c.statusText)}</span>` : esc(c.statusText)}</td></tr>`).join('');
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
  const { fresh, value: r } = await gate.run('drawer', () => call(`account/${encodeURIComponent(code)}`));
  if (!fresh) return;
  if (!r.ok) {
    openDrawer(`<h2 class="d-title" id="drawer-title">${esc(code)}</h2>${failure(r)}${isRoleRefusal(r) ? `<p class="dropnote">Viewing as ${esc(ui.data.role.label)}. The request went to the server with this role and came back empty.</p>` : ''}`);
    return;
  }
  const a = r.body;
  const line = (x) => `<li><span>${esc(x.dateLabel)}</span><span>${rowLink(x, `${x.doc}, ${x.tab} row ${x.row}`)}<br><span class="muted">${esc(x.name)}</span></span><span class="q">${x.qty > 0 ? '' : '-'}${n(Math.abs(x.qty))}</span></li>`;
  const cur = a.rows.filter((x) => x.week === 'this'); const prev = a.rows.filter((x) => x.week === 'prev');
  openDrawer(`<h2 class="d-title" id="drawer-title">${esc(a.code)}</h2>
    <p class="d-sub">${esc(a.marketName)}, ${esc(a.label)}. This week ${n(a.qty)} ${esc(a.units)}${a.status === 'ready' ? '' : ' so far'}, last week ${n(a.prevQty)}. Select a row to open it in its file.</p>
    <h3>This week</h3><ul class="rows">${cur.map(line).join('') || '<li><span></span><span class="muted">No rows yet</span><span></span></li>'}</ul>
    ${a.skipped.length ? `<h3>Skipped</h3><ul class="rows">${a.skipped.map((s) => `<li><span>Re-sent</span><span>${rowLink(s, `${s.doc}, ${s.tab} row ${s.row}`)}<br><span class="muted">Already counted from ${esc(s.first.name)}, row ${esc(s.first.row)}</span></span><span class="q">0</span></li>`).join('')}</ul>` : ''}
    ${a.replaced && a.replaced.length ? `<h3>Corrected</h3><ul class="rows">${a.replaced.map((s) => `<li><span>Re-sent</span><span>${rowLink(s, `${s.doc}, ${s.tab} row ${s.row}`)}<br><span class="muted">Replaces ${esc(s.first.name)}, row ${esc(s.first.row)}: ${s.from} became ${s.to}</span></span><span class="q">${n(s.to)}</span></li>`).join('')}</ul>` : ''}
    <h3>Last week</h3><ul class="rows">${prev.map(line).join('')}</ul>`);
}

const COLS = 'ABCDEFGHIJ';
async function openRow(file, tab, row) {
  openDrawer('<p class="muted">Opening the file.</p>');
  const { fresh, value: r } = await gate.run('drawer', () => call('row', { file, tab, row }));
  if (!fresh) return;
  if (!r.ok) { openDrawer(failure(r)); return; }
  const x = r.body;
  const width = Math.max(x.cells.length, x.header ? x.header.cells.length : 0, 1);
  const cells = (arr) => Array.from({ length: width }, (_, i) => `<td>${esc(arr[i] ?? '')}</td>`).join('');
  let rows = '';
  if (x.header) {
    rows += `<tr class="hdr"><th class="rn" scope="row">${x.header.row}</th>${cells(x.header.cells)}</tr>`;
    if (x.row > x.header.row + 1) rows += `<tr><th class="rn" scope="row">...</th>${cells([])}</tr>`;
  }
  rows += `<tr class="hit"><th class="rn" scope="row">${x.row}</th>${cells(x.cells)}</tr>`;
  const kinds = { 'sell-in': 'Partner sell-in file', 'sell-through': 'Retailer POS export', panel: 'Market panel extract' };
  const back = ui.fromAccount ? `<p class="dropnote"><button type="button" class="linkish" data-account="${esc(ui.fromAccount)}">Back to ${esc(ui.fromAccount)}</button></p>` : '';
  openDrawer(`<h2 class="d-title" id="drawer-title">${esc(x.name)}</h2>
    <p class="d-sub">${kinds[x.kind]}. Tab ${esc(x.tab)}, row ${x.row}. Fictional sample file.</p>
    <div class="sheet"><table><thead><tr><th></th>${Array.from({ length: width }, (_, i) => `<th scope="col">${COLS[i]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="tabs">${x.tabs.map((t) => `<span class="${t === x.tab ? 'on' : ''}">${esc(t)}</span>`).join('')}</div></div>
    <p class="outcome">${esc(x.outcome)}</p>
    ${x.dropped && x.dropped.length ? '<p class="dropnote">Customer phone and loyalty ID are excluded from the reporting data, so they are not shown here.</p>' : ''}${back}`);
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
  } else if (t.dataset.answer) showAnswer(t.dataset.answer, t.dataset.target);
  else if (t.dataset.try) runTry(t.dataset.try);
  else if (t.dataset.ohioTry) tryOhio();
  else if (t.dataset.role || t.dataset.switch) setRole(t.dataset.role || t.dataset.switch, Boolean(t.dataset.switch));
});
$('load').addEventListener('click', async () => {
  ui.extras.push(SAMPLE);
  await refresh();
});

async function tryOhio() {
  if (ui.role !== 'mi-sales') await setRole('mi-sales', false);
  $('ohio').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  await runTry('account');
}

async function setRole(role, scroll) {
  if (role === ui.role) return;
  gate.switchRole();
  ui.role = role; ui.ohioTries = [];
  ui.openAnswer = { answer: null, 'oh-answer': null };
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
