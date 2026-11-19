import { clearSessionCookie, cookie, isSameOrigin, json, sha256 } from '../../lib/auth.ts';
import type { AuthEnv } from '../../lib/auth.ts';

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!isSameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
  const token = cookie(request, 'atx_session');
  if (token && env.DB) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
};


