(function(){
  let history=[];
  let sending=false;

  function add(type,text){
    if(typeof window.addBubbleMessage==='function')window.addBubbleMessage(type,text);
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
      body:JSON.stringify({message:text,history:history.slice(-10),riskLevel})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Aria Assistant is unavailable right now.');
    return String(data.answer||'').trim();
  }

  function markSafetyRisk(risk){
    const actions=document.querySelector('#ariaBubbleLog .aria-bubble-actions:last-of-type');
    if(actions)actions.dataset.lifelineRisk=risk;
  }

  function clientFallbackRisk(text){
    if(typeof window.detectRisk==='function')return window.detectRisk(text);
    return 'normal';
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
      risk.responseWindowSeconds=risk.level==='critical'?120:risk.level==='high'?300:0;
    }

    if(typeof window.applyRisk==='function')window.applyRisk(risk.level);

    if(risk.level==='high'||risk.level==='critical'){
      const reply=typeof window.ariaResponse==='function'
        ?window.ariaResponse(risk.level)
        :'I’m concerned about what you’re describing. If you may be in immediate danger, use your device to contact local emergency services now and reach someone you trust if possible.';
      add('aria',reply);
      if(typeof window.addSafetyActions==='function'){
        window.addSafetyActions();
        markSafetyRisk(risk.level);
      }
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
})();
