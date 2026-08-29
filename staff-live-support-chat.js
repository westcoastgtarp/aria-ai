(()=>{
  if(window.__ariaStaffLiveSupportChatLoaded)return;
  window.__ariaStaffLiveSupportChatLoaded=true;

  let currentTicketId=null;
  let currentPanel=null;
  let currentData=null;
  let pollTimer=null;
  let canSend=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);}

  function ticketIdFromCard(card){
    const meta=card?.querySelector('.ticket-id')?.textContent||'';
    return (meta.split('•')[0]||'').trim();
  }

  function findTicketCard(id){
    return [...document.querySelectorAll('.ticket-card')].find(card=>ticketIdFromCard(card)===id)||null;
  }

  function setButtonState(id,open){
    document.querySelectorAll(`.live-support-open-chat[data-id="${CSS.escape(id)}"]`).forEach(button=>{
      button.textContent=open?'Hide chat':'Open chat';
      button.setAttribute('aria-expanded',open?'true':'false');
    });
  }

  function buildPanel(id){
    const card=findTicketCard(id);if(!card)return null;
    const existing=card.querySelector(`.live-chat-inline[data-ticket-id="${CSS.escape(id)}"]`);
    if(existing)return existing;

    const panel=document.createElement('section');
    panel.className='live-chat-inline';
    panel.dataset.ticketId=id;
    panel.innerHTML=`
      <header class="live-chat-inline-head">
        <div><div class="eyebrow">ARIA LIVE SUPPORT</div><h3>Member conversation</h3><span class="live-chat-inline-status">Connecting…</span></div>
      </header>
      <div class="live-chat-transcript"><div class="empty-queue">Loading conversation…</div></div>
      <form class="live-chat-compose">
        <textarea maxlength="4000" placeholder="Message the member..."></textarea>
        <button class="primary" type="submit">Send</button>
      </form>
      <div class="live-chat-readonly hidden">Read-only conversation review</div>`;

    panel.querySelector('.live-chat-compose')?.addEventListener('submit',event=>send(event,id));
    const main=card.querySelector('.ticket-main');
    const meta=main?.querySelector('.ticket-meta');
    if(meta)meta.insertAdjacentElement('afterend',panel);
    else main?.prepend(panel);
    return panel;
  }

  function render(data){
    if(!currentTicketId)return;
    currentData=data;
    currentPanel=buildPanel(currentTicketId);
    if(!currentPanel)return;
    canSend=Boolean(data.canSend);

    const heading=currentPanel.querySelector('h3');
    const status=currentPanel.querySelector('.live-chat-inline-status');
    if(heading)heading.textContent=data.ticket?.memberName||'Member conversation';
    if(status)status.textContent=[data.ticket?.assignedTo?`Support: ${data.ticket.assignedTo}`:'',data.ticket?.status||''].filter(Boolean).join(' • ');

    const transcript=currentPanel.querySelector('.live-chat-transcript');
    if(transcript){
      transcript.innerHTML=(data.messages||[]).map(message=>{
        const role=message.role==='member'?'member':message.role==='staff'?'staff':'aria';
        const label=message.role==='member'?'Member':message.role==='staff'?'Support':'Aria';
        return `<div class="live-chat-line ${role}"><div class="live-chat-label">${label}<span>${esc(fmt(message.createdAt))}</span></div><div class="live-chat-bubble">${esc(message.content).replace(/\n/g,'<br>')}</div></div>`;
      }).join('')||'<div class="empty-queue">No conversation messages yet.</div>';
      transcript.scrollTop=transcript.scrollHeight;
    }

    const compose=currentPanel.querySelector('.live-chat-compose');
    const readonly=currentPanel.querySelector('.live-chat-readonly');
    compose?.classList.toggle('hidden',!canSend);
    readonly?.classList.toggle('hidden',canSend);
    setButtonState(currentTicketId,true);
  }

  async function load({poll=false}={}){
    if(!currentTicketId)return;
    currentPanel=buildPanel(currentTicketId);
    try{
      const suffix=poll?'?poll=1':'';
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(currentTicketId)}/conversation${suffix}`,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Conversation could not be loaded.');
      render(data);
    }catch(error){
      currentPanel=buildPanel(currentTicketId);
      const transcript=currentPanel?.querySelector('.live-chat-transcript');
      if(transcript)transcript.innerHTML=`<div class="empty-queue">${esc(error.message)}</div>`;
    }
  }

  function open(id){
    if(currentTicketId===id&&findTicketCard(id)?.querySelector('.live-chat-inline')){
      close(id);return;
    }
    if(currentTicketId)setButtonState(currentTicketId,false);
    document.querySelectorAll('.live-chat-inline').forEach(panel=>panel.remove());
    currentTicketId=id;
    currentPanel=buildPanel(id);
    currentData=null;
    setButtonState(id,true);
    load();
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>load({poll:true}),3000);
  }

  function close(id=currentTicketId){
    if(id)setButtonState(id,false);
    document.querySelectorAll('.live-chat-inline').forEach(panel=>panel.remove());
    currentTicketId=null;
    currentPanel=null;
    currentData=null;
    canSend=false;
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=null;
  }

  async function send(event,id){
    event.preventDefault();
    if(!currentTicketId||currentTicketId!==id||!canSend)return;
    const form=event.currentTarget;
    const input=form.querySelector('textarea');
    const content=input?.value.trim();if(!content)return;
    const button=form.querySelector('button');if(button)button.disabled=true;
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/messages`,{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({content})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Message could not be sent.');
      input.value='';
      await load({poll:true});
    }catch(error){alert(error.message);}
    finally{if(button)button.disabled=false;}
  }

  function addButtons(){
    document.querySelectorAll('.ticket-card').forEach(card=>{
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta))return;
      const id=ticketIdFromCard(card);if(!id)return;
      const actions=card.querySelector('.ticket-actions');if(!actions)return;
      let button=actions.querySelector('.live-support-open-chat');
      if(!button){
        button=document.createElement('button');
        button.className='status-btn live-support-open-chat';
        button.type='button';
        button.dataset.id=id;
        actions.prepend(button);
      }
      button.textContent=currentTicketId===id?'Hide chat':'Open chat';
      button.setAttribute('aria-expanded',currentTicketId===id?'true':'false');
      if(currentTicketId===id){
        currentPanel=buildPanel(id);
        if(currentData)render(currentData);
      }
    });
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.live-support-open-chat');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    open(button.dataset.id);
  },true);

  const observer=new MutationObserver(()=>addButtons());
  observer.observe(document.body,{childList:true,subtree:true});
  addButtons();
  window.addEventListener('beforeunload',()=>{observer.disconnect();if(pollTimer)clearInterval(pollTimer);},{once:true});
})();
