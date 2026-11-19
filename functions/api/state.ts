// Cloudflare Pages Function: /api/state
// Shared D1 state with version checks and D1-backed Medexera sessions.
import { issueSession, json } from '../lib/auth.ts';
import type { AuthData, AuthEnv } from '../lib/auth.ts';

type StateRow = { state_json: string; version: number; updated_at: string; updated_by: string | null };
type StateContext = EventContext<AuthEnv, string, AuthData>;

function accountIndex(state: any, username: string): number {
  if (!Array.isArray(state?.users)) return -1;
  return state.users.findIndex((user: any) => typeof user?.n === 'string' && user.n.trim().toLowerCase() === username.trim().toLowerCase());
}

function clientState(state: any): any {
  const result = structuredClone(state);
  result.users = (result.users || []).map((user: any) => {
    const { salt, ph, ...safeUser } = user;
    return safeUser;
  });
  return result;
}

function sameWithoutCredentials(users: any): string {
  return JSON.stringify((Array.isArray(users) ? users : []).map((user: any) => {
    const { salt, ph, ...safeUser } = user || {};
    return safeUser;
  }));
}

function mergeCredentials(submitted: any[], stored: any[]): any[] {
  const byName = new Map(stored.map((user: any) => [String(user?.n || '').trim().toLowerCase(), user]));
  return submitted.map((user: any) => {
    const old = byName.get(String(user?.n || '').trim().toLowerCase());
    return old ? { ...user, salt: old.salt, ph: old.ph } : user;
  });
}

function removesExistingItems(before: unknown, after: unknown): boolean {
  const previous = Array.isArray(before) ? before : [];
  const next = Array.isArray(after) ? after : [];
  const nextIds = new Set(next.map((item: any) => item?.id).filter((id: any) => id !== undefined && id !== null));
  return previous.some((item: any) => item?.id !== undefined && item?.id !== null && !nextIds.has(item.id));
}

function actorFor(context: StateContext): { username: string; role: string } | null {
  return context.data.authUser || (context.data.bootstrap ? { username: 'Admin', role: 'admin' } : null);
}

export const onRequestGet: PagesFunction<AuthEnv, string, AuthData> = async (context) => {
  try {
    if (!context.env.DB) return json({ error: 'D1 binding DB is not configured' }, 500);
    const actor = actorFor(context);
    if (!actor) return json({ error: 'Authentication required' }, 401);

    const row = await context.env.DB.prepare('SELECT state_json, version, updated_at, updated_by FROM app_state WHERE id = ?')
      .bind('current').first<StateRow>();
    if (!row) {
      if (!context.data.bootstrap) return json({ error: 'Application state has not been initialized' }, 503);
      return json({ state: null, version: 0, updatedAt: null, updatedBy: null, actor: { username: 'Admin', role: 'admin', bootstrap: true } });
    }

    let state: any;
    try { state = JSON.parse(row.state_json); } catch { return json({ error: 'Stored application state is invalid JSON' }, 500); }
    const index = accountIndex(state, actor.username);
    if (index < 0) return json({ error: 'Authenticated Medexera account no longer exists' }, 403);
    state.me = index;
    return json({
      state: clientState(state),
      version: row.version,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      actor: { username: actor.username, role: state.users[index]?.role },
    });
  } catch {
    return json({ error: 'Failed to retrieve state' }, 500);
  }
};

export const onRequestPost: PagesFunction<AuthEnv, string, AuthData> = async (context) => {
  try {
    if (!context.env.DB) return json({ error: 'D1 binding DB is not configured' }, 500);
    const actor = actorFor(context);
    if (!actor) return json({ error: 'Authentication required' }, 401);
    const contentLength = Number(context.request.headers.get('Content-Length') || 0);
    if (contentLength > 2_000_000) return json({ error: 'Payload exceeds 2 MB limit' }, 413);

    let body: any;
    try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Expected a JSON object' }, 400);
    const state = body.state;
    const expectedVersion = body.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return json({ error: 'A non-negative state version is required' }, 400);
    if (!state || typeof state !== 'object' || Array.isArray(state) || !Array.isArray(state.emps) || !Array.isArray(state.users) || !Array.isArray(state.aud)) {
      return json({ error: 'Invalid state schema: expected emps, users, and aud arrays' }, 400);
    }
    for (const field of ['annualAllowances', 'sickAllowances'] as const) {
      const allowances = state[field];
      if (allowances === undefined || allowances === null) continue;
      const label = field === 'annualAllowances' ? 'Annual' : 'Sick';
      if (typeof allowances !== 'object' || Array.isArray(allowances)) return json({ error: `${label} leave allowances must be an object keyed by year` }, 400);
      for (const [year, employees] of Object.entries(allowances)) {
        if (!/^\d{4}$/.test(year) || Number(year) < 2020 || Number(year) > 2100 || !employees || typeof employees !== 'object' || Array.isArray(employees)) {
          return json({ error: `${label} leave allowance year data is invalid` }, 400);
        }
        for (const [employeeId, amount] of Object.entries(employees as Record<string, unknown>)) {
          if (!/^\d+$/.test(employeeId) || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 366) {
            return json({ error: `${label} leave allowance values must be between 0 and 366 days` }, 400);
          }
        }
      }
    }

    const userIndex = accountIndex(state, actor.username);
    if (userIndex < 0 || state.me !== userIndex) return json({ error: 'State actor does not match the authenticated Medexera account' }, 403);
    const current = await context.env.DB.prepare('SELECT state_json, version FROM app_state WHERE id = ?')
      .bind('current').first<{ state_json: string; version: number }>();
    let actorRole: string;
    let bootstrapSave = false;

    if (!current) {
      if (!context.data.bootstrap || actor.username.toLowerCase() !== 'admin' || state.users[userIndex]?.role !== 'admin' || !state.users[userIndex]?.ph || !state.users[userIndex]?.salt || expectedVersion !== 0) {
        return json({ error: 'Initial state must be created by the one-time Admin bootstrap flow' }, 403);
      }
      actorRole = 'admin';
      bootstrapSave = true;
    } else {
      if (context.data.bootstrap) return json({ error: 'Initial setup has already been completed' }, 409);
      let currentState: any;
      try { currentState = JSON.parse(current.state_json); } catch { return json({ error: 'Stored application state is invalid JSON' }, 500); }
      const currentActorIndex = accountIndex(currentState, actor.username);
      if (currentActorIndex < 0) return json({ error: 'Authenticated Medexera account no longer exists' }, 403);
      actorRole = currentState.users[currentActorIndex]?.role;
      if (!actorRole || state.users[userIndex]?.role !== actorRole) return json({ error: 'Application role does not match the stored account' }, 403);

      const currentEmployees = Array.isArray(currentState.emps) ? currentState.emps : [];
      const employmentDateChanges = state.emps.flatMap((employee: any) => {
        const previous = currentEmployees.find((item: any) => item?.id === employee?.id);
        if (!previous) return [];
        return (['hire', 'endDate'] as const)
          .filter((field) => String(previous[field] || '') !== String(employee[field] || ''))
          .map((field) => ({ employee, previous, field }));
      });
      const linkedEmployeeId = Number(currentState.users[currentActorIndex]?.emp);
      const linkedEmployee = currentEmployees.find((employee: any) => employee?.id === linkedEmployeeId);
      const isAccountant = String(linkedEmployee?.title || '').toLowerCase() === 'accountant' && !linkedEmployee?.left && linkedEmployee?.st !== 'terminated';
      const allowancesChanged = ['annualAllowances', 'sickAllowances'].some((field) => JSON.stringify(state[field] || {}) !== JSON.stringify(currentState[field] || {}));
      if (allowancesChanged && actorRole !== 'admin' && !isAccountant) {
        return json({ error: 'Only Admins and active Accountant employees can edit leave allowances' }, 403);
      }
      if (employmentDateChanges.length && actorRole !== 'admin' && !isAccountant) {
          const departureStatuses = new Set(['resigned', 'terminated', 'onspot']);
          for (const { employee, previous, field } of employmentDateChanges) {
            if (field === 'hire') return json({ error: 'Only Admins and active Accountant employees can edit employment dates' }, 403);
            const synchronizedDate = !!employee.endDate && String(employee.endDate) === String(employee.sdt || '');
            const newDeparture = departureStatuses.has(employee.st) && employee.st !== previous.st;
            const newlyMarkedLeft = !!employee.left && !previous.left;
            const backfilledDeparture = !previous.endDate && departureStatuses.has(employee.st) && synchronizedDate;
            const clearedDeparture = departureStatuses.has(previous.st) && !employee.st && !employee.left && !employee.endDate && !employee.sdt;
            const approvedResignation = (state.reqs || []).some((request: any) => request?.t === 'resign' && request?.e === employee.id && request?.status === 'approved' && request?.last === employee.endDate && (currentState.reqs || []).some((old: any) => old?.id === request.id && old?.status === 'pending'));
            if (!(synchronizedDate && (newDeparture || newlyMarkedLeft || backfilledDeparture || approvedResignation)) && !clearedDeparture) {
              return json({ error: 'Only Admins and active Accountant employees can edit employment dates' }, 403);
            }
          }
      }

      if (actorRole !== 'admin') {
        if (sameWithoutCredentials(state.users) !== sameWithoutCredentials(currentState.users)) return json({ error: 'Only an Admin can change user accounts or roles' }, 403);
        const adminOnlySettings = actorRole === 'ceo' ? ['leaders', 'pts', 'departments'] : ['leaders', 'oms', 'pts', 'departments'];
        for (const key of adminOnlySettings) {
          if (JSON.stringify(state[key]) !== JSON.stringify(currentState[key])) return json({ error: `Only an Admin can change ${key}` }, 403);
        }
      }

      if (!['admin', 'ceo', 'om'].includes(actorRole)) {
        if (removesExistingItems(currentState.reqs, state.reqs)) return json({ error: 'Only Admin, CEO, or Operation Manager accounts can delete requests' }, 403);
        if (removesExistingItems(currentState.forms, state.forms)) return json({ error: 'Only Admin, CEO, or Operation Manager accounts can delete stored forms' }, 403);
      }

      const priorAudit = Array.isArray(currentState.aud) ? currentState.aud : [];
      const submittedAudit = state.aud;
      if (submittedAudit.length < priorAudit.length) return json({ error: 'Audit history cannot be deleted' }, 403);
      const addedCount = submittedAudit.length - priorAudit.length;
      if (JSON.stringify(submittedAudit.slice(addedCount)) !== JSON.stringify(priorAudit)) return json({ error: 'Existing audit history cannot be edited or reordered' }, 403);
      if (submittedAudit.slice(0, addedCount).some((entry: any) => !entry || typeof entry.u !== 'string' || entry.u.trim().toLowerCase() !== actor.username.trim().toLowerCase())) {
        return json({ error: 'New audit entries must identify the authenticated account' }, 403);
      }
      // Password hashes are server-held state; clients never receive or replace existing hashes.
      state.users = mergeCredentials(state.users, currentState.users);
    }

    const stateJson = JSON.stringify(state);
    if (stateJson.length > 2_000_000) return json({ error: 'Serialized state exceeds 2 MB limit' }, 413);
    const updatedBy = actor.username.slice(0, 100);
    const saved = await context.env.DB.prepare(`
      INSERT INTO app_state (id, state_json, version, updated_by, updated_at)
      VALUES ('current', ?1, 1, ?2, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        version = app_state.version + 1,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
      WHERE app_state.version = ?3
      RETURNING version
    `).bind(stateJson, updatedBy, expectedVersion).first<{ version: number }>();

    if (!saved) {
      const latest = await context.env.DB.prepare('SELECT version FROM app_state WHERE id = ?').bind('current')
        .first<{ version: number }>();
      return json({ error: 'State conflict: reload before saving', expectedVersion, currentVersion: latest?.version ?? 0 }, 409);
    }

    if (saved.version === 1 || saved.version % 10 === 0) {
      try {
        await context.env.DB.prepare('INSERT INTO state_snapshots (state_json, saved_by, state_version, saved_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
          .bind(stateJson, updatedBy, saved.version).run();
        await context.env.DB.prepare('DELETE FROM state_snapshots WHERE id NOT IN (SELECT id FROM state_snapshots ORDER BY state_version DESC, id DESC LIMIT 200)').run();
      } catch (snapshotError) { console.warn('State saved but recovery snapshot failed', snapshotError); }
    }

    const headers = new Headers();
    if (bootstrapSave) {
      const issued = await issueSession(context.env.DB, actor.username, context.request);
      headers.append('Set-Cookie', issued.cookie);
    }
    return json({ success: true, version: saved.version, updatedAt: new Date().toISOString() }, 200, headers);
  } catch {
    return json({ error: 'Failed to save state' }, 500);
  }
};

