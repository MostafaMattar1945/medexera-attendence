import { constantTimeEqual, isSameOrigin, issueSession, json } from '../../lib/auth.ts';
import type { AuthEnv } from '../../lib/auth.ts';
import { hashPassword } from '../../lib/password.ts';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!isSameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, 503);
  if (!env.BOOTSTRAP_TOKEN) return json({ error: 'Admin recovery is not configured' }, 503);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!constantTimeEqual(token, env.BOOTSTRAP_TOKEN)) return json({ error: 'Recovery token is incorrect' }, 403);
  if (password.length < 8 || password.length > 256) return json({ error: 'Password must be between 8 and 256 characters' }, 400);

  const row = await env.DB.prepare('SELECT state_json, version FROM app_state WHERE id = ?').bind('current')
    .first<{ state_json: string; version: number }>();
  if (!row) return json({ error: 'Initial Admin setup has not been completed' }, 409);

  let state: any;
  try { state = JSON.parse(row.state_json); } catch { return json({ error: 'Stored application state is invalid' }, 500); }
  const admin = state.users?.find((candidate: any) =>
    String(candidate?.n || '').trim().toLowerCase() === 'admin' && String(candidate?.role || '').toLowerCase() === 'admin' && candidate?.st !== 'disabled');
  if (!admin) return json({ error: 'Active Admin account was not found' }, 409);
  if (admin.recoveryUsedAt) return json({ error: 'One-time Admin recovery has already been used' }, 409);

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  admin.salt = salt;
  admin.ph = await hashPassword(password, salt);
  admin.passwordChangedAt = new Date().toISOString();
  admin.passwordChangedAt = new Date().toISOString();
  admin.recoveryUsedAt = new Date().toISOString();
  if (!Array.isArray(state.aud)) state.aud = [];
  state.aud.unshift({ t: new Date().toLocaleString('en-GB'), u: admin.n, a: 'Admin password recovered', d: 'Password reset with the recovery token' });

  const update = await env.DB.prepare(`UPDATE app_state
    SET state_json = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?`).bind(JSON.stringify(state), admin.n, 'current', row.version).run();
  if (update.meta?.changes !== 1) return json({ error: 'Application state changed during recovery. Please retry.' }, 409);

  await env.DB.prepare('DELETE FROM auth_sessions').run();
  const issued = await issueSession(env.DB, admin.n, request);
  return json({ success: true, username: admin.n }, 200, { 'Set-Cookie': issued.cookie });
};
