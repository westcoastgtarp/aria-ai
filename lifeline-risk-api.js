import { recordLifelineSignal } from './lifeline-persistence.js';
import { runAriaSafetyModel } from './aria-ai-provider.js';
import { consumeAiRateLimit } from './ai-rate-limit.js';
import { recordAiOperationalAudit } from './ai-operational-audit.js';

function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
async function currentMember(request,env){if(!env.DB)return null;const token=parseCookies(request).aria_session;if(!token)return null;const tokenHash=await sha256(token);return env.DB.prepare(`SELECT u.id AS user_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.account_type='member' AND u.status='active' LIMIT 1`).bind(tokenHash,new Date().toISOString()).first();}
function trialActive(selectedAt){const start=new Date(selectedAt);return !Number.isNaN(start.getTime())&&Date.now()<start.getTime()+(30*24*60*60*1000);}
async function hasLifelineAccess(env,userId){const selection=await env.DB.prepare(`SELECT plan_code,status,selected_at FROM member_plan_selections WHERE user_id=? ORDER BY selected_at DESC LIMIT 1`).bind(userId).first();if(!selection)return false;return (String(selection.plan_code||'').startsWith('lifeline_')&&selection.status==='active')||trialActive(selection.selected_at);}
function cleanHistory(value){if(!Array.isArray(value))return [];return value.slice(-12).filter(item=>item?.role!=='assistant').map(item=>({role:'user',content:String(item?.content||'').trim().slice(0,2000)})).filter(item=>item.content);}
function isClearlyQuotedOrEducational(text){
  const raw=String(text||'').trim();
  const t=raw.toLowerCase();
  const framing=['i was reading','an article','the article','what does that phrase mean','what does this phrase mean','what does "','what does “','in context','quoted','quote','for a paper','for an assignment','for homework','definition of','what does it mean'];
  const hasFraming=framing.some(k=>t.includes(k));
  const hasQuote=/["“”'][^"“”']{1,160}["“”']/.test(raw);
  const personalSignals=['i feel this way','i feel like this','this is how i feel','i mean it','i want to die','i want to kill myself','i am suicidal','i’m suicidal','im suicidal','i might hurt myself','i am going to hurt myself','i’m going to hurt myself','im going to hurt myself'];
  const stripped=raw.replace(/["“”'][^"“”']{1,160}["“”']/g,' ').toLowerCase();
  const hasPersonalOutsideQuote=personalSignals.some(k=>stripped.includes(k));
  return hasFraming&&hasQuote&&!hasPersonalOutsideQuote;
}
function isClearlyThirdPartyReport(text){
  const raw=String(text||'').trim();
  const t=raw.toLowerCase();
  const thirdParty=['my friend','a friend','my boyfriend','my girlfriend','my partner','my husband','my wife','my brother','my sister','my mom','my mother','my dad','my father','my child','my son','my daughter','my coworker','my co-worker','someone i know','they said','he said','she said'];
  if(!thirdParty.some(k=>t.includes(k)))return false;
  const personalSignals=['i want to die','i want to kill myself','i am suicidal','i’m suicidal','im suicidal','i feel unsafe','i need help right now','i am in immediate danger','i’m in immediate danger','im in immediate danger','i might hurt myself','i am going to hurt myself','i’m going to hurt myself','im going to hurt myself'];
  const withoutQuoted=raw.replace(/["“”'][^"“”']{1,200}["“”']/g,' ').toLowerCase();
  return !personalSignals.some(k=>withoutQuoted.includes(k));
}
function fallbackRisk(text){const t=String(text||'').toLowerCase();const critical=['kill myself','suicide','want to die','end my life','can’t breathe','cant breathe','overdose','unconscious','immediate danger','not safe alone','i have a gun','i have a knife','someone is attacking me','trying to kill me','bleeding heavily'];const high=['feel unsafe','need help now','need help right now','someone is hurting me','alone and scared','severe pain','very dizzy','getting worse'];const concern=['scared','worried','dizzy','pain','don’t feel right','dont feel right','bad reaction','side effect','distressed','panic'];if(critical.some(k=>t.includes(k)))return 'critical';if(high.some(k=>t.includes(k)))return 'high';if(concern.some(k=>t.includes(k)))return 'concern';return 'normal';}
function hasExplicitCriticalSignal(text){const t=String(text||'').toLowerCase();const signals=['kill myself','suicide','want to die','end my life','can’t breathe','cant breathe','overdose','unconscious','immediate danger','not safe alone','i have a gun','i have a knife','someone is attacking me','trying to kill me','bleeding heavily','i am going to hurt myself','i’m going to hurt myself','im going to hurt myself'];return signals.some(k=>t.includes(k));}
function normalizeLevel(value){const level=String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ');if(level==='critical')return 'critical';if(level==='high'||level==='high risk')return 'high';if(level==='concern')return 'concern';return 'normal';}
function extractJson(text){const raw=String(text||'').trim();try{return JSON.parse(raw);}catch{}const match=raw.match(/\{[\s\S]*\}/);if(!match)return null;try{return JSON.parse(match[0]);}catch{return null;}}
function safeErrorCode(error){return String(error?.code||error?.name||'AI_CLASSIFICATION_FAILED').slice(0,80);}
async function auditAi(env,userId,eventType,details){try{await recordAiOperationalAudit(env,{userId,eventType,scope:'lifeline-risk',...details});}catch(error){console.error('AI operational audit write failed',{code:safeErrorCode(error)});}}
async function recordSafetyAudit(env,member,classification){if(!env.DB||classification.level==='normal')return;const now=new Date().toISOString();await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(`AUD-${crypto.randomUUID()}`,'Lifeline Safety','lifeline_risk_classified',member.user_id,'member',member.user_id,JSON.stringify({level:classification.level,confidence:classification.confidence,source:classification.source}),now,now).run();}

const RISK_PROMPT=`You are Aria Lifeline Risk Monitor. Your only job is to classify safety and support signals in a member conversation.

Evaluate the CURRENT member message in the context of recent MEMBER messages. Aria's own prior replies are not evidence and must never raise the risk level. The level describes the MEMBER'S own current safety/support state, not the state of another person they are asking about.

Use exactly one level:
- normal: ordinary conversation, frustration, neutral questions, routine health/app questions, quoted material, academic/definition questions, third-person reports about a friend/family member/other person, or no meaningful distress signal from the member.
- concern: distress, fear, worry, pain, panic, confusion, overwhelm, or deterioration expressed by the member that merits supportive follow-up and closer monitoring.
- high: substantial safety concern or credible risk expressed by the member where Aria should present the member with a clear option to speak with trained live support. Statements such as "I feel unsafe" or "I need help right now" are high unless the member also gives an explicit indication of immediate or imminent danger.
- critical: reserve this for explicit or strongly evidenced immediate/imminent danger to the member, such as active self-harm intent, overdose, inability to breathe, unconsciousness, active violence, a weapon threat, severe uncontrolled bleeding, or a direct statement that the member is in immediate danger.

Important rules:
- This is a support/safety classification, not a diagnosis or clinical assessment.
- Consider context and multiple MEMBER signals, not isolated keywords.
- Quoted phrases, article excerpts, fictional dialogue, academic questions, definition questions, or questions about what words mean are NOT personal safety disclosures unless the member separately indicates the words describe their own current state.
- Third-person reports are not personal safety disclosures. Example: My friend said "I want to die" yesterday, but they told me today they were exaggerating. What should I do? => normal for the member.
- A third-person report can still warrant advice about helping that other person; that advice belongs in the conversational response, not in the member's risk level.
- Example: I was reading an article that said "I want to die." What does that phrase mean in context? => normal.
- Example: This homework is killing me lol => normal.
- Repeated concern-level distress across several member messages matters and may justify offering live support even if no single message is high or critical.
- Do not diagnose.
- Do not downgrade explicit immediate-danger statements about the member because the member sounds calm.
- Do not contact, claim to contact, or imply contact with emergency services, outside responders, care contacts, or staff.
- Return JSON only with this schema: {"level":"normal|concern|high|critical","confidence":0.0,"reason":"brief non-diagnostic rationale"}.
- Never include private chain-of-thought. The reason must be a short summary suitable for an audit record.`;

async function classifyWithAI(env,message,history){
  if(isClearlyQuotedOrEducational(message))return {level:'normal',confidence:0.98,reason:'Quoted or educational context without a personal safety disclosure.',responseWindowSeconds:0,source:'context-guard',provider:null,model:null};
  if(isClearlyThirdPartyReport(message))return {level:'normal',confidence:0.98,reason:'Third-person report without a personal safety disclosure from the member.',responseWindowSeconds:0,source:'context-guard',provider:null,model:null};
  const memberHistory=history.filter(item=>item.role==='user');const transcript=memberHistory.map(item=>`MEMBER: ${item.content}`).join('\n');const inference=await runAriaSafetyModel(env,{messages:[{role:'system',content:RISK_PROMPT},{role:'user',content:`Recent MEMBER messages:\n${transcript||'(none)'}\n\nCURRENT MEMBER MESSAGE:\n${message}\n\nReturn the JSON classification only.`}],maxTokens:180,temperature:0.05,topP:0.2});const parsed=extractJson(inference?.result?.response);if(!parsed)throw Object.assign(new Error('invalid_risk_response'),{code:'AI_INVALID_CLASSIFICATION'});let level=normalizeLevel(parsed.level);const memberEvidence=`${memberHistory.map(h=>h.content).join(' ')} ${message}`;if(level==='critical'&&!hasExplicitCriticalSignal(memberEvidence))level='high';return {level,confidence:Math.max(0,Math.min(1,Number(parsed.confidence)||0)),reason:String(parsed.reason||'Conversation-aware Lifeline classification.').slice(0,240),responseWindowSeconds:0,source:'ai',provider:inference.provider,model:inference.model};}

async function handleAssess(request,env){
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const member=await currentMember(request,env);if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  if(!(await hasLifelineAccess(env,member.user_id)))return json({ok:false,code:'lifeline_unavailable',error:'Lifeline conversation monitoring is not active for this account.'},{status:403});
  let body=null;try{body=await request.json();}catch{}
  const message=String(body?.message||'').trim();if(!message)return json({ok:false,error:'A message is required.'},{status:400});if(message.length>4000)return json({ok:false,error:'Please shorten your message and try again.'},{status:400});
  const history=cleanHistory(body?.history);let classification;let fallbackReason=null;

  const rate=await consumeAiRateLimit(env,{userId:member.user_id,scope:'lifeline-risk',limit:40});
  if(rate.allowed){
    try{classification=await classifyWithAI(env,message,history);}catch(error){const code=safeErrorCode(error);console.error('Lifeline AI risk classification failed; using fallback',{code});fallbackReason=code;await auditAi(env,member.user_id,'ai_lifeline_classifier_failed',{code,fallback:'local_conservative_classifier'});}
  }else{
    fallbackReason='AI_RATE_LIMITED';
    await auditAi(env,member.user_id,'ai_lifeline_classifier_rate_limited',{count:rate.count,limit:rate.limit,fallback:'local_conservative_classifier'});
  }

  if(!classification){const contextual=isClearlyQuotedOrEducational(message)||isClearlyThirdPartyReport(message);const memberEvidence=contextual?'':`${history.map(h=>h.content).join(' ')} ${message}`;const level=memberEvidence?fallbackRisk(memberEvidence):'normal';classification={level,confidence:level==='normal'?0.55:0.7,reason:'Conservative fallback classification used because the AI risk monitor was unavailable.',responseWindowSeconds:0,source:'fallback',provider:null,model:null};if(fallbackReason)classification.fallbackReason=fallbackReason;}

  let persistence={persisted:false,incidentId:null,reason:'normal'};
  if(classification.level!=='normal'){
    try{persistence=await recordLifelineSignal(env,{memberUserId:member.user_id,riskLevel:classification.level,confidence:classification.confidence,source:classification.source,reason:classification.reason});}
    catch(error){console.error('Lifeline incident persistence failed',{code:safeErrorCode(error)});persistence={persisted:false,incidentId:null,reason:'write_failed'};}
  }
  try{await recordSafetyAudit(env,member,classification);}catch(error){console.error('Lifeline audit write failed',{code:safeErrorCode(error)});}

  return json({ok:true,risk:{level:classification.level,responseWindowSeconds:classification.responseWindowSeconds}});
}

export async function handleLifelineRiskRoute(request,env){const url=new URL(request.url);if(url.pathname==='/api/member/lifeline/risk'&&request.method==='POST')return handleAssess(request,env);return null;}
