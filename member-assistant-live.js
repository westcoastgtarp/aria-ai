(function(){
  let history=[];
  let sending=false;

  function add(type,text){
    if(typeof window.addBubbleMessage==='function')window.addBubbleMessage(type,text);
  }

  async function askAssistant(text){
    const response=await fetch('/api/member/assistant',{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({message:text,history:history.slice(-10)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Aria Assistant is unavailable right now.');
    return String(data.answer||'').trim();
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

    if(typeof window.findMedicationStatus==='function'){
      const lookup=window.findMedicationStatus(text);
      if(lookup?.intent){
        const reply=lookup.status&&typeof window.medicationStatusMessage==='function'
          ?window.medicationStatusMessage(lookup.status)
          :'Which medication?';
        setTimeout(()=>add('aria',reply),120);
        return;
      }
    }

    const risk=typeof window.detectRisk==='function'?window.detectRisk(text):'normal';
    if(typeof window.applyRisk==='function')window.applyRisk(risk);
    if(risk==='high'||risk==='critical'){
      const reply=typeof window.ariaResponse==='function'
        ?window.ariaResponse(risk)
        :'I’m concerned about what you’re describing. If you may be in immediate danger, use your device to contact local emergency services now and reach someone you trust if possible.';
      setTimeout(()=>{
        add('aria',reply);
        if(typeof window.addSafetyActions==='function')window.addSafetyActions();
      },120);
      return;
    }

    sending=true;
    button.disabled=true;
    const oldText=button.textContent;
    button.textContent='…';
    try{
      const answer=await askAssistant(text);
      add('aria',answer);
      history.push({role:'user',content:text},{role:'assistant',content:answer});
      history=history.slice(-10);
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
