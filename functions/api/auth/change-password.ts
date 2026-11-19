import { isSameOrigin, issueSession, json } from '../../lib/auth.ts';
import type { AuthData, AuthEnv } from '../../lib/auth.ts';
import { hashPassword, verifyPassword } from '../../lib/password.ts';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<AuthEnv, string, AuthData> = async ({ request, env, data }) => {
  if (!isSameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, 503);
  const actor = data.authUser;
  if (!actor) return json({ error: 'Authentication required' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 8 || newPassword.length > 256) return json({ error: 'New password must be between 8 and 256 characters' }, 400);

  const row = await env.DB.prepare('SELECT state_json, version FROM app_state WHERE id = ?').bind('current')
    .first<{ state_json: string; version: number }>();
  if (!row) return json({ error: 'Application state is unavailable' }, 503);
  let state: any;
  try { state = JSON.parse(row.state_json); } catch { return json({ error: 'Stored application state is invalid' }, 500); }
  const user = state.users?.find((candidate: any) => String(candidate?.n || '').trim().toLowerCase() === actor.username.trim().toLowerCase());
  if (!user || user.st === 'disabled') return json({ error: 'Account is unavailable' }, 403);
  if (!await verifyPassword(currentPassword, user.salt, user.ph)) return json({ error: 'Current password is incorrect' }, 403);
  if (await verifyPassword(newPassword, user.salt, user.ph)) return json({ error: 'Choose a password different from your current password' }, 400);

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  user.salt = salt;
  user.ph = await hashPassword(newPassword, salt);
  user.passwordChangedAt = new Date().toISOString();
  if (!Array.isArray(state.aud)) state.aud = [];
  state.aud.unshift({ t: new Date().toLocaleString('en-GB'), u: user.n, a: 'Password changed', d: 'User changed their own password' });

  const update = await env.DB.prepare(`UPDATE app_state
    SET state_json = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?`).bind(JSON.stringify(state), user.n, 'current', row.version).run();
  if (update.meta?.changes !== 1) return json({ error: 'Application state changed while updating the password. Please retry.' }, 409);

  await env.DB.prepare('DELETE FROM auth_sessions WHERE username = ? COLLATE NOCASE').bind(user.n).run();
  const issued = await issueSession(env.DB, user.n, request);
  return json({ success: true, username: user.n }, 200, { 'Set-Cookie': issued.cookie });
};
