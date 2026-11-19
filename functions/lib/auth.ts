export interface AppActor {
  username: string;
  role: string;
}

export interface AuthData {
  authUser?: AppActor;
  bootstrap?: boolean;
}

export interface AuthEnv {
  DB: D1Database;
  BOOTSTRAP_TOKEN?: string;
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(JSON_HEADERS);
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

export function cookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function cookieHeader(name: string, value: string, maxAge: number, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function sessionCookie(token: string, maxAge: number, request: Request): string {
  return cookieHeader('atx_session', token, maxAge, request);
}

export function clearSessionCookie(request: Request): string {
  return cookieHeader('atx_session', '', 0, request);
}

export function bootstrapCookie(token: string, request: Request): string {
  return cookieHeader('atx_bootstrap', token, 900, request);
}

export function clearBootstrapCookie(request: Request): string {
  return cookieHeader('atx_bootstrap', '', 0, request);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}

export async function issueSession(db: D1Database, username: string, request: Request): Promise<{ token: string; cookie: string }> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await db.prepare('INSERT INTO auth_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), username, expires).run();
  return { token, cookie: sessionCookie(token, 12 * 60 * 60, request) };
}

export async function resolveSession(db: D1Database, request: Request): Promise<AppActor | null> {
  const token = cookie(request, 'atx_session');
  if (!token) return null;
  const row = await db.prepare("SELECT username FROM auth_sessions WHERE token_hash = ? AND julianday(expires_at) > julianday('now')")
    .bind(await sha256(token)).first<{ username: string }>();
  if (!row) return null;
  const stateRow = await db.prepare('SELECT state_json FROM app_state WHERE id = ?').bind('current')
    .first<{ state_json: string }>();
  if (!stateRow) return null;
  try {
    const state = JSON.parse(stateRow.state_json);
    const user = state.users?.find((candidate: any) => String(candidate?.n || '').trim().toLowerCase() === row.username.trim().toLowerCase());
    if (!user || user.st === 'disabled') return null;
    return { username: user.n, role: user.role || 'agent', mustChangePassword: !user.passwordChangedAt };
  } catch {
    return null;
  }
}

export async function hasEmptyState(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM app_state WHERE id = ?').bind('current').first<{ id: string }>();
  return !row;
}

export async function hasValidBootstrap(db: D1Database, token: string | null, configuredToken: string | undefined): Promise<boolean> {
  if (!token || !configuredToken || !constantTimeEqual(token, configuredToken)) return false;
  return hasEmptyState(db);
}
