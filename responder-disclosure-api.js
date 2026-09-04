function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      ...(init.headers||{})
    }
  });
}

function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];
  }));
}
function clean(value,max=1000){return String(value||'').trim().slice(0,max);}
function norm(value){return clean(value,160).toLowerCase();}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
async function readBody(request){try{return await request.json();}catch{return {};}}

const PRIVILEGED_ROLES=['founder','lead supervisor','supervisor of live support','supervisor'];
const REVIEW_ROLES=['founder','lead supervisor','supervisor of live support','privacy officer','compliance officer','security lead','security administrator'];
const VERIFY_METHODS=['agency_callback','dispatch_confirmation','credential_plus_agency_callback','in_person_credential','other_documented_method'];
const DISCLOSURE_FIELDS=['member_identity','current_lifeline_status','incident_summary','medication_summary','care_circle_contact_information','member_provided_location'];

async function currentStaff(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

function isLiveSupportSpecialist(session){
  return norm(session?.role_name)==='live support specialist'&&norm(session?.department)==='operations';
}
function canRecord(session){return PRIVILEGED_ROLES.includes(norm(session?.role_name))||isLiveSupportSpecialist(session);}
function canReview(session){return REVIEW_ROLES.includes(norm(session?.role_name))||isLiveSupportSpecialist(session);}

async function requireStaff(request,env,mode='record'){
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return {error:json({ok:false,error:'Authentication required.'},{status:401})};
  if(mode==='record'&&!canRecord(session))return {error:json({ok:false,error:'Responder disclosure recording is not available for this staff role.'},{status:403})};
  if(mode==='review'&&!canReview(session))return {error:json({ok:false,error:'Responder disclosure history is restricted to authorized staff.'},{status:403})};
  return {session};
}

async function audit(env,session,eventType,memberUserId,ticketId,details={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
    VALUES (?,'Responder Disclosure',?,?,'member',?,?,?,?,?,?)
  `).bind(uuid('AUD'),eventType,session.user_id,memberUserId,ticketId||null,JSON.stringify(details),now,now).run();
}

async function activeCase(env,ticketId){
  return env.DB.prepare(`
    SELECT t.id,t.created_by_user_id AS member_user_id,t.assigned_to_user_id,t.status,
      u.display_name AS member_name,u.email AS member_email,
      li.id AS incident_id,li.current_risk_level
    FROM tickets t
    JOIN users u ON u.id=t.created_by_user_id
    LEFT JOIN lifeline_incidents li ON li.related_ticket_id=t.id AND li.status!='closed'
    WHERE t.id=? AND t.department='Operations' AND t.category='Member Communication'
    LIMIT 1
  `).bind(ticketId).first();
}

async function listTargets(env,session){
  const specialist=isLiveSupportSpecialist(session);
  const sql=`
    SELECT t.id AS ticket_id,t.created_by_user_id AS member_user_id,t.assigned_to_user_id,t.status,
      u.display_name AS member_name,u.email AS member_email,
      li.id AS incident_id,li.current_risk_level
    FROM tickets t
    JOIN users u ON u.id=t.created_by_user_id
    LEFT JOIN lifeline_incidents li ON li.related_ticket_id=t.id AND li.status!='closed'
    WHERE t.department='Operations' AND t.category='Member Communication' AND t.status!='Closed'
      ${specialist?'AND t.assigned_to_user_id=?':''}
    ORDER BY t.updated_at DESC LIMIT 100
  `;
  const result=specialist?await env.DB.prepare(sql).bind(session.user_id).all():await env.DB.prepare(sql).all();
  return json({ok:true,targets:(result.results||[]).map(row=>({
    ticketId:row.ticket_id,
    memberUserId:row.member_user_id,
    memberName:row.member_name||row.member_email||'Member',
    memberEmail:row.member_email||'',
    incidentId:row.incident_id||null,
    currentRiskLevel:row.current_risk_level||null,
    assignedToCurrentStaff:row.assigned_to_user_id===session.user_id
  }))});
}

async function createDisclosure(request,env,session){
  const data=await readBody(request);
  const ticketId=clean(data.relatedTicketId,120);
  if(!ticketId)return json({ok:false,error:'An active Member Communication ticket is required.'},{status:400});
  const ticket=await activeCase(env,ticketId);
  if(!ticket)return json({ok:false,error:'Active Member Communication case not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'Closed support cases cannot create new responder disclosures.'},{status:409});
  if(isLiveSupportSpecialist(session)&&ticket.assigned_to_user_id!==session.user_id){
    return json({ok:false,error:'Live Support Specialists may record disclosures only for cases assigned to them.'},{status:403});
  }

  const responderName=clean(data.responderName,160);
  const responderAgency=clean(data.responderAgency,180);
  const responderRole=clean(data.responderRole,120);
  const credentialReference=clean(data.credentialReference,120)||null;
  const callbackNumber=clean(data.callbackNumber,80)||null;
  const verificationMethod=clean(data.verificationMethod,80);
  const verificationNotes=clean(data.verificationNotes,1000);
  const disclosureReason=clean(data.disclosureReason,1200);
  const disclosedFields=[...new Set((Array.isArray(data.disclosedFields)?data.disclosedFields:[]).map(String).filter(v=>DISCLOSURE_FIELDS.includes(v)))];

  if(responderName.length<2||responderAgency.length<2||responderRole.length<2){
    return json({ok:false,error:'Responder name, agency, and role are required.'},{status:400});
  }
  if(!VERIFY_METHODS.includes(verificationMethod))return json({ok:false,error:'Choose an approved responder verification method.'},{status:400});
  if(data.verificationConfirmed!==true)return json({ok:false,error:'Responder identity must be confirmed before disclosure is logged.'},{status:400});
  if(verificationNotes.length<10)return json({ok:false,error:'Document how responder identity was verified.'},{status:400});
  if((verificationMethod==='agency_callback'||verificationMethod==='credential_plus_agency_callback')&&!callbackNumber){
    return json({ok:false,error:'A callback number is required for callback-based verification.'},{status:400});
  }
  if(disclosureReason.length<20)return json({ok:false,error:'A specific disclosure reason of at least 20 characters is required.'},{status:400});
  if(!disclosedFields.length)return json({ok:false,error:'Record at least one category of information disclosed.'},{status:400});

  const now=new Date().toISOString();
  const id=uuid('RDL');
  await env.DB.prepare(`
    INSERT INTO responder_disclosures
    (id,member_user_id,related_ticket_id,related_incident_id,responder_name,responder_agency,responder_role,credential_reference,callback_number,verification_method,verification_notes,disclosure_reason,disclosed_fields_json,recorded_by_user_id,verified_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id,ticket.member_user_id,ticket.id,ticket.incident_id||null,responderName,responderAgency,responderRole,
    credentialReference,callbackNumber,verificationMethod,verificationNotes,disclosureReason,JSON.stringify(disclosedFields),session.user_id,now,now
  ).run();

  await audit(env,session,'responder_verified_and_disclosure_logged',ticket.member_user_id,ticket.id,{
    disclosureId:id,
    relatedIncidentId:ticket.incident_id||null,
    responderAgency,
    responderRole,
    verificationMethod,
    disclosedFields,
    minimumNecessaryAcknowledged:true
  });

  return json({ok:true,disclosure:{id,ticketId:ticket.id,memberUserId:ticket.member_user_id,responderName,responderAgency,responderRole,verificationMethod,disclosedFields,verifiedAt:now,createdAt:now}},{status:201});
}

async function listDisclosures(request,env,session){
  const url=new URL(request.url);
  const ticketId=clean(url.searchParams.get('ticketId'),120);
  const memberUserId=clean(url.searchParams.get('memberUserId'),120);
  const where=[];const binds=[];
  if(ticketId){where.push('d.related_ticket_id=?');binds.push(ticketId);}
  if(memberUserId){where.push('d.member_user_id=?');binds.push(memberUserId);}
  if(isLiveSupportSpecialist(session)){
    where.push('d.recorded_by_user_id=?');binds.push(session.user_id);
  }
  const result=await env.DB.prepare(`
    SELECT d.*,u.display_name AS staff_name,u.email AS staff_email,m.display_name AS member_name,m.email AS member_email
    FROM responder_disclosures d
    JOIN users u ON u.id=d.recorded_by_user_id
    JOIN users m ON m.id=d.member_user_id
    ${where.length?`WHERE ${where.join(' AND ')}`:''}
    ORDER BY d.created_at DESC LIMIT 100
  `).bind(...binds).all();
  return json({ok:true,disclosures:(result.results||[]).map(row=>{
    let fields=[];try{fields=JSON.parse(row.disclosed_fields_json||'[]');}catch{}
    return {
      id:row.id,memberUserId:row.member_user_id,memberName:row.member_name||row.member_email||'Member',
      relatedTicketId:row.related_ticket_id,relatedIncidentId:row.related_incident_id||null,
      responderName:row.responder_name,responderAgency:row.responder_agency,responderRole:row.responder_role,
      credentialReference:row.credential_reference||null,callbackNumber:row.callback_number||null,
      verificationMethod:row.verification_method,verificationNotes:row.verification_notes,
      disclosureReason:row.disclosure_reason,disclosedFields:fields,
      recordedBy:row.staff_name||row.staff_email||'Staff',verifiedAt:row.verified_at,createdAt:row.created_at
    };
  })});
}

export async function handleResponderDisclosureRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/staff/responder-disclosures'))return null;

  if(url.pathname==='/api/staff/responder-disclosures/targets'&&request.method==='GET'){
    const auth=await requireStaff(request,env,'record');
    if(auth.error)return auth.error;
    return listTargets(env,auth.session);
  }
  if(url.pathname==='/api/staff/responder-disclosures'&&request.method==='POST'){
    const auth=await requireStaff(request,env,'record');
    if(auth.error)return auth.error;
    return createDisclosure(request,env,auth.session);
  }
  if(url.pathname==='/api/staff/responder-disclosures'&&request.method==='GET'){
    const auth=await requireStaff(request,env,'review');
    if(auth.error)return auth.error;
    return listDisclosures(request,env,auth.session);
  }
  return json({ok:false,error:'Responder disclosure route not found.'},{status:404});
}
