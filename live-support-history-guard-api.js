function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function normalized(value){return String(value||'').trim().toLowerCase();}

async function currentStaff(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

export async function handleLiveSupportHistoryGuardRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/staff/live-support/records'||request.method!=='GET')return null;
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return json({ok:false,error:'Authentication required.'},{status:401});
  if(!['founder','lead supervisor'].includes(normalized(session.role_name))){
    return json({ok:false,error:'Closed Live Support history is restricted to Founder and Lead Supervisor.'},{status:403});
  }
  return null;
}
