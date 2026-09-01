(()=>{
  if(window.__ariaCareCircleControlsLoaded)return;
  window.__ariaCareCircleControlsLoaded=true;

  const page=document.getElementById('carecircle-page');
  if(!page)return;

  let contacts=[];

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function bool(value){return value===1||value===true||value==='1';}
  function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'?';}
  function phoneDisplay(value){const raw=String(value||'');if(raw.length<5)return raw;return `${raw.slice(0,2)}•••${raw.slice(-4)}`;}

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
    const heading=page.querySelector('.section-heading');
    if(heading&&!document.getElementById('careCircleAdd')){
      const button=document.createElement('button');
      button.id='careCircleAdd';button.type='button';button.className='primary';button.textContent='Add contact';
      button.addEventListener('click',()=>openEditor());
      heading.appendChild(button);
    }

    const grid=page.querySelector('.contact-grid');
    if(grid)grid.id='careCircleLiveGrid';

    const consentPanel=[...page.querySelectorAll('.permissions-panel')].find(panel=>panel.querySelector('h3')?.textContent.includes('Emergency contact consent'));
    if(consentPanel){
      consentPanel.id='careCircleConsentOverview';
      consentPanel.innerHTML=`
        <h3>Consent & disclosure controls</h3>
        <p>Each Care Circle contact has their own sharing permissions. Adding a person does <strong>not</strong> give them access to your full Aria account or conversations.</p>
        <div class="care-consent-baseline">
          <strong>Default sharing</strong>
          <span>Support-event notice + limited status only</span>
        </div>
        <p class="small muted">Location, medication information, and chat transcripts stay off unless you explicitly enable them for that contact. You can change or revoke consent at any time.</p>`;
    }

    const sharingPanel=[...page.querySelectorAll('.permissions-panel')].find(panel=>panel.querySelector('h3')?.textContent.includes('Emergency sharing preferences'));
    if(sharingPanel){
      sharingPanel.id='careCircleDisclosureNotice';
      sharingPanel.innerHTML=`
        <h3>Disclosure boundary</h3>
        <div class="notice info"><strong>Care Circle contacts are not automatically contacted.</strong> These settings only define what Aria is permitted to share if a member-authorized Care Circle workflow is used.</div>
        <p class="small muted">Full chat transcripts are never part of the default disclosure scope. If transcript sharing is enabled for a contact, that choice is recorded separately in the audit history.</p>`;
    }
  }

  function render(){
    const grid=document.getElementById('careCircleLiveGrid');if(!grid)return;
    if(!contacts.length){
      grid.innerHTML='<div class="care-circle-empty"><strong>No Care Circle contacts yet</strong><span>Add someone you trust and choose exactly what Aria may share with them.</span></div>';
      if(typeof window.renderDashboardSummary==='function')window.renderDashboardSummary();
      return;
    }
    grid.innerHTML=contacts.map(contact=>{
      const permissions=permissionLabels(contact);
      const transcript=bool(contact.share_chat_transcript);
      return `<article class="contact-card care-circle-live-card" data-contact-id="${esc(contact.id)}">
        <div class="contact-avatar">${esc(initials(contact.display_name))}</div>
        <div class="care-circle-card-main">
          <strong>${esc(contact.display_name)}</strong>
          <span>${esc(contact.relationship||'Approved contact')} • Priority ${esc(contact.priority)} • ${esc(phoneDisplay(contact.phone))}</span>
          <div class="care-circle-scope-row">${permissions.map(label=>`<span class="care-scope-pill ${label==='Chat transcript'?'sensitive':''}">${esc(label)}</span>`).join('')||'<span class="care-scope-pill none">No disclosure permissions</span>'}</div>
          ${transcript?'<div class="care-transcript-warning">Chat transcript sharing is explicitly enabled for this contact.</div>':''}
        </div>
        <div class="care-circle-card-actions">
          <div class="pill success">Approved</div>
          <button type="button" class="ghost-btn care-edit" data-id="${esc(contact.id)}">Edit</button>
          <button type="button" class="ghost-btn care-remove" data-id="${esc(contact.id)}">Remove</button>
        </div>
      </article>`;
    }).join('');

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
      <div class="eyebrow">CARE CIRCLE</div>
      <h2 id="modalTitle">${edit?'Edit approved contact':'Add approved contact'}</h2>
      <p>Choose the person and exactly what Aria may disclose to them. These permissions can be changed or revoked later.</p>
      <div class="form-grid care-circle-form">
        <label>Name<input id="ccName" maxlength="120" value="${esc(contact?.display_name||'')}" placeholder="Contact name" /></label>
        <label>Relationship<input id="ccRelationship" maxlength="80" value="${esc(contact?.relationship||'')}" placeholder="Friend, parent, partner…" /></label>
        <label>Phone<input id="ccPhone" maxlength="24" value="${esc(contact?.phone||'')}" placeholder="Phone number" /></label>
        <label>Priority<input id="ccPriority" type="number" min="1" max="10" value="${esc(contact?.priority||1)}" /></label>
      </div>
      <fieldset class="care-disclosure-fieldset">
        <legend>Allowed disclosures</legend>
        <label><input id="ccShareSupport" type="checkbox" ${d.supportEvent?'checked':''}/> Notify this contact that I requested/authorized Care Circle support</label>
        <label><input id="ccShareStatus" type="checkbox" ${d.limitedStatus?'checked':''}/> Share a limited support-status update</label>
        <label><input id="ccShareLocation" type="checkbox" ${d.location?'checked':''}/> Share permitted Lifeline-event location when location access is also enabled</label>
        <label><input id="ccShareMedication" type="checkbox" ${d.medicationSummary?'checked':''}/> Share a limited medication summary</label>
        <label class="care-sensitive-choice"><input id="ccShareTranscript" type="checkbox" ${d.chatTranscript?'checked':''}/> Share Aria chat transcript <strong>(not recommended as a default)</strong></label>
      </fieldset>
      <label class="care-consent-confirm"><input id="ccConsent" type="checkbox" ${edit?'checked':''}/> I confirm this person agreed to be an approved Aria contact and understands the sharing permissions I selected.</label>
      <div class="notice info"><strong>Member choice:</strong> Saving these permissions does not automatically contact this person.</div>
      <div id="ccEditorError" class="care-editor-error" hidden></div>
      <div class="modal-actions"><button class="primary" id="ccSave">${edit?'Save changes':'Add contact'}</button><button class="outline" id="ccCancel">Cancel</button></div>`;
  }

  function openEditor(contact=null){
    if(typeof window.openModal!=='function')return;
    window.openModal(editorHtml(contact));
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
