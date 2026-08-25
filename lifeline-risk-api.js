const MODEL='@cf/meta/llama-3.1-8b-instruct-fast';

function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}
  });
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
async function currentMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.account_type='member' AND u.status='active' LIMIT 1`).bind(tokenHash,new Date().toISOString()).first();
}
function trialActive(selectedAt){const start=new Date(selectedAt);return !Number.isNaN(start.getTime())&&Date.now()<start.getTime()+(30*24*60*60*1000);}
async function hasLifelineAccess(env,userId){
  const selection=await env.DB.prepare(`SELECT plan_code,status,selected_at FROM member_plan_selections WHERE user_id=? ORDER BY selected_at DESC LIMIT 1`).bind(userId).first();
  if(!selection)return false;
  return (String(selection.plan_code||'').startsWith('lifeline_')&&selection.status==='active')||trialActive(selection.selected_at);
}
function cleanHistory(value){
  if(!Array.isArray(value))return [];
  return value.slice(-12).map(item=>({role:item?.role==='assistant'?'assistant':'user',content:String(item?.content||'').trim().slice(0,2000)})).filter(item=>item.content);
}
function fallbackRisk(text){
  const t=String(text||'').toLowerCase();
  const critical=['kill myself','suicide','want to die','end my life','can’t breathe','cant breathe','overdose','unconscious','immediate danger','not safe alone'];
  const high=['feel unsafe','need help now','someone is hurting me','alone and scared','severe pain','very dizzy','getting worse'];
  const concern=['scared','worried','dizzy','pain','don’t feel right','dont feel right','bad reaction','side effect','distressed','panic'];
  if(critical.some(k=>t.includes(k)))return 'critical';
  if(high.some(k=>t.includes(k)))return 'high';
  if(concern.some(k=>t.includes(k)))return 'concern';
  return 'normal';
}
function normalizeLevel(value){
  const level=String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ');
  if(level==='critical')return 'critical';
  if(level==='high'||level==='high risk')return 'high';
  if(level==='concern')return 'concern';
  return 'normal';
}
function extractJson(text){const raw=String(text||'').trim();try{return JSON.parse(raw);}catch{}const match=raw.match(/\{[\s\S]*\}/);if(!match)return null;try{return JSON.parse(match[0]);}catch{return null;}}
async function recordSafetyAudit(env,member,classification){
  if(!env.DB||classification.level==='normal')return;
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`AUD-${crypto.randomUUID()}`,'Lifeline Safety','lifeline_risk_classified',member.user_id,'member',member.user_id,JSON.stringify({level:classification.level,confidence:classification.confidence,source:classification.source}),now,now).run();
}

const RISK_PROMPT=`You are Aria Lifeline Risk Monitor. Your only job is to classify safety risk in a member conversation.

Evaluate the CURRENT member message in the context of the recent conversation. Look for emotional distress, self-harm or suicide risk, threats or violence, abuse, inability to stay safe, severe or rapidly worsening symptoms, overdose, breathing difficulty, loss of consciousness, or other language suggesting the person may need urgent human support.

Use exactly one level:
- normal: ordinary conversation, frustration, neutral questions, routine health/app questions, or no meaningful distress signal.
- concern: distress, fear, worry, pain, panic, confusion, or deterioration that merits supportive follow-up and closer monitoring.
- high: substantial safety concern or credible risk that should trigger an automatic trained-agent chat escalation.
- critical: strong indication of immediate or imminent danger, self-harm intent, overdose, inability to breathe, unconsciousness, active violence, or another urgent threat that should trigger an immediate trained-agent chat escalation.

Important rules:
- Consider conversation context, not isolated keywords. Quoting a phrase, asking a general question about suicide, or mentioning pain medication is not automatically distress.
- Repeated concern-level distress across several messages matters and may justify human review even if no single message is high or critical.
- Do not diagnose.
- Do not downgrade explicit immediate-danger statements because the member sounds calm.
- Do not recommend contacting third parties on Aria's behalf. Aria's company escalation is chat-only to trained internal support staff.
- Return JSON only with this schema: {"level":"normal|concern|high|critical","confidence":0.0,"reason":"brief non-diagnostic rationale"}.
- Never include private chain-of-thought. The reason must be a short summary suitable for an audit record.`;

async function classifyWithAI(env,message,history){
  const transcript=history.map(item=>`${item.role==='assistant'?'ARIA':'MEMBER'}: ${item.content}`).join('\n');
  const result=await env.AI.run(MODEL,{messages:[{role:'system',content:RISK_PROMPT},{role:'user',content:`Recent conversation:\n${transcript||'(none)'}\n\nCURRENT MEMBER MESSAGE:\n${message}\n\nReturn the JSON classification only.`}],max_tokens:180,temperature:0.05,top_p:0.2});
  const parsed=extractJson(result?.response);if(!parsed)throw new Error('invalid_risk_response');
  const level=normalizeLevel(parsed.level);
  return {level,confidence:Math.max(0,Math.min(1,Number(parsed.confidence)||0)),reason:String(parsed.reason||'Conversation-aware Lifeline classification.').slice(0,240),responseWindowSeconds:0,source:'ai'};
}

async function handleAssess(request,env){
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const member=await currentMember(request,env);if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  if(!(await hasLifelineAccess(env,member.user_id)))return json({ok:false,code:'lifeline_unavailable',error:'Lifeline conversation monitoring is not active for this account.'},{status:403});
  let body=null;try{body=await request.json();}catch{}
  const message=String(body?.message||'').trim();if(!message)return json({ok:false,error:'A message is required.'},{status:400});
  if(message.length>4000)return json({ok:false,error:'Please shorten your message and try again.'},{status:400});
  const history=cleanHistory(body?.history);
  let classification;
  if(env.AI&&typeof env.AI.run==='function'){try{classification=await classifyWithAI(env,message,history);}catch(error){console.error('Lifeline AI risk classification failed; using fallback',error);}}
  if(!classification){const level=fallbackRisk(`${history.map(h=>h.content).join(' ')} ${message}`);classification={level,confidence:level==='normal'?0.55:0.7,reason:'Conservative fallback classification used because the AI risk monitor was unavailable.',responseWindowSeconds:0,source:'fallback'};}
  try{await recordSafetyAudit(env,member,classification);}catch(error){console.error('Lifeline audit write failed',error);}
  return json({ok:true,risk:classification});
}
export async function handleLifelineRiskRoute(request,env){const url=new URL(request.url);if(url.pathname==='/api/member/lifeline/risk'&&request.method==='POST')return handleAssess(request,env);return null;}
