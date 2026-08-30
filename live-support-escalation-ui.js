(()=>{
  if(window.__ariaLiveSupportEscalationUiLoaded)return;
  window.__ariaLiveSupportEscalationUiLoaded=true;

  let lastTicketId='';
  let pollTimer=null;
  let busy=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function currentTicketId(){
    const open=document.querySelector('.live-support-open-chat[aria-expanded="true"]');
    return String(open?.dataset.id||'').trim();
  }
  function workspace(){return document.getElementById('liveSupportWorkspace');}

  function ensurePanel(){
    const ws=workspace();if(!ws)return null;
    let panel=document.getElementById('liveSupportEscalationPanel');
    if(panel)return panel;
    const transcript=ws.querySelector('#liveSupportWorkspaceTranscript');
    if(!transcript)return null;
    panel=document.createElement('details');
    panel.id='liveSupportEscalationPanel';
    panel.className='live-support-escalation-panel';
    panel.innerHTML=`
      <summary><span>Escalate conversation</span><span class="live-support-escalation-chevron" aria-hidden="true">⌄</span></summary>
      <div class="live-support-escalation-body">
        <div class="live-support-escalation-active" id="liveSupportEscalationActive" hidden></div>

        <div class="live-support-escalation-field">
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
          <textarea id="liveSupportEscalationReason" rows="7" maxlength="500" placeholder="Briefly explain why this conversation needs escalation..."></textarea>
        </div>

        <div class="live-support-escalation-actions">
          <button type="button" class="primary" id="liveSupportEscalationSend">Send escalation</button>
          <span id="liveSupportEscalationMessage"></span>
        </div>
      </div>`;
    transcript.insertAdjacentElement('beforebegin',panel);
    panel.querySelector('#liveSupportEscalationSend')?.addEventListener('click',submit);
    return panel;
  }

  function setMessage(text,error=false){
    const el=document.getElementById('liveSupportEscalationMessage');if(!el)return;
    el.textContent=text||'';
    el.style.color=error?'#b42318':'#617087';
  }

  function render(escalation){
    const active=document.getElementById('liveSupportEscalationActive');if(!active)return;
    if(!escalation){active.hidden=true;active.innerHTML='';return;}
    active.hidden=false;
    active.innerHTML=`<strong>Escalated to ${esc(escalation.targetRole)}</strong><span>${esc(escalation.reason)}</span><small>Escalated by ${esc(escalation.escalatedBy||'Staff')}</small>`;
  }

  async function refresh(){
    const ws=workspace();
    if(!ws||ws.hidden)return;
    ensurePanel();
    const id=currentTicketId();
    if(!id){render(null);return;}
    if(id!==lastTicketId){lastTicketId=id;setMessage('');}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/escalation`,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.ok)render(data.escalation||null);
    }catch(error){console.error('Live Support escalation status failed',error);}
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
    const button=document.getElementById('liveSupportEscalationSend');
    if(button){button.disabled=true;button.textContent='Escalating...';}
    try{
      const response=await fetch(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/escalation`,{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({targetRole:role,reason})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Escalation could not be sent.');
      render(data.escalation);
      const reasonBox=document.getElementById('liveSupportEscalationReason');if(reasonBox)reasonBox.value='';
      setMessage(`Escalated to ${role}.`);
    }catch(error){setMessage(error.message||'Escalation could not be sent.',true);}
    finally{busy=false;if(button){button.disabled=false;button.textContent='Send escalation';}}
  }

  function addStyles(){
    if(document.getElementById('liveSupportEscalationStyles'))return;
    const style=document.createElement('style');
    style.id='liveSupportEscalationStyles';
    style.textContent=`
      #liveSupportEscalationPanel.live-support-escalation-panel{display:block!important;margin:14px 16px!important;border:1px solid #e2e7ef!important;border-radius:14px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 3px 12px rgba(35,48,73,.04)!important}
      #liveSupportEscalationPanel>summary{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;cursor:pointer!important;padding:13px 15px!important;font-size:12px!important;font-weight:800!important;color:#344054!important;list-style:none!important;background:#f8faff!important;border:0!important;margin:0!important}
      #liveSupportEscalationPanel>summary::-webkit-details-marker{display:none!important}
      #liveSupportEscalationPanel .live-support-escalation-chevron{font-size:16px!important;color:#7e8999!important;line-height:1!important;transition:transform .15s ease!important}
      #liveSupportEscalationPanel[open] .live-support-escalation-chevron{transform:rotate(180deg)!important}
      #liveSupportEscalationPanel .live-support-escalation-body{display:grid!important;grid-template-columns:minmax(210px,260px) minmax(0,1fr)!important;gap:14px!important;align-items:start!important;padding:16px!important;background:#fff!important}
      #liveSupportEscalationPanel .live-support-escalation-field{display:flex!important;flex-direction:column!important;gap:7px!important;min-width:0!important;margin:0!important}
      #liveSupportEscalationPanel .live-support-escalation-reason{grid-column:1/-1!important;width:100%!important}
      #liveSupportEscalationPanel .live-support-escalation-field label{display:block!important;margin:0!important;padding:0!important;font-size:11px!important;font-weight:800!important;color:#5c687a!important;line-height:1.2!important}
      #liveSupportEscalationPanel select,#liveSupportEscalationPanel textarea{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;border:1px solid #d9e0ea!important;border-radius:10px!important;background:#fff!important;padding:10px 11px!important;font:inherit!important;font-size:12px!important;color:#263244!important;box-sizing:border-box!important;outline:none!important;box-shadow:none!important}
      #liveSupportEscalationPanel select{height:42px!important;min-height:42px!important}
      #liveSupportEscalationPanel #liveSupportEscalationReason{display:block!important;width:100%!important;height:160px!important;min-height:160px!important;max-height:320px!important;resize:vertical!important;line-height:1.45!important;overflow:auto!important}
      #liveSupportEscalationPanel select:focus,#liveSupportEscalationPanel textarea:focus{border-color:#6b63e8!important;box-shadow:0 0 0 3px rgba(107,99,232,.10)!important}
      #liveSupportEscalationPanel .live-support-escalation-actions{grid-column:1/-1!important;display:flex!important;align-items:center!important;gap:12px!important;margin-top:2px!important;padding:0!important}
      #liveSupportEscalationPanel #liveSupportEscalationSend{min-width:130px!important;height:40px!important;padding:0 16px!important;border-radius:10px!important;margin:0!important}
      #liveSupportEscalationPanel #liveSupportEscalationMessage{font-size:11px!important;line-height:1.4!important}
      #liveSupportEscalationPanel .live-support-escalation-active{grid-column:1/-1!important;display:flex!important;gap:10px!important;align-items:center!important;flex-wrap:wrap!important;padding:10px 12px!important;border-radius:10px!important;background:#fff7ed!important;border:1px solid #fed7aa!important;color:#7c4a03!important;font-size:11px!important}
      #liveSupportEscalationPanel .live-support-escalation-active[hidden]{display:none!important}
      #liveSupportEscalationPanel .live-support-escalation-active span{color:#735f49!important}
      #liveSupportEscalationPanel .live-support-escalation-active small{margin-left:auto!important;color:#8a755e!important}
      @media(max-width:800px){
        #liveSupportEscalationPanel .live-support-escalation-body{grid-template-columns:1fr!important}
        #liveSupportEscalationPanel .live-support-escalation-reason{grid-column:1!important}
        #liveSupportEscalationPanel .live-support-escalation-actions{grid-column:1!important;align-items:flex-start!important;flex-direction:column!important}
        #liveSupportEscalationPanel .live-support-escalation-active{grid-column:1!important}
      }
    `;
    document.head.appendChild(style);
  }

  addStyles();
  pollTimer=setInterval(refresh,2000);
  refresh();
  window.addEventListener('beforeunload',()=>{if(pollTimer)clearInterval(pollTimer);},{once:true});
})();
