import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.ts';

function makeContext(path) {
  const state = { users: [{ n: 'Staff User', role: 'agent' }] };
  const DB = { prepare(sql) { return { values: [], bind(...values) { this.values=values; return this; }, async first() {
    if (sql.includes('FROM auth_sessions')) return { username: 'Staff User' };
    if (sql.includes('FROM app_state')) return { state_json: JSON.stringify(state) };
    return null;
  } }; } };
  let nextCalled = false;
  return {
    env: { DB }, data: {}, request: new Request(`https://attendance.example${path}`, { headers: { Cookie: 'atx_session=valid-session' } }),
    async next() { nextCalled = true; return new Response('served', { status: 200 }); },
    nextCalled: () => nextCalled,
  };
}

test('forced password change permits both Cloudflare Pages password-page URL forms', async () => {
  for (const path of ['/change-password.html', '/change-password']) {
    const context = makeContext(path);
    const response = await onRequest(context);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), 'served');
    assert.equal(context.nextCalled(), true);
  }
});

test('forced password change redirects other application pages to the password page', async () => {
  const context = makeContext('/index.html');
  const response = await onRequest(context);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://attendance.example/change-password.html');
  assert.equal(context.nextCalled(), false);
});
