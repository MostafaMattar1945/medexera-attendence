import { hasValidBootstrap, json, resolveSession } from './lib/auth.ts';
import type { AuthData, AuthEnv } from './lib/auth.ts';

export const onRequest: PagesFunction<AuthEnv, string, AuthData> = async (context) => {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  if (path === '/login.html' || path === '/api/auth/login' || path === '/api/auth/bootstrap' || path === '/api/auth/recover-admin' || path === '/api/health') {
    return context.next();
  }

  if (!env.DB) {
    if (path.startsWith('/api/')) return json({ error: 'D1 binding DB is not configured' }, 503);
    return new Response('Application storage is not configured', { status: 503 });
  }

  let actor = null;
  try { actor = await resolveSession(env.DB, request); } catch { /* Fail closed below. */ }
  if (actor) {
    context.data.authUser = actor;
    if (actor.mustChangePassword && path !== '/change-password.html' && path !== '/change-password' && path !== '/api/auth/change-password' && path !== '/api/auth/logout') {
      if (path.startsWith('/api/')) return json({ error: 'Password change required', mustChangePassword: true }, 403);
      return Response.redirect(new URL('/change-password.html', request.url), 302);
    }
    return context.next();
  }

  let bootstrap = false;
  try { bootstrap = await hasValidBootstrap(env.DB, cookieValue(request), env.BOOTSTRAP_TOKEN); } catch { /* Fail closed below. */ }
  const bootstrapPaths = ['/', '/index.html', '/api/state', '/exceljs.min.js', '/html2canvas.min.js', '/jspdf.umd.min.js'];
  if (bootstrap && bootstrapPaths.includes(path)) {
    context.data.bootstrap = true;
    return context.next();
  }

  if (path.startsWith('/api/')) return json({ error: 'Authentication required' }, 401);
  const loginUrl = new URL('/login.html', request.url);
  const login = await env.ASSETS.fetch(new Request(loginUrl, { method: 'GET' }));
  const headers = new Headers(login.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return new Response(login.body, { status: login.status, statusText: login.statusText, headers });
};

function cookieValue(request: Request): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator >= 0 && item.slice(0, separator).trim() === 'atx_bootstrap') {
      try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}


