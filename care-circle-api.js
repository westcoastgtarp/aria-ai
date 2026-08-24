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

function uuid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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
    const index = v.indexOf('=');
    return [v.slice(0, index), decodeURIComponent(v.slice(index + 1))];
  }));
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function currentMember(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request).aria_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id, u.email, u.display_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.account_type = 'member'
      AND u.status = 'active'
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
}

async function requireMember(request, env) {
  const member = await currentMember(request, env);
  if (!member) return { error: json({ ok: false, error: 'Member authentication required.' }, { status: 401 }) };
  return { member };
}

async function recordAudit(env, event) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, details_json, occurred_at, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uuid('AUD'),
    'Care Circle',
    event.eventType,
    event.actorUserId,
    'care_circle_contact',
    event.subjectId,
    JSON.stringify(event.details || {}),
    now,
    now
  ).run();
}

function normalizePhone(value = '') {
  const raw = String(value).trim();
  const cleaned = raw.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
  return cleaned.replace(/\D/g, '');
}

function validateContact(body) {
  const displayName = String(body?.displayName || '').trim();
  const relationship = String(body?.relationship || '').trim();
  const phone = normalizePhone(body?.phone);
  const priority = Number(body?.priority || 1);
  const consentConfirmed = body?.consentConfirmed === true;

  if (!displayName || displayName.length > 120) return { error: 'Contact name is required and must be 120 characters or fewer.' };
  if (relationship.length > 80) return { error: 'Relationship must be 80 characters or fewer.' };
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return { error: 'Enter a valid contact phone number.' };
  if (!Number.isInteger(priority) || priority < 1 || priority > 10) return { error: 'Priority must be between 1 and 10.' };
  if (!consentConfirmed) return { error: 'Confirm that this person agreed to be an approved Aria contact.' };

  return { displayName, relationship: relationship || null, phone, priority, consentConfirmed };
}

async function listContacts(request, env) {
  const auth = await requireMember(request, env);
  if (auth.error) return auth.error;

  const result = await env.DB.prepare(`
    SELECT id, display_name, relationship, phone, priority, consent_confirmed, status, created_at, updated_at
    FROM care_circle_contacts
    WHERE user_id = ? AND status = 'active'
    ORDER BY priority ASC, created_at ASC
  `).bind(auth.member.user_id).all();

  return json({ ok: true, contacts: result.results || [] });
}

async function createContact(request, env) {
  const auth = await requireMember(request, env);
  if (auth.error) return auth.error;
  const validated = validateContact(await readBody(request));
  if (validated.error) return json({ ok: false, error: validated.error }, { status: 400 });

  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM care_circle_contacts
    WHERE user_id = ? AND status = 'active'
  `).bind(auth.member.user_id).first();
  if (Number(count?.count || 0) >= 10) {
    return json({ ok: false, error: 'Care Circle currently supports up to 10 active approved contacts.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const id = uuid('CC');
  await env.DB.prepare(`
    INSERT INTO care_circle_contacts
    (id, user_id, display_name, relationship, phone, priority, consent_confirmed, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
  `).bind(
    id,
    auth.member.user_id,
    validated.displayName,
    validated.relationship,
    validated.phone,
    validated.priority,
    now,
    now
  ).run();

  await recordAudit(env, {
    eventType: 'approved_contact_added',
    actorUserId: auth.member.user_id,
    subjectId: id,
    details: { priority: validated.priority, consentConfirmed: true }
  });

  return json({ ok: true, contact: { id, ...validated, status: 'active', createdAt: now, updatedAt: now } }, { status: 201 });
}

async function updateContact(request, env, id) {
  const auth = await requireMember(request, env);
  if (auth.error) return auth.error;

  const existing = await env.DB.prepare(`
    SELECT id FROM care_circle_contacts
    WHERE id = ? AND user_id = ? AND status = 'active'
    LIMIT 1
  `).bind(id, auth.member.user_id).first();
  if (!existing) return json({ ok: false, error: 'Approved contact not found.' }, { status: 404 });

  const validated = validateContact(await readBody(request));
  if (validated.error) return json({ ok: false, error: validated.error }, { status: 400 });
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE care_circle_contacts
    SET display_name = ?, relationship = ?, phone = ?, priority = ?, consent_confirmed = 1, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    validated.displayName,
    validated.relationship,
    validated.phone,
    validated.priority,
    now,
    id,
    auth.member.user_id
  ).run();

  await recordAudit(env, {
    eventType: 'approved_contact_updated',
    actorUserId: auth.member.user_id,
    subjectId: id,
    details: { priority: validated.priority, consentConfirmed: true }
  });

  return json({ ok: true, id, updatedAt: now });
}

async function removeContact(request, env, id) {
  const auth = await requireMember(request, env);
  if (auth.error) return auth.error;
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE care_circle_contacts
    SET status = 'disabled', updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).bind(now, id, auth.member.user_id).run();

  if (!result.meta?.changes) return json({ ok: false, error: 'Approved contact not found.' }, { status: 404 });

  await recordAudit(env, {
    eventType: 'approved_contact_removed',
    actorUserId: auth.member.user_id,
    subjectId: id,
    details: {}
  });

  return json({ ok: true, removed: true });
}

export async function handleCareCircleRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/member/care-circle' && request.method === 'GET') return listContacts(request, env);
  if (url.pathname === '/api/member/care-circle' && request.method === 'POST') return createContact(request, env);

  const match = url.pathname.match(/^\/api\/member\/care-circle\/([^/]+)$/);
  if (match && request.method === 'PATCH') return updateContact(request, env, decodeURIComponent(match[1]));
  if (match && request.method === 'DELETE') return removeContact(request, env, decodeURIComponent(match[1]));
  return null;
}
