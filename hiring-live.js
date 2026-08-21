(function(){
  const list=document.getElementById('candidateList');
  const hiringPage=document.getElementById('hiring-page');
  if(!list||!hiringPage)return;

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function statusLabel(value){
    return ({invited:'Onboarding invited',submitted:'Submitted for review',reviewed:'Reviewed',archived:'Archived'})[value]||value||'Unknown';
  }

  function addCreateButton(){
    const head=hiringPage.querySelector('.action-head');
    if(!head||document.getElementById('addHiringCandidate'))return;
    const actions=document.createElement('div');
    actions.style.display='flex';
    actions.style.gap='10px';
    actions.style.flexWrap='wrap';
    actions.style.justifyContent='flex-end';
    const oldLink=head.querySelector('a[href^="onboarding.html"]');
    if(oldLink)oldLink.remove();
    const button=document.createElement('button');
    button.id='addHiringCandidate';
    button.className='primary';
    button.type='button';
    button.textContent='Invite Candidate';
    actions.appendChild(button);
    head.appendChild(actions);
  }

  function addModal(){
    if(document.getElementById('hiringCandidateModal'))return;
    const backdrop=document.createElement('div');
    backdrop.className='modal-backdrop hidden';
    backdrop.id='hiringCandidateModal';
    backdrop.innerHTML=`<div class="modal">
      <button class="close" type="button" data-hiring-close aria-label="Close">×</button>
      <div class="eyebrow">HIRING</div><h2>Invite Candidate</h2>
      <p style="color:var(--muted);font-size:13px;line-height:1.55">Create a hiring record and a private onboarding link for the candidate.</p>
      <label>Candidate name<input id="hiringCandidateName" maxlength="120" /></label>
      <label>Candidate email<input id="hiringCandidateEmail" type="email" maxlength="254" /></label>
      <label>Department<select id="hiringCandidateDepartment"><option>Operations</option><option>HR</option><option>IT</option><option>Engineering</option></select></label>
      <label>Expected role<input id="hiringCandidateRole" maxlength="120" /></label>
      <div id="hiringInviteResult" class="notice hidden" style="margin-top:16px"></div>
      <div class="modal-actions"><button class="primary" id="saveHiringCandidate" type="button">Create Onboarding Link</button></div>
    </div>`;
    document.body.appendChild(backdrop);
  }

  function openModal(){
    document.getElementById('hiringInviteResult')?.classList.add('hidden');
    ['hiringCandidateName','hiringCandidateEmail','hiringCandidateRole'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('hiringCandidateModal')?.classList.remove('hidden');
  }
  function closeModal(){document.getElementById('hiringCandidateModal')?.classList.add('hidden');}

  async function loadCandidates(){
    list.innerHTML='<div class="empty-queue">Loading hiring records…</div>';
    try{
      const response=await fetch('/api/staff/hiring/candidates',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load hiring records.');
      const records=data.candidates||[];
      list.innerHTML=records.length?records.map(candidate=>{
        const submitted=candidate.status==='submitted'||candidate.status==='reviewed';
        const detail=submitted?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);line-height:1.6">
          <strong style="color:var(--text)">Onboarding submission</strong><br>
          ${escapeHtml(candidate.personal_email||candidate.email)} • ${escapeHtml(candidate.phone||'No phone')}<br>
          ${escapeHtml([candidate.city,candidate.state].filter(Boolean).join(', '))} • Start ${escapeHtml(candidate.preferred_start_date||'Not provided')} • ${escapeHtml(candidate.availability||'')}
          ${candidate.notes?`<div style="margin-top:7px">${escapeHtml(candidate.notes)}</div>`:''}
        </div>`:'';
        const action=candidate.status==='submitted'?`<button class="secondary hiring-reviewed" data-id="${escapeHtml(candidate.id)}" type="button">Mark Reviewed</button>`:'';
        return `<article class="candidate-card">
          <div class="candidate-meta"><strong>${escapeHtml(candidate.full_name)}</strong><span>${escapeHtml(candidate.email)} • ${escapeHtml(candidate.department||'Department pending')} • ${escapeHtml(candidate.expected_role||'Role pending')}</span>${detail}</div>
          <div class="candidate-actions"><span class="pill ${candidate.status==='reviewed'?'active':candidate.status==='submitted'?'in-progress':'pending'}">${escapeHtml(statusLabel(candidate.status))}</span>${action}</div>
        </article>`;
      }).join(''):'<div class="empty-queue">No hiring records yet. Invite a candidate to begin.</div>';

      const pending=document.getElementById('pendingCount');
      if(pending)pending.textContent=String(records.filter(c=>c.status!=='reviewed'&&c.status!=='archived').length);
    }catch(error){
      list.innerHTML=`<div class="empty-queue">${escapeHtml(error?.message||'Unable to load hiring records.')}</div>`;
    }
  }

  async function createCandidate(){
    const button=document.getElementById('saveHiringCandidate');
    const fullName=document.getElementById('hiringCandidateName').value.trim();
    const email=document.getElementById('hiringCandidateEmail').value.trim();
    const department=document.getElementById('hiringCandidateDepartment').value;
    const expectedRole=document.getElementById('hiringCandidateRole').value.trim();
    if(!fullName||!email||!expectedRole){alert('Candidate name, email, and expected role are required.');return;}
    button.disabled=true;button.textContent='Creating…';
    try{
      const response=await fetch('/api/staff/hiring/candidates',{
        method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({fullName,email,department,expectedRole})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to create candidate invitation.');
      const result=document.getElementById('hiringInviteResult');
      result.innerHTML=`<strong>Onboarding link created.</strong><div style="margin-top:8px;word-break:break-all">${escapeHtml(data.onboardingUrl||'')}</div><button class="secondary" id="copyHiringLink" type="button" style="margin-top:10px">Copy Link</button><div style="margin-top:8px;font-size:11px">The link expires in 7 days.</div>`;
      result.classList.remove('hidden');
      document.getElementById('copyHiringLink')?.addEventListener('click',async()=>{
        try{await navigator.clipboard.writeText(data.onboardingUrl||'');event.target.textContent='Copied';}catch{}
      });
      await loadCandidates();
    }catch(error){alert(error?.message||'Unable to create candidate invitation.');}
    finally{button.disabled=false;button.textContent='Create Onboarding Link';}
  }

  async function markReviewed(id){
    try{
      const response=await fetch(`/api/staff/hiring/candidates/${encodeURIComponent(id)}/reviewed`,{method:'POST',credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to mark onboarding reviewed.');
      await loadCandidates();
    }catch(error){alert(error?.message||'Unable to mark onboarding reviewed.');}
  }

  addCreateButton();
  addModal();
  document.getElementById('addHiringCandidate')?.addEventListener('click',openModal);
  document.querySelector('[data-hiring-close]')?.addEventListener('click',closeModal);
  document.getElementById('hiringCandidateModal')?.addEventListener('click',event=>{if(event.target.id==='hiringCandidateModal')closeModal();});
  document.getElementById('saveHiringCandidate')?.addEventListener('click',createCandidate);
  document.addEventListener('click',event=>{const button=event.target.closest('.hiring-reviewed');if(button)markReviewed(button.dataset.id);});

  loadCandidates();
})();
