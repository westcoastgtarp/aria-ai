(()=>{
  if(window.__ariaLiveSupportTicketWorkflowLoaded)return;
  window.__ariaLiveSupportTicketWorkflowLoaded=true;

  const originalProgressControl=window.progressControl;
  if(typeof originalProgressControl==='function'){
    window.progressControl=function(ticket){
      if(ticket?.category==='Member Communication'&&ticket?.department==='Operations')return '';
      return originalProgressControl(ticket);
    };
  }

  function ticketId(card){
    const meta=card.querySelector('.ticket-id')?.textContent||'';
    return (meta.split('•')[0]||'').trim();
  }

  function decorate(){
    document.querySelectorAll('.ticket-card').forEach(card=>{
      if(card.classList.contains('aria-chat-archive-card'))return;
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta))return;
      if(!card.classList.contains('live-support-ticket-card'))card.classList.add('live-support-ticket-card');

      const assignmentText=card.querySelector('.ticket-meta')?.textContent||'';
      const assigned=/Assigned to/i.test(assignmentText);
      const actions=card.querySelector('.ticket-actions');
      if(!actions)return;

      let start=card.querySelector('.live-support-start-chat');
      const genericStart=card.querySelector('.ticket-status[data-status="In Progress"]');
      if(!assigned){
        if(genericStart){
          start=genericStart;
          if(!start.classList.contains('live-support-start-chat'))start.classList.add('live-support-start-chat');
        }else if(!start){
          start=document.createElement('button');
          start.type='button';
          start.className='status-btn live-support-start-chat';
          start.dataset.id=ticketId(card);
          actions.prepend(start);
        }
        if(start&&start.textContent!=='Start chat')start.textContent='Start chat';
      }else{
        if(genericStart)genericStart.remove();
        if(start&&start!==genericStart)start.remove();
      }

      const close=card.querySelector('.ticket-status[data-status="Closed"]');
      if(close&&close.textContent!=='Close ticket')close.textContent='Close ticket';
    });
  }

  function restoreOperations(){
    const page=sessionStorage.getItem('aria-live-support-return-page');
    if(page!=='operations')return;
    sessionStorage.removeItem('aria-live-support-return-page');
    const nav=document.querySelector('[data-page="operations"]');
    nav?.click();

    const id=sessionStorage.getItem('aria-live-support-open-ticket');
    if(!id)return;
    sessionStorage.removeItem('aria-live-support-open-ticket');
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const button=document.querySelector(`.live-support-open-chat[data-id="${CSS.escape(id)}"]`);
      if(button){clearInterval(timer);button.click();}
      else if(tries>=30)clearInterval(timer);
    },250);
  }

  async function startChat(id,button){
    if(!id||button?.disabled)return;
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Starting...';
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/start`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Live Support conversation could not be started.');
      sessionStorage.setItem('aria-live-support-return-page','operations');
      sessionStorage.setItem('aria-live-support-open-ticket',id);
      location.reload();
    }catch(error){
      alert(error.message||'Live Support conversation could not be started.');
      button.disabled=false;
      button.textContent=old;
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.live-support-start-chat');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startChat(button.dataset.id,button);
  },true);

  decorate();
  restoreOperations();
  const observer=new MutationObserver(decorate);
  const queue=document.getElementById('operationsQueue');
  if(queue)observer.observe(queue,{childList:true,subtree:true});
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
