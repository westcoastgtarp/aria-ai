(()=>{
  if(window.__ariaStaffLiveSupportChatLoaded)return;
  window.__ariaStaffLiveSupportChatLoaded=true;

  let overlay=null;
  let currentTicketId=null;
  let pollTimer=null;
  let canSend=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);}

  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');overlay.className='live-chat-overlay hidden';overlay.innerHTML=`
      <section class="live-chat-console" role="dialog" aria-modal="true" aria-label="Live Support conversation">
        <header class="live-chat-console-head"><div><div class="eyebrow">ARIA LIVE SUPPORT</div><h2 id="liveChatMemberName">Member conversation</h2><span id="liveChatStatus"></span></div><button class="live-chat-close" type="button" aria-label="Close conversation">×</button></header>
        <div class="live-chat-transcript" id="liveChatTranscript"></div>
        <form class="live-chat-compose" id="liveChatCompose"><textarea id="liveChatInput" maxlength="4000" placeholder="Message the member..."></textarea><button class="primary" type="submit">Send</button></form>
        <div class="live-chat-readonly hidden" id="liveChatReadonly">Read-only conversation review</div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.live-chat-close')?.addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('#liveChatCompose')?.addEventListener('submit',send);
    return overlay;
  }

  function render(data){
    ensureOverlay();canSend=Boolean(data.canSend);
    document.getElementById('liveChatMemberName').textContent=data.ticket?.memberName||'Member conversation';
    document.getElementById('liveChatStatus').textContent=[data.ticket?.assignedTo?`Support: ${data.ticket.assignedTo}`:'',data.ticket?.status||''].filter(Boolean).join(' • ');
    const transcript=document.getElementById('liveChatTranscript');
    transcript.innerHTML=(data.messages||[]).map(m=>{
      const role=m.role==='member'?'member':m.role==='staff'?'staff':'aria';
      const label=m.role==='member'?'Member':m.role==='staff'?'Support':'Aria';
      return `<div class="live-chat-line ${role}"><div class="live-chat-label">${label}<span>${esc(fmt(m.createdAt))}</span></div><div class="live-chat-bubble">${esc(m.content).replace(/\n/g,'<br>')}</div></div>`;
    }).join('')||'<div class="empty-queue">No conversation messages yet.</div>';
    transcript.scrollTop=transcript.scrollHeight;
    document.getElementById('liveChatCompose').classList.toggle('hidden',!canSend);
    document.getElementById('liveChatReadonly').classList.toggle('hidden',canSend);
  }

  async function load({poll=false}={}){
    if(!currentTicketId)return;
    try{
      const suffix=poll?'?poll=1':'';
      const r=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(currentTicketId)}/conversation${suffix}`,{credentials:'same-origin',cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)throw new Error(data.error||'Conversation could not be loaded.');
      render(data);
    }catch(error){
      const t=document.getElementById('liveChatTranscript');if(t)t.innerHTML=`<div class="empty-queue">${esc(error.message)}</div>`;
    }
  }

  function open(id){
    currentTicketId=id;ensureOverlay().classList.remove('hidden');load();
    if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(()=>load({poll:true}),3000);
  }
  function close(){
    currentTicketId=null;if(pollTimer)clearInterval(pollTimer);pollTimer=null;overlay?.classList.add('hidden');
  }

  async function send(event){
    event.preventDefault();if(!currentTicketId||!canSend)return;
    const input=document.getElementById('liveChatInput');const content=input?.value.trim();if(!content)return;
    const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{
      const r=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(currentTicketId)}/messages`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({content})});
      const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error(data.error||'Message could not be sent.');
      input.value='';await load({poll:true});
    }catch(error){alert(error.message);}finally{button.disabled=false;}
  }

  function addButtons(){
    document.querySelectorAll('.ticket-card').forEach(card=>{
      const meta=card.querySelector('.ticket-id')?.textContent||'';
      if(!/MEMBER COMMUNICATION/i.test(meta)||card.querySelector('.live-support-open-chat'))return;
      const id=(meta.split('•')[0]||'').trim();if(!id)return;
      const actions=card.querySelector('.ticket-actions');if(!actions)return;
      const button=document.createElement('button');button.className='status-btn live-support-open-chat';button.type='button';button.textContent='Open chat';button.dataset.id=id;
      actions.prepend(button);
    });
  }

  document.addEventListener('click',event=>{const b=event.target.closest('.live-support-open-chat');if(b){event.preventDefault();event.stopImmediatePropagation();open(b.dataset.id);}},true);
  const observer=new MutationObserver(addButtons);observer.observe(document.body,{childList:true,subtree:true});addButtons();
  window.addEventListener('beforeunload',()=>{observer.disconnect();if(pollTimer)clearInterval(pollTimer);},{once:true});
})();
