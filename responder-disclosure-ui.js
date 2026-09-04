(()=>{
  if(window.__ariaResponderDisclosureUiLoaded)return;
  window.__ariaResponderDisclosureUiLoaded=true;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const label=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

  function session(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'{}');}catch{return {};}
  }
  function allowed(){
    const s=session();
    const role=String(s.staffRole||'').toLowerCase();
    const dept=String(s.department||'').toLowerCase();
    return ['founder','lead supervisor','supervisor of live support','supervisor'].includes(role)||(role==='live support specialist'&&dept==='operations');
  }

  function ensureStyles(){
    if(document.querySelector('link[data-responder-disclosure]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='responder-disclosure.css?v=20260903-1';
    link.dataset.responderDisclosure='true';
    document.head.appendChild(link);
  }

  function build(){
    if(!allowed())return;
    const page=document.getElementById('operations-page');
    if(!page||document.getElementById('responderDisclosurePanel'))return;
    const panel=document.createElement('article');
    panel.id='responderDisclosurePanel';
    panel.className='panel responder-disclosure-panel';
    panel.innerHTML=`
      <div class="responder-head">
        <div><div class="eyebrow">RESPONDER VERIFICATION</div><h2>Emergency responder disclosure record</h2><p>Verify the responder before sharing member information, then record only the minimum necessary information actually disclosed.</p></div>
        <button class="secondary" id="responderRefresh" type="button">Refresh cases</button>
      </div>
      <div class="responder-warning"><strong>Do not disclose first and verify later.</strong> If identity cannot be verified, do not share member information through this workflow.</div>
      <form id="responderDisclosureForm" class="responder-form">
        <label>Active Lifeline case<select id="responderTicket" required><option value="">Loading active cases…</option></select></label>
        <div class="responder-grid">
          <label>Responder name<input id="responderName" required maxlength="160" /></label>
          <label>Agency / organization<input id="responderAgency" required maxlength="180" placeholder="Fire, EMS, law enforcement, hospital, etc." /></label>
          <label>Responder role<input id="responderRole" required maxlength="120" placeholder="Paramedic, dispatcher, officer…" /></label>
          <label>Badge / credential reference<input id="responderCredential" maxlength="120" placeholder="Reference only if needed" /></label>
          <label>Agency callback number<input id="responderCallback" maxlength="80" placeholder="Required for callback verification" /></label>
          <label>Verification method<select id="responderVerificationMethod" required>
            <option value="">Choose method</option>
            <option value="agency_callback">Agency callback</option>
            <option value="dispatch_confirmation">Dispatch confirmation</option>
            <option value="credential_plus_agency_callback">Credential + agency callback</option>
            <option value="in_person_credential">In-person credential</option>
            <option value="other_documented_method">Other documented method</option>
          </select></label>
        </div>
        <label>Verification notes<textarea id="responderVerificationNotes" required minlength="10" maxlength="1000" placeholder="Document how identity and agency affiliation were confirmed."></textarea></label>
        <label>Why disclosure was necessary<textarea id="responderReason" required minlength="20" maxlength="1200" placeholder="Document why this information was necessary for the active Lifeline event."></textarea></label>
        <fieldset><legend>Information actually disclosed</legend><div class="responder-check-grid">
          <label><input type="checkbox" name="responderField" value="member_identity" /> Member identity</label>
          <label><input type="checkbox" name="responderField" value="current_lifeline_status" /> Current Lifeline status</label>
          <label><input type="checkbox" name="responderField" value="incident_summary" /> Incident summary</label>
          <label><input type="checkbox" name="responderField" value="medication_summary" /> Medication summary</label>
          <label><input type="checkbox" name="responderField" value="care_circle_contact_information" /> Care Circle contact information</label>
          <label><input type="checkbox" name="responderField" value="member_provided_location" /> Member-provided location</label>
        </div></fieldset>
        <label class="responder-confirm"><input id="responderConfirmed" type="checkbox" /> <span>I confirmed the responder's identity before disclosure and recorded only the minimum necessary information shared.</span></label>
        <div id="responderStatus" class="responder-status" role="status"></div>
        <button class="primary" id="responderSubmit" type="submit">Record verified disclosure</button>
      </form>
      <div class="responder-history-head"><div><div class="eyebrow">RECENT RECORDS</div><h3>Responder disclosures</h3></div><button class="secondary" id="responderHistoryRefresh" type="button">Refresh</button></div>
      <div id="responderHistory" class="responder-history"><div class="empty-queue">No records loaded yet.</div></div>`;
    const queue=document.getElementById('operationsQueue');
    if(queue)queue.insertAdjacentElement('afterend',panel); else page.appendChild(panel);
    bind();
    loadTargets();
    loadHistory();
  }

  async function loadTargets(){
    const select=document.getElementById('responderTicket');if(!select)return;
    select.innerHTML='<option value="">Loading active cases…</option>';
    try{
      const r=await fetch('/api/staff/responder-disclosures/targets',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok)throw new Error(d.error||'Unable to load cases.');
      select.innerHTML='<option value="">Choose an active member case</option>'+((d.targets||[]).map(t=>`<option value="${esc(t.ticketId)}">${esc(t.memberName)} • ${esc(t.ticketId)}${t.currentRiskLevel?` • ${esc(t.currentRiskLevel)}`:''}</option>`).join(''));
    }catch(e){select.innerHTML=`<option value="">${esc(e.message||'Unable to load cases')}</option>`;}
  }

  async function loadHistory(){
    const box=document.getElementById('responderHistory');if(!box)return;
    box.innerHTML='<div class="empty-queue">Loading disclosure records…</div>';
    try{
      const r=await fetch('/api/staff/responder-disclosures',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok)throw new Error(d.error||'Unable to load disclosure records.');
      const rows=d.disclosures||[];
      box.innerHTML=rows.length?rows.slice(0,20).map(x=>`<article class="responder-record"><div><strong>${esc(x.responderName)}</strong><span>${esc(x.responderAgency)} • ${esc(x.responderRole)}</span><small>${esc(x.memberName)} • ${esc(x.relatedTicketId)} • ${esc(new Date(x.createdAt).toLocaleString())}</small></div><div>${(x.disclosedFields||[]).map(f=>`<span class="responder-chip">${esc(label(f))}</span>`).join('')}</div></article>`).join(''):'<div class="empty-queue">No responder disclosures recorded yet.</div>';
    }catch(e){box.innerHTML=`<div class="empty-queue">${esc(e.message||'Unable to load disclosure records.')}</div>`;}
  }

  function bind(){
    document.getElementById('responderRefresh')?.addEventListener('click',loadTargets);
    document.getElementById('responderHistoryRefresh')?.addEventListener('click',loadHistory);
    document.getElementById('responderDisclosureForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const status=document.getElementById('responderStatus');
      const button=document.getElementById('responderSubmit');
      const fields=[...document.querySelectorAll('input[name="responderField"]:checked')].map(i=>i.value);
      const payload={
        relatedTicketId:document.getElementById('responderTicket').value,
        responderName:document.getElementById('responderName').value,
        responderAgency:document.getElementById('responderAgency').value,
        responderRole:document.getElementById('responderRole').value,
        credentialReference:document.getElementById('responderCredential').value,
        callbackNumber:document.getElementById('responderCallback').value,
        verificationMethod:document.getElementById('responderVerificationMethod').value,
        verificationNotes:document.getElementById('responderVerificationNotes').value,
        disclosureReason:document.getElementById('responderReason').value,
        disclosedFields:fields,
        verificationConfirmed:document.getElementById('responderConfirmed').checked
      };
      status.textContent='Recording…';button.disabled=true;
      try{
        const r=await fetch('/api/staff/responder-disclosures',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
        const d=await r.json().catch(()=>({}));
        if(!r.ok||!d.ok)throw new Error(d.error||'Unable to record disclosure.');
        status.textContent='Verified responder disclosure recorded in the audit trail.';
        e.currentTarget.reset();
        await Promise.all([loadTargets(),loadHistory()]);
      }catch(err){status.textContent=err.message||'Unable to record disclosure.';}
      finally{button.disabled=false;}
    });
  }

  let remountTimer=null;
  function scheduleBuild(){
    clearTimeout(remountTimer);
    remountTimer=setTimeout(()=>{ensureStyles();build();},40);
  }

  function boot(){
    ensureStyles();
    scheduleBuild();
    document.querySelector('[data-page="operations"]')?.addEventListener('click',scheduleBuild);

    const observer=new MutationObserver(()=>{
      if(document.getElementById('operations-page')&&!document.getElementById('responderDisclosurePanel'))scheduleBuild();
    });
    observer.observe(document.body,{childList:true,subtree:true});

    let attempts=0;
    const retry=setInterval(()=>{
      attempts+=1;
      scheduleBuild();
      if(document.getElementById('responderDisclosurePanel')||attempts>=20)clearInterval(retry);
    },250);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
