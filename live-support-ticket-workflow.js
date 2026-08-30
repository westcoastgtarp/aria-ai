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

  function decorate(){
    document.querySelectorAll('.ticket-card').forEach(card=>{
      if(card.classList.contains('aria-chat-archive-card'))return;
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta))return;
      card.classList.add('live-support-ticket-card');
      const start=card.querySelector('.ticket-status[data-status="In Progress"]');
      if(start){
        start.classList.add('live-support-start-chat');
        start.textContent='Start chat';
      }
      const close=card.querySelector('.ticket-status[data-status="Closed"]');
      if(close)close.textContent='Close ticket';
    });
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
  const observer=new MutationObserver(decorate);
  const queue=document.getElementById('operationsQueue');
  if(queue)observer.observe(queue,{childList:true,subtree:true});
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
