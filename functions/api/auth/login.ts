import { isSameOrigin, json, sha256, issueSession } from '../../lib/auth.ts';
import type { AuthEnv } from '../../lib/auth.ts';

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  if (!salt || !expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return hex(bits) === expected.toLowerCase();
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!isSameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, 503);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || password.length < 1 || password.length > 256) return json({ error: 'Username or password is incorrect' }, 401);

  const source = request.headers.get('CF-Connecting-IP') || 'unknown';
  const attemptKey = await sha256(`${username.toLowerCase()}|${source}`);
  const attempts = await env.DB.prepare('SELECT failed_count, locked_until FROM auth_login_attempts WHERE attempt_key = ?')
    .bind(attemptKey).first<{ failed_count: number; locked_until: string | null }>();
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > Date.now()) {
    return json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429);
  }

  const stateRow = await env.DB.prepare('SELECT state_json FROM app_state WHERE id = ?').bind('current')
    .first<{ state_json: string }>();
  let user: any = null;
  if (stateRow) {
    try {
      const state = JSON.parse(stateRow.state_json);
      user = state.users?.find((candidate: any) => String(candidate?.n || '').trim().toLowerCase() === username.toLowerCase());
    } catch {
      return json({ error: 'Stored application state is invalid' }, 500);
    }
  }
  const valid = !!user && user.st !== 'disabled' && await verifyPassword(password, user.salt, user.ph);
  if (!valid) {
    await env.DB.prepare(`
      INSERT INTO auth_login_attempts (attempt_key, failed_count, window_started, locked_until)
      VALUES (?1, 1, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(attempt_key) DO UPDATE SET
        failed_count = CASE WHEN window_started < datetime('now', '-15 minutes') THEN 1 ELSE failed_count + 1 END,
        window_started = CASE WHEN window_started < datetime('now', '-15 minutes') THEN CURRENT_TIMESTAMP ELSE window_started END,
        locked_until = CASE WHEN (CASE WHEN window_started < datetime('now', '-15 minutes') THEN 1 ELSE failed_count + 1 END) >= 7 THEN datetime('now', '+15 minutes') ELSE locked_until END
    `).bind(attemptKey).run();
    return json({ error: 'Username or password is incorrect' }, 401);
  }

  await env.DB.prepare('DELETE FROM auth_login_attempts WHERE attempt_key = ?').bind(attemptKey).run();
  const issued = await issueSession(env.DB, user.n, request);
  return json({ success: true, username: user.n, mustChangePassword: !user.passwordChangedAt }, 200, { 'Set-Cookie': issued.cookie });
};


