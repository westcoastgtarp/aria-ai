(()=>{
  if(window.__ariaStaffLiveSupportChatLoaded)return;
  window.__ariaStaffLiveSupportChatLoaded=true;

  let currentTicketId=null;
  let workspace=null;
  let pollTimer=null;
  let buttonScanTimer=null;
  let canSend=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);}

  function ticketIdFromCard(card){
    const meta=card?.querySelector('.ticket-id')?.textContent||'';
    return (meta.split('•')[0]||'').trim();
  }

  function ensureWorkspace(){
    if(workspace&&document.body.contains(workspace))return workspace;
    const operations=document.getElementById('operations-page');
    const queue=document.getElementById('operationsQueue');
    if(!operations||!queue)return null;

    workspace=document.createElement('section');
    workspace.id='liveSupportWorkspace';
    workspace.className='live-chat-inline';
    workspace.hidden=true;
    workspace.innerHTML=`
      <header class="live-chat-inline-head">
        <div>
          <div class="eyebrow">ARIA LIVE SUPPORT</div>
          <h3 id="liveSupportWorkspaceTitle">Member conversation</h3>
          <span class="live-chat-inline-status" id="liveSupportWorkspaceStatus">Not connected</span>
        </div>
        <button type="button" class="status-btn" id="liveSupportWorkspaceClose">Hide chat</button>
      </header>
      <div class="live-chat-transcript" id="liveSupportWorkspaceTranscript"><div class="empty-queue">Choose a conversation to open.</div></div>
      <form class="live-chat-compose hidden" id="liveSupportWorkspaceCompose">
        <textarea maxlength="4000" placeholder="Message the member..."></textarea>
        <button class="primary" type="submit">Send</button>
      </form>
      <div class="live-chat-readonly hidden" id="liveSupportWorkspaceReadonly">Read-only conversation review</div>`;

    queue.parentNode.insertBefore(workspace,queue);
    workspace.querySelector('#liveSupportWorkspaceClose')?.addEventListener('click',close);
    workspace.querySelector('#liveSupportWorkspaceCompose')?.addEventListener('submit',send);
    return workspace;
  }

  function buttonText(button,open){
    const reviewOnly=button.dataset.reviewOnly==='true';
    if(reviewOnly)return open?'Hide review':'Review chat';
    return open?'Hide chat':'Open chat';
  }

  function setButtonState(id,open){
    document.querySelectorAll('.live-support-open-chat').forEach(button=>{
      const match=button.dataset.id===id;
      const nextText=buttonText(button,Boolean(match&&open));
      const nextExpanded=match&&open?'true':'false';
      if(button.textContent!==nextText)button.textContent=nextText;
      if(button.getAttribute('aria-expanded')!==nextExpanded)button.setAttribute('aria-expanded',nextExpanded);
    });
  }

  function render(data){
    const panel=ensureWorkspace();if(!panel)return;
    canSend=Boolean(data.canSend);
    panel.hidden=false;

    const heading=panel.querySelector('#liveSupportWorkspaceTitle');
    const status=panel.querySelector('#liveSupportWorkspaceStatus');
    if(heading)heading.textContent=data.ticket?.memberName||'Member conversation';
    if(status)status.textContent=[data.ticket?.assignedTo?`Support: ${data.ticket.assignedTo}`:'',data.ticket?.status||''].filter(Boolean).join(' • ')||'Connected';

    const transcript=panel.querySelector('#liveSupportWorkspaceTranscript');
    if(transcript){
      transcript.innerHTML=(data.messages||[]).map(message=>{
        const role=message.role==='member'?'member':message.role==='staff'?'staff':'aria';
        const label=message.role==='member'?'Member':message.role==='staff'?'Support':'Aria';
        return `<div class="live-chat-line ${role}"><div class="live-chat-label">${label}<span>${esc(fmt(message.createdAt))}</span></div><div class="live-chat-bubble">${esc(message.content).replace(/\n/g,'<br>')}</div></div>`;
      }).join('')||'<div class="empty-queue">No conversation messages were found for this member yet.</div>';
      transcript.scrollTop=transcript.scrollHeight;
    }

    panel.querySelector('#liveSupportWorkspaceCompose')?.classList.toggle('hidden',!canSend);
    panel.querySelector('#liveSupportWorkspaceReadonly')?.classList.toggle('hidden',canSend);
    setButtonState(currentTicketId,true);
  }

  function showError(message,statusCode=''){
    const panel=ensureWorkspace();if(!panel)return;
    panel.hidden=false;
    const status=panel.querySelector('#liveSupportWorkspaceStatus');
    if(status)status.textContent='Could not load conversation';
    const transcript=panel.querySelector('#liveSupportWorkspaceTranscript');
    if(transcript)transcript.innerHTML=`<div class="empty-queue"><strong>Live Support chat could not load.</strong><br>${esc(message)}${statusCode?`<br><small>HTTP ${esc(statusCode)}</small>`:''}</div>`;
    panel.querySelector('#liveSupportWorkspaceCompose')?.classList.add('hidden');
    panel.querySelector('#liveSupportWorkspaceReadonly')?.classList.remove('hidden');
  }

  async function load({poll=false}={}){
    if(!currentTicketId)return;
    const panel=ensureWorkspace();if(!panel)return;
    panel.hidden=false;
    if(!poll){
      const transcript=panel.querySelector('#liveSupportWorkspaceTranscript');
      if(transcript)transcript.innerHTML='<div class="empty-queue">Loading conversation…</div>';
      const status=panel.querySelector('#liveSupportWorkspaceStatus');
      if(status)status.textContent='Connecting…';
    }

    try{
      const suffix=poll?'?poll=1':'';
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(currentTicketId)}/conversation${suffix}`,{credentials:'same-origin',cache:'no-store'});
      const raw=await response.text();
      let data={};
      try{data=raw?JSON.parse(raw):{};}catch{}
      if(!response.ok||!data.ok){
        const message=data.error||data.message||raw.slice(0,180)||'Conversation could not be loaded.';
        throw Object.assign(new Error(message),{status:response.status});
      }
      render(data);
    }catch(error){
      console.error('Live Support conversation load failed',error);
      showError(error.message||'Conversation could not be loaded.',error.status||'');
    }
  }

  function open(id){
    if(!id)return;
    if(currentTicketId===id&&workspace&&!workspace.hidden){close();return;}
    currentTicketId=id;
    canSend=false;
    setButtonState(id,true);
    const panel=ensureWorkspace();
    if(panel){
      panel.hidden=false;
      panel.scrollIntoView({behavior:'smooth',block:'start'});
    }
    load();
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>load({poll:true}),3000);
  }

  function close(){
    if(currentTicketId)setButtonState(currentTicketId,false);
    currentTicketId=null;
    canSend=false;
    if(workspace)workspace.hidden=true;
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=null;
  }

  async function send(event){
    event.preventDefault();
    if(!currentTicketId||!canSend)return;
    const form=event.currentTarget;
    const input=form.querySelector('textarea');
    const content=input?.value.trim();if(!content)return;
    const button=form.querySelector('button');if(button)button.disabled=true;
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(currentTicketId)}/messages`,{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({content})
      });
      const raw=await response.text();
      let data={};try{data=raw?JSON.parse(raw):{};}catch{}
      if(!response.ok||!data.ok)throw new Error(data.error||raw.slice(0,180)||'Message could not be sent.');
      input.value='';
      await load({poll:true});
    }catch(error){alert(error.message||'Message could not be sent.');}
    finally{if(button)button.disabled=false;}
  }

  function addButtons(){
    ensureWorkspace();
    document.querySelectorAll('.ticket-card').forEach(card=>{
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta))return;
      const id=ticketIdFromCard(card);if(!id)return;
      const actions=card.querySelector('.ticket-actions');if(!actions)return;
      const reviewOnly=card.classList.contains('aria-chat-archive-card');
      let button=actions.querySelector('.live-support-open-chat');
      if(!button){
        button=document.createElement('button');
        button.className='status-btn live-support-open-chat';
        button.type='button';
        button.dataset.id=id;
        actions.prepend(button);
      }
      button.dataset.reviewOnly=reviewOnly?'true':'false';
      const openState=currentTicketId===id&&workspace&&!workspace.hidden;
      const nextText=buttonText(button,openState);
      const nextExpanded=openState?'true':'false';
      if(button.textContent!==nextText)button.textContent=nextText;
      if(button.getAttribute('aria-expanded')!==nextExpanded)button.setAttribute('aria-expanded',nextExpanded);
    });
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.live-support-open-chat');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    open(button.dataset.id);
  },true);

  addButtons();
  buttonScanTimer=setInterval(addButtons,1000);
  window.addEventListener('beforeunload',()=>{
    if(pollTimer)clearInterval(pollTimer);
    if(buttonScanTimer)clearInterval(buttonScanTimer);
  },{once:true});
})();
