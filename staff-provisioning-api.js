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

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const index = v.indexOf('=');
    return [v.slice(0, index), decodeURIComponent(v.slice(index + 1))];
  }));
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function currentSession(request, env) {
  const token = parseCookies(request).aria_session;
  if (!token || !env.DB) return null;
  const tokenHash = await sha256(token);
  return await env.DB.prepare(`
    SELECT s.id AS session_id, u.id AS user_id, u.email, u.display_name, u.account_type, u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS staff_role,
      (SELECT department FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
}

async function requireProvisioner(request, env) {
  const session = await currentSession(request, env);
  const role = String(session?.staff_role || '').trim().toLowerCase();
  const allowed = ['founder', 'founder / co-founder', 'co-founder', 'system administrator', 'system admin'];
  if (!session || session.account_type !== 'staff' || session.status !== 'active') {
    return { error: json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };
  }
  if (!allowed.includes(role)) {
    return { error: json({ ok: false, error: 'You do not have permission to provision staff accounts.' }, { status: 403 }) };
  }
  return { session, role };
}

async function recordAudit(env, event) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, details_json, occurred_at, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uuid('AUD'), event.category, event.eventType, event.actorUserId || null,
    event.subjectType || null, event.subjectId || null,
    JSON.stringify(event.details || {}), now, now
  ).run();
}

function makeSetupToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

async function createStaffInvitation(request, env) {
  const auth = await requireProvisioner(request, env);
  if (auth.error) return auth.error;

  const body = await readBody(request);
  const displayName = String(body?.displayName || '').trim();
  const email = normalizeEmail(body?.email);
  const department = String(body?.department || '').trim();
  const roleName = String(body?.role || '').trim();

  if (!displayName || displayName.length > 120) return json({ ok: false, error: 'Employee name is required.' }, { status: 400 });
  if (!email || !email.includes('@') || email.length > 254) return json({ ok: false, error: 'A valid work email is required.' }, { status: 400 });
  if (!department || department.length > 120) return json({ ok: false, error: 'Department is required.' }, { status: 400 });
  if (!roleName || roleName.length > 120) return json({ ok: false, error: 'Role is required.' }, { status: 400 });

  const requestedRole = roleName.toLowerCase();
  if (requestedRole === 'founder' || requestedRole === 'founder / co-founder') {
    return json({ ok: false, error: 'Founder access cannot be created through the employee provisioning workflow.' }, { status: 400 });
  }
  const privileged = ['co-founder', 'system administrator', 'system admin'];
  const founderCreator = ['founder', 'founder / co-founder', 'co-founder'].includes(auth.role);
  if (privileged.includes(requestedRole) && !founderCreator) {
    return json({ ok: false, error: 'Only Founder / Co-Founder access can assign privileged staff roles.' }, { status: 403 });
  }

  const existing = await env.DB.prepare(`SELECT id, status FROM users WHERE email = ? LIMIT 1`).bind(email).first();
  if (existing) {
    return json({ ok: false, error: `An Aria account already exists for this email (${existing.status}).` }, { status: 409 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 72);
  const userId = uuid('USR');
  const roleId = uuid('ROL');
  const invitationId = uuid('SINV');
  const token = makeSetupToken();
  const tokenHash = await sha256(token);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, email, display_name, account_type, status, password_hash, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, 'staff', 'pending', NULL, NULL, ?, ?)
    `).bind(userId, email, displayName, now.toISOString(), now.toISOString()),
    env.DB.prepare(`
      INSERT INTO staff_roles (id, user_id, role_name, department, active, assigned_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).bind(roleId, userId, roleName, department, now.toISOString()),
    env.DB.prepare(`
      INSERT INTO staff_account_invitations (id, user_id, token_hash, status, issued_by_user_id, issued_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).bind(invitationId, userId, tokenHash, auth.session.user_id, now.toISOString(), expiresAt.toISOString())
  ]);

  await recordAudit(env, {
    category: 'Account Access',
    eventType: 'staff_account_invitation_created',
    actorUserId: auth.session.user_id,
    subjectType: 'user',
    subjectId: userId,
    details: { email, displayName, department, role: roleName, expiresAt: expiresAt.toISOString(), delivery: 'manual_setup_link' }
  });

  const setupUrl = `${new URL(request.url).origin}/staff-setup.html?token=${encodeURIComponent(token)}`;
  return json({
    ok: true,
    employee: { id: userId, email, displayName, department, role: roleName, status: 'pending' },
    invitation: { id: invitationId, setupUrl, expiresAt: expiresAt.toISOString(), emailDelivery: 'not_connected' }
  }, { status: 201 });
}

async function listStaffAccounts(request, env) {
  const auth = await requireProvisioner(request, env);
  if (auth.error) return auth.error;

  const result = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.status, u.created_at,
      (SELECT role_name FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS department,
      (SELECT status FROM staff_account_invitations i WHERE i.user_id = u.id ORDER BY i.issued_at DESC LIMIT 1) AS invitation_status,
      (SELECT expires_at FROM staff_account_invitations i WHERE i.user_id = u.id ORDER BY i.issued_at DESC LIMIT 1) AS invitation_expires_at
    FROM users u
    WHERE u.account_type = 'staff'
    ORDER BY u.created_at DESC
  `).all();

  return json({ ok: true, employees: result.results || [] });
}

async function validateStaffSetup(request, env) {
  const token = String(new URL(request.url).searchParams.get('token') || '');
  if (token.length < 32) return json({ ok: false, valid: false, error: 'This setup link is invalid.' }, { status: 400 });
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT i.id AS invitation_id, i.expires_at, u.id AS user_id, u.email, u.display_name, u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id = u.id AND r.active = 1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM staff_account_invitations i
    JOIN users u ON u.id = i.user_id
    WHERE i.token_hash = ? AND i.status = 'pending' AND i.expires_at > ? AND u.status = 'pending'
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!row) return json({ ok: false, valid: false, error: 'This setup link is invalid, expired, or has already been used.' }, { status: 404 });
  return json({ ok: true, valid: true, employee: { email: row.email, displayName: row.display_name, role: row.role_name, department: row.department }, expiresAt: row.expires_at });
}

async function completeStaffSetup(request, env) {
  const body = await readBody(request);
  const token = String(body?.token || '');
  const password = String(body?.password || '');
  if (token.length < 32) return json({ ok: false, error: 'This setup link is invalid.' }, { status: 400 });
  if (password.length < 14 || password.length > 200) return json({ ok: false, error: 'Password must be between 14 and 200 characters.' }, { status: 400 });

  const tokenHash = await sha256(token);
  const now = new Date();
  const row = await env.DB.prepare(`
    SELECT i.id AS invitation_id, i.user_id, i.expires_at, u.email, u.display_name
    FROM staff_account_invitations i
    JOIN users u ON u.id = i.user_id
    WHERE i.token_hash = ? AND i.status = 'pending' AND i.expires_at > ? AND u.status = 'pending'
    LIMIT 1
  `).bind(tokenHash, now.toISOString()).first();
  if (!row) return json({ ok: false, error: 'This setup link is invalid, expired, or has already been used.' }, { status: 404 });

  const passwordHash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash = ?, status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(passwordHash, now.toISOString(), row.user_id),
    env.DB.prepare(`UPDATE staff_account_invitations SET status = 'used', used_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(now.toISOString(), row.invitation_id)
  ]);

  await recordAudit(env, {
    category: 'Account Access',
    eventType: 'staff_account_activated',
    actorUserId: row.user_id,
    subjectType: 'user',
    subjectId: row.user_id,
    details: { email: row.email, setupMethod: 'one_time_setup_link' }
  });

  return json({ ok: true, activated: true, user: { email: row.email, displayName: row.display_name } });
}

export async function handleStaffProvisioningRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/staff/invitations' && request.method === 'POST') return createStaffInvitation(request, env);
  if (url.pathname === '/api/staff/accounts' && request.method === 'GET') return listStaffAccounts(request, env);
  if (url.pathname === '/api/staff/setup/validate' && request.method === 'GET') return validateStaffSetup(request, env);
  if (url.pathname === '/api/staff/setup/complete' && request.method === 'POST') return completeStaffSetup(request, env);
  return null;
}
