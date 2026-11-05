import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGate, isRoleRefusal } from '../site/gate.js';
import { stateFor } from '../src/core.js';

const later = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

test('role race: a Leadership answer that arrives last never repaints a Michigan page', async () => {
  const gate = createGate();
  let page = null;
  const apply = ({ fresh, value }) => { if (fresh) page = value; };
  // Leadership request starts first and is slow; the person switches to Michigan sales meanwhile.
  const slow = gate.run('state', () => later(40, stateFor('leadership', ['mi-w44b']))).then(apply);
  // A drawer opened on an Ohio account before the switch also comes back late.
  let drawer = 'closed';
  const oldDrawer = (async () => { const r = await gate.run('drawer', () => later(60, { code: 'OH-005' })); if (r.fresh) drawer = r.value.code; })();
  gate.switchRole();
  const fast = gate.run('state', () => later(5, stateFor('mi-sales', ['mi-w44b']))).then(apply);
  await Promise.all([slow, fast, oldDrawer]);
  assert.equal(page.role.id, 'mi-sales');
  assert.ok(!/OH-|Ohio/.test(JSON.stringify(page)), 'no Ohio data on the page');
  assert.equal(drawer, 'closed', 'the late Ohio drawer is dropped');
});

test('only the latest request of a kind wins, even under one role', async () => {
  const gate = createGate();
  const a = gate.run('answer', () => later(30, 'first'));
  const b = gate.run('answer', () => later(5, 'second'));
  assert.deepEqual(await a, { fresh: false, value: 'first' });
  assert.deepEqual(await b, { fresh: true, value: 'second' });
});

test('"Refused by the server" is reserved to the role refusal', () => {
  assert.equal(isRoleRefusal({ status: 403, body: { error: 'outside_role' } }), true);
  assert.equal(isRoleRefusal({ status: 404, body: { error: 'not_found' } }), false);
  assert.equal(isRoleRefusal({ status: 500, body: { error: 'server_error' } }), false);
  assert.equal(isRoleRefusal({ status: 403, body: { error: 'other' } }), false);
});
