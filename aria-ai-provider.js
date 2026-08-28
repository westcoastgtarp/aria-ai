const DEFAULT_CONVERSATION_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_SAFETY_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';

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
    messages:Array.isArray(messages)?messages:[],
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
    messages:Array.isArray(messages)?messages:[],
    max_tokens:maxTokens,
    temperature,
    top_p:topP
  });
  return {provider:'cloudflare-workers-ai',model,result};
}
