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
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'
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
      #ariaBubbleLog .aria-support-choice{margin:12px 10px 16px!important;padding:14px!important;border:1px solid rgba(108,99,232,.18)!important;border-radius:18px!important;background:linear-gradient(180deg,#ffffff 0%,#f8f7ff 100%)!important;box-shadow:0 8px 24px rgba(54,45,140,.08)!important}
      #ariaBubbleLog .aria-support-choice-title{font-size:14px!important;font-weight:700!important;line-height:1.4!important;margin:0 0 10px!important;color:#25253a!important}
      #ariaBubbleLog .aria-support-choice-actions{display:grid!important;gap:10px!important}
      #ariaBubbleLog button.aria-support-choice-button{appearance:none!important;-webkit-appearance:none!important;width:100%!important;min-height:0!important;height:auto!important;margin:0!important;border-radius:14px!important;padding:11px 13px!important;cursor:pointer!important;font:inherit!important;text-align:left!important;line-height:1.3!important;text-transform:none!important;letter-spacing:normal!important;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-continue{background:#fff!important;background-image:none!important;border:1px solid rgba(108,99,232,.24)!important;color:#2b2b3d!important;box-shadow:0 3px 10px rgba(54,45,140,.05)!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-live{background:linear-gradient(135deg,#655ee8,#8066eb)!important;border:1px solid transparent!important;color:#fff!important;box-shadow:0 6px 16px rgba(107,99,232,.24)!important}
      #ariaBubbleLog button.aria-support-choice-button:hover{transform:translateY(-1px)!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-continue:hover{border-color:#8d84ef!important;background:#fbfaff!important;box-shadow:0 5px 14px rgba(68,59,150,.1)!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-live:hover{box-shadow:0 8px 20px rgba(107,99,232,.31)!important}
      #ariaBubbleLog button.aria-support-choice-button:focus-visible{outline:3px solid rgba(107,99,232,.22)!important;outline-offset:2px!important}
      #ariaBubbleLog button.aria-support-choice-button strong{display:block!important;font-size:13px!important;font-weight:700!important;line-height:1.25!important;margin:0 0 3px!important;color:inherit!important}
      #ariaBubbleLog button.aria-support-choice-button span{display:block!important;font-size:12px!important;font-weight:400!important;line-height:1.4!important;margin:0!important;color:inherit!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-continue span{color:#73738a!important}
      #ariaBubbleLog button.aria-support-choice-button.aria-support-choice-live span{color:rgba(255,255,255,.9)!important}
      #ariaBubbleLog button.aria-support-choice-button[disabled]{opacity:.58!important;cursor:default!important;transform:none!important;box-shadow:none!important}
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
    if(!response.ok||!data.ok){
      const error=new Error(data.error||'Aria Assistant is unavailable right now.');
      error.code=String(data.code||'');
      error.status=response.status;
      throw error;
    }
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
        <button type="button" class="aria-support-choice-button aria-support-choice-continue" data-choice="aria">
          <strong>Keep chatting with Aria</strong>
          <span>Stay here and keep talking with Aria.</span>
        </button>
        <button type="button" class="aria-support-choice-button aria-support-choice-live" data-choice="support">
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

  function isPersonalConcernMessage(text){
    const t=String(text||'').toLowerCase();
    const signals=[
      'i’m overwhelmed','i\'m overwhelmed','im overwhelmed','i am overwhelmed',
      'really overwhelmed','still really overwhelmed','feeling really overwhelmed','feeling overwhelmed',
      'i’m scared','i\'m scared','im scared','i am scared','getting more scared',
      'can’t calm down','cant calm down','cannot calm down',
      'i’m panicking','i\'m panicking','im panicking','i am panicking',
      'i feel panicked','i feel anxious','really anxious','i don’t know what to do','i dont know what to do'
    ];
    return signals.some(signal=>t.includes(signal));
  }

  function hasCurrentCriticalSignal(text){
    const t=String(text||'').toLowerCase();
    const signals=['kill myself','suicide','want to die','end my life','can’t breathe','cant breathe','overdose','unconscious','immediate danger','not safe alone','i have a gun','i have a knife','someone is attacking me','trying to kill me','bleeding heavily','i am going to hurt myself','i’m going to hurt myself','im going to hurt myself'];
    return signals.some(signal=>t.includes(signal));
  }

  function hasCurrentHighSignal(text){
    const t=String(text||'').toLowerCase();
    const signals=['feel unsafe','i feel unsafe','need help now','need help right now','someone is hurting me','alone and scared','severe pain','very dizzy','getting worse'];
    return signals.some(signal=>t.includes(signal));
  }

  function safeClientFallbackRisk(text){
    if(hasCurrentCriticalSignal(text))return 'critical';
    if(hasCurrentHighSignal(text))return 'high';
    if(isPersonalConcernMessage(text))return 'concern';
    const detected=clientFallbackRisk(text);
    return ['normal','concern','high','critical'].includes(detected)?detected:'normal';
  }

  function isExplicitSupportRequest(text){
    return String(text||'').toLowerCase().includes('i need to talk to someone');
  }

  function durableRecentConcernCount(currentText){
    const memberMessages=history
      .filter(item=>item.role==='user')
      .map(item=>item.content);
    return [...memberMessages,currentText]
      .slice(-3)
      .filter(isPersonalConcernMessage)
      .length;
  }

  async function handleExplicitSupportRequest(text){
    const acknowledgment='I hear you. Would you like to speak with someone now?';
    add('aria',acknowledgment);
    offerLiveSupport('concern','explicit_support_request');
    history.push({role:'user',content:text},{role:'assistant',content:acknowledgment});
    history=history.slice(-12);

    try{
      await Promise.all([
        saveDeterministicMessage('member',text,'concern'),
        saveDeterministicMessage('assistant',acknowledgment,'concern'),
        assessRisk(text).catch(error=>{console.error('Lifeline risk assessment failed after explicit support request',error);return null;})
      ]);
    }catch(error){
      console.error('Explicit support request persistence failed',error);
    }
  }

  async function send(event){
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if(sending||window.__ariaHumanSupportActive)return;

    const input=document.getElementById('ariaBubbleInput');
    const button=document.getElementById('ariaBubbleSend');
    const text=input?.value.trim();
    if(!input||!button||!text)return;

    add('user',text);
    input.value='';

    if(isExplicitSupportRequest(text)){
      sending=true;
      button.disabled=true;
      const oldText=button.textContent;
      button.textContent='…';
      try{await handleExplicitSupportRequest(text);}finally{
        sending=false;
        button.disabled=false;
        button.textContent=oldText;
      }
      return;
    }

    sending=true;
    button.disabled=true;
    const oldText=button.textContent;
    button.textContent='…';

    let risk={level:'normal',responseWindowSeconds:0,source:'client-fallback'};
    try{
      risk=await assessRisk(text);
    }catch(error){
      console.error('Lifeline risk endpoint unavailable; using browser fallback',error);
      risk.level=safeClientFallbackRisk(text);
    }

    if(typeof window.applyRisk==='function')window.applyRisk(risk.level);
    const streak=updateConcernStreak(risk.level);
    const durableConcernCount=durableRecentConcernCount(text);
    const immediateOffer=risk.level==='high'||risk.level==='critical';
    const repeatedConcern=(risk.level==='concern'&&streak>=3)||durableConcernCount>=3;
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
      if(window.__ariaHumanSupportActive)return;
      add('aria',answer);
      history.push({role:'user',content:text},{role:'assistant',content:answer});
      history=history.slice(-12);
      if(shouldOfferSupport)offerLiveSupport(risk.level,supportTrigger);
    }catch(error){
      if(error?.code==='human_support_active'||error?.status===409)return;
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