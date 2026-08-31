const DEFAULT_CONVERSATION_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_SAFETY_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const ALLOWED_ROLES=new Set(['system','user','assistant']);
const MAX_PROVIDER_MESSAGE_CHARS=5000;
const MAX_PROVIDER_MESSAGES=12;
const DEFAULT_CONVERSATION_TIMEOUT_MS=7000;
const DEFAULT_SAFETY_TIMEOUT_MS=2500;

function requireWorkersAI(env){
  if(!env?.AI||typeof env.AI.run!=='function'){
    const error=new Error('Aria AI provider is unavailable.');
    error.code='AI_PROVIDER_UNAVAILABLE';
    throw error;
  }
  return env.AI;
}

function configuredModel(env,key,fallback){
  const value=String(env?.[key]||'').trim();
  return value||fallback;
}

function configuredTimeout(env,key,fallback){
  const value=Number(env?.[key]);
  if(!Number.isFinite(value)||value<500||value>30000)return fallback;
  return Math.round(value);
}

function sanitizeProviderMessages(messages){
  if(!Array.isArray(messages))return [];
  return messages
    .slice(-MAX_PROVIDER_MESSAGES)
    .map(message=>{
      const role=ALLOWED_ROLES.has(message?.role)?message.role:null;
      const content=String(message?.content||'').trim().slice(0,MAX_PROVIDER_MESSAGE_CHARS);
      if(!role||!content)return null;
      return {role,content};
    })
    .filter(Boolean);
}

function timeoutError(kind,timeoutMs){
  const error=new Error(`${kind} AI request exceeded ${timeoutMs}ms.`);
  error.name='TimeoutError';
  error.code='AI_PROVIDER_TIMEOUT';
  return error;
}

async function withTimeout(promise,timeoutMs,kind){
  let timer;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(timeoutError(kind,timeoutMs)),timeoutMs);
      })
    ]);
  }finally{
    if(timer)clearTimeout(timer);
  }
}

export function ariaAiProviderInfo(env){
  return {
    provider:'cloudflare-workers-ai',
    conversationModel:configuredModel(env,'ARIA_CONVERSATION_MODEL',DEFAULT_CONVERSATION_MODEL),
    safetyModel:configuredModel(env,'ARIA_SAFETY_MODEL',DEFAULT_SAFETY_MODEL),
    conversationTimeoutMs:configuredTimeout(env,'ARIA_CONVERSATION_TIMEOUT_MS',DEFAULT_CONVERSATION_TIMEOUT_MS),
    safetyTimeoutMs:configuredTimeout(env,'ARIA_SAFETY_TIMEOUT_MS',DEFAULT_SAFETY_TIMEOUT_MS)
  };
}

export async function runAriaConversationModel(env,{messages,maxTokens=260,temperature=0.45,topP=0.9}={}){
  const ai=requireWorkersAI(env);
  const model=configuredModel(env,'ARIA_CONVERSATION_MODEL',DEFAULT_CONVERSATION_MODEL);
  const timeoutMs=configuredTimeout(env,'ARIA_CONVERSATION_TIMEOUT_MS',DEFAULT_CONVERSATION_TIMEOUT_MS);
  const result=await withTimeout(ai.run(model,{
    messages:sanitizeProviderMessages(messages),
    max_tokens:maxTokens,
    temperature,
    top_p:topP
  }),timeoutMs,'conversation');
  return {provider:'cloudflare-workers-ai',model,result};
}

export async function runAriaSafetyModel(env,{messages,maxTokens=100,temperature=0.05,topP=0.2}={}){
  const ai=requireWorkersAI(env);
  const model=configuredModel(env,'ARIA_SAFETY_MODEL',DEFAULT_SAFETY_MODEL);
  const timeoutMs=configuredTimeout(env,'ARIA_SAFETY_TIMEOUT_MS',DEFAULT_SAFETY_TIMEOUT_MS);
  const result=await withTimeout(ai.run(model,{
    messages:sanitizeProviderMessages(messages),
    max_tokens:maxTokens,
    temperature,
    top_p:topP
  }),timeoutMs,'safety');
  return {provider:'cloudflare-workers-ai',model,result};
}
