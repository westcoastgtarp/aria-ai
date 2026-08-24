(function(){
  const page=document.getElementById('carecircle-page');
  if(!page)return;

  const grid=page.querySelector('.contact-grid');
  const consentPanel=document.getElementById('careContactConsent')?.closest('.panel');
  if(!grid||!consentPanel)return;

  let contacts=[];
  let editingId=null;

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
  }

  function telHref(phone=''){
    const cleaned=String(phone).replace(/[^0-9+]/g,'');
    return `tel:${cleaned}`;
  }

  function initials(name=''){
    return String(name).trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'C';
  }

  function updateDashboard(){
    const count=document.getElementById('careCircleCount');
    const summary=document.getElementById('careCircleSummary');
    if(count)count.textContent=`${contacts.length} ${contacts.length===1?'contact':'contacts'}`;
    if(summary)summary.textContent=contacts.length?`${contacts.length} approved contact${contacts.length===1?'':'s'}`:'No approved contacts';
  }

  function render(){
    updateDashboard();
    grid.innerHTML=contacts.length?contacts.map(contact=>`
      <article class="contact-card" data-care-id="${esc(contact.id)}" style="align-items:flex-start">
        <div class="contact-avatar">${esc(initials(contact.display_name))}</div>
        <div style="min-width:0;flex:1">
          <strong>${esc(contact.display_name)}</strong>
          <span>${esc(contact.relationship||'Approved contact')} • Priority ${esc(contact.priority)}</span>
          <span style="margin-top:3px">${esc(contact.phone)}</span>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
            <a class="primary" href="${esc(telHref(contact.phone))}" style="text-decoration:none;display:inline-flex;align-items:center">Call</a>
            <button class="ghost-btn care-edit" type="button" data-id="${esc(contact.id)}">Edit</button>
            <button class="ghost-btn care-remove" type="button" data-id="${esc(contact.id)}">Remove</button>
          </div>
        </div>
        <div class="pill success">Approved</div>
      </article>`).join(''):`<article class="panel" style="grid-column:1/-1"><div class="empty-state"><h3>No approved contacts yet</h3><p>Add someone you trust so their phone number is available directly from Aria, including after an Assistant trial ends.</p></div></article>`;
  }

  function setupPanel(){
    consentPanel.innerHTML=`
      <div class="panel-head" style="align-items:flex-start">
        <div><div class="eyebrow">APPROVED CONTACTS</div><h3>Your Care Circle</h3><p class="small muted">Only add people who have agreed to be contacted as part of your Aria safety plan. You control this list.</p></div>
        <button class="primary" id="addCareContact" type="button">Add contact</button>
      </div>
      <div class="notice info" style="margin-top:12px"><strong>Privacy:</strong> approved contacts do not automatically receive your medication list or full Aria conversation. Calling them from this page uses your device's normal phone calling function.</div>`;
  }

  function openContactModal(contact=null){
    editingId=contact?.id||null;
    const body=document.getElementById('modalBody');
    const backdrop=document.getElementById('modalBackdrop');
    if(!body||!backdrop)return;
    body.innerHTML=`
      <div class="eyebrow">CARE CIRCLE</div>
      <h2 id="modalTitle">${contact?'Edit approved contact':'Add approved contact'}</h2>
      <p class="aria-contact-form-intro">${contact?'Update the details for this approved contact.':'Add someone who has agreed to be part of your Aria Care Circle.'}</p>
      <div class="aria-form-grid">
        <label class="aria-field">
          <span class="aria-field-label">Contact name</span>
          <input id="careName" maxlength="120" autocomplete="name" value="${esc(contact?.display_name||'')}" placeholder="e.g. Jordan Lee" />
        </label>
        <label class="aria-field">
          <span class="aria-field-label">Relationship</span>
          <input id="careRelationship" maxlength="80" value="${esc(contact?.relationship||'')}" placeholder="Parent, partner, friend" />
        </label>
        <label class="aria-field">
          <span class="aria-field-label">Phone number</span>
          <input id="carePhone" maxlength="32" inputmode="tel" autocomplete="tel" value="${esc(contact?.phone||'')}" placeholder="(555) 555-0123" />
          <span class="aria-field-help">Used only for direct calling and approved Lifeline contact workflows.</span>
        </label>
        <label class="aria-field">
          <span class="aria-field-label">Contact priority</span>
          <select id="carePriority">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${Number(contact?.priority||1)===n?'selected':''}>Priority ${n}</option>`).join('')}</select>
          <span class="aria-field-help">Priority 1 is the first person Aria should surface.</span>
        </label>
        <label class="aria-check-row aria-care-consent" for="careConsent">
          <input id="careConsent" type="checkbox" ${contact?'checked':''}/>
          <span class="aria-check-copy"><strong>Consent confirmed</strong><small>I confirm this person agreed to be an approved Aria contact and understands they may be contacted during a serious safety concern.</small></span>
        </label>
        <div class="aria-form-error" id="careFormError" role="alert" hidden></div>
      </div>
      <div class="aria-form-actions">
        <button class="primary" id="saveCareContact" type="button">${contact?'Save changes':'Add contact'}</button>
        <button class="secondary" id="cancelCareContact" type="button">Cancel</button>
      </div>`;
    backdrop.classList.remove('hidden');
    document.getElementById('careName')?.focus();
    document.getElementById('cancelCareContact')?.addEventListener('click',()=>backdrop.classList.add('hidden'));
    document.getElementById('saveCareContact')?.addEventListener('click',saveContact);
  }

  async function saveContact(){
    const error=document.getElementById('careFormError');
    const button=document.getElementById('saveCareContact');
    const payload={
      displayName:document.getElementById('careName')?.value.trim(),
      relationship:document.getElementById('careRelationship')?.value.trim(),
      phone:document.getElementById('carePhone')?.value.trim(),
      priority:Number(document.getElementById('carePriority')?.value||1),
      consentConfirmed:Boolean(document.getElementById('careConsent')?.checked)
    };
    if(error){error.hidden=true;error.textContent='';}
    button.disabled=true;
    const old=button.textContent;
    button.textContent='Saving…';
    try{
      const url=editingId?`/api/member/care-circle/${encodeURIComponent(editingId)}`:'/api/member/care-circle';
      const response=await fetch(url,{method:editingId?'PATCH':'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to save this approved contact.');
      document.getElementById('modalBackdrop')?.classList.add('hidden');
      await loadContacts();
    }catch(err){
      if(error){error.textContent=err?.message||'Unable to save this approved contact.';error.hidden=false;}
    }finally{
      button.disabled=false;
      button.textContent=old;
    }
  }

  async function removeContact(id){
    const contact=contacts.find(item=>item.id===id);
    if(!contact)return;
    if(!confirm(`Remove ${contact.display_name} from your approved Care Circle?`))return;
    try{
      const response=await fetch(`/api/member/care-circle/${encodeURIComponent(id)}`,{method:'DELETE',credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to remove this approved contact.');
      await loadContacts();
    }catch(err){alert(err?.message||'Unable to remove this approved contact.');}
  }

  async function loadContacts(){
    try{
      const response=await fetch('/api/member/care-circle',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load Care Circle.');
      contacts=Array.isArray(data.contacts)?data.contacts:[];
      render();
    }catch(err){
      console.error('Care Circle load failed',err);
      grid.innerHTML='<article class="panel" style="grid-column:1/-1"><div class="notice info"><strong>Care Circle unavailable:</strong> the approved-contact database may still need its migration applied.</div></article>';
      updateDashboard();
    }
  }

  setupPanel();
  document.getElementById('addCareContact')?.addEventListener('click',()=>openContactModal());
  grid.addEventListener('click',event=>{
    const edit=event.target.closest('.care-edit');
    if(edit){const contact=contacts.find(item=>item.id===edit.dataset.id);if(contact)openContactModal(contact);return;}
    const remove=event.target.closest('.care-remove');
    if(remove)removeContact(remove.dataset.id);
  });

  loadContacts();
})();
