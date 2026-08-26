(function(){
  let history=[];
  let sending=false;
  let concernStreak=0;
  let supportEscalated=false;

  function add(type,text){
    if(typeof window.addBubbleMessage==='function')window.addBubbleMessage(type,text);
  }

  async function loadDurableHistory(){
    try{
      const response=await fetch('/api/member/conversations?limit=30',{credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)return;
      const messages=Array.isArray(data.messages)?data.messages:[];
      history=messages
        .filter(message=>message.role==='member'||message.role==='assistant')
        .map(message=>({role:message.role==='member'?'user':'assistant',content:message.content}))
        .slice(-12);
      if(!messages.length)return;

      const log=document.getElementById('ariaBubbleLog');
      if(log)log.innerHTML='';
      messages.forEach(message=>{
        if(message.role==='member')add('user',message.content);
        else if(message.role==='assistant'||message.role==='staff'||message.role==='system')add('aria',message.content);
      });
    }catch(error){
      console.error('Conversation history load failed',error);
    }
  }

  async function saveDeterministicMessage(role,content,riskLevel='normal'){
    const response=await fetch('/api/member/conversations',{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({role,content,riskLevel})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Conversation message could not be saved.');
    return data;
  }

  async function saveDeterministicExchange(memberText,assistantText,riskLevel='normal'){
    try{
      await saveDeterministicMessage('member',memberText,riskLevel);
      await saveDeterministicMessage('assistant',assistantText,riskLevel);
    }catch(error){
      console.error('Conversation exchange persistence failed',error);
    }
  }

  async function assessRisk(text){
    const response=await fetch('/api/member/lifeline/risk',{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({message:text,history:history.slice(-12)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Lifeline risk monitor is unavailable.');
    return data.risk||{level:'normal',responseWindowSeconds:0,source:'unknown'};
  }

  async function askAssistant(text,riskLevel='normal'){
    const response=await fetch('/api/member/assistant',{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({message:text,riskLevel})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Aria Assistant is unavailable right now.');
    return String(data.answer||'').trim();
  }

  async function escalateToSupport(risk,trigger){
    if(supportEscalated)return true;
    try{
      const response=await fetch('/api/member/lifeline/support-escalate',{
        method:'POST',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({risk,trigger})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Support escalation could not be created.');
      supportEscalated=true;
      return true;
    }catch(error){
      console.error('Lifeline support escalation failed',error);
      return false;
    }
  }

  function clientFallbackRisk(text){
    if(typeof window.detectRisk==='function')return window.detectRisk(text);
    return 'normal';
  }

  function updateConcernStreak(level){
    if(level==='concern')concernStreak+=1;
    else if(level==='normal')concernStreak=0;
    else concernStreak=Math.max(concernStreak,1);
    return concernStreak;
  }

  async function send(event){
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if(sending)return;

    const input=document.getElementById('ariaBubbleInput');
    const button=document.getElementById('ariaBubbleSend');
    const text=input?.value.trim();
    if(!input||!button||!text)return;

    add('user',text);
    input.value='';
    sending=true;
    button.disabled=true;
    const oldText=button.textContent;
    button.textContent='…';

    let risk={level:'normal',responseWindowSeconds:0,source:'client-fallback'};
    try{
      risk=await assessRisk(text);
    }catch(error){
      console.error('Lifeline risk endpoint unavailable; using browser fallback',error);
      risk.level=clientFallbackRisk(`${history.map(h=>h.content).join(' ')} ${text}`);
    }

    if(typeof window.applyRisk==='function')window.applyRisk(risk.level);
    const streak=updateConcernStreak(risk.level);
    const immediateHandoff=risk.level==='high'||risk.level==='critical';
    const repeatedConcern=risk.level==='concern'&&streak>=3;

    if((immediateHandoff||repeatedConcern)&&!supportEscalated){
      const queued=await escalateToSupport(risk.level,repeatedConcern?'repeated_distress_signals':'high_severity_distress');
      if(queued)add('aria','I’m escalating this chat for live support review so a trained Aria support agent can take a closer look.');
    }

    if(risk.level==='high'||risk.level==='critical'){
      const reply=typeof window.ariaResponse==='function'
        ?window.ariaResponse(risk.level)
        :'I’m concerned about what you’re describing. If you may be in immediate danger, contact local emergency services using your device now.';
      add('aria',reply);
      await saveDeterministicExchange(text,reply,risk.level);
      history.push({role:'user',content:text},{role:'assistant',content:reply});
      history=history.slice(-12);
      sending=false;
      button.disabled=false;
      button.textContent=oldText;
      return;
    }

    if(typeof window.findMedicationStatus==='function'){
      const lookup=window.findMedicationStatus(text);
      if(lookup?.intent){
        const reply=lookup.status&&typeof window.medicationStatusMessage==='function'
          ?window.medicationStatusMessage(lookup.status)
          :'Which medication?';
        add('aria',reply);
        await saveDeterministicExchange(text,reply,risk.level);
        history.push({role:'user',content:text},{role:'assistant',content:reply});
        history=history.slice(-12);
        sending=false;
        button.disabled=false;
        button.textContent=oldText;
        return;
      }
    }

    try{
      const answer=await askAssistant(text,risk.level);
      add('aria',answer);
      if(risk.level==='concern'&&typeof window.ariaResponse==='function'){
        const support=window.ariaResponse('concern');
        if(support&&support!==answer)add('aria',support);
      }
      history.push({role:'user',content:text},{role:'assistant',content:answer});
      history=history.slice(-12);
    }catch(error){
      add('aria',error?.message||'Aria Assistant is unavailable right now. Please try again.');
    }finally{
      sending=false;
      button.disabled=false;
      button.textContent=oldText;
    }
  }

  const sendButton=document.getElementById('ariaBubbleSend');
  const input=document.getElementById('ariaBubbleInput');
  sendButton?.addEventListener('click',send,true);
  input?.addEventListener('keydown',event=>{
    if(event.key==='Enter')send(event);
  },true);

  loadDurableHistory();
})();
