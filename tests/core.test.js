import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchProduct, parseQty, parseCoverage, findHeader, storeTime, ingestFile, buildDataset, marketFigure,
  stateFor, accountFor, rowFor, exportCsv, answerFor, factsFor, validateAnswer, checkNote, scopedDataset,
  ROLES, BASE_FILES, SAMPLE_FILE, FOCUS_SKU, HttpError,
} from '../src/core.js';
import { FILES, ANSWERS } from '../src/data.js';

const S = [SAMPLE_FILE];
const mi = (extras = []) => stateFor('leadership', extras).markets.find((m) => m.code === 'MI').focus;

test('three spellings of the five-pack match one catalog product; the blunt stays separate', () => {
  for (const s of ['ROVE ICE PACK ACAPULCO GOLD 2.5G 5PK', 'Rove Ice Packs Acapulco Gold 2.5g (5)', 'IP ACAP GLD 5PK', 'Ice Packs 5pk - Acapulco Gold 2.5g']) {
    assert.equal(matchProduct(s).sku, FOCUS_SKU, s);
  }
  assert.equal(matchProduct('ROVE IP BLUNT ACAPULCO GOLD 2G').sku, 'ice-packs-blunts/acapulco-gold/2g-blunt');
  assert.equal(matchProduct('Ice Packs Blunts Acapulco Gold 2g').sku, 'ice-packs-blunts/acapulco-gold/2g-blunt');
  assert.equal(matchProduct('anything', 'RV-IP-AG-5').by, 'partner SKU');
});

test('a bare strain name is held, never guessed; an unknown item is rejected with its reason', () => {
  const h = matchProduct('ACAPULCO GOLD');
  assert.equal(h.status, 'held');
  assert.match(h.reason, /No format/);
  assert.equal(matchProduct('DISPLAY KIT, COUNTER').status, 'rejected');
  assert.equal(matchProduct('Acapulco Gold 2.5g blunt').status, 'held');
});

test('quantities and coverage lines are read from messy cells', () => {
  assert.equal(parseQty(' 50 ').qty, 50);
  assert.equal(parseQty('60.00').qty, 60);
  assert.equal(parseQty('').error, 'Missing quantity');
  assert.equal(parseQty('2.5').error, 'Quantity is not a whole number');
  assert.deepEqual(parseCoverage([['x'], ['Period covered: 10/26/2026 - 10/29/2026']]), { start: '2026-10-26', end: '2026-10-29', row: 2 });
  assert.deepEqual(parseCoverage([['x'], ['Coverage 10/19/2026 to 10/25/2026']]), { start: '2026-10-19', end: '2026-10-25', row: 2 });
  assert.equal(findHeader(FILES['oh-w44'].sheets.Sales).index, 2);
  assert.equal(findHeader(FILES['mi-w44a'].sheets.Invoices).index, 3);
});

test('before the sample file: Michigan shows 600 boxes and no weekly change, Fri to Sun missing', () => {
  const f = mi();
  assert.equal(f.qty, 600);
  assert.equal(f.prevQty, 1000);
  assert.equal(f.status, 'pending');
  assert.equal(f.changePct, null);
  assert.deepEqual(f.missing, ['2026-10-30', '2026-10-31', '2026-11-01']);
});

test('after the sample file: the week closes at 1,020 boxes, +2.0%, with exact days and accounts', () => {
  const f = mi(S);
  assert.equal(f.status, 'ready');
  assert.equal(f.qty, 1020);
  assert.equal(f.changePct, 2);
  assert.deepEqual(f.byDay.map((d) => d.qty), [160, 140, 150, 150, 172, 128, 120]);
  const acc = Object.fromEntries(f.accounts.map((a) => [a.code, a.qty]));
  assert.deepEqual(acc, { 'MI-003': 190, 'MI-007': 150, 'MI-011': 100, 'MI-014': 270, 'MI-022': 170, 'MI-031': 140 });
  assert.equal(f.accounts.reduce((a, x) => a + x.prevQty, 0), 1000);
  assert.equal(f.accounts.find((a) => a.code === 'MI-014').changePct, 8);
  assert.equal(f.accounts.find((a) => a.code === 'MI-007').changePct, -6.3, 'rounded like Excel: -6.25 gives -6.3');
  assert.ok(mi().accounts.every((a) => a.changePct === null), 'no per-account change while the week is pending');
});

test('loading the same file again changes nothing', () => {
  const once = mi(S); const twice = stateFor('leadership', [SAMPLE_FILE, SAMPLE_FILE]);
  const f = twice.markets[0].focus;
  assert.equal(f.qty, once.qty);
  assert.deepEqual(f.accounts, once.accounts);
  assert.equal(twice.imports.length, 2);
  assert.equal(twice.imports[1].already, true);
  assert.equal(twice.imports[1].counted, 0);
});

test('a re-sent invoice is skipped once, a credit note is netted, bad rows carry their reason', () => {
  const rc = stateFor('leadership', S).imports[0];
  assert.equal(rc.duplicates.length, 1);
  assert.equal(rc.duplicates[0].doc, 'INV-50398');
  assert.equal(rc.credits, 1);
  assert.deepEqual(rc.rejected.map((r) => [r.row, r.reason]), [[10, 'Not a catalog product'], [16, 'Missing quantity']]);
  const a = accountFor('leadership', 'MI-014', S);
  assert.equal(a.qty, 270);
  assert.ok(a.rows.some((r) => r.kind === 'credit' && r.qty === -12 && r.tab === 'Credits' && r.row === 3));
  assert.equal(a.skipped.length, 1);
});

test('missing days come from the declared coverage, not from the absence of rows', () => {
  const files = structuredClone(FILES);
  // A file that declares Fri to Sun but has no Saturday rows: the week is complete (a quiet Saturday is a zero).
  files['mi-w44b'].sheets.Invoices = files['mi-w44b'].sheets.Invoices.filter((r) => r[1] !== '10/31/2026');
  const ds = buildDataset([...BASE_FILES.filter((x) => x.startsWith('mi')), 'mi-w44b'], files);
  assert.equal(marketFigure(ds, 'MI').status, 'ready');
  // Rows through Sunday in a file that only declares Mon to Thu: still pending.
  const f2 = structuredClone(FILES);
  f2['mi-w44a'].sheets.Invoices.push(['INV-59999', '11/01/2026', 'MI-003', 'IP ACAP GLD 5PK', '', '10', 'BX']);
  const ds2 = buildDataset(BASE_FILES.filter((x) => x.startsWith('mi')), f2);
  const fig = marketFigure(ds2, 'MI');
  assert.equal(fig.status, 'pending');
  assert.equal(fig.changePct, null);
});

test('a partner line with no format keeps the week provisional; the same line in a till export does not', () => {
  const files = structuredClone(FILES);
  files['mi-w44b'].sheets.Invoices.push(['INV-50430', '11/01/2026', 'MI-011', 'ACAPULCO GOLD', '', '12', 'BX']);
  const ds = buildDataset([...BASE_FILES.filter((x) => x.startsWith('mi')), 'mi-w44b'], files);
  const fig = marketFigure(ds, 'MI');
  assert.equal(fig.status, 'provisional');
  assert.equal(fig.changePct, null);
  const facts = factsFor(ds, 'MI');
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'why-ready'), facts).ok, false);
  assert.equal(mi(S).status, 'ready');
});

test('till export: customer fields are dropped before storage', () => {
  const f = ingestFile('mi-pos-022');
  assert.deepEqual(f.dropped, ['Customer Phone', 'Loyalty #']);
  const stored = JSON.stringify(f);
  assert.ok(!stored.includes('555'), 'no phone number stored');
  assert.ok(!/L-2\d{4}/.test(stored), 'no loyalty id stored');
  const row = rowFor('leadership', 'mi-pos-022', 'Export', 3, []);
  assert.equal(row.cells.length, 4);
  assert.ok(!JSON.stringify(row).includes('555'));
});

test('fall back night: two tickets at 01:30 on Nov 1 are both kept; a wrong offset is rejected', () => {
  const a = storeTime('2026-11-01 01:30 -04:00', 'America/Detroit');
  const b = storeTime('2026-11-01 01:30 -05:00', 'America/Detroit');
  assert.equal(b.instant - a.instant, 3600000);
  assert.ok(storeTime('2026-10-28 10:00 -05:00', 'America/Detroit').error);
  assert.equal(storeTime('2026-11-01 23:40 -05:00', 'America/Detroit').localDate, '2026-11-01');
  const f = ingestFile('mi-pos-022');
  assert.ok(f.records.some((r) => r.doc === 'T-88190') && f.records.some((r) => r.doc === 'T-88191'));
  const till = stateFor('leadership', []).markets[0].tills[0];
  assert.equal(till.qty, 41, 'duplicate T-88168 counted once, late Sunday ticket stays in the week');
  assert.equal(till.held.length, 1);
});

test('sell-through and the panel never feed the partner figure', () => {
  const ds = buildDataset(['mi-w43', 'mi-w44a', 'mi-w44b']);
  assert.equal(marketFigure(ds, 'MI').qty, mi(S).qty);
});

test('Michigan sales role: no Ohio data leaves the server, by any door', () => {
  const role = 'mi-sales';
  const st = JSON.stringify(stateFor(role, S));
  assert.ok(!/OH-|Ohio|oh-w4|OH_partner/.test(st), 'state view has no Ohio data');
  const expectForbidden = (fn) => assert.throws(fn, (e) => e instanceof HttpError && e.status === 403 && !/OH-|7\d{3}/.test(e.message));
  expectForbidden(() => accountFor(role, 'OH-005', S));
  expectForbidden(() => answerFor(role, 'ohio-close', S));
  expectForbidden(() => exportCsv(role, 'OH', S));
  expectForbidden(() => rowFor(role, 'oh-w44', 'Sales', 5, S));
  const ds = scopedDataset(ROLES[role], S);
  assert.ok(ds.files.every((f) => f.market === 'MI'), 'Ohio files are never read for this role');
  assert.ok(!exportCsv(role, 'MI', S).includes('OH-'));
  assert.ok(!JSON.stringify(answerFor(role, 'why-ready', S)).includes('OH'));
});

test('leadership sees both markets, including Ohio accounts and rows', () => {
  const st = stateFor('leadership', S);
  assert.deepEqual(st.markets.map((m) => m.code), ['MI', 'OH']);
  const oh = st.markets[1].focus;
  assert.equal(oh.qty, 740); assert.equal(oh.prevQty, 715); assert.equal(oh.changePct, 3.5);
  assert.equal(accountFor('leadership', 'OH-005', S).qty, 300);
  assert.equal(rowFor('leadership', 'oh-w44', 'Sales', 5, S).cells[2], 'OH-005');
});

test('switching role does not reuse an earlier answer (no shared cache)', () => {
  assert.equal(accountFor('leadership', 'OH-005', S).code, 'OH-005');
  assert.throws(() => accountFor('mi-sales', 'OH-005', S), (e) => e.status === 403);
  assert.equal(accountFor('leadership', 'OH-005', S).code, 'OH-005');
});

test('unknown roles and files are refused', () => {
  assert.throws(() => stateFor('', []), (e) => e.status === 400);
  assert.throws(() => stateFor('admin', []), (e) => e.status === 400);
  assert.throws(() => stateFor('leadership', ['oh-w44']), (e) => e.status === 400);
});

test('shipped prepared answers validate on the data they were prepared for', () => {
  const pending = factsFor(scopedDataset(ROLES.leadership, []), 'MI');
  const ready = factsFor(scopedDataset(ROLES.leadership, S), 'MI');
  const oh = factsFor(scopedDataset(ROLES.leadership, S), 'OH');
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'why-pending'), pending).ok, true);
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'why-ready'), ready).ok, true);
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'ohio-close'), oh).ok, true);
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'why-ready'), pending).ok, false, 'not shown before the week closes');
  const r = answerFor('leadership', 'why-ready', S);
  assert.match(r.sentences[1].text, /1,020 five-packs, \+2\.0% on the 1,000/);
  assert.match(r.sentences[2].text, /12 five-packs for MI-014/);
});

test('plausible false answers are rejected by the validator', () => {
  const ds = scopedDataset(ROLES.leadership, S);
  const facts = { ...factsFor(ds, 'MI'), ...factsFor(ds, 'OH') };
  const base = { id: 'x', market: 'MI', claims: [{ kind: 'week_total', fact: 'MI.total' }], notes: [] };
  const bad = [
    ['number typed in the text', { ...base, notes: ['Sales rose 2% after the credit.'] }],
    ['number in words', { ...base, notes: ['Up by twenty boxes on the week.'] }],
    ['two accounts glued together', { ...base, notes: ['The buyer at MI-014 and MI-007 reordered.'] }],
    ['product name in free text', { ...base, notes: ['Blunts carried the week.'] }],
    ['market name in free text', { ...base, notes: ['Ohio did better.'] }],
    ['day name in free text', { ...base, notes: ['Friday was the strongest day.'] }],
    ['reason lent to the wrong fact', { ...base, claims: [{ kind: 'credit_applied', fact: 'MI.dup.INV-50398' }] }],
    ['two orders cumulated in one claim', { ...base, claims: [{ kind: 'week_total', fact: ['MI.total', 'OH.total'] }] }],
    ['number taken from another market', { ...base, claims: [{ kind: 'week_total', fact: 'OH.total' }] }],
    ['claim that does not hold', { ...base, claims: [{ kind: 'held_in_figure', fact: 'MI.held.T-88160' }] }],
    ['invented fact id', { ...base, claims: [{ kind: 'credit_applied', fact: 'MI.credit.CR-9999' }] }],
  ];
  for (const [why, a] of bad) assert.equal(validateAnswer(a, facts).ok, false, why);
  assert.deepEqual(checkNote('Nothing was guessed: a line without a clear format waits for a person.'), []);
  // The account named in a rendered credit sentence is the one on the credit row itself.
  assert.match(rowFor('leadership', 'mi-w44b', 'Credits', 3, S).outcome, /^Netted as -12 five-packs for MI-014, matched to Ice Packs, Acapulco Gold, 2\.5g 5-Pack/);
  assert.match(rowFor('leadership', 'mi-w44b', 'Invoices', 5, S).outcome, /^Skipped: the same line was already counted from MI_partner_weekly_2026-10-29\.xlsx, row 20/);
  assert.match(rowFor('leadership', 'mi-pos-022', 'Export', 9, S).outcome, /^Held for review/);
  const credit = facts['MI.credit.CR-1182'];
  const row = rowFor('leadership', credit.evidence[0].file, credit.evidence[0].tab, credit.evidence[0].row, S);
  assert.equal(row.cells[2], credit.account);
});

test('file coverage shows the Michigan partner workbook three days late until the sample arrives', () => {
  const before = stateFor('mi-sales', []).coverage.find((c) => c.source === 'mi-partner');
  assert.equal(before.daysBehind, 3); assert.equal(before.status, 'missing'); assert.equal(before.statusText, 'Fri-Sun missing');
  const after = stateFor('mi-sales', S).coverage.find((c) => c.source === 'mi-partner');
  assert.equal(after.daysBehind, 0); assert.equal(after.statusText, 'Coverage complete');
  assert.ok(!stateFor('mi-sales', S).coverage.some((c) => c.market === 'OH'));
  const panel = stateFor('mi-sales', S).coverage.find((c) => c.kind === 'panel');
  assert.equal(panel.status, 'complete');
});

// ---------- Cases added after the review of the finished demo ----------
const MI_IDS = [...BASE_FILES.filter((x) => x.startsWith('mi')), 'mi-w44b'];
const withRow = (edit) => { const f = structuredClone(FILES); edit(f['mi-w44b'].sheets.Invoices, f); return marketFigure(buildDataset(MI_IDS, f), 'MI'); };

test('a rejected line of the tracked product keeps the week provisional (the earlier workbook, kept as a regression case)', () => {
  const fig = withRow((rows) => { rows[15] = ['INV-50416', '10/31/2026', 'MI-022', 'IP ACAP GLD 5PK', '', '', 'BX']; });
  assert.equal(fig.status, 'provisional');
  assert.equal(fig.changePct, null);
  assert.equal(fig.issueText, '7 days covered · 1 invoice needs a quantity');
  assert.deepEqual(fig.issues.map((i) => [i.doc, i.row, i.issue]), [['INV-50416', 16, 'qty']]);
  assert.ok(fig.accounts.every((a) => a.changePct === null));
  const ds = buildDataset(MI_IDS, (() => { const f = structuredClone(FILES); f['mi-w44b'].sheets.Invoices[15][3] = 'IP ACAP GLD 5PK'; f['mi-w44b'].sheets.Invoices[15][4] = ''; return f; })());
  assert.equal(validateAnswer(ANSWERS.find((a) => a.id === 'why-ready'), factsFor(ds, 'MI')).ok, false, 'the prepared answer is suspended');
});

test('a wrong unit or an unreadable date on the tracked product also keeps the week provisional', () => {
  assert.equal(withRow((rows) => { rows[16][6] = 'EA'; }).status, 'provisional');
  assert.equal(withRow((rows) => { rows[16][1] = '46327'; }).status, 'provisional');
  assert.equal(withRow((rows) => { rows[9][3] = 'DISPLAY KIT, COUNTER'; }).status, 'ready', 'an item outside the catalog does not block');
});

test('the shipped sample workbook is reconciled: the open line is on another product, which stays provisional', () => {
  const st = stateFor('leadership', S).markets[0];
  assert.equal(st.focus.status, 'ready');
  const af = st.products.find((p) => p.sku === 'ice-packs/apple-fritter/2.5g-5-pack');
  assert.equal(af.status, 'provisional');
  assert.equal(af.issues[0].doc, 'INV-50416');
});

test('a corrected re-send replaces the earlier line; two real identical lines on one invoice both count', () => {
  const fixed = withRow((rows) => { rows[4][5] = '45'; });
  assert.equal(fixed.qty, 1025);
  assert.equal(fixed.status, 'ready');
  const f = structuredClone(FILES); f['mi-w44b'].sheets.Invoices[4][5] = '45';
  const rc = buildDataset(MI_IDS, f).receipts.find((r) => r.file === 'mi-w44b');
  assert.deepEqual(rc.replaced.map((r) => [r.doc, r.from, r.to]), [['INV-50398', 40, 45]]);
  assert.equal(rc.duplicates.length, 0);
  const twice = withRow((rows) => { rows.splice(6, 0, [...rows[5]]); });
  assert.equal(twice.qty, 1060, 'INV-50403 carries two lines of 40');
});

test('roles, files and tabs named after object internals are refused, never a server error', () => {
  for (const role of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.throws(() => stateFor(role, []), (e) => e instanceof HttpError && e.status === 400, role);
    assert.throws(() => rowFor(role, 'mi-w43', 'Invoices', 1, []), (e) => e instanceof HttpError && e.status === 400, role);
  }
  assert.throws(() => rowFor('leadership', 'mi-w43', '__proto__', 1, []), (e) => e.status === 404);
  assert.throws(() => rowFor('leadership', '__proto__', 'Invoices', 1, []), (e) => e.status === 404);
  assert.throws(() => rowFor('leadership', 'constructor', 'Invoices', 1, []), (e) => e.status === 404);
  assert.throws(() => stateFor('leadership', ['__proto__']), (e) => e.status === 400);
});

test('an unknown account is a 404 for a role that may see its market, a 403 otherwise (existence never leaks)', () => {
  assert.throws(() => accountFor('leadership', 'OH-999', S), (e) => e.status === 404);
  assert.throws(() => accountFor('leadership', 'MI-999', S), (e) => e.status === 404);
  assert.throws(() => accountFor('mi-sales', 'MI-999', S), (e) => e.status === 404);
  assert.throws(() => accountFor('mi-sales', 'OH-999', S), (e) => e.status === 403);
  assert.throws(() => accountFor('mi-sales', 'OH-005', S), (e) => e.status === 403);
});
