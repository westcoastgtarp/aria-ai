const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) }
  });
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

async function verifyPassword(password, stored = '') {
  const [scheme, iterationText, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterationText || !saltHex || !hashHex) return false;
  const iterations = Number(iterationText);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations }, key, 256);
  const candidate = bytesToHex(bits);
  if (candidate.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const index = v.indexOf('=');
    return [v.slice(0, index), decodeURIComponent(v.slice(index + 1))];
  }));
}

function sessionCookie(token, maxAgeSeconds) {
  return `aria_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return 'aria_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function databaseReady(env) {
  return Boolean(env.DB && typeof env.DB.prepare === 'function');
}

function databaseRequired() {
  return json({
    ok: false,
    status: 'database_not_connected',
    message: 'The Aria backend code is deployed, but the Cloudflare D1 database binding has not been connected yet.'
  }, { status: 503 });
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function currentSession(request, env) {
  if (!databaseReady(env)) return null;
  const token = parseCookies(request).aria_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.display_name,
           u.account_type, u.status,
           (SELECT role_name FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS staff_role,
           (SELECT department FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

async function recordAudit(env, event) {
  if (!databaseReady(env)) return;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, room_or_zone, asset_id, badge_id, related_ticket_id, details_json, occurred_at, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uuid('AUD'), event.category, event.eventType, event.actorUserId || null,
    event.subjectType || null, event.subjectId || null, event.roomOrZone || null,
    event.assetId || null, event.badgeId || null, event.relatedTicketId || null,
    JSON.stringify(event.details || {}), event.occurredAt || now, now
  ).run();
}

async function requireStaffRole(request, env, allowedRoles) {
  const session = await currentSession(request, env);
  if (!session || session.account_type !== 'staff' || session.status !== 'active') {
    return { error: json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };
  }
  const role = String(session.staff_role || '').toLowerCase();
  if (!allowedRoles.map(v => v.toLowerCase()).includes(role)) {
    return { error: json({ ok: false, error: 'You do not have permission to perform this action.' }, { status: 403 }) };
  }
  return { session };
}

async function handleLogin(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  if (!email || !password) return json({ ok: false, error: 'Email and password are required.' }, { status: 400 });

  const user = await env.DB.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).bind(email).first();
  if (!user || user.status !== 'active' || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return json({ ok: false, error: 'Incorrect email or password.' }, { status: 401 });
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 12);
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(uuid('SES'), user.id, tokenHash, createdAt.toISOString(), expiresAt.toISOString(), request.headers.get('user-agent') || null).run();

  await recordAudit(env, { category: 'Authentication', eventType: 'login_success', actorUserId: user.id, subjectType: 'user', subjectId: user.id });
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.display_name, accountType: user.account_type } }, {
    headers: { 'set-cookie': sessionCookie(token, 60 * 60 * 12) }
  });
}

async function handleLogout(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const token = parseCookies(request).aria_session;
  if (token) {
    const tokenHash = await sha256(token);
    await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`)
      .bind(new Date().toISOString(), tokenHash).run();
  }
  return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}

async function handleSession(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, authenticated: false }, { status: 401 });
  return json({ ok: true, authenticated: true, user: {
    id: session.user_id,
    email: session.email,
    name: session.display_name,
    accountType: session.account_type,
    role: session.staff_role || null,
    department: session.department || null
  }});
}

async function handleIssueInvitation(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const auth = await requireStaffRole(request, env, ['Founder / Co-Founder', 'Founder', 'Co-Founder', 'System Administrator', 'System Admin']);
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  if (!email || !email.includes('@')) return json({ ok: false, error: 'A valid approved member email is required.' }, { status: 400 });

  const code = `ARIA-${crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()}`;
  const codeHash = await sha256(code);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 1000 * 60 * 60 * 24 * 7);
  const invitationId = uuid('INV');
  await env.DB.prepare(`
    INSERT INTO member_invitations (id, email, code_hash, status, issued_by_user_id, issued_at, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).bind(invitationId, email, codeHash, auth.session.user_id, issuedAt.toISOString(), expiresAt.toISOString()).run();
  await recordAudit(env, {
    category: 'Account Access', eventType: 'member_invitation_issued', actorUserId: auth.session.user_id,
    subjectType: 'member_invitation', subjectId: invitationId, details: { email, expiresAt: expiresAt.toISOString() }
  });

  return json({ ok: true, invitation: { id: invitationId, email, code, status: 'pending', expiresAt: expiresAt.toISOString() } }, { status: 201 });
}

async function handleInvitationEligibility(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || '').trim().toUpperCase();
  if (!email) return json({ ok: false, eligible: false, error: 'Email is required.' }, { status: 400 });

  const now = new Date().toISOString();
  const direct = await env.DB.prepare(`SELECT id FROM member_invitations WHERE email = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`)
    .bind(email, now).first();
  if (direct) return json({ ok: true, eligible: true, method: 'approved_email' });

  if (!code) return json({ ok: true, eligible: false, accessCodeRequired: true });
  const codeHash = await sha256(code);
  const byCode = await env.DB.prepare(`SELECT id FROM member_invitations WHERE code_hash = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`)
    .bind(codeHash, now).first();
  return json({ ok: true, eligible: Boolean(byCode), accessCodeRequired: !byCode, method: byCode ? 'access_code' : null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'aria-ai-backend',
        environment: 'prototype-to-production',
        version: '0.2.0-auth-foundation',
        databaseConnected: databaseReady(env),
        time: new Date().toISOString()
      });
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      const connected = databaseReady(env);
      return json({
        ok: true,
        backend: 'online',
        staticAssets: 'online',
        persistentDatabase: connected ? 'connected' : 'pending-d1-binding',
        authentication: connected ? 'server-side-foundation-ready' : 'waiting-for-database',
        invitations: connected ? 'server-side-foundation-ready' : 'waiting-for-database',
        auditLogging: connected ? 'backend-event-store-ready' : 'waiting-for-database',
        contactNotifications: 'disconnected'
      });
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/auth/session' && request.method === 'GET') return handleSession(request, env);
    if (url.pathname === '/api/invitations/issue' && request.method === 'POST') return handleIssueInvitation(request, env);
    if (url.pathname === '/api/invitations/eligibility' && request.method === 'POST') return handleInvitationEligibility(request, env);

    if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'API route not found.' }, { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
