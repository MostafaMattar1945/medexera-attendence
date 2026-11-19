import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/state.ts';

const admin = { n: 'Admin', role: 'admin', salt: 's', ph: 'h' };
const agent = { n: 'Nate Hollister', role: 'agent', emp: 1, salt: 's', ph: 'h' };
const makeState = () => ({
  emps: [{ id: 1, us: 'Nate Hollister' }], recs: [], reqs: [], acts: [], aud: [],
  users: [admin, agent], leaders: {}, oms: {}, pts: {}, departments: ['Operations'], me: 0,
});

class MockD1 {
  constructor({ state = null, mapping = null } = {}) {
    this.state = state;
    this.mapping = mapping;
  }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes('FROM access_user_map')) {
          return db.mapping && db.mapping.email.toLowerCase() === String(this.values[0]).toLowerCase()
            ? db.mapping : null;
        }
        if (sql.includes('FROM app_state')) return db.state;
        if (sql.includes('INSERT INTO app_state')) {
          const [stateJson, updatedBy, expectedVersion] = this.values;
          if ((db.state?.version ?? 0) !== expectedVersion) return null;
          const version = db.state ? db.state.version + 1 : 1;
          db.state = { state_json: stateJson, version, updated_by: updatedBy, updated_at: 'now' };
          return { version };
        }
        return null;
      },
      async run() { return { success: true }; },
    };
  }
}

function context(db, username = 'Nate Hollister', state = undefined, version = 1, role = 'agent', bootstrap = false) {
  return {
    env: { DB: db },
    request: new Request('https://attendance.example/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, version }),
    }),
    data: { authUser: bootstrap ? undefined : { username, role }, bootstrap },
  };
}

const stateRow = (state, version = 1) => ({ state_json: JSON.stringify(state), version, updated_at: 'now', updated_by: 'Admin' });

test('GET binds state to the authenticated Medexera account and redacts password hashes', async () => {
  const state = makeState();
  const response = await onRequestGet({ ...context(new MockD1({ state: stateRow(state) })), request: new Request('https://attendance.example/api/state') });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.state.me, 1);
  assert.equal('ph' in body.state.users[0], false);
  assert.equal('salt' in body.state.users[1], false);
  assert.deepEqual(body.actor, { username: 'Nate Hollister', role: 'agent' });
});

test('GET rejects a session whose Medexera account no longer exists', async () => {
  const response = await onRequestGet({ ...context(new MockD1({ state: stateRow(makeState()) }), 'Removed User'), request: new Request('https://attendance.example/api/state') });
  assert.equal(response.status, 403);
});

test('POST rejects attempts to act as a different Medexera account', async () => {
  const state = makeState();
  state.me = 0;
  const response = await onRequestPost(context(new MockD1({ state: stateRow(makeState()) }), 'Nate Hollister', state));
  assert.equal(response.status, 403);
});

test('POST blocks non-admin changes to user roles and control settings', async () => {
  const original = makeState();
  const changed = makeState();
  changed.me = 1;
  changed.users[0] = { ...changed.users[0], role: 'agent' };
  const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Nate Hollister', changed));
  assert.equal(response.status, 403);
});

test('POST rejects stale versions without changing the stored state', async () => {
  const original = makeState();
  const changed = makeState();
  changed.me = 1;
  changed.recs.push({ id: 2 });
  const db = new MockD1({ state: stateRow(original, 2) });
  const response = await onRequestPost(context(db, 'Nate Hollister', changed, 1));
  assert.equal(response.status, 409);
  assert.equal(JSON.parse(db.state.state_json).recs.length, 0);
});

test('POST accepts an authorized account save at the current version', async () => {
  const original = makeState();
  const changed = makeState();
  changed.me = 1;
  changed.recs.push({ id: 2 });
  const db = new MockD1({ state: stateRow(original) });
  const response = await onRequestPost(context(db, 'Nate Hollister', changed, 1));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, 2);
  assert.equal(JSON.parse(db.state.state_json).recs.length, 1);
  assert.equal(db.state.updated_by, 'Nate Hollister');
});

test('POST allows Admin and active Accountant to edit both leave allowances', async () => {
  for (const [username, role, employeeTitle] of [['Admin', 'admin', null], ['Nate Hollister', 'accountant', 'Accountant']]) {
    const original = makeState();
    if (employeeTitle) original.emps[0].title = employeeTitle;
    const changed = structuredClone(original);
    changed.me = role === 'admin' ? 0 : 1;
    changed.annualAllowances = { '2026': { '1': 20 } };
    changed.sickAllowances = { '2026': { '1': 10 } };
    const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), username, changed, 1, role));
    assert.equal(response.status, 200, `${role} should edit annual and sick allowances`);
  }
});

test('POST blocks other roles from changing sick leave allowances and validates values', async () => {
  const original = makeState();
  const changed = structuredClone(original);
  changed.me = 1;
  changed.sickAllowances = { '2026': { '1': 10 } };
  const denied = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Nate Hollister', changed));
  assert.equal(denied.status, 403);

  const invalid = structuredClone(original);
  invalid.sickAllowances = { '2026': { '1': -1 } };
  const badValue = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Admin', invalid, 1, 'admin'));
  assert.equal(badValue.status, 400);
});

test('POST blocks non-privileged accounts from deleting requests or stored forms', async () => {
  const original = makeState();
  original.reqs = [{ id: 71, by: 'Nate Hollister', status: 'pending' }];
  original.forms = [{ id: 'form-71', n: 'Request form.pdf' }];
  for (const key of ['reqs', 'forms']) {
    const changed = structuredClone(original);
    changed.me = 1;
    changed[key] = [];
    const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Nate Hollister', changed));
    assert.equal(response.status, 403, `${key} deletion must be denied`);
  }
});

test('POST allows CEO and Operation Manager accounts to delete requests', async () => {
  for (const role of ['ceo', 'om']) {
    const original = makeState();
    original.users.push({ n: 'Reviewer', role, salt: 's', ph: 'h' });
    original.reqs = [{ id: 72, by: 'Nate Hollister', status: 'pending' }];
    const changed = structuredClone(original);
    changed.me = 2;
    changed.reqs = [];
    changed.aud = [{ t: 'now', u: 'Reviewer', a: 'Request deleted', d: 'test' }];
    const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Reviewer', changed, 1, role));
    assert.equal(response.status, 200, `${role} should be allowed to delete requests`);
  }
});

test('POST allows the CEO to update direct manager mappings but not Team Leader mappings', async () => {
  const original = makeState();
  original.users.push({ n: 'CEO User', role: 'ceo', salt: 's', ph: 'h' });

  const changed = structuredClone(original);
  changed.me = 2;
  changed.oms = { 'Medical Assistants|Provider': 1 };
  const db = new MockD1({ state: stateRow(original) });
  const allowed = await onRequestPost(context(db, 'CEO User', changed, 1, 'ceo'));
  assert.equal(allowed.status, 200);
  assert.deepEqual(JSON.parse(db.state.state_json).oms, changed.oms);

  const forbidden = structuredClone(original);
  forbidden.me = 2;
  forbidden.leaders = { 'Medical Assistants|Provider': 1 };
  const denied = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'CEO User', forbidden, 1, 'ceo'));
  assert.equal(denied.status, 403);
});

test('POST allows only the bootstrap Admin to initialize an empty database', async () => {
  const state = makeState();
  const db = new MockD1();
  const response = await onRequestPost(context(db, 'Admin', state, 0, 'admin', true));
  assert.equal(response.status, 200);
  assert.equal(db.state.version, 1);
});

test('POST rejects deleting prior audit history', async () => {
  const original = makeState();
  original.aud = [{ t: 'yesterday', u: 'Admin', a: 'Entry', d: 'record' }];
  const changed = makeState();
  changed.me = 1;
  const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Nate Hollister', changed));
  assert.equal(response.status, 403);
});

test('POST rejects audit entries attributed to another account', async () => {
  const original = makeState();
  const changed = makeState();
  changed.me = 1;
  changed.aud = [{ t: 'now', u: 'Admin', a: 'Forged', d: 'entry' }];
  const response = await onRequestPost(context(new MockD1({ state: stateRow(original) }), 'Nate Hollister', changed));
  assert.equal(response.status, 403);
});
