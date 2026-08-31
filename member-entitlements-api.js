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
    SELECT u.id AS user_id, u.email, u.display_name, u.account_type, u.status
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

function trialWindow(selectedAt) {
  const start = new Date(selectedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const remainingMs = Math.max(0, end.getTime() - now.getTime());
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    active: now < end,
    daysRemaining: Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
  };
}

async function handleEntitlements(request, env) {
  const member = await currentMember(request, env);
  if (!member) return json({ ok: false, error: 'Member authentication required.' }, { status: 401 });

  const selection = await env.DB.prepare(`
    SELECT id, plan_code, billing_interval, price_cents, status, selected_at, activated_at
    FROM member_plan_selections
    WHERE user_id = ?
    ORDER BY selected_at DESC
    LIMIT 1
  `).bind(member.user_id).first();

  const trial = selection?.selected_at ? trialWindow(selection.selected_at) : null;
  const paidActive = Boolean(
    selection &&
    String(selection.plan_code || '').startsWith('lifeline_') &&
    selection.status === 'active'
  );
  const assistantAccess = paidActive || Boolean(trial?.active);
  const mode = paidActive ? 'lifeline' : trial?.active ? 'trial' : 'free';

  return json({
    ok: true,
    member: { id: member.user_id, name: member.display_name, email: member.email },
    mode,
    plan: selection ? {
      code: selection.plan_code,
      billingInterval: selection.billing_interval,
      priceCents: selection.price_cents,
      status: selection.status,
      selectedAt: selection.selected_at,
      activatedAt: selection.activated_at
    } : { code: 'free', status: 'active' },
    trial: trial || { startsAt: null, endsAt: null, active: false, daysRemaining: 0 },
    entitlements: {
      medicationTracking: true,
      reminders: true,
      doseCheckoffs: true,
      approvedContactCalling: true,
      emergencyCalling: true,
      ariaAssistant: assistantAccess,
      lifelineConversationMonitoring: assistantAccess,
      enhancedEscalation: assistantAccess,
      incidentHistory: assistantAccess
    },
    fallback: assistantAccess
      ? null
      : {
          assistantUnavailable: true,
          message: 'Your 30-day Aria Assistant trial has ended. Medication tools and reminders remain available. You can still contact approved Care Circle contacts directly.',
          allowedActions: ['approved_contacts', 'emergency_calling']
        }
  });
}

function publicIncidentStatus(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'closed') return 'Closed';
  if (key === 'in_progress') return 'In progress';
  if (key === 'human_support_queued') return 'Support requested';
  return 'Open';
}

async function handleIncidentHistory(request, env) {
  const member = await currentMember(request, env);
  if (!member) return json({ ok: false, error: 'Member authentication required.' }, { status: 401 });

  const result = await env.DB.prepare(`
    SELECT id, status, started_at, escalated_at, claimed_at, closed_at, updated_at, related_ticket_id
    FROM lifeline_incidents
    WHERE member_user_id = ?
    ORDER BY started_at DESC
    LIMIT 100
  `).bind(member.user_id).all();

  return json({
    ok: true,
    incidents: (result.results || []).map(row => ({
      id: row.id,
      type: row.related_ticket_id ? 'Live Support Request' : 'Lifeline Event',
      status: publicIncidentStatus(row.status),
      startedAt: row.started_at,
      supportRequestedAt: row.escalated_at || null,
      connectedAt: row.claimed_at || null,
      closedAt: row.closed_at || null,
      updatedAt: row.updated_at
    }))
  });
}

export async function handleMemberEntitlementsRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/member/entitlements' && request.method === 'GET') {
    return handleEntitlements(request, env);
  }
  if (url.pathname === '/api/member/incidents' && request.method === 'GET') {
    return handleIncidentHistory(request, env);
  }
  return null;
}
