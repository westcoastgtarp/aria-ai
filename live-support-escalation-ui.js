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
      <summary>Escalate</summary>
      <div class="live-support-escalation-body">
        <div class="live-support-escalation-active" id="liveSupportEscalationActive" hidden></div>
        <label>Escalate to
          <select id="liveSupportEscalationRole">
            <option value="">Select command role</option>
            <option>Lead Supervisor</option>
            <option>Supervisor</option>
            <option>Founder</option>
          </select>
        </label>
        <label>Reason
          <textarea id="liveSupportEscalationReason" maxlength="500" placeholder="Briefly explain why this conversation needs escalation..."></textarea>
        </label>
        <div class="live-support-escalation-actions">
          <button type="button" class="status-btn" id="liveSupportEscalationSend">Send escalation</button>
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
      .live-support-escalation-panel{margin:0;border-top:1px solid #e7ebf2;border-bottom:1px solid #e7ebf2;background:#fbfcff}
      .live-support-escalation-panel>summary{cursor:pointer;padding:10px 16px;font-size:12px;font-weight:800;color:#4f5d73;list-style:none}
      .live-support-escalation-panel>summary::-webkit-details-marker{display:none}
      .live-support-escalation-panel>summary::after{content:'▾';float:right;color:#7e8999}
      .live-support-escalation-panel[open]>summary::after{content:'▴'}
      .live-support-escalation-body{padding:0 16px 14px;display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:10px;align-items:end}
      .live-support-escalation-body label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#657185}
      .live-support-escalation-body select,.live-support-escalation-body textarea{width:100%;border:1px solid #dce2ec;border-radius:9px;background:#fff;padding:8px 10px;font:inherit;font-size:12px;box-sizing:border-box}
      .live-support-escalation-body textarea{min-height:58px;resize:vertical}
      .live-support-escalation-actions{grid-column:1/-1;display:flex;align-items:center;gap:10px}
      #liveSupportEscalationMessage{font-size:11px}
      .live-support-escalation-active{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border-radius:10px;background:#fff4e8;border:1px solid #f4d6ad;color:#7b4b12;font-size:11px}
      .live-support-escalation-active span{color:#735f49}.live-support-escalation-active small{margin-left:auto;color:#8a755e}
      @media(max-width:800px){.live-support-escalation-body{grid-template-columns:1fr}.live-support-escalation-actions{grid-column:1}.live-support-escalation-active{grid-column:1}}
    `;
    document.head.appendChild(style);
  }

  addStyles();
  pollTimer=setInterval(refresh,2000);
  refresh();
  window.addEventListener('beforeunload',()=>{if(pollTimer)clearInterval(pollTimer);},{once:true});
})();
