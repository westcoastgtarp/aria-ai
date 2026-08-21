const MEMBER_CONSENT_VERSION = '2026-08-20-v1';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

const PLAN_OPTIONS = {
  free: { code: 'free', billingInterval: null, priceCents: 0, status: 'active' },
  lifeline_weekly: { code: 'lifeline_weekly', billingInterval: 'weekly', priceCents: 499, status: 'payment_required' },
  lifeline_annual: { code: 'lifeline_annual', billingInterval: 'annual', priceCents: 25900, status: 'payment_required' }
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
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

function databaseReady(env) {
  return Boolean(env.DB && typeof env.DB.prepare === 'function');
}

function databaseRequired() {
  return json({ ok: false, error: 'The Aria database is not connected.' }, { status: 503 });
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function invitationFor(env, email, accessCode = '') {
  const now = new Date().toISOString();
  const direct = await env.DB.prepare(`
    SELECT id, email, status, expires_at
    FROM member_invitations
    WHERE email = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY issued_at DESC
    LIMIT 1
  `).bind(email, now).first();

  if (direct && !accessCode) return { invitation: direct, usedAccessCode: false };

  if (accessCode) {
    const codeHash = await sha256(accessCode.trim().toUpperCase());
    const coded = await env.DB.prepare(`
      SELECT id, email, status, expires_at
      FROM member_invitations
      WHERE code_hash = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY issued_at DESC
      LIMIT 1
    `).bind(codeHash, now).first();
    if (coded && normalizeEmail(coded.email) === email) return { invitation: coded, usedAccessCode: true };
  }

  if (direct) return { invitation: direct, usedAccessCode: false };
  return { invitation: null, usedAccessCode: false };
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
    JSON.stringify(event.details || {}), event.occurredAt || now, now
  ).run();
}

function makeVerificationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(value % 1000000).padStart(6, '0');
}

async function requestIpHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip) return null;
  return sha256(`aria-member-signup-v1:${ip}`);
}

async function handleConsent(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  const accessCode = String(body?.accessCode || '').trim().toUpperCase();
  const accepted = body?.accepted === true;
  const consentVersion = String(body?.consentVersion || '');

  if (!email || !email.includes('@')) return json({ ok: false, error: 'A valid application email is required.' }, { status: 400 });
  if (!accepted) return json({ ok: false, error: 'You must accept the member consent before continuing.' }, { status: 400 });
  if (consentVersion !== MEMBER_CONSENT_VERSION) return json({ ok: false, error: 'The consent form changed. Please review the current version before continuing.' }, { status: 409 });

  const { invitation, usedAccessCode } = await invitationFor(env, email, accessCode);
  if (!invitation) return json({ ok: false, error: 'No active member invitation matches this email and access code.' }, { status: 403 });

  const existing = await env.DB.prepare(`SELECT id, account_type, status FROM users WHERE email = ? LIMIT 1`).bind(email).first();
  if (existing && existing.account_type !== 'member') return json({ ok: false, error: 'This email belongs to a staff account.' }, { status: 409 });
  if (existing && existing.status === 'active') return json({ ok: false, error: 'A member account already exists for this email. Sign in instead.' }, { status: 409 });

  const now = new Date().toISOString();
  const userId = existing?.id || uuid('USR');
  const consentId = uuid('CNS');
  const verificationId = uuid('EVR');
  const verificationCode = makeVerificationCode();
  const codeHash = await sha256(verificationCode);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const userAgent = request.headers.get('user-agent') || null;
  const ipHash = await requestIpHash(request);

  const statements = [];
  if (!existing) {
    statements.push(env.DB.prepare(`
      INSERT INTO users (id, email, display_name, account_type, status, password_hash, email_verified_at, created_at, updated_at)
      VALUES (?, ?, NULL, 'member', 'pending', NULL, NULL, ?, ?)
    `).bind(userId, email, now, now));
  }

  statements.push(env.DB.prepare(`
    INSERT INTO member_consents
    (id, user_id, invitation_id, email, consent_version, accepted, accepted_at, user_agent, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).bind(consentId, userId, invitation.id, email, MEMBER_CONSENT_VERSION, now, userAgent, ipHash, now));

  statements.push(env.DB.prepare(`
    UPDATE email_verifications SET used_at = ?
    WHERE user_id = ? AND used_at IS NULL
  `).bind(now, userId));

  statements.push(env.DB.prepare(`
    INSERT INTO email_verifications (id, user_id, code_hash, created_at, expires_at, used_at, attempt_count)
    VALUES (?, ?, ?, ?, ?, NULL, 0)
  `).bind(verificationId, userId, codeHash, now, expiresAt));

  await env.DB.batch(statements);

  await recordAudit(env, {
    category: 'Account Access',
    eventType: 'member_consent_accepted',
    actorUserId: userId,
    subjectType: 'member_consent',
    subjectId: consentId,
    details: { consentVersion: MEMBER_CONSENT_VERSION, invitationId: invitation.id }
  });

  const devCodeAllowed = String(env.MEMBER_SIGNUP_DEV_CODES || '').toLowerCase() === 'true' && usedAccessCode;
  return json({
    ok: true,
    consentAccepted: true,
    consentVersion: MEMBER_CONSENT_VERSION,
    emailVerification: {
      required: true,
      expiresAt,
      delivery: 'not_connected',
      message: 'Email delivery is not connected yet. Verification codes are generated and stored securely server-side.',
      developmentCode: devCodeAllowed ? verificationCode : null
    }
  }, { status: 201 });
}

async function handleVerifyEmail(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  const verificationCode = String(body?.verificationCode || '').trim();
  if (!email || !verificationCode) return json({ ok: false, error: 'Email and verification code are required.' }, { status: 400 });

  const user = await env.DB.prepare(`SELECT id, account_type, status FROM users WHERE email = ? LIMIT 1`).bind(email).first();
  if (!user || user.account_type !== 'member' || user.status !== 'pending') return json({ ok: false, error: 'No pending member registration was found.' }, { status: 404 });

  const verification = await env.DB.prepare(`
    SELECT id, code_hash, expires_at, attempt_count
    FROM email_verifications
    WHERE user_id = ? AND used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(user.id).first();
  if (!verification) return json({ ok: false, error: 'No active verification code was found.' }, { status: 404 });
  if (verification.expires_at <= new Date().toISOString()) return json({ ok: false, error: 'The verification code expired. Restart signup to generate a new code.' }, { status: 410 });
  if (Number(verification.attempt_count || 0) >= 6) return json({ ok: false, error: 'Too many verification attempts. Restart signup to generate a new code.' }, { status: 429 });

  const providedHash = await sha256(verificationCode);
  if (providedHash !== verification.code_hash) {
    await env.DB.prepare(`UPDATE email_verifications SET attempt_count = attempt_count + 1 WHERE id = ?`).bind(verification.id).run();
    return json({ ok: false, error: 'That verification code is incorrect.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_verifications SET used_at = ?, attempt_count = attempt_count + 1 WHERE id = ?`).bind(now, verification.id),
    env.DB.prepare(`UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, user.id)
  ]);

  await recordAudit(env, {
    category: 'Account Access',
    eventType: 'member_email_verified',
    actorUserId: user.id,
    subjectType: 'user',
    subjectId: user.id
  });

  return json({ ok: true, verified: true });
}

async function handleComplete(request, env) {
  if (!databaseReady(env)) return databaseRequired();
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  const displayName = String(body?.displayName || '').trim();
  const password = String(body?.password || '');
  const planCode = String(body?.planCode || '');
  const plan = PLAN_OPTIONS[planCode];

  if (!email) return json({ ok: false, error: 'Email is required.' }, { status: 400 });
  if (!displayName || displayName.length > 120) return json({ ok: false, error: 'Your name is required and must be 120 characters or fewer.' }, { status: 400 });
  if (password.length < 14 || password.length > 200) return json({ ok: false, error: 'Password must be between 14 and 200 characters.' }, { status: 400 });
  if (!plan) return json({ ok: false, error: 'Choose a valid Aria plan.' }, { status: 400 });

  const user = await env.DB.prepare(`SELECT id, account_type, status, email_verified_at FROM users WHERE email = ? LIMIT 1`).bind(email).first();
  if (!user || user.account_type !== 'member' || user.status !== 'pending') return json({ ok: false, error: 'No pending member registration was found.' }, { status: 404 });
  if (!user.email_verified_at) return json({ ok: false, error: 'Verify your email before creating the account.' }, { status: 403 });

  const consent = await env.DB.prepare(`
    SELECT id, invitation_id, consent_version, accepted_at
    FROM member_consents
    WHERE user_id = ? AND accepted = 1
    ORDER BY accepted_at DESC
    LIMIT 1
  `).bind(user.id).first();
  if (!consent || consent.consent_version !== MEMBER_CONSENT_VERSION) return json({ ok: false, error: 'Current member consent is required before account creation.' }, { status: 403 });

  const invitation = await env.DB.prepare(`
    SELECT id, status, expires_at
    FROM member_invitations
    WHERE id = ? AND email = ?
    LIMIT 1
  `).bind(consent.invitation_id, email).first();
  if (!invitation || invitation.status !== 'pending') return json({ ok: false, error: 'This member invitation is no longer available.' }, { status: 409 });
  if (invitation.expires_at && invitation.expires_at <= new Date().toISOString()) return json({ ok: false, error: 'This member invitation expired.' }, { status: 410 });

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const planSelectionId = uuid('PLN');

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET display_name = ?, password_hash = ?, status = 'active', updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).bind(displayName, passwordHash, now, user.id),
    env.DB.prepare(`
      UPDATE member_invitations SET status = 'used', used_at = ?
      WHERE id = ? AND status = 'pending'
    `).bind(now, invitation.id),
    env.DB.prepare(`
      INSERT INTO member_plan_selections
      (id, user_id, plan_code, billing_interval, price_cents, currency, status, selected_at, activated_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, NULL)
    `).bind(
      planSelectionId,
      user.id,
      plan.code,
      plan.billingInterval,
      plan.priceCents,
      plan.status,
      now,
      plan.status === 'active' ? now : null
    )
  ]);

  await recordAudit(env, {
    category: 'Account Access',
    eventType: 'member_account_created',
    actorUserId: user.id,
    subjectType: 'user',
    subjectId: user.id,
    details: { planCode: plan.code, planStatus: plan.status }
  });

  return json({
    ok: true,
    accountCreated: true,
    member: { id: user.id, email, displayName },
    plan: {
      code: plan.code,
      billingInterval: plan.billingInterval,
      priceCents: plan.priceCents,
      status: plan.status,
      paymentRequired: plan.status === 'payment_required'
    },
    message: plan.status === 'payment_required'
      ? 'Your Aria account is active. Lifeline billing is not connected yet, so paid Lifeline access is not active.'
      : 'Your Aria Free account is ready.'
  }, { status: 201 });
}

export async function handleMemberSignupRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/member-signup/consent' && request.method === 'POST') return handleConsent(request, env);
  if (url.pathname === '/api/member-signup/verify-email' && request.method === 'POST') return handleVerifyEmail(request, env);
  if (url.pathname === '/api/member-signup/complete' && request.method === 'POST') return handleComplete(request, env);
  if (url.pathname === '/api/member-signup/config' && request.method === 'GET') {
    return json({
      ok: true,
      consentVersion: MEMBER_CONSENT_VERSION,
      plans: [
        { code: 'free', name: 'Aria Free', price: '$0', status: 'available' },
        { code: 'lifeline_weekly', name: 'Aria Lifeline', price: '$4.99/week', status: 'payment_not_connected' },
        { code: 'lifeline_annual', name: 'Aria Lifeline', price: '$259/year', status: 'payment_not_connected' }
      ]
    });
  }
  return null;
}
