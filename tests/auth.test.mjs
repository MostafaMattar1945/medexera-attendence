import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/auth/login.ts';
import { onRequestPost as onRecoverAdminPost } from '../functions/api/auth/recover-admin.ts';
import { onRequestPost as onChangePasswordPost } from '../functions/api/auth/change-password.ts';

const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}

class MockD1 {
  constructor(state) { this.state = state; this.writes = []; }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes('FROM auth_login_attempts')) return null;
        if (sql.includes('FROM app_state')) return { state_json: JSON.stringify(db.state) };
        return null;
      },
      async run() { db.writes.push(sql); return { success: true }; },
    };
  }
}

async function fixture(password = 'correct horse battery staple') {
  const salt = 'test-salt-value';
  const state = { users: [{ n: 'Admin', role: 'admin', salt, ph: await passwordHash(password, salt) }] };
  const DB = new MockD1(state);
  const request = new Request('https://attendance.example/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://attendance.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify({ username: 'Admin', password }),
  });
  return { DB, request, env: { DB } };
}

test('login issues an HttpOnly server session for a valid Medexera password', async () => {
  const context = await fixture();
  const response = await onRequestPost(context);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.username, 'Admin');
  assert.equal(result.mustChangePassword, true);
  assert.match(response.headers.get('Set-Cookie'), /atx_session=.*HttpOnly.*SameSite=Strict/);
  assert.ok(context.DB.writes.some(sql => sql.includes('INSERT INTO auth_sessions')));
});

test('login does not require a password change after a recorded password update', async () => {
  const context = await fixture();
  context.DB.state.users[0].passwordChangedAt = '2026-11-11T12:00:00.000Z';
  const response = await onRequestPost(context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mustChangePassword, false);
});

test('any authenticated user can change their own password and previous sessions are invalidated', async () => {
  const salt = 'test-salt-value';
  const state = { users: [{ n: 'Staff User', role: 'agent', salt, ph: await passwordHash('current password', salt) }], aud: [] };
  const row = { state_json: JSON.stringify(state), version: 3 };
  const writes = [];
  const DB = {
    prepare(sql) {
      return {
        values: [], bind(...values) { this.values = values; return this; },
        async first() { return sql.includes('FROM app_state') ? row : null; },
        async run() {
          writes.push({ sql, values: this.values });
          if (sql.includes('UPDATE app_state')) { row.state_json = this.values[0]; row.version++; return { meta: { changes: 1 } }; }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  const request = new Request('https://attendance.example/api/auth/change-password', {
    method: 'POST', headers: { Origin: 'https://attendance.example', Cookie: 'atx_session=previous-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'current password', newPassword: 'a much stronger password' }),
  });
  const response = await onChangePasswordPost({ request, env: { DB }, data: { authUser: { username: 'Staff User', role: 'agent', mustChangePassword: true } } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /atx_session=.*HttpOnly/);
  const updated = JSON.parse(row.state_json).users[0];
  assert.ok(updated.passwordChangedAt);
  assert.equal(await passwordHash('a much stronger password', updated.salt), updated.ph);
  assert.ok(writes.some(entry => entry.sql.includes('DELETE FROM auth_sessions')));
});

test('password change rejects an incorrect current password', async () => {
  const salt = 'test-salt-value';
  const state = { users: [{ n: 'Staff User', role: 'agent', salt, ph: await passwordHash('current password', salt) }], aud: [] };
  const DB = { prepare(sql) { return { values: [], bind(...values) { this.values=values; return this; }, async first() { return sql.includes('FROM app_state') ? { state_json: JSON.stringify(state), version: 1 } : null; }, async run() { return { meta: { changes: 1 } }; } }; } };
  const request = new Request('https://attendance.example/api/auth/change-password', { method: 'POST', headers: { Origin: 'https://attendance.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a much stronger password' }) });
  const response = await onChangePasswordPost({ request, env: { DB }, data: { authUser: { username: 'Staff User', role: 'agent' } } });
  assert.equal(response.status, 403);
});

test('login rejects requests from a different origin', async () => {
  const context = await fixture();
  context.request = new Request(context.request, { headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' } });
  const response = await onRequestPost(context);
  assert.equal(response.status, 403);
});

test('login rejects a wrong password without issuing a session', async () => {
  const context = await fixture();
  context.request = new Request(context.request.url, {
    method: 'POST',
    headers: { Origin: 'https://attendance.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', password: 'wrong password' }),
  });
  const response = await onRequestPost(context);
  assert.equal(response.status, 401);
  assert.ok(context.DB.writes.some(sql => sql.includes('INSERT INTO auth_login_attempts')));
  assert.equal(context.DB.writes.some(sql => sql.includes('INSERT INTO auth_sessions')), false);
});

test('Admin recovery resets a stored password with the one-time token and issues a session', async () => {
  const state = { users: [{ n: 'Admin', role: 'admin', salt: 'old-salt', ph: 'a'.repeat(64) }], aud: [] };
  const row = { state_json: JSON.stringify(state), version: 4 };
  const writes = [];
  const DB = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return sql.includes('FROM app_state') ? row : null; },
        async run() {
          writes.push({ sql, values: this.values });
          if (sql.includes('UPDATE app_state')) {
            row.state_json = this.values[0];
            row.version++;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  const token = 'recovery-token-for-test-only-123456';
  const request = new Request('https://attendance.example/api/auth/recover-admin', {
    method: 'POST',
    headers: { Origin: 'https://attendance.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: 'new secure password' }),
  });
  const response = await onRecoverAdminPost({ request, env: { DB, BOOTSTRAP_TOKEN: token } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).username, 'Admin');
  assert.match(response.headers.get('Set-Cookie'), /atx_session=.*HttpOnly/);
  const recovered = JSON.parse(row.state_json);
  assert.equal(await passwordHash('new secure password', recovered.users[0].salt), recovered.users[0].ph);
  assert.equal(row.version, 5);
  assert.ok(recovered.aud.some(entry => entry.a === 'Admin password recovered'));
  assert.ok(writes.some(entry => entry.sql.includes('DELETE FROM auth_sessions')));
});

test('Admin recovery rejects an incorrect one-time token without changing state', async () => {
  const request = new Request('https://attendance.example/api/auth/recover-admin', {
    method: 'POST',
    headers: { Origin: 'https://attendance.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'wrong-token', password: 'new secure password' }),
  });
  const response = await onRecoverAdminPost({ request, env: { DB: new MockD1({ users: [] }), BOOTSTRAP_TOKEN: 'correct-token-at-least-32-characters' } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'Recovery token is incorrect');
});
