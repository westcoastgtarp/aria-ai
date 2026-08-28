(function(){
  if(window.__ariaAssistantLiveLoaded)return;
  window.__ariaAssistantLiveLoaded=true;

  let history=[];
  let sending=false;
  let concernStreak=0;
  let supportEscalated=false;
  let supportOfferVisible=false;

  function add(type,text){
    if(typeof window.addBubbleMessage==='function')window.addBubbleMessage(type,text);
  }

  function escapeText(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[ch]));
  }

  function storedTime(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(date);
  }

  function addStored(type,text,createdAt){
    const log=document.getElementById('ariaBubbleLog');
    if(!log){add(type,text);return;}
    const div=document.createElement('div');
    div.className=`aria-bubble-msg ${type}`;
    const time=storedTime(createdAt);
    div.innerHTML=`${escapeText(text).replace(/\n/g,'<br>')}${time?`<span class="aria-bubble-time">${escapeText(time)}</span>`:''}`;
    log.appendChild(div);
    log.scrollTop=log.scrollHeight;
  }

  function ensureSupportStyles(){
    if(document.getElementById('ariaSupportChoiceStyles'))return;
    const style=document.createElement('style');
    style.id='ariaSupportChoiceStyles';
    style.textContent=`
      .aria-support-choice{margin:10px 2px 14px;padding:12px;border:1px solid #dde2ee;border-radius:14px;background:#fff;box-shadow:0 3px 12px rgba(34,45,80,.06)}
      .aria-support-choice-title{font-weight:700;margin-bottom:8px;color:#202638}
      .aria-support-choice-actions{display:grid;gap:8px}
      .aria-support-choice button{width:100%;text-align:left;border:1px solid #d7dceb;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer;color:#202638}
      .aria-support-choice button:hover{border-color:#6a63e8;background:#f8f7ff}
      .aria-support-choice button strong{display:block;font-size:13px;margin-bottom:2px}
      .aria-support-choice button span{display:block;font-size:12px;color:#687087;line-height:1.35}
      .aria-support-choice button[disabled]{opacity:.6;cursor:default}
    `;
    document.head.appendChild(style);
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
        if(message.role==='member')addStored('user',message.content,message.createdAt);
        else if(message.role==='assistant'||message.role==='staff'||message.role==='system')addStored('aria',message.content,message.createdAt);
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

  async function saveAssistantNotice(text,riskLevel='normal'){
    try{
      await saveDeterministicMessage('assistant',text,riskLevel);
    }catch(error){
      console.error('Conversation notice persistence failed',error);
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
      if(!response.ok||!data.ok)throw new Error(data.error||'Support request could not be created.');
      supportEscalated=true;
      return true;
    }catch(error){
      console.error('Lifeline support request failed',error);
      return false;
    }
  }

  function offerLiveSupport(riskLevel,trigger){
    if(supportEscalated||supportOfferVisible)return;
    const log=document.getElementById('ariaBubbleLog');
    if(!log)return;
    ensureSupportStyles();
    supportOfferVisible=true;

    const card=document.createElement('div');
    card.className='aria-support-choice';
    card.innerHTML=`
      <div class="aria-support-choice-title">Would you like to keep talking with Aria or speak with someone?</div>
      <div class="aria-support-choice-actions">
        <button type="button" data-choice="aria">
          <strong>Keep chatting with Aria</strong>
          <span>Stay here and keep talking with Aria.</span>
        </button>
        <button type="button" data-choice="support">
          <strong>Speak with someone now</strong>
          <span>You don’t have to handle this conversation alone.</span>
        </button>
      </div>`;

    const closeOffer=()=>{
      supportOfferVisible=false;
      card.remove();
    };

    card.querySelector('[data-choice="aria"]')?.addEventListener('click',()=>{
      closeOffer();
      add('aria','I’m here with you. We can keep talking here.');
    });

    card.querySelector('[data-choice="support"]')?.addEventListener('click',async()=>{
      const buttons=[...card.querySelectorAll('button')];
      buttons.forEach(button=>button.disabled=true);
      const requested=await escalateToSupport(riskLevel,trigger);
      closeOffer();
      const notice=requested
        ?'Your live support request has been sent. You can keep chatting with Aria here while you wait.'
        :'I couldn’t send the live support request right now. You can keep chatting with Aria and try again in a moment.';
      add('aria',notice);
      if(requested)await saveAssistantNotice(notice,riskLevel);
    });

    log.appendChild(card);
    log.scrollTop=log.scrollHeight;
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
    const immediateOffer=risk.level==='high'||risk.level==='critical';
    const repeatedConcern=risk.level==='concern'&&streak>=3;
    const shouldOfferSupport=immediateOffer||repeatedConcern;
    const supportTrigger=repeatedConcern?'repeated_distress_signals':'high_severity_distress';

    if(typeof window.findMedicationStatus==='function'&&risk.level==='normal'){
      const lookup=window.findMedicationStatus(text);
      if(lookup?.intent){
        const reply=lookup.status&&typeof window.medicationStatusMessage==='function'
          ?window.medicationStatusMessage(lookup.status)
          :'Which medication?';
        add('aria',reply);
        try{await saveDeterministicMessage('member',text,risk.level);await saveDeterministicMessage('assistant',reply,risk.level);}catch(error){console.error('Conversation exchange persistence failed',error);}
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
      history.push({role:'user',content:text},{role:'assistant',content:answer});
      history=history.slice(-12);
      if(shouldOfferSupport)offerLiveSupport(risk.level,supportTrigger);
    }catch(error){
      add('aria',error?.message||'Aria Assistant is unavailable right now. Please try again.');
      if(shouldOfferSupport)offerLiveSupport(risk.level,supportTrigger);
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
