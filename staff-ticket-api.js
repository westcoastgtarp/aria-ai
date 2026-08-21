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

async function requireStaff(request, env) {
  const session = await currentSession(request, env);
  if (!session || session.account_type !== 'staff' || session.status !== 'active') {
    return { error: json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };
  }
  return { session };
}

function roleKey(session) {
  return String(session?.staff_role || '').trim().toLowerCase();
}

function isGlobalTicketRole(session) {
  return ['founder', 'founder / co-founder', 'co-founder', 'system administrator', 'system admin'].includes(roleKey(session));
}

const ticketDepartments = ['Operations', 'IT', 'Engineering'];
const categoryMap = {
  Operations: ['Customer Service','Sales','Refunds','Audits','Billing Support','Privacy & Compliance','Other Operations'],
  IT: ['Aria AI','Aria Lifeline','Staff Systems','Access & Accounts','Software','Integrations','Service Health'],
  Engineering: ['Infrastructure','Backups','Recovery','Hardware','Deployment','Member Recovery Tooling']
};

function canAccessDepartment(session, department) {
  if (isGlobalTicketRole(session)) return true;
  return String(session?.department || '').trim().toLowerCase() === String(department || '').trim().toLowerCase();
}

async function recordAudit(env, event) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, related_ticket_id, details_json, occurred_at, recorded_at)
    VALUES (?, 'Staff Operations', ?, ?, 'ticket', ?, ?, ?, ?, ?)
  `).bind(
    uuid('AUD'), event.eventType, event.actorUserId || null,
    event.ticketId || null, event.ticketId || null,
    JSON.stringify(event.details || {}), now, now
  ).run();
}

function ticketId(department) {
  const prefix = { Operations: 'OPS', IT: 'IT', Engineering: 'ENG' }[department] || 'TKT';
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
}

function mapTicket(row, notes = []) {
  return {
    id: row.id,
    department: row.department,
    category: row.category,
    title: row.title,
    details: row.description || '',
    priority: row.priority,
    status: row.status,
    progress: Number(row.progress) || 0,
    created: row.created_at,
    updated: row.updated_at,
    createdBy: row.created_by_name || row.created_by_email || 'Staff',
    assignedTo: row.assigned_to_name || row.assigned_to_email || null,
    notes
  };
}

async function listTickets(request, env) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const session = auth.session;

  let query = `
    SELECT t.*,
      creator.display_name AS created_by_name, creator.email AS created_by_email,
      assignee.display_name AS assigned_to_name, assignee.email AS assigned_to_email
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
  `;
  const binds = [];
  if (!isGlobalTicketRole(session)) {
    const department = String(session.department || '').trim();
    if (!ticketDepartments.includes(department)) return json({ ok: true, tickets: [] });
    query += ` WHERE t.department = ?`;
    binds.push(department);
  }
  query += ` ORDER BY t.updated_at DESC LIMIT 200`;

  const ticketResult = await env.DB.prepare(query).bind(...binds).all();
  const rows = ticketResult.results || [];
  if (!rows.length) return json({ ok: true, tickets: [] });

  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const noteResult = await env.DB.prepare(`
    SELECT n.id, n.ticket_id, n.note, n.created_at,
      u.display_name AS author_name, u.email AS author_email
    FROM ticket_notes n
    JOIN users u ON u.id = n.author_user_id
    WHERE n.ticket_id IN (${placeholders})
    ORDER BY n.created_at ASC
  `).bind(...ids).all();

  const notesByTicket = new Map();
  for (const note of noteResult.results || []) {
    if (!notesByTicket.has(note.ticket_id)) notesByTicket.set(note.ticket_id, []);
    notesByTicket.get(note.ticket_id).push({
      id: note.id,
      author: note.author_name || note.author_email || 'Staff',
      text: note.note,
      created: note.created_at
    });
  }

  return json({ ok: true, tickets: rows.map(row => mapTicket(row, notesByTicket.get(row.id) || [])) });
}

async function createTicket(request, env) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const department = String(body?.department || '').trim();
  const category = String(body?.category || '').trim();
  const priority = String(body?.priority || 'Normal').trim();
  const title = String(body?.title || '').trim();
  const description = String(body?.details || '').trim();

  if (!ticketDepartments.includes(department)) return json({ ok: false, error: 'Invalid ticket department.' }, { status: 400 });
  if (!canAccessDepartment(auth.session, department)) return json({ ok: false, error: 'You do not have access to this ticket queue.' }, { status: 403 });
  if (!categoryMap[department]?.includes(category)) return json({ ok: false, error: 'Invalid ticket category.' }, { status: 400 });
  if (!['Normal','High','Urgent'].includes(priority)) return json({ ok: false, error: 'Invalid ticket priority.' }, { status: 400 });
  if (!title || title.length > 80) return json({ ok: false, error: 'Ticket title is required and must be 80 characters or fewer.' }, { status: 400 });
  if (!description || description.length > 500) return json({ ok: false, error: 'Ticket details are required and must be 500 characters or fewer.' }, { status: 400 });

  const id = ticketId(department);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO tickets
    (id, department, category, title, description, priority, status, progress, created_by_user_id, assigned_to_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Open', 0, ?, NULL, ?, ?)
  `).bind(id, department, category, title, description, priority, auth.session.user_id, now, now).run();

  await recordAudit(env, {
    eventType: 'staff_ticket_created',
    actorUserId: auth.session.user_id,
    ticketId: id,
    details: { department, category, priority, title }
  });

  return json({ ok: true, id }, { status: 201 });
}

async function getAuthorizedTicket(env, session, id) {
  const ticket = await env.DB.prepare(`SELECT * FROM tickets WHERE id = ? LIMIT 1`).bind(id).first();
  if (!ticket) return { error: json({ ok: false, error: 'Ticket not found.' }, { status: 404 }) };
  if (!canAccessDepartment(session, ticket.department)) return { error: json({ ok: false, error: 'You do not have access to this ticket.' }, { status: 403 }) };
  return { ticket };
}

async function updateTicket(request, env, id) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const found = await getAuthorizedTicket(env, auth.session, id);
  if (found.error) return found.error;
  const body = await readBody(request);

  let progress = body?.progress == null ? Number(found.ticket.progress) : Number(body.progress);
  if (![0,25,50,75,100].includes(progress)) return json({ ok: false, error: 'Progress must be 0, 25, 50, 75, or 100.' }, { status: 400 });

  let status = String(body?.status || found.ticket.status);
  if (!['Open','In Progress','Closed'].includes(status)) return json({ ok: false, error: 'Invalid ticket status.' }, { status: 400 });
  if (progress === 100) status = 'Closed';
  else if (progress > 0) status = 'In Progress';
  else if (status === 'Closed') progress = 100;
  if (status === 'In Progress' && progress === 0) progress = 25;
  if (status === 'Open' && progress === 100) progress = 0;

  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE tickets SET status = ?, progress = ?, updated_at = ? WHERE id = ?`)
    .bind(status, progress, now, id).run();

  await recordAudit(env, {
    eventType: 'staff_ticket_updated',
    actorUserId: auth.session.user_id,
    ticketId: id,
    details: { fromStatus: found.ticket.status, toStatus: status, fromProgress: found.ticket.progress, toProgress: progress }
  });

  return json({ ok: true, status, progress, updatedAt: now });
}

async function addNote(request, env, id) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const found = await getAuthorizedTicket(env, auth.session, id);
  if (found.error) return found.error;
  const body = await readBody(request);
  const note = String(body?.note || '').trim();
  if (!note || note.length > 600) return json({ ok: false, error: 'Note is required and must be 600 characters or fewer.' }, { status: 400 });

  const noteId = uuid('NOTE');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ticket_notes (id, ticket_id, author_user_id, note, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(noteId, id, auth.session.user_id, note, now),
    env.DB.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).bind(now, id)
  ]);

  await recordAudit(env, {
    eventType: 'staff_ticket_note_added',
    actorUserId: auth.session.user_id,
    ticketId: id,
    details: { noteId }
  });

  return json({ ok: true, note: { id: noteId, author: auth.session.display_name || auth.session.email || 'Staff', text: note, created: now } }, { status: 201 });
}

export async function handleStaffTicketRoute(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/staff/tickets' && request.method === 'GET') return listTickets(request, env);
  if (url.pathname === '/api/staff/tickets' && request.method === 'POST') return createTicket(request, env);

  const noteMatch = url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)\/notes$/);
  if (noteMatch && request.method === 'POST') return addNote(request, env, decodeURIComponent(noteMatch[1]));

  const ticketMatch = url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)$/);
  if (ticketMatch && request.method === 'PATCH') return updateTicket(request, env, decodeURIComponent(ticketMatch[1]));
  return null;
}
