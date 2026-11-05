// Pipeline, permissions and prepared answers for the Monday sales check.
// Everything here is deterministic and covered by tests/core.test.js.
import { FILES, ANSWERS } from './data.js';

export const REVIEW = {
  date: '2026-11-02',
  week: { start: '2026-10-26', end: '2026-11-01' },
  prev: { start: '2026-10-19', end: '2026-10-25' },
};
export const MARKETS = { MI: 'Michigan', OH: 'Ohio' };
export const ROLES = {
  leadership: { id: 'leadership', label: 'Leadership', markets: ['MI', 'OH'] },
  'mi-sales': { id: 'mi-sales', label: 'Michigan sales', markets: ['MI'] },
};
export const BASE_FILES = ['mi-w43', 'mi-w44a', 'mi-pos-022', 'mi-panel', 'oh-w43', 'oh-w44'];
export const SAMPLE_FILE = 'mi-w44b';
export const FOCUS_SKU = 'ice-packs/acapulco-gold/2.5g-5-pack';

// Public catalog entries (rovebrand.com, read 2026-11-05). Matching uses line + strain + format, never strain alone.
export const CATALOG = [
  { sku: FOCUS_SKU, line: 'Ice Packs', strain: 'Acapulco Gold', format: '2.5g 5-Pack', shape: 'fivepack', units: 'five-packs', uoms: ['BX', 'BOX', 'BOXES', 'BXS'] },
  { sku: 'ice-packs-blunts/acapulco-gold/2g-blunt', line: 'Ice Packs Blunts', strain: 'Acapulco Gold', format: '2g Blunt', shape: 'blunt', units: 'blunts', uoms: ['EA', 'EACH'] },
  { sku: 'ice-packs/apple-fritter/2.5g-5-pack', line: 'Ice Packs', strain: 'Apple Fritter', format: '2.5g 5-Pack', shape: 'fivepack', units: 'five-packs', uoms: ['BX', 'BOX', 'BOXES', 'BXS'] },
];
const BY_SKU = Object.fromEntries(CATALOG.map((c) => [c.sku, c]));
export const skuLabel = (sku) => { const c = BY_SKU[sku]; return `${c.line}, ${c.strain}, ${c.format}`; };
const STRAINS = [
  { name: 'Acapulco Gold', re: /\bACAP(?:ULCO)?\s+G(?:OLD|LD)\b/ },
  { name: 'Apple Fritter', re: /\bAPPLE\s+FRITTER\b|\bAPL\s+FRTR\b/ },
];
const FIVEPACK = [/\b2\.5\s?G\b/, /\b5\s?PK\b/, /\b5\s?PACK\b/, /\(5\)/];
const BLUNT = [/\bBLUNTS?\b/, /(^|[^.\d])2\s?G\b/];
const PARTNER_SKUS = {
  'RV-IP-AG-5': FOCUS_SKU,
  'RV-IPB-AG-2': 'ice-packs-blunts/acapulco-gold/2g-blunt',
  'RV-IP-AF-5': 'ice-packs/apple-fritter/2.5g-5-pack',
};

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const forbidden = () => new HttpError(403, 'outside_role', 'This is outside your role. No rows were returned.');

export function matchProduct(item, partnerSku) {
  const code = String(partnerSku || '').trim().toUpperCase();
  if (PARTNER_SKUS[code]) return { status: 'matched', sku: PARTNER_SKUS[code], by: 'partner SKU' };
  const t = String(item || '').toUpperCase().replace(/[^A-Z0-9.()]+/g, ' ').replace(/\s+/g, ' ').trim();
  const strain = STRAINS.find((s) => s.re.test(t));
  if (!strain) return { status: 'rejected', reason: 'Not a catalog product' };
  const five = FIVEPACK.some((r) => r.test(t));
  const blunt = BLUNT.some((r) => r.test(t));
  if (five && blunt) return { status: 'held', strain: strain.name, reason: 'Two formats in one line' };
  if (!five && !blunt) return { status: 'held', strain: strain.name, reason: 'No format, so it could be either product' };
  const hit = CATALOG.find((c) => c.strain === strain.name && c.shape === (five ? 'fivepack' : 'blunt'));
  if (!hit) return { status: 'rejected', reason: 'Format not in the catalog for this strain' };
  return { status: 'matched', sku: hit.sku, by: 'name and format' };
}

export function parseQty(v) {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (!t) return { error: 'Missing quantity' };
  const m = t.match(/^-?\d+(\.\d+)?$/);
  if (!m) return { error: 'Quantity is not a number' };
  const n = Number(t);
  if (!Number.isInteger(n)) return { error: 'Quantity is not a whole number' };
  return { qty: n };
}

export function parseDate(v) {
  const t = String(v || '').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? t : null;
}

const RANGE = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*(?:-|to)\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
export function parseCoverage(rows) {
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const m = (rows[i] || []).join(' ').match(RANGE);
    if (m) return { start: parseDate(m[1]), end: parseDate(m[2]), row: i + 1 };
  }
  return null;
}

const ALIASES = {
  doc: ['inv #', 'invoice no', 'invoice #', 'credit #'],
  date: ['inv date', 'date', 'invoice date'],
  account: ['acct', 'customer', 'account'],
  item: ['item', 'description'],
  partnerSku: ['partner sku'],
  qty: ['qty', 'qty shipped', 'quantity'],
  uom: ['uom', 'unit'],
  ref: ['ref inv'],
  txn: ['txn id'],
  time: ['local time'],
};
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const map = {};
    (rows[i] || []).forEach((cell, col) => {
      const key = String(cell || '').trim().toLowerCase();
      for (const [field, names] of Object.entries(ALIASES)) if (names.includes(key) && !(field in map)) map[field] = col;
    });
    if (Object.keys(map).length >= 3) return { index: i, map };
  }
  return null;
}

// Till exports keep only these fields; everything else (customer phone, loyalty ids) is dropped before storage.
const TILL_ALLOWED = ['txn', 'time', 'item', 'qty'];

export function storeTime(local, timeZone) {
  const m = String(local || '').trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) ([+-])(\d{2}):(\d{2})$/);
  if (!m) return { error: 'Time has no offset' };
  const [, y, mo, d, hh, mi, sign, oh, om] = m;
  const instant = Date.UTC(+y, +mo - 1, +d, +hh, +mi) - (sign === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(instant)).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const shown = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  if (shown !== `${y}-${mo}-${d} ${hh}:${mi}`) return { error: 'Time offset does not match the store time zone' };
  return { instant, localDate: `${y}-${mo}-${d}` };
}

const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
export function ingestFile(id, files = FILES) {
  const f = own(files, id) ? files[id] : null;
  if (!f) throw new HttpError(400, 'unknown_file', 'Unknown file');
  const out = { id, name: f.name, market: f.market, kind: f.kind, source: f.source, coverage: null, records: [], rejected: [], held: [], dropped: [], rowsRead: 0, panel: null, headers: {} };
  const tabs = Object.entries(f.sheets);
  out.coverage = parseCoverage(tabs[0][1]);
  if (out.coverage) out.coverage.tab = tabs[0][0];
  for (const [tab, rows] of tabs) {
    if (f.kind === 'panel') {
      const h = rows.findIndex((r) => r.includes('Brand est. units'));
      const r = rows[h + 1];
      out.panel = { market: f.market, segment: r[1], units: Number(r[2]), period: out.coverage, tab, row: h + 2 };
      continue;
    }
    const head = findHeader(rows);
    if (!head) continue;
    const { index, map } = head;
    let cols = rows[index].map((_, c) => c);
    if (f.kind === 'sell-through') {
      cols = Object.entries(map).filter(([field]) => TILL_ALLOWED.includes(field)).map(([, c]) => c).sort((a, b) => a - b);
      out.dropped = rows[index].filter((_, c) => !cols.includes(c));
    }
    out.headers[tab] = { row: index + 1, cells: cols.map((c) => rows[index][c]) };
    const isCredit = tab.toLowerCase().startsWith('credit');
    const occ = new Map();
    for (let i = index + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.some((c) => String(c ?? '').trim())) continue;
      out.rowsRead++;
      const at = { file: id, tab, row: i + 1 };
      const cell = (field) => (field in map ? String(r[map[field]] ?? '').trim() : '');
      const item = cell('item');
      const match = matchProduct(item, cell('partnerSku'));
      const q = parseQty(cell('qty'));
      const doc = f.kind === 'sell-through' ? cell('txn') : cell('doc');
      const account = f.kind === 'sell-through' ? f.account : cell('account');
      const reject = (reason, issue, date = null) => out.rejected.push({ ...at, item, doc, account, date, reason, issue, sku: match.sku || null, strain: match.strain || null, source: f.kind });
      let date; let key;
      if (f.kind === 'sell-through') {
        const t = storeTime(cell('time'), f.timezone);
        if (t.error) { reject(t.error, 'time'); continue; }
        date = t.localDate; key = `sale|${f.account}|${cell('txn')}|${item.toUpperCase()}|${q.qty}`;
      } else {
        date = parseDate(cell('date'));
        if (!date) { reject('Unreadable date', 'date'); continue; }
      }
      if (match.status === 'rejected') { reject(match.reason, 'product', date); continue; }
      if (q.error) { reject(q.error, 'qty', date); continue; }
      if (match.status === 'held') { out.held.push({ ...at, item, doc, date, account, qty: q.qty, strain: match.strain, reason: match.reason, source: f.kind }); continue; }
      const cat = BY_SKU[match.sku];
      const uom = cell('uom').toUpperCase();
      if (f.kind !== 'sell-through' && uom && !cat.uoms.includes(uom)) { reject(`Unit ${uom} does not fit this product`, 'unit', date); continue; }
      const qty = isCredit ? -Math.abs(q.qty) : q.qty;
      // Partner lines are identified by document, account, product and their rank in the file, never by quantity:
      // a corrected re-send replaces the earlier line, and two real identical lines on one invoice both count.
      let lineKey = null;
      if (!key) {
        const base = `${isCredit ? 'credit' : 'invoice'}|${doc}|${account}|${match.sku}`;
        occ.set(base, (occ.get(base) || 0) + 1);
        lineKey = `${base}|${occ.get(base)}`; key = lineKey;
      }
      out.records.push({ ...at, key, doc, date, account, sku: match.sku, qty, kind: isCredit ? 'credit' : f.kind === 'sell-through' ? 'sale' : 'invoice', ref: cell('ref') || null, market: f.market, fileKind: f.kind, matchedBy: match.by, cells: cols.map((c) => r[c] ?? '') });
    }
  }
  return out;
}

export function buildDataset(fileIds, files = FILES) {
  const seen = new Map(); const done = new Set();
  const ds = { files: [], records: [], receipts: [], held: [], rejected: [] };
  for (const id of fileIds) {
    if (done.has(id)) {
      ds.receipts.push({ file: id, name: files[id].name, already: true, rowsRead: 0, counted: 0, credits: 0, duplicates: [], replaced: [], rejected: [], held: [], dropped: [] });
      continue;
    }
    done.add(id);
    const f = ingestFile(id, files);
    ds.files.push(f); ds.held.push(...f.held); ds.rejected.push(...f.rejected);
    const rc = { file: id, name: f.name, already: false, rowsRead: f.rowsRead, counted: 0, credits: 0, duplicates: [], replaced: [], rejected: f.rejected, held: f.held, dropped: f.dropped };
    for (const r of f.records) {
      if (seen.has(r.key)) {
        const prev = seen.get(r.key);
        const first = { file: prev.file, tab: prev.tab, row: prev.row };
        if (prev.qty === r.qty) { rc.duplicates.push({ file: r.file, tab: r.tab, row: r.row, doc: r.doc, account: r.account, market: r.market, first }); continue; }
        ds.records[ds.records.indexOf(prev)] = r; seen.set(r.key, r);
        rc.replaced.push({ file: r.file, tab: r.tab, row: r.row, doc: r.doc, account: r.account, market: r.market, from: prev.qty, to: r.qty, first });
        continue;
      }
      seen.set(r.key, r);
      ds.records.push(r);
      if (r.kind === 'credit') rc.credits++; else rc.counted++;
    }
    ds.receipts.push(rc);
  }
  return ds;
}

export function daysOf(start, end) {
  const out = []; let t = Date.parse(`${start}T00:00:00Z`); const e = Date.parse(`${end}T00:00:00Z`);
  for (; t <= e; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const inRange = (d, w) => d >= w.start && d <= w.end;

export function weekSummary(ds, market, sku, week) {
  const partner = ds.files.filter((f) => f.market === market && f.kind === 'sell-in');
  const covered = new Set();
  for (const f of partner) if (f.coverage) for (const d of daysOf(f.coverage.start, f.coverage.end)) covered.add(d);
  const days = daysOf(week.start, week.end);
  const missing = days.filter((d) => !covered.has(d));
  const rows = ds.records.filter((r) => r.market === market && r.fileKind === 'sell-in' && r.sku === sku && inRange(r.date, week));
  const strain = BY_SKU[sku].strain;
  const inWeek = (x) => !x.date || inRange(x.date, week);
  const held = ds.held.filter((h) => h.source === 'sell-in' && files_market(ds, h.file) === market && h.strain === strain && inWeek(h))
    .map((h) => ({ ...h, issue: 'format' }));
  // A rejected partner line that names this product (or this strain without a clear product) could change the total.
  const bad = ds.rejected.filter((x) => x.source === 'sell-in' && files_market(ds, x.file) === market && x.issue !== 'product'
    && (x.sku === sku || (!x.sku && x.strain === strain)) && inWeek(x));
  const risk = [...held, ...bad];
  const boxes = rows.reduce((a, r) => a + r.qty, 0);
  const status = missing.length ? 'pending' : risk.length ? 'provisional' : 'ready';
  const byDay = days.map((d) => ({
    date: d, label: dayLabel(d), covered: covered.has(d),
    qty: rows.filter((r) => r.date === d).reduce((a, r) => a + r.qty, 0),
    declaredBy: partner.filter((f) => f.coverage && d >= f.coverage.start && d <= f.coverage.end).map((f) => f.name),
  }));
  const byAccount = {};
  for (const r of rows) byAccount[r.account] = (byAccount[r.account] || 0) + r.qty;
  return { market, sku, week, boxes, status, missing, issues: risk.map((x) => ({ file: x.file, tab: x.tab, row: x.row, doc: x.doc, account: x.account, item: x.item, issue: x.issue, reason: x.reason })), covered: days.filter((d) => covered.has(d)), byDay, byAccount, risk, rows };
}
function files_market(ds, fileId) { const f = ds.files.find((x) => x.id === fileId); return f && f.market; }

const round1 = (x) => (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10 + 0;
export function marketFigure(ds, market, sku = FOCUS_SKU) {
  const cur = weekSummary(ds, market, sku, REVIEW.week);
  const prev = weekSummary(ds, market, sku, REVIEW.prev);
  const changePct = cur.status === 'ready' && prev.status === 'ready' && prev.boxes > 0 ? round1(((cur.boxes - prev.boxes) / prev.boxes) * 100) : null;
  const accounts = [...new Set([...Object.keys(prev.byAccount), ...Object.keys(cur.byAccount)])].sort()
    .map((code) => {
      const qty = cur.byAccount[code] || 0; const prevQty = prev.byAccount[code] || 0;
      return { code, qty, prevQty, changePct: changePct !== null && prevQty > 0 ? round1(((qty - prevQty) / prevQty) * 100) : null };
    });
  return { market, name: MARKETS[market], sku, label: skuLabel(sku), units: BY_SKU[sku].units, status: cur.status, qty: cur.boxes, prevQty: prev.boxes, prevStatus: prev.status, changePct, missing: cur.missing, covered: cur.covered, byDay: cur.byDay, accounts, risk: cur.risk.length, issues: cur.issues, issueText: issueText(cur.covered.length, cur.issues) };
}

const ISSUE_WORDS = {
  qty: ['invoice needs a quantity', 'invoices need a quantity'],
  unit: ['invoice has a unit that does not fit', 'invoices have a unit that does not fit'],
  date: ['invoice has an unreadable date', 'invoices have an unreadable date'],
  format: ['line needs a format', 'lines need a format'],
};
export function issueText(coveredDays, issues) {
  if (!issues.length) return null;
  const counts = {};
  for (const i of issues) counts[i.issue] = (counts[i.issue] || 0) + 1;
  const parts = Object.entries(counts).map(([k, c]) => `${c} ${(ISSUE_WORDS[k] || ['line needs a check', 'lines need a check'])[c === 1 ? 0 : 1]}`);
  return `${coveredDays} days covered · ${parts.join(', ')}`;
}

export function getRole(roleId) {
  const r = own(ROLES, roleId) ? ROLES[roleId] : null;
  if (!r) throw new HttpError(400, 'no_role', 'Choose a simulated role: leadership or mi-sales.');
  return r;
}
export function checkExtras(extras) {
  for (const e of extras) if (e !== SAMPLE_FILE) throw new HttpError(400, 'unknown_file', 'Only the sample partner file can be added.');
  return extras;
}
// The only door to data: files outside the role's markets are never read, so nothing else can leak them.
export function scopedDataset(role, extras = []) {
  checkExtras(extras);
  const ids = [...BASE_FILES, ...extras].filter((id) => role.markets.includes(FILES[id].market));
  return buildDataset(ids);
}

export function fileCoverage(ds) {
  const LABELS = { 'mi-partner': 'Michigan partner workbook', 'mi-pos-022': 'POS export from retailer MI-022', 'mi-panel': 'Michigan market panel extract', 'oh-partner': 'Ohio partner workbook' };
  const bySource = {};
  for (const f of ds.files) {
    const end = f.coverage ? f.coverage.end : null;
    const cur = bySource[f.source];
    if (!cur || (end && end > cur.through)) bySource[f.source] = { source: f.source, label: LABELS[f.source], market: f.market, kind: f.kind, latestFile: f.name, through: end };
  }
  return Object.values(bySource).map((s) => {
    const expected = s.kind === 'panel' ? REVIEW.prev.end : REVIEW.week.end;
    const behind = s.through ? Math.max(0, Math.round((Date.parse(expected) - Date.parse(s.through)) / 86400000)) : null;
    const missing = behind ? daysOf(new Date(Date.parse(s.through) + 86400000).toISOString().slice(0, 10), expected) : [];
    const span = missing.length > 1 ? `${dayLabel(missing[0]).slice(0, 3)}-${dayLabel(missing[missing.length - 1]).slice(0, 3)}` : missing.length ? dayLabel(missing[0]).slice(0, 3) : '';
    return { ...s, expected, daysBehind: behind, status: behind ? 'missing' : 'complete', statusText: behind ? `${span} missing` : 'Coverage complete', lagNote: s.kind === 'panel' ? 'Covers the week before, by design' : null };
  });
}

function marketView(ds, market) {
  const focus = marketFigure(ds, market);
  const products = CATALOG.filter((c) => ds.records.some((r) => r.market === market && r.sku === c.sku && r.fileKind === 'sell-in'))
    .map((c) => { const m = marketFigure(ds, market, c.sku); return { sku: c.sku, label: m.label, units: c.units, qty: m.qty, status: m.status, issues: m.issues, issueText: m.issueText }; });
  const tills = ds.files.filter((f) => f.market === market && f.kind === 'sell-through').map((f) => ({
    file: f.id, name: f.name, account: FILES[f.id].account,
    qty: ds.records.filter((r) => r.file === f.id && r.sku === FOCUS_SKU && inRange(r.date, REVIEW.week)).reduce((a, r) => a + r.qty, 0),
    held: f.held.map((h) => ({ item: h.item, qty: h.qty, file: h.file, tab: h.tab, row: h.row, reason: h.reason })),
    dropped: f.dropped,
  }));
  const panels = ds.files.filter((f) => f.market === market && f.kind === 'panel').map((f) => ({ ...f.panel, file: f.id, name: f.name }));
  return { code: market, name: MARKETS[market], focus, products, tills, panels };
}

export function stateFor(roleId, extras = []) {
  const role = getRole(roleId);
  const ds = scopedDataset(role, extras);
  const answers = ANSWERS.filter((a) => role.markets.includes(a.market)).map((a) => {
    const v = validateAnswer(a, factsFor(ds, a.market));
    return { id: a.id, market: a.market, question: a.question, available: v.ok };
  });
  return {
    role, review: REVIEW,
    markets: role.markets.map((m) => marketView(ds, m)),
    imports: ds.receipts.filter((r) => r.file === SAMPLE_FILE),
    coverage: fileCoverage(ds),
    answers,
  };
}

const ref = (ds, file, tab, row) => ({ file, name: ds.files.find((f) => f.id === file)?.name, tab, row });

export function accountFor(roleId, code, extras = []) {
  const role = getRole(roleId);
  const ds = scopedDataset(role, extras);
  // The market is read from the code prefix, so a refusal never depends on whether an outside account exists.
  const prefix = String(code).split('-')[0];
  if (!role.markets.includes(prefix)) throw forbidden();
  const rows = ds.records.filter((r) => r.account === code && r.fileKind === 'sell-in');
  if (!rows.length) throw new HttpError(404, 'not_found', 'No such account in this sample.');
  const market = rows[0].market;
  const fig = marketFigure(ds, market);
  const acc = fig.accounts.find((a) => a.code === code) || { qty: 0, prevQty: 0 };
  const focus = rows.filter((r) => r.sku === FOCUS_SKU && (inRange(r.date, REVIEW.week) || inRange(r.date, REVIEW.prev)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ ...ref(ds, r.file, r.tab, r.row), doc: r.doc, date: r.date, dateLabel: dayLabel(r.date), qty: r.qty, kind: r.kind, week: inRange(r.date, REVIEW.week) ? 'this' : 'prev' }));
  const skipped = ds.receipts.flatMap((rc) => rc.duplicates).filter((d) => d.account === code)
    .map((d) => ({ ...ref(ds, d.file, d.tab, d.row), doc: d.doc, first: ref(ds, d.first.file, d.first.tab, d.first.row) }));
  const replaced = ds.receipts.flatMap((rc) => rc.replaced).filter((d) => d.account === code)
    .map((d) => ({ ...ref(ds, d.file, d.tab, d.row), doc: d.doc, from: d.from, to: d.to, first: ref(ds, d.first.file, d.first.tab, d.first.row) }));
  return { code, market, marketName: MARKETS[market], label: fig.label, units: fig.units, status: fig.status, qty: acc.qty, prevQty: acc.prevQty, rows: focus, skipped, replaced };
}

export function rowFor(roleId, fileId, tab, rowNum, extras = []) {
  const role = getRole(roleId);
  if (!own(FILES, fileId)) throw new HttpError(404, 'not_found', 'No such file.');
  if (!role.markets.includes(FILES[fileId].market)) throw forbidden();
  const ds = scopedDataset(role, extras);
  const f = ds.files.find((x) => x.id === fileId);
  if (!f) throw new HttpError(404, 'not_imported', 'This file has not been added yet.');
  const sheet = own(FILES[fileId].sheets, tab) ? FILES[fileId].sheets[tab] : null;
  const n = Number(rowNum);
  if (!sheet || !Number.isInteger(n) || n < 1 || n > sheet.length) throw new HttpError(404, 'not_found', 'No such row.');
  const head = f.headers[tab];
  let cells;
  if (f.kind === 'sell-through') {
    const allowed = new Set(head ? head.cells : []);
    const all = FILES[fileId].sheets[tab][head.row - 1];
    cells = n > head.row ? sheet[n - 1].filter((_, c) => allowed.has(all[c])) : sheet[n - 1].slice(0, 1);
  } else cells = sheet[n - 1];
  return { file: fileId, name: f.name, kind: f.kind, tab, tabs: Object.keys(FILES[fileId].sheets), row: n, header: head && n > head.row ? head : null, cells, dropped: f.dropped, outcome: rowOutcome(ds, f, tab, n) };
}

// What the pipeline did with one row, written by code from the dataset.
function rowOutcome(ds, f, tab, n) {
  const at = (x) => x.file === f.id && x.tab === tab && x.row === n;
  const rec = ds.records.find(at);
  if (rec) {
    const c = BY_SKU[rec.sku];
    const what = rec.kind === 'credit' ? `Netted as ${rec.qty} ${c.units}` : rec.kind === 'sale' ? `Counted as sell-through: ${rec.qty} ${c.units}` : `Counted: ${rec.qty} ${c.units}`;
    return `${what} for ${rec.account}, matched to ${skuLabel(rec.sku)} by ${rec.matchedBy}.`;
  }
  const rep = ds.receipts.flatMap((r) => r.replaced).find(at);
  if (rep) return `Corrected re-send: replaces the line from ${ds.files.find((x) => x.id === rep.first.file).name}, row ${rep.first.row} (${rep.from} became ${rep.to}).`;
  const dup = ds.receipts.flatMap((r) => r.duplicates).find(at);
  if (dup) return `Skipped: the same line was already counted from ${ds.files.find((x) => x.id === dup.first.file).name}, row ${dup.first.row}.`;
  const rej = ds.rejected.find(at);
  if (rej) return `Set aside: ${rej.reason.toLowerCase()}. It is not in any figure.`;
  const held = ds.held.find(at);
  if (held) return `Held for review: ${held.reason.toLowerCase()}. ${held.source === 'sell-in' ? 'The week stays provisional until it is resolved.' : 'It is sell-through, so it does not touch the partner figure.'}`;
  if (f.coverage && f.coverage.tab === tab && f.coverage.row === n) return `Read as the period this file declares: ${dayLabel(f.coverage.start)} to ${dayLabel(f.coverage.end)}.`;
  if (f.panel && f.panel.tab === tab && f.panel.row === n) return 'Market-level estimate, shown for context and never added to accounts.';
  return 'Not a data row.';
}

export function exportCsv(roleId, market, extras = []) {
  const role = getRole(roleId);
  if (!role.markets.includes(market)) throw forbidden();
  const ds = scopedDataset(role, extras);
  const lines = [['market', 'account', 'date', 'product', 'qty', 'file', 'tab', 'row'].join(',')];
  for (const r of ds.records.filter((x) => x.market === market && x.fileKind === 'sell-in' && inRange(x.date, REVIEW.week))) {
    lines.push([r.market, r.account, r.date, `"${skuLabel(r.sku)}"`, r.qty, ds.files.find((f) => f.id === r.file).name, r.tab, r.row].join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------- Prepared answers: the text picks claim kinds and fact ids; code writes every figure ----------
export function factsFor(ds, market) {
  const facts = {};
  const fig = marketFigure(ds, market);
  const partner = ds.files.filter((f) => f.market === market && f.kind === 'sell-in' && f.coverage && f.coverage.end >= REVIEW.week.start);
  facts[`${market}.coverage`] = {
    type: 'coverage', market, complete: fig.missing.length === 0,
    start: fig.covered[0] || null, end: fig.covered[fig.covered.length - 1] || null, missing: fig.missing,
    evidence: partner.map((f) => ref(ds, f.id, f.coverage.tab, f.coverage.row)),
  };
  const cur = weekSummary(ds, market, FOCUS_SKU, REVIEW.week).rows;
  const basis = `Sum of quantity over ${MARKETS[market]} partner rows for ${fig.label}, ${dayLabel(REVIEW.week.start)} to ${dayLabel(REVIEW.week.end)}: ${plural(cur.filter((r) => r.kind === 'invoice').length, 'invoice line', 'invoice lines')} and ${plural(cur.filter((r) => r.kind === 'credit').length, 'credit note', 'credit notes')}, duplicates removed, rows outside this role never read.`;
  facts[`${market}.total`] = { type: 'total', market, qty: fig.qty, prev: fig.prevQty, pct: fig.changePct, status: fig.status, units: fig.units, basis, evidence: [] };
  for (const r of ds.records.filter((x) => x.market === market && x.kind === 'credit' && inRange(x.date, REVIEW.week))) {
    facts[`${market}.credit.${r.doc}`] = { type: 'credit', market, doc: r.doc, account: r.account, qty: -r.qty, units: BY_SKU[r.sku].units, tab: r.tab, row: r.row, evidence: [ref(ds, r.file, r.tab, r.row)] };
  }
  for (const d of ds.receipts.flatMap((rc) => rc.duplicates).filter((x) => x.market === market)) {
    facts[`${market}.dup.${d.doc}`] = { type: 'duplicate', market, doc: d.doc, evidence: [ref(ds, d.file, d.tab, d.row), ref(ds, d.first.file, d.first.tab, d.first.row)] };
  }
  for (const h of ds.held.filter((x) => files_market(ds, x.file) === market)) {
    facts[`${market}.held.${h.doc}`] = { type: 'held', market, raw: h.item, source: h.source, evidence: [ref(ds, h.file, h.tab, h.row)] };
  }
  return facts;
}

const n = (x) => x.toLocaleString('en-US');
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const pct = (x) => `${x > 0 ? '+' : x < 0 ? '-' : ''}${Math.abs(x).toFixed(1)}%`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const CLAIMS = {
  coverage_partial: { type: 'coverage', holds: (f) => !f.complete && !!f.start, render: (f) => `The ${MARKETS[f.market]} partner file declares ${dayLabel(f.start)} to ${dayLabel(f.end)}. ${list(f.missing.map(dayLabel))} ${f.missing.length > 1 ? 'are' : 'is'} not in any file yet.` },
  coverage_complete: { type: 'coverage', holds: (f) => f.complete, render: (f) => `Partner files declare every day from ${dayLabel(f.start)} to ${dayLabel(f.end)}.` },
  counted_so_far: { type: 'total', holds: (f) => f.status === 'pending', render: (f) => `${n(f.qty)} ${f.units} are counted so far. The closed week before ended at ${n(f.prev)}.` },
  week_total: { type: 'total', holds: (f) => f.status === 'ready' && f.pct !== null, render: (f) => `The week closes at ${n(f.qty)} ${f.units}, ${pct(f.pct)} on the ${n(f.prev)} of the week before.` },
  credit_applied: { type: 'credit', holds: () => true, render: (f) => `A credit note of ${n(f.qty)} ${f.units} for ${f.account} is netted out (${f.doc}, tab ${f.tab}, row ${f.row}).` },
  duplicate_skipped: { type: 'duplicate', holds: () => true, render: (f) => `Invoice ${f.doc} arrived in two files; the second copy was skipped.` },
  held_outside_figure: { type: 'held', holds: (f) => f.source === 'sell-through', render: (f) => `One retailer line reads only “${f.raw}”, with no format. It is held for review, and it is sell-through, so it cannot change this figure.` },
  held_in_figure: { type: 'held', holds: (f) => f.source === 'sell-in', render: (f) => `A partner line reads only “${f.raw}”, with no format. Until someone resolves it, the week stays provisional.` },
};

const NOTE_BANS = [
  [/\d/, 'a digit'],
  [/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|dozen|half|double|twice|percent)\b/i, 'a number in words'],
  [/\b[A-Z]{2,3}-[A-Z0-9]+\b/, 'an account or document code'],
  [/acapulco|fritter|ice packs?|blunts?|five-?pack|2\.5g/i, 'a product name'],
  [/\b(michigan|ohio)\b|\b(MI|OH)\b/i, 'a market name'],
  [/\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?|weekend)\b/i, 'a day name'],
  [/\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i, 'a month name'],
];
export function checkNote(note) {
  const errs = [];
  if (typeof note !== 'string' || !note.trim()) return ['empty note'];
  if (note.length > 200) errs.push('note too long');
  for (const [re, what] of NOTE_BANS) if (re.test(note)) errs.push(`free text contains ${what}`);
  return errs;
}

export function validateAnswer(a, facts) {
  const errors = [];
  if (!Array.isArray(a.claims) || !a.claims.length) errors.push('no claims');
  for (const c of a.claims || []) {
    const spec = CLAIMS[c.kind];
    if (!spec) { errors.push(`unknown claim kind ${c.kind}`); continue; }
    if (typeof c.fact !== 'string') { errors.push('a claim cites exactly one fact'); continue; }
    const f = facts[c.fact];
    if (!f) { errors.push(`unknown fact ${c.fact}`); continue; }
    if (f.type !== spec.type) errors.push(`${c.kind} cannot cite a ${f.type} fact`);
    else if (f.market !== a.market) errors.push('fact from another market');
    else if (!spec.holds(f)) errors.push(`${c.kind} does not hold for ${c.fact}`);
  }
  for (const note of a.notes || []) errors.push(...checkNote(note));
  return { ok: errors.length === 0, errors };
}

export function renderAnswer(a, facts) {
  return {
    id: a.id, market: a.market, question: a.question, label: 'Answer prepared offline for this sample',
    sentences: a.claims.map((c) => ({ kind: c.kind, text: CLAIMS[c.kind].render(facts[c.fact]), evidence: facts[c.fact].evidence })),
    basis: facts[`${a.market}.total`].basis,
    notes: a.notes || [],
  };
}

export function answerFor(roleId, id, extras = [], answers = ANSWERS) {
  const role = getRole(roleId);
  const a = answers.find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'not_found', 'No such question.');
  if (!role.markets.includes(a.market)) throw forbidden();
  const ds = scopedDataset(role, extras);
  const facts = factsFor(ds, a.market);
  const v = validateAnswer(a, facts);
  if (!v.ok) throw new HttpError(409, 'not_for_this_data', 'This prepared answer does not match the data on screen.');
  return renderAnswer(a, facts);
}
