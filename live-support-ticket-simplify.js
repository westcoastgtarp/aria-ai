(()=>{
  if(window.__ariaLiveSupportTicketSimplifyLoaded)return;
  window.__ariaLiveSupportTicketSimplifyLoaded=true;

  function simplify(){
    document.querySelectorAll('.ticket-card').forEach(card=>{
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta))return;
      if(card.classList.contains('aria-chat-archive-card'))return;

      card.querySelectorAll('.ticket-progress').forEach(button=>{
        const controls=button.parentElement;
        const progressBlock=controls?.parentElement;
        if(progressBlock)progressBlock.style.display='none';
      });

      card.querySelectorAll('.ticket-status[data-status="In Progress"]').forEach(button=>button.remove());

      const closeButton=card.querySelector('.ticket-status[data-status="Closed"]');
      if(closeButton&&closeButton.textContent!=='Close ticket')closeButton.textContent='Close ticket';
    });
  }

  simplify();
  const timer=setInterval(simplify,1000);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
