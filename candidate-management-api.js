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

async function requireHiringManager(request, env) {
  const session = await currentSession(request, env);
  if (!session || session.account_type !== 'staff' || session.status !== 'active') {
    return { error: json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };
  }

  const role = String(session.staff_role || '').trim().toLowerCase();
  const department = String(session.department || '').trim().toLowerCase();
  const allowed = ['founder', 'founder / co-founder', 'co-founder', 'system administrator', 'system admin', 'hr'];
  if (!allowed.includes(role) && department !== 'hr') {
    return { error: json({ ok: false, error: 'You do not have permission to manage hiring candidates.' }, { status: 403 }) };
  }

  return { session, role };
}

async function recordAudit(env, event) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, details_json, occurred_at, recorded_at)
    VALUES (?, 'Hiring & Onboarding', ?, ?, 'candidate', ?, ?, ?, ?)
  `).bind(
    uuid('AUD'),
    event.eventType,
    event.actorUserId || null,
    event.subjectId || null,
    JSON.stringify(event.details || {}),
    now,
    now
  ).run();
}

function isFounder(role) {
  return ['founder', 'founder / co-founder', 'co-founder'].includes(String(role || '').toLowerCase());
}

async function manageCandidate(request, env, candidateId) {
  const auth = await requireHiringManager(request, env);
  if (auth.error) return auth.error;

  const body = await readBody(request);
  const action = String(body?.action || '').trim().toLowerCase();
  if (!['revoke', 'archive', 'delete'].includes(action)) {
    return json({ ok: false, error: 'Unsupported candidate action.' }, { status: 400 });
  }

  const candidate = await env.DB.prepare(`
    SELECT id, full_name, email, department, expected_role, status
    FROM hiring_candidates
    WHERE id = ?
    LIMIT 1
  `).bind(candidateId).first();

  if (!candidate) return json({ ok: false, error: 'Candidate not found.' }, { status: 404 });

  if (action === 'delete') {
    if (!isFounder(auth.role)) {
      return json({ ok: false, error: 'Only Founder can permanently delete hiring records.' }, { status: 403 });
    }

    await recordAudit(env, {
      eventType: 'candidate_permanently_deleted',
      actorUserId: auth.session.user_id,
      subjectId: candidate.id,
      details: {
        fullName: candidate.full_name,
        email: candidate.email,
        department: candidate.department,
        expectedRole: candidate.expected_role,
        previousStatus: candidate.status
      }
    });

    await env.DB.batch([
      env.DB.prepare(`UPDATE job_applications SET candidate_id = NULL, updated_at = ? WHERE candidate_id = ?`)
        .bind(new Date().toISOString(), candidate.id),
      env.DB.prepare(`DELETE FROM onboarding_submissions WHERE candidate_id = ?`).bind(candidate.id),
      env.DB.prepare(`DELETE FROM hiring_candidates WHERE id = ?`).bind(candidate.id)
    ]);

    return json({ ok: true, action: 'delete', deleted: true });
  }

  const eventType = action === 'revoke' ? 'candidate_revoked' : 'candidate_archived';
  const now = new Date().toISOString();
  const invalidTokenHash = await sha256(`${action}:${candidate.id}:${crypto.randomUUID()}:${now}`);

  await env.DB.prepare(`
    UPDATE hiring_candidates
    SET status = 'archived', onboarding_token_hash = ?, onboarding_expires_at = ?
    WHERE id = ?
  `).bind(invalidTokenHash, now, candidate.id).run();

  await recordAudit(env, {
    eventType,
    actorUserId: auth.session.user_id,
    subjectId: candidate.id,
    details: {
      fullName: candidate.full_name,
      email: candidate.email,
      department: candidate.department,
      expectedRole: candidate.expected_role,
      previousStatus: candidate.status
    }
  });

  return json({ ok: true, action, status: 'archived' });
}

export async function handleCandidateManagementRoute(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/staff\/hiring\/candidates\/([^/]+)\/action$/);
  if (match && request.method === 'POST') {
    return manageCandidate(request, env, decodeURIComponent(match[1]));
  }
  return null;
}
