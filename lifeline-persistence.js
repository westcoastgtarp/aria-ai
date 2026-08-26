const RISK_ORDER={concern:1,high:2,critical:3};

function nowIso(){return new Date().toISOString();}
function incidentId(){return `LFL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;}
function eventId(){return `LFLE-${crypto.randomUUID()}`;}
function normalizeRisk(value){const v=String(value||'').toLowerCase();return ['concern','high','critical'].includes(v)?v:null;}
function isMissingTableError(error){return /no such table:\s*lifeline_(incidents|events)/i.test(String(error?.message||error||''));}

export async function recordLifelineSignal(env,{memberUserId,riskLevel,confidence=null,source='lifeline_monitor',reason=''}){
  const risk=normalizeRisk(riskLevel);
  if(!env?.DB||!memberUserId||!risk)return {persisted:false,incidentId:null,reason:'not_applicable'};
  const now=nowIso();
  try{
    let incident=await env.DB.prepare(`
      SELECT id,highest_risk_level,current_risk_level,status
      FROM lifeline_incidents
      WHERE member_user_id=? AND status!='closed'
      ORDER BY updated_at DESC LIMIT 1
    `).bind(memberUserId).first();

    if(!incident){
      const id=incidentId();
      await env.DB.prepare(`
        INSERT INTO lifeline_incidents
        (id,member_user_id,status,highest_risk_level,current_risk_level,source,started_at,last_signal_at,created_at,updated_at)
        VALUES (?,?,'open',?,?,?,?,?,?,?)
      `).bind(id,memberUserId,risk,risk,source,now,now,now,now).run();
      incident={id,highest_risk_level:risk,current_risk_level:risk,status:'open'};
    }else{
      const highest=(RISK_ORDER[risk]||0)>(RISK_ORDER[incident.highest_risk_level]||0)?risk:incident.highest_risk_level;
      await env.DB.prepare(`
        UPDATE lifeline_incidents
        SET highest_risk_level=?,current_risk_level=?,last_signal_at=?,updated_at=?
        WHERE id=?
      `).bind(highest,risk,now,now,incident.id).run();
      incident.highest_risk_level=highest;
      incident.current_risk_level=risk;
    }

    await env.DB.prepare(`
      INSERT INTO lifeline_events
      (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at)
      VALUES (?,?,?,?,?,'system',NULL,?,?,?)
    `).bind(eventId(),incident.id,memberUserId,'risk_signal',risk,JSON.stringify({confidence,source,reason:String(reason||'').slice(0,240)}),now,now).run();

    return {persisted:true,incidentId:incident.id,highestRiskLevel:incident.highest_risk_level};
  }catch(error){
    if(isMissingTableError(error))return {persisted:false,incidentId:null,reason:'migration_required'};
    throw error;
  }
}

export async function queueLifelineHumanSupport(env,{memberUserId,riskLevel,ticketId,trigger='automatic_distress_monitor'}){
  const risk=normalizeRisk(riskLevel);
  if(!env?.DB||!memberUserId||!risk||!ticketId)return {persisted:false,incidentId:null,reason:'not_applicable'};
  const now=nowIso();
  try{
    let incident=await env.DB.prepare(`
      SELECT id,highest_risk_level,current_risk_level,status
      FROM lifeline_incidents
      WHERE member_user_id=? AND status!='closed'
      ORDER BY updated_at DESC LIMIT 1
    `).bind(memberUserId).first();

    if(!incident){
      const id=incidentId();
      await env.DB.prepare(`
        INSERT INTO lifeline_incidents
        (id,member_user_id,status,highest_risk_level,current_risk_level,source,related_ticket_id,started_at,last_signal_at,escalated_at,created_at,updated_at)
        VALUES (?,?,'human_support_queued',?,?, 'lifeline_monitor',?,?,?,?,?,?)
      `).bind(id,memberUserId,risk,risk,ticketId,now,now,now,now,now).run();
      incident={id,highest_risk_level:risk,current_risk_level:risk,status:'human_support_queued'};
    }else{
      const highest=(RISK_ORDER[risk]||0)>(RISK_ORDER[incident.highest_risk_level]||0)?risk:incident.highest_risk_level;
      await env.DB.prepare(`
        UPDATE lifeline_incidents
        SET status='human_support_queued',highest_risk_level=?,current_risk_level=?,related_ticket_id=?,last_signal_at=?,escalated_at=COALESCE(escalated_at,?),updated_at=?
        WHERE id=?
      `).bind(highest,risk,ticketId,now,now,now,incident.id).run();
      incident.highest_risk_level=highest;
    }

    await env.DB.prepare(`
      INSERT INTO lifeline_events
      (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at)
      VALUES (?,?,?,?,?,'system',NULL,?,?,?)
    `).bind(eventId(),incident.id,memberUserId,'human_support_queued',risk,JSON.stringify({ticketId,trigger,channel:'chat_only'}),now,now).run();

    return {persisted:true,incidentId:incident.id,highestRiskLevel:incident.highest_risk_level};
  }catch(error){
    if(isMissingTableError(error))return {persisted:false,incidentId:null,reason:'migration_required'};
    throw error;
  }
}
