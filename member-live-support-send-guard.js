(()=>{
  if(window.__ariaLiveSupportSendGuardLoaded)return;
  window.__ariaLiveSupportSendGuardLoaded=true;

  let sending=false;

  function isSendEvent(event){
    if(event.type==='click')return Boolean(event.target?.closest?.('#ariaBubbleSend'));
    if(event.type==='keydown')return event.key==='Enter'&&event.target?.id==='ariaBubbleInput';
    return false;
  }

  async function sendHumanMessage(text){
    if(sending||!text)return;
    sending=true;
    const button=document.getElementById('ariaBubbleSend');
    const oldText=button?.textContent||'Send';
    if(button){button.disabled=true;button.textContent='…';}
    try{
      const response=await fetch('/api/member/lifeline/live-chat/messages',{
        method:'POST',
        credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({content:text})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Message could not be sent.');
    }catch(error){
      const log=document.getElementById('ariaBubbleLog');
      if(log){
        const div=document.createElement('div');
        div.className='aria-live-chat-error';
        div.textContent=error.message||'Message could not be sent.';
        log.appendChild(div);
        log.scrollTop=log.scrollHeight;
      }
    }finally{
      sending=false;
      if(button){button.disabled=false;button.textContent=oldText;}
    }
  }

  function intercept(event){
    if(!window.__ariaHumanSupportActive||!isSendEvent(event))return;
    const input=document.getElementById('ariaBubbleInput');
    const text=input?.value.trim()||'';
    if(!text)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value='';
    sendHumanMessage(text);
  }

  document.addEventListener('click',intercept,true);
  document.addEventListener('keydown',intercept,true);
})();
