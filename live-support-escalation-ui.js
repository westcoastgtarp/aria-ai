(()=>{
  if(window.__ariaLiveSupportEscalationUiLoaded)return;
  window.__ariaLiveSupportEscalationUiLoaded=true;

  let lastTicketId='';
  let pollTimer=null;
  let busy=false;
  let pickupBusy=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function currentTicketId(){const open=document.querySelector('.live-support-open-chat[aria-expanded="true"]');return String(open?.dataset.id||'').trim();}
  function workspace(){return document.getElementById('liveSupportWorkspace');}

  function ensurePanel(){
    const ws=workspace();if(!ws)return null;
    let panel=document.getElementById('liveSupportEscalationPanel');if(panel)return panel;
    const transcript=ws.querySelector('#liveSupportWorkspaceTranscript');if(!transcript)return null;
    panel=document.createElement('details');
    panel.id='liveSupportEscalationPanel';
    panel.className='live-support-escalation-panel';
    panel.innerHTML=`
      <summary><span>Escalate conversation</span><span class="live-support-escalation-chevron" aria-hidden="true">⌄</span></summary>
      <div class="live-support-escalation-card">
        <div class="live-support-escalation-header">
          <div class="esc-header-icon" aria-hidden="true">↗</div>
          <div class="esc-header-main">
            <h3 id="liveSupportEscalationTitle">Escalate conversation</h3>
            <span class="esc-header-badge" id="liveSupportEscalationBadge">Command review</span>
          </div>
          <div class="esc-header-meta" id="liveSupportEscalationMeta">
            <span>Escalation</span>
            <strong>Choose a command role</strong>
          </div>
        </div>

        <div class="live-support-escalation-form">
          <div class="live-support-escalation-field live-support-escalation-role">
            <label for="liveSupportEscalationRole">Escalate to</label>
            <select id="liveSupportEscalationRole">
              <option value="">Select command role</option>
              <option>Lead Supervisor</option>
              <option>Supervisor</option>
              <option>Founder</option>
            </select>
          </div>

          <div class="live-support-escalation-field live-support-escalation-reason">
            <label for="liveSupportEscalationReason">Reason</label>
            <textarea id="liveSupportEscalationReason" rows="4" maxlength="500" placeholder="Briefly explain why this conversation needs escalation..."></textarea>
          </div>

          <div class="live-support-escalation-actions">
            <button type="button" id="liveSupportEscalationSend"><span aria-hidden="true">↗</span>Send escalation</button>
            <span id="liveSupportEscalationMessage"></span>
          </div>
        </div>

        <div class="live-support-escalation-footer" id="liveSupportEscalationFooter" hidden></div>
      </div>`;
    transcript.insertAdjacentElement('beforebegin',panel);
    panel.querySelector('#liveSupportEscalationSend')?.addEventListener('click',submit);
    return panel;
  }

  function setMessage(text,error=false){const el=document.getElementById('liveSupportEscalationMessage');if(!el)return;el.textContent=text||'';el.className=error?'error':'success';}

  function render(escalation,{canPickup=false}={}){
    const title=document.getElementById('liveSupportEscalationTitle');
    const badge=document.getElementById('liveSupportEscalationBadge');
    const meta=document.getElementById('liveSupportEscalationMeta');
    const footer=document.getElementById('liveSupportEscalationFooter');
    const role=document.getElementById('liveSupportEscalationRole');
    if(!title||!badge||!meta||!footer)return;

    if(!escalation){
      title.textContent='Escalate conversation';
      badge.textContent='Command review';badge.className='esc-header-badge';
      meta.innerHTML='<span>Escalation</span><strong>Choose a command role</strong>';
      footer.hidden=true;footer.innerHTML='';
      if(role)role.value='';
      return;
    }

    const waiting=Boolean(escalation.awaitingPickup||!escalation.pickedUpAt);
    title.textContent=`Escalated to ${escalation.targetRole}`;
    badge.textContent=waiting?'Awaiting pickup':'Escalated';
    badge.className=`esc-header-badge ${waiting?'waiting':'connected'}`;
    meta.innerHTML=`<span>Escalated by</span><strong>${esc(escalation.escalatedBy||'Staff')}</strong>`;
    if(role)role.value=escalation.targetRole||'';

    footer.hidden=false;
    footer.className=`live-support-escalation-footer ${waiting?'waiting':'connected'}`;
    if(waiting){
      footer.innerHTML=`
        <span class="esc-footer-icon">↗</span>
        <div class="esc-footer-copy">
          <strong>Awaiting ${esc(escalation.targetRole)} pickup</strong>
          <span>${esc(escalation.reason)}</span>
        </div>
        ${canPickup?'<button type="button" id="liveSupportEscalationPickup" class="live-support-escalation-pickup">Take escalation</button>':''}`;
      footer.querySelector('#liveSupportEscalationPickup')?.addEventListener('click',pickup);
    }else{
      footer.innerHTML=`<span class="esc-footer-icon">✓</span><div><strong>${esc(escalation.pickedUpByName||escalation.targetName||escalation.targetRole)} is now leading</strong><span>The conversation has been escalated.</span></div>`;
    }
  }

  async function refresh(){
    const ws=workspace();if(!ws||ws.hidden)return;
    ensurePanel();
    const id=currentTicketId();if(!id){render(null);return;}
    if(id!==lastTicketId){lastTicketId=id;setMessage('');}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/escalation`,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.ok)render(data.escalation||null,{canPickup:Boolean(data.canPickup)});
    }catch(error){console.error('Live Support escalation status failed',error);}
  }

  async function pickup(){
    if(pickupBusy)return;
    const id=currentTicketId();
    if(!id){setMessage('Open an active conversation first.',true);return;}
    pickupBusy=true;
    const button=document.getElementById('liveSupportEscalationPickup');
    if(button){button.disabled=true;button.textContent='Taking escalation...';}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/escalation/pickup`,{method:'POST',credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Escalation could not be picked up.');
      render(data.escalation||null,{canPickup:false});
      setMessage('You are now leading this conversation.');
      window.dispatchEvent(new CustomEvent('aria:live-support-escalation-picked-up',{detail:{ticketId:id,escalation:data.escalation||null}}));
    }catch(error){setMessage(error.message||'Escalation could not be picked up.',true);}
    finally{pickupBusy=false;if(button&&document.body.contains(button)){button.disabled=false;button.textContent='Take escalation';}}
  }

  async function submit(){
    if(busy)return;
    const id=currentTicketId();
    const role=document.getElementById('liveSupportEscalationRole')?.value||'';
    const reason=document.getElementById('liveSupportEscalationReason')?.value.trim()||'';
    if(!id){setMessage('Open an active conversation first.',true);return;}
    if(!role){setMessage('Choose a command role.',true);return;}
    if(!reason){setMessage('Enter a reason for the escalation.',true);return;}
    busy=true;
    const button=document.getElementById('liveSupportEscalationSend');if(button){button.disabled=true;button.textContent='Escalating...';}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/escalation`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({targetRole:role,reason})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Escalation could not be sent.');
      render(data.escalation,{canPickup:Boolean(data.canPickup)});
      const reasonBox=document.getElementById('liveSupportEscalationReason');if(reasonBox)reasonBox.value='';
      setMessage(`Awaiting ${role} pickup.`);
    }catch(error){setMessage(error.message||'Escalation could not be sent.',true);}
    finally{busy=false;if(button){button.disabled=false;button.innerHTML='<span aria-hidden="true">↗</span>Send escalation';}}
  }

  pollTimer=setInterval(refresh,2000);refresh();
  window.addEventListener('beforeunload',()=>{if(pollTimer)clearInterval(pollTimer);},{once:true});
})();
