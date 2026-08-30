function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(init.headers || {})
    }
  });
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

async function currentSession(request, env) {
  const token = parseCookies(request).aria_session;
  if (!token || !env.DB) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`
    SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name, u.account_type, u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS staff_role,
      (SELECT department FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
}

async function requireAuditReviewer(request, env) {
  const session = await currentSession(request, env);
  if (!session || session.account_type !== 'staff' || session.status !== 'active') {
    return { error: json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };
  }
  const role = String(session.staff_role || '').trim().toLowerCase();
  if (!['founder','lead supervisor'].includes(role)) {
    return { error: json({ ok: false, error: 'Audit history is restricted to Founder and Lead Supervisor access.' }, { status: 403 }) };
  }
  return { session };
}

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function safeInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function listAuditEvents(request, env) {
  const auth = await requireAuditReviewer(request, env);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const category = clean(url.searchParams.get('category'), 120);
  const actor = clean(url.searchParams.get('actor'), 120);
  const action = clean(url.searchParams.get('action'), 160);
  const query = clean(url.searchParams.get('q'), 160);
  const from = clean(url.searchParams.get('from'), 40);
  const to = clean(url.searchParams.get('to'), 40);
  const limit = safeInt(url.searchParams.get('limit'), 150, 1, 500);

  const where = [];
  const binds = [];

  if (category) { where.push('a.category = ?'); binds.push(category); }
  if (action) { where.push('a.event_type LIKE ?'); binds.push(`%${action}%`); }
  if (actor) {
    where.push('(u.display_name LIKE ? OR u.email LIKE ? OR a.actor_user_id LIKE ?)');
    binds.push(`%${actor}%`, `%${actor}%`, `%${actor}%`);
  }
  if (from) { where.push('a.occurred_at >= ?'); binds.push(`${from}T00:00:00.000Z`); }
  if (to) { where.push('a.occurred_at <= ?'); binds.push(`${to}T23:59:59.999Z`); }
  if (query) {
    where.push(`(
      a.id LIKE ? OR a.category LIKE ? OR a.event_type LIKE ? OR
      COALESCE(a.subject_type,'') LIKE ? OR COALESCE(a.subject_id,'') LIKE ? OR
      COALESCE(a.room_or_zone,'') LIKE ? OR COALESCE(a.asset_id,'') LIKE ? OR
      COALESCE(a.badge_id,'') LIKE ? OR COALESCE(a.related_ticket_id,'') LIKE ? OR
      COALESCE(u.display_name,'') LIKE ? OR COALESCE(u.email,'') LIKE ? OR
      a.details_json LIKE ?
    )`);
    const term = `%${query}%`;
    binds.push(term,term,term,term,term,term,term,term,term,term,term,term);
  }

  const sql = `
    SELECT a.id,a.category,a.event_type,a.actor_user_id,a.subject_type,a.subject_id,
      a.room_or_zone,a.asset_id,a.badge_id,a.related_ticket_id,a.details_json,
      a.occurred_at,a.recorded_at,u.display_name AS actor_name,u.email AS actor_email,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=a.actor_user_id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS actor_role,
      (SELECT department FROM staff_roles r WHERE r.user_id=a.actor_user_id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS actor_department
    FROM audit_events a
    LEFT JOIN users u ON u.id=a.actor_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.occurred_at DESC
    LIMIT ?
  `;
  binds.push(limit);

  const result = await env.DB.prepare(sql).bind(...binds).all();
  const categoriesResult = await env.DB.prepare(`SELECT category, COUNT(*) AS count FROM audit_events GROUP BY category ORDER BY count DESC, category COLLATE NOCASE`).all();

  const events = (result.results || []).map(row => {
    let details = {};
    try { details = JSON.parse(row.details_json || '{}'); } catch {}
    return {
      ...row,
      details
    };
  });

  return json({
    ok: true,
    events,
    categories: categoriesResult.results || [],
    viewer: { id: auth.session.user_id, name: auth.session.display_name || auth.session.email, role: auth.session.staff_role }
  });
}

export async function handleAuditRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/staff/audit/events' && request.method === 'GET') {
    return listAuditEvents(request, env);
  }
  return null;
}
