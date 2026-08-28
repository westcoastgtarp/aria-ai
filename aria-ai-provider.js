const DEFAULT_CONVERSATION_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_SAFETY_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const ALLOWED_ROLES=new Set(['system','user','assistant']);
const MAX_PROVIDER_MESSAGE_CHARS=6000;
const MAX_PROVIDER_MESSAGES=16;

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

function sanitizeProviderMessages(messages){
  if(!Array.isArray(messages))return [];
  return messages
    .slice(-MAX_PROVIDER_MESSAGES)
    .map(message=>{
      const role=ALLOWED_ROLES.has(message?.role)?message.role:null;
      const content=String(message?.content||'').trim().slice(0,MAX_PROVIDER_MESSAGE_CHARS);
      if(!role||!content)return null;
      // Deliberately return only the fields the model needs. Do not forward IDs,
      // email addresses stored in metadata, account details, timestamps, risk
      // objects, staff information, database rows, or arbitrary caller fields.
      return {role,content};
    })
    .filter(Boolean);
}

export function ariaAiProviderInfo(env){
  return {
    provider:'cloudflare-workers-ai',
    conversationModel:configuredModel(env,'ARIA_CONVERSATION_MODEL',DEFAULT_CONVERSATION_MODEL),
    safetyModel:configuredModel(env,'ARIA_SAFETY_MODEL',DEFAULT_SAFETY_MODEL)
  };
}

export async function runAriaConversationModel(env,{messages,maxTokens=500,temperature=0.45,topP=0.9}={}){
  const ai=requireWorkersAI(env);
  const model=configuredModel(env,'ARIA_CONVERSATION_MODEL',DEFAULT_CONVERSATION_MODEL);
  const result=await ai.run(model,{
    messages:sanitizeProviderMessages(messages),
    max_tokens:maxTokens,
    temperature,
    top_p:topP
  });
  return {provider:'cloudflare-workers-ai',model,result};
}

export async function runAriaSafetyModel(env,{messages,maxTokens=180,temperature=0.05,topP=0.2}={}){
  const ai=requireWorkersAI(env);
  const model=configuredModel(env,'ARIA_SAFETY_MODEL',DEFAULT_SAFETY_MODEL);
  const result=await ai.run(model,{
    messages:sanitizeProviderMessages(messages),
    max_tokens:maxTokens,
    temperature,
    top_p:topP
  });
  return {provider:'cloudflare-workers-ai',model,result};
}
