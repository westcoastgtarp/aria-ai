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

function asBool(value) {
  return value === 1 || value === true || value === '1';
}

function maskedPhone(value = '') {
  const raw = String(value || '');
  if (raw.length <= 4) return raw;
  return `${raw.slice(0, 2)}•••${raw.slice(-4)}`;
}

function buildPreview(contact) {
  const scopes = [];
  const excludedScopes = [];

  if (asBool(contact.share_support_event)) {
    scopes.push({
      key: 'support_event',
      label: 'Support request notice',
      value: 'The member requested and authorized Care Circle support.'
    });
  } else excludedScopes.push('support_event');

  if (asBool(contact.share_limited_status)) {
    scopes.push({
      key: 'limited_status',
      label: 'Limited support status',
      value: 'The member has asked for support. No additional personal details are included.'
    });
  } else excludedScopes.push('limited_status');

  if (asBool(contact.share_location)) {
    scopes.push({
      key: 'location',
      label: 'Permitted Lifeline-event location',
      value: 'Location may be included only when the member has separately enabled location access. No location is attached to this preview.'
    });
  } else excludedScopes.push('location');

  if (asBool(contact.share_medication_summary)) {
    scopes.push({
      key: 'medication_summary',
      label: 'Limited medication summary',
      value: 'Medication names may be included when a disclosure is delivered. No instructions or dose changes are added by Aria. No medication data is attached to this preview.'
    });
  } else excludedScopes.push('medication_summary');

  if (asBool(contact.share_chat_transcript)) {
    scopes.push({
      key: 'chat_transcript',
      label: 'Aria chat transcript',
      value: 'Transcript sharing is explicitly permitted for this contact. Transcript content is not attached to this preview.'
    });
  } else excludedScopes.push('chat_transcript');

  return { scopes, excludedScopes };
}

async function prepareOutreachPreview(request, env, contactId) {
  const member = await currentMember(request, env);
  if (!member) return json({ ok: false, error: 'Member authentication required.' }, { status: 401 });

  let body = null;
  try { body = await request.json(); } catch {}
  if (body?.authorized !== true) {
    return json({ ok: false, error: 'Member authorization is required before preparing a Care Circle disclosure.' }, { status: 400 });
  }

  const contact = await env.DB.prepare(`
    SELECT id, display_name, relationship, phone, priority, status, consent_confirmed,
      share_support_event, share_limited_status, share_location,
      share_medication_summary, share_chat_transcript, consent_scope_version
    FROM care_circle_contacts
    WHERE id = ? AND user_id = ? AND status = 'active' AND consent_confirmed = 1
    LIMIT 1
  `).bind(contactId, member.user_id).first();

  if (!contact) {
    return json({ ok: false, error: 'Approved Care Circle contact not found or consent has been revoked.' }, { status: 404 });
  }

  const preview = buildPreview(contact);
  if (!preview.scopes.length) {
    return json({ ok: false, error: 'This contact currently has no disclosure permissions enabled.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const previewId = uuid('CCP');

  await recordAudit(env, {
    eventType: 'care_circle_outreach_prepared',
    actorUserId: member.user_id,
    subjectId: contact.id,
    details: {
      previewId,
      memberAuthorized: true,
      previewOnly: true,
      deliveryAttempted: false,
      contactPriority: Number(contact.priority || 1),
      consentScopeVersion: contact.consent_scope_version || '2026-09-01',
      disclosedScopes: preview.scopes.map(item => item.key),
      excludedScopes: preview.excludedScopes
    }
  });

  return json({
    ok: true,
    previewOnly: true,
    deliveryAttempted: false,
    previewId,
    preparedAt: now,
    contact: {
      id: contact.id,
      displayName: contact.display_name,
      relationship: contact.relationship,
      priority: Number(contact.priority || 1),
      phone: maskedPhone(contact.phone)
    },
    disclosure: {
      scopeVersion: contact.consent_scope_version || '2026-09-01',
      items: preview.scopes,
      excludedScopes: preview.excludedScopes
    }
  });
}

export async function handleCareCircleOutreachRoute(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/member\/care-circle\/([^/]+)\/outreach-preview$/);
  if (match && request.method === 'POST') {
    return prepareOutreachPreview(request, env, decodeURIComponent(match[1]));
  }
  return null;
}
