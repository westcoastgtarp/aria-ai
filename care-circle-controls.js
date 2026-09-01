(()=>{
  if(window.__ariaCareCircleControlsLoaded)return;
  window.__ariaCareCircleControlsLoaded=true;

  const page=document.getElementById('carecircle-page');
  if(!page)return;

  let contacts=[];
  const RELATIONSHIPS=['Parent','Partner','Friend','Sibling','Spouse','Caregiver','Child','Relative','Other'];

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function bool(value){return value===1||value===true||value==='1';}
  function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'?';}
  function phoneDisplay(value){const raw=String(value||'');if(raw.length<5)return raw;return `${raw.slice(0,2)}•••${raw.slice(-4)}`;}
  function relationshipOptions(current=''){
    const selected=String(current||'').trim();
    const options=[...RELATIONSHIPS];
    if(selected&&!options.includes(selected))options.unshift(selected);
    return `<option value="">Select relationship</option>${options.map(item=>`<option value="${esc(item)}" ${item===selected?'selected':''}>${esc(item)}</option>`).join('')}`;
  }
  function priorityOptions(current=1){
    const selected=Number(current||1);
    return Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===selected?'selected':''}>${n}${n===1?' — Highest priority':n===10?' — Lowest priority':''}</option>`).join('');
  }

  function disclosure(contact){
    return {
      supportEvent:bool(contact.share_support_event),
      limitedStatus:bool(contact.share_limited_status),
      location:bool(contact.share_location),
      medicationSummary:bool(contact.share_medication_summary),
      chatTranscript:bool(contact.share_chat_transcript)
    };
  }

  function permissionLabels(contact){
    const d=disclosure(contact);
    const labels=[];
    if(d.supportEvent)labels.push('Support event');
    if(d.limitedStatus)labels.push('Limited status');
    if(d.location)labels.push('Location');
    if(d.medicationSummary)labels.push('Medication summary');
    if(d.chatTranscript)labels.push('Chat transcript');
    return labels;
  }

  function ensureLayout(){
    page.classList.add('care-circle-redesign');
    const heading=page.querySelector('.section-heading');
    if(heading){
      heading.classList.add('care-circle-heading');
      if(!document.getElementById('careCircleAdd')){
        const button=document.createElement('button');
        button.id='careCircleAdd';button.type='button';button.className='primary care-circle-add';button.innerHTML='<span aria-hidden="true">＋</span> Add contact';
        button.addEventListener('click',()=>openEditor());
        heading.appendChild(button);
      }
    }

    const introNotice=[...page.querySelectorAll('.notice.info')][0];
    if(introNotice)introNotice.classList.add('care-circle-intro-notice');

    const grid=page.querySelector('.contact-grid');
    if(grid){grid.id='careCircleLiveGrid';grid.classList.add('care-circle-live-grid');}

    const consentPanel=[...page.querySelectorAll('.permissions-panel')].find(panel=>panel.querySelector('h3')?.textContent.includes('Emergency contact consent'));
    if(consentPanel){
      consentPanel.id='careCircleConsentOverview';
      consentPanel.classList.add('care-circle-summary-card');
      consentPanel.innerHTML=`
        <div class="care-summary-head"><span class="care-summary-icon care-logo-mark" aria-hidden="true"></span><div><h3>Your Care Circle</h3><p>Trusted people with permissions you control.</p></div></div>
        <div class="care-summary-points">
          <div><span>✓</span><p><strong>Support-only by default</strong><small>Support-event notice + limited status.</small></p></div>
          <div><span>✓</span><p><strong>Sensitive sharing stays off</strong><small>Location, medication and transcripts require your choice.</small></p></div>
          <div><span>✓</span><p><strong>You stay in control</strong><small>Change or revoke permissions at any time.</small></p></div>
        </div>`;
    }

    const sharingPanel=[...page.querySelectorAll('.permissions-panel')].find(panel=>panel.querySelector('h3')?.textContent.includes('Emergency sharing preferences'));
    if(sharingPanel){
      sharingPanel.id='careCircleDisclosureNotice';
      sharingPanel.classList.add('care-circle-boundary-card');
      sharingPanel.innerHTML=`
        <div class="care-boundary-inline"><span class="care-boundary-shield">◇</span><div><strong>Disclosure boundary</strong><p>Care Circle contacts are not automatically contacted. These permissions only define what Aria may share after a member-authorized Care Circle workflow.</p></div></div>
        <span class="care-boundary-note">Full chat transcripts are never shared by default.</span>`;
    }

    const locationPanel=[...page.querySelectorAll('.permissions-panel')].find(panel=>panel.querySelector('h3')?.textContent.includes('Lifeline location support'));
    if(locationPanel){locationPanel.id='careCircleLocationCard';locationPanel.classList.add('care-circle-compact-card');}

    const responsePanel=[...page.querySelectorAll('.panel')].find(panel=>panel.querySelector('.eyebrow')?.textContent.includes('LIFELINE RESPONSE FLOW'));
    if(responsePanel){responsePanel.id='careCircleFlowCard';responsePanel.classList.add('care-circle-compact-card');}

    if(!document.getElementById('careCircleDashboard')){
      const dashboard=document.createElement('div');dashboard.id='careCircleDashboard';dashboard.className='care-circle-dashboard';
      const contactsCard=document.createElement('article');contactsCard.className='panel care-circle-contacts-card';
      contactsCard.innerHTML='<div class="care-card-title"><span class="care-people-icon">◎</span><div><h3>Approved contacts</h3><p>People you chose and what each person may receive.</p></div></div>';
      if(grid)contactsCard.appendChild(grid);
      if(consentPanel)dashboard.append(consentPanel,contactsCard);
      else dashboard.append(contactsCard);
      const anchor=introNotice?.nextSibling||heading?.nextSibling;
      if(anchor)page.insertBefore(dashboard,anchor);else page.appendChild(dashboard);

      const lower=document.createElement('div');lower.id='careCircleLowerGrid';lower.className='care-circle-lower-grid';
      if(locationPanel)lower.appendChild(locationPanel);
      if(responsePanel)lower.appendChild(responsePanel);
      if(lower.children.length){
        if(sharingPanel)page.insertBefore(lower,sharingPanel);else page.appendChild(lower);
      }
    }
  }

  function render(){
    const grid=document.getElementById('careCircleLiveGrid');if(!grid)return;
    if(!contacts.length){
      grid.innerHTML=`<div class="care-circle-empty"><div class="care-empty-icon">◎</div><strong>No contacts added yet</strong><span>Add someone you trust and choose exactly what Aria may share with them.</span><button type="button" class="ghost-btn" id="careCircleEmptyAdd">＋ Add your first contact</button></div>`;
      document.getElementById('careCircleEmptyAdd')?.addEventListener('click',()=>openEditor());
      if(typeof window.renderDashboardSummary==='function')window.renderDashboardSummary();
      return;
    }

    grid.innerHTML=contacts.map(contact=>{
      const permissions=permissionLabels(contact);
      const transcript=bool(contact.share_chat_transcript);
      return `<article class="care-circle-live-card" data-contact-id="${esc(contact.id)}">
        <button type="button" class="care-contact-summary" data-toggle="${esc(contact.id)}" aria-expanded="false">
          <div class="contact-avatar">${esc(initials(contact.display_name))}</div>
          <div class="care-circle-card-main">
            <div class="care-contact-name-row"><strong>${esc(contact.display_name)}</strong><span class="pill success">Approved</span></div>
            <span>${esc(contact.relationship||'Approved contact')} · Priority ${esc(contact.priority)} · ${esc(phoneDisplay(contact.phone))}</span>
          </div>
          <span class="care-contact-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="care-contact-details" data-details="${esc(contact.id)}" hidden>
          <div class="care-scope-label">Allowed disclosures</div>
          <div class="care-circle-scope-row">${permissions.map(label=>`<span class="care-scope-pill ${label==='Chat transcript'?'sensitive':''}">${esc(label)}</span>`).join('')||'<span class="care-scope-pill none">No disclosure permissions</span>'}</div>
          ${transcript?'<div class="care-transcript-warning">Chat transcript sharing is explicitly enabled for this contact.</div>':''}
          <div class="care-circle-card-actions"><button type="button" class="ghost-btn care-edit" data-id="${esc(contact.id)}">Edit permissions</button><button type="button" class="ghost-btn care-remove" data-id="${esc(contact.id)}">Remove</button></div>
        </div>
      </article>`;
    }).join('');

    grid.querySelectorAll('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.toggle;const details=grid.querySelector(`[data-details="${CSS.escape(id)}"]`);if(!details)return;
      const open=details.hidden;details.hidden=!open;button.setAttribute('aria-expanded',open?'true':'false');
    }));
    grid.querySelectorAll('.care-edit').forEach(btn=>btn.addEventListener('click',()=>openEditor(contacts.find(c=>c.id===btn.dataset.id))));
    grid.querySelectorAll('.care-remove').forEach(btn=>btn.addEventListener('click',()=>removeContact(btn.dataset.id)));
    if(typeof window.renderDashboardSummary==='function')window.renderDashboardSummary();
  }

  async function load(){
    const grid=document.getElementById('careCircleLiveGrid');
    if(grid)grid.innerHTML='<div class="care-circle-empty"><span>Loading Care Circle…</span></div>';
    try{
      const response=await fetch('/api/member/care-circle',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Care Circle could not be loaded.');
      contacts=Array.isArray(data.contacts)?data.contacts:[];
      render();
    }catch(error){
      if(grid)grid.innerHTML=`<div class="care-circle-empty error"><strong>Care Circle could not load</strong><span>${esc(error.message||'Please try again.')}</span></div>`;
    }
  }

  function editorHtml(contact){
    const edit=Boolean(contact);
    const d=contact?disclosure(contact):{supportEvent:true,limitedStatus:true,location:false,medicationSummary:false,chatTranscript:false};
    return `
      <div class="care-editor-brand"><span class="care-logo-mark" aria-hidden="true"></span><div><div class="eyebrow">CARE CIRCLE</div><h2 id="modalTitle">${edit?'Edit approved contact':'Add approved contact'}</h2><p>Add someone you trust and choose exactly what Aria may disclose to them.</p></div></div>
      <div class="form-grid care-circle-form">
        <label>Name<input id="ccName" maxlength="120" value="${esc(contact?.display_name||'')}" placeholder="Full name" /></label>
        <label>Relationship<select id="ccRelationship">${relationshipOptions(contact?.relationship||'')}</select></label>
        <label>Phone<input id="ccPhone" maxlength="24" value="${esc(contact?.phone||'')}" placeholder="(555) 123-4567" /></label>
        <label>Priority<select id="ccPriority">${priorityOptions(contact?.priority||1)}</select><small>Lower numbers are contacted first.</small></label>
      </div>
      <div class="care-disclosure-heading"><strong>What Aria may share</strong><span>Choose only the information you're comfortable sharing.</span></div>
      <fieldset class="care-disclosure-fieldset">
        <label><input id="ccShareSupport" type="checkbox" ${d.supportEvent?'checked':''}/><span><strong>Notify this contact when I request/authorize Care Circle support</strong><small>They'll know Aria may reach out to them.</small></span></label>
        <label><input id="ccShareStatus" type="checkbox" ${d.limitedStatus?'checked':''}/><span><strong>Share a limited support-status update</strong><small>Status only; no additional details.</small></span></label>
        <label><input id="ccShareLocation" type="checkbox" ${d.location?'checked':''}/><span><strong>Share permitted Lifeline-event location</strong><small>Only when location access is also enabled.</small></span></label>
        <label><input id="ccShareMedication" type="checkbox" ${d.medicationSummary?'checked':''}/><span><strong>Share a limited medication summary</strong><small>Names only; no instructions are added by Aria.</small></span></label>
        <label class="care-sensitive-choice"><input id="ccShareTranscript" type="checkbox" ${d.chatTranscript?'checked':''}/><span><strong>Share Aria chat transcript</strong><small>Optional · Not recommended as a default.</small></span></label>
      </fieldset>
      <label class="care-consent-confirm"><input id="ccConsent" type="checkbox" ${edit?'checked':''}/><span>I confirm this person agreed to be an approved Aria contact and understands the sharing permissions I selected.</span></label>
      <div class="notice info care-member-choice"><strong>Member choice:</strong> Saving these permissions does not automatically contact this person.</div>
      <div id="ccEditorError" class="care-editor-error" hidden></div>
      <div class="modal-actions"><button class="outline" id="ccCancel">Cancel</button><button class="primary" id="ccSave">${edit?'Save changes':'Add contact'}</button></div>`;
  }

  function openEditor(contact=null){
    if(typeof window.openModal!=='function')return;
    window.openModal(editorHtml(contact));
    document.querySelector('#modalBackdrop .modal')?.classList.add('care-circle-editor-modal');
    document.getElementById('ccCancel')?.addEventListener('click',()=>window.closeModal?.());
    document.getElementById('ccSave')?.addEventListener('click',()=>saveContact(contact?.id||null));
  }

  function payload(){
    return {
      displayName:document.getElementById('ccName')?.value.trim()||'',
      relationship:document.getElementById('ccRelationship')?.value.trim()||'',
      phone:document.getElementById('ccPhone')?.value.trim()||'',
      priority:Number(document.getElementById('ccPriority')?.value||1),
      consentConfirmed:Boolean(document.getElementById('ccConsent')?.checked),
      shareSupportEvent:Boolean(document.getElementById('ccShareSupport')?.checked),
      shareLimitedStatus:Boolean(document.getElementById('ccShareStatus')?.checked),
      shareLocation:Boolean(document.getElementById('ccShareLocation')?.checked),
      shareMedicationSummary:Boolean(document.getElementById('ccShareMedication')?.checked),
      shareChatTranscript:Boolean(document.getElementById('ccShareTranscript')?.checked)
    };
  }

  async function saveContact(id){
    const button=document.getElementById('ccSave');const error=document.getElementById('ccEditorError');
    if(button){button.disabled=true;button.textContent='Saving…';}
    if(error)error.hidden=true;
    try{
      const response=await fetch(id?`/api/member/care-circle/${encodeURIComponent(id)}`:'/api/member/care-circle',{
        method:id?'PATCH':'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload())
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Contact could not be saved.');
      window.closeModal?.();
      await load();
    }catch(err){
      if(error){error.textContent=err.message||'Contact could not be saved.';error.hidden=false;}
      if(button){button.disabled=false;button.textContent=id?'Save changes':'Add contact';}
    }
  }

  async function removeContact(id){
    const contact=contacts.find(c=>c.id===id);if(!contact)return;
    if(!window.confirm(`Remove ${contact.display_name} from your Care Circle and revoke their disclosure permissions?`))return;
    try{
      const response=await fetch(`/api/member/care-circle/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Contact could not be removed.');
      await load();
    }catch(error){window.alert(error.message||'Contact could not be removed.');}
  }

  ensureLayout();
  load();
})();
