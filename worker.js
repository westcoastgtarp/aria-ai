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

function notReady(area) {
  return json({
    ok: false,
    status: 'not_configured',
    area,
    message: 'Backend foundation is deployed, but this protected service is not enabled until persistent storage and production authentication are connected.'
  }, { status: 501 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'aria-ai-backend',
        environment: 'prototype',
        version: '0.1.0-backend-foundation',
        time: new Date().toISOString()
      });
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      return json({
        ok: true,
        backend: 'online',
        staticAssets: 'online',
        authentication: 'pending-production-implementation',
        persistentDatabase: 'pending-connection',
        invitations: 'frontend-prototype-only',
        auditLogging: 'frontend-prototype-only',
        tickets: 'frontend-prototype-only'
      });
    }

    if (url.pathname.startsWith('/api/auth/')) return notReady('authentication');
    if (url.pathname.startsWith('/api/invitations/')) return notReady('account invitations');
    if (url.pathname.startsWith('/api/audit/')) return notReady('audit logging');
    if (url.pathname.startsWith('/api/tickets/')) return notReady('ticket storage');

    if (url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'API route not found.' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
