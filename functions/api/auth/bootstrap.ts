import { bootstrapCookie, hasEmptyState, isSameOrigin, json } from '../../lib/auth.ts';
import type { AuthEnv } from '../../lib/auth.ts';

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!isSameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, 503);
  if (!env.BOOTSTRAP_TOKEN) return json({ error: 'Initial Admin setup is not configured' }, 503);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
  if (typeof body?.token !== 'string' || body.token.length < 32 || body.token !== env.BOOTSTRAP_TOKEN) {
    return json({ error: 'Setup token is incorrect' }, 403);
  }
  if (!await hasEmptyState(env.DB)) return json({ error: 'Initial setup has already been completed' }, 409);
  return json({ success: true }, 200, { 'Set-Cookie': bootstrapCookie(body.token, request) });
};


