(()=>{
  if(window.__ariaLiveSupportQueueWatchLoaded)return;
  window.__ariaLiveSupportQueueWatchLoaded=true;

  let knownIds=new Set();
  let initialized=false;
  let watcher=null;
  let banner=null;

  function activeMemberCommunicationIds(data){
    return new Set((data?.tickets||[])
      .filter(ticket=>ticket?.department==='Operations'&&ticket?.category==='Member Communication'&&ticket?.status!=='Closed')
      .map(ticket=>String(ticket.id||''))
      .filter(Boolean));
  }

  function busyWithLiveWork(){
    const workspace=document.getElementById('liveSupportWorkspace');
    if(workspace&&!workspace.hidden)return true;
    const active=document.activeElement;
    return Boolean(active&&(active.matches?.('textarea,input,[contenteditable="true"]')));
  }

  function ensureBanner(){
    if(banner&&document.body.contains(banner))return banner;
    banner=document.createElement('div');
    banner.id='ariaNewLiveSupportBanner';
    banner.style.cssText='position:fixed;right:20px;bottom:20px;z-index:1200;display:none;align-items:center;gap:10px;padding:12px 14px;border:1px solid #dfe4ed;border-radius:14px;background:#fff;box-shadow:0 14px 40px rgba(24,38,64,.18);font-size:12px;color:#344157';
    banner.innerHTML='<strong>New live support request</strong><button type="button" class="status-btn" style="margin-left:4px">Refresh queue</button>';
    banner.querySelector('button')?.addEventListener('click',()=>location.reload());
    document.body.appendChild(banner);
    return banner;
  }

  async function poll(){
    try{
      const response=await fetch('/api/staff/tickets',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)return;
      const next=activeMemberCommunicationIds(data);
      if(!initialized){knownIds=next;initialized=true;return;}
      const added=[...next].filter(id=>!knownIds.has(id));
      knownIds=next;
      if(!added.length)return;
      if(busyWithLiveWork()){
        const notice=ensureBanner();
        notice.style.display='flex';
      }else{
        location.reload();
      }
    }catch(error){
      console.error('Live Support queue watch failed',error);
    }
  }

  function showClosedConfirmation(){
    const workspace=document.getElementById('liveSupportWorkspace');
    if(!workspace||workspace.hidden)return;
    const status=workspace.querySelector('#liveSupportWorkspaceStatus');
    if(status){
      status.className='live-chat-inline-status closed';
      status.textContent='CLOSED • Conversation archived';
    }
    workspace.querySelector('#liveSupportWorkspaceCompose')?.classList.add('hidden');
    const readonly=workspace.querySelector('#liveSupportWorkspaceReadonly');
    if(readonly){readonly.classList.remove('hidden');readonly.textContent='Conversation closed • Moving to Aria Chat archive';}
  }

  async function closeLiveSupportTicket(id,button){
    if(!id)return;
    const original=button?.textContent||'Close';
    if(button){button.disabled=true;button.textContent='Closing...';}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/close`,{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Live Support conversation could not be closed.');
      showClosedConfirmation();
      if(button)button.textContent='Closed';
      setTimeout(()=>location.reload(),900);
    }catch(error){
      alert(error.message||'Live Support conversation could not be closed.');
      if(button){button.disabled=false;button.textContent=original;}
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.ticket-status[data-status="Closed"]');
    if(!button)return;
    const card=button.closest('.ticket-card');
    const meta=card?.querySelector('.ticket-id')?.textContent||'';
    if(!/MEMBER COMMUNICATION/i.test(meta))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id=button.dataset.id||(meta.split('•')[0]||'').trim();
    closeLiveSupportTicket(id,button);
  },true);

  ensureBanner();
  poll();
  watcher=setInterval(poll,3000);
  window.addEventListener('beforeunload',()=>watcher&&clearInterval(watcher),{once:true});
})();
