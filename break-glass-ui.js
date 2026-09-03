(()=>{
  if(window.__ariaBreakGlassUiLoaded)return;
  window.__ariaBreakGlassUiLoaded=true;

  let selectedTarget=null;
  let activeGrant=null;
  let countdownTimer=null;

  function session(){try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'{}')||{};}catch{return {};}}
  function role(){return String(session().staffRole||session().role||'').trim().toLowerCase();}
  function eligible(){return ['founder','lead supervisor','supervisor of live support','live support specialist'].includes(role());}
  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){const error=new Error(data.error||`Request failed (${response.status})`);error.status=response.status;error.data=data;throw error;}
    return data;
  }

  function ensurePage(){
    if(!eligible())return null;
    const main=document.querySelector('.staff-main');if(!main)return null;
    let page=document.getElementById('breakglass-page');
    if(page)return page;
    page=document.createElement('section');
    page.id='breakglass-page';page.className='page';
    page.innerHTML=`
      <div class="break-glass-shell">
        <div class="break-glass-banner">
          <div class="break-glass-banner-icon">⚠</div>
          <div><h2>Break Glass Emergency Access</h2><p>Use only when an active Lifeline or Member Communication event requires temporary access to otherwise restricted member information. Every activation and every data view is logged, the grant expires automatically after 15 minutes, and the access is subject to later review.</p></div>
        </div>
        <div class="break-glass-grid">
          <article class="break-glass-card">
            <h3>Request temporary access</h3><p class="sub">Identify the member and active support event, choose only the information needed, and document why emergency access is necessary.</p>
            <label class="break-glass-label">Find member</label>
            <div class="break-glass-row"><input id="breakGlassTargetSearch" type="search" placeholder="Member name, email, or ID" /><button class="break-glass-btn secondary" id="breakGlassSearch" type="button">Search</button></div>
            <div class="break-glass-targets" id="breakGlassTargets"></div>
            <label class="break-glass-label">Selected member</label>
            <input id="breakGlassMemberId" readonly placeholder="Choose a member above" />
            <div class="break-glass-row">
              <label class="break-glass-label" style="flex:1">Support ticket ID<input id="breakGlassTicketId" placeholder="Example: OPS-..." /></label>
              <label class="break-glass-label" style="flex:1">Lifeline incident ID<input id="breakGlassIncidentId" placeholder="Example: LFL-..." /></label>
            </div>
            <label class="break-glass-label">Emergency access scope</label>
            <div class="break-glass-scopes">
              <label class="break-glass-scope"><input type="checkbox" value="lifeline_history" /><span><strong>Lifeline history</strong><span>Recent incident state, risk level, and Lifeline event history.</span></span></label>
              <label class="break-glass-scope"><input type="checkbox" value="conversation_transcript" /><span><strong>Conversation transcript</strong><span>Recent member, Aria, system, and staff conversation messages.</span></span></label>
              <label class="break-glass-scope"><input type="checkbox" value="medication_summary" /><span><strong>Medication summary</strong><span>Active medication names, dose text, and member-entered notes.</span></span></label>
            </div>
            <label class="break-glass-label">Emergency justification</label>
            <textarea id="breakGlassReason" maxlength="1000" placeholder="Describe the active emergency/support need and why normal access is insufficient."></textarea>
            <label class="break-glass-ack"><input id="breakGlassAck" type="checkbox" /><span>I understand this access is temporary, monitored, limited to the selected scopes, and subject to security/compliance review.</span></label>
            <div class="break-glass-actions"><button class="break-glass-btn danger" id="breakGlassActivate" type="button">Activate Break Glass</button></div>
            <div id="breakGlassError"></div>
          </article>
          <div>
            <article class="break-glass-card break-glass-status" id="breakGlassStatus"><div class="break-glass-inactive">No active Break Glass grant.</div></article>
            <article class="break-glass-card break-glass-snapshot" id="breakGlassSnapshotCard" hidden><h3>Emergency snapshot</h3><p class="sub">Displayed only while the active grant remains valid.</p><div id="breakGlassSnapshot"></div></article>
          </div>
        </div>
        <article class="break-glass-card break-glass-review-card" id="breakGlassReviewCard" hidden><h3>Security / Compliance review</h3><p class="sub">Expired and revoked Break Glass grants remain reviewable. Review notes are recorded with the grant and the event ledger.</p><div class="break-glass-reviews" id="breakGlassReviews"></div></article>
      </div>`;
    main.appendChild(page);
    bind();
    loadReviews();
    return page;
  }

  function ensureNav(){
    if(!eligible())return;
    const nav=document.querySelector('.staff-lifeline-nav')||document.querySelector('.staff-sidebar nav');if(!nav)return;
    if(nav.querySelector('[data-page="breakglass"]'))return;
    const button=document.createElement('button');
    button.type='button';button.className='nav-btn staff-nav-item';button.dataset.page='breakglass';
    button.innerHTML='<span class="staff-nav-icon">⚠</span><span>Break Glass</span>';
    const anchor=nav.querySelector('[data-page="audit"]')||nav.lastElementChild;
    if(anchor)nav.insertBefore(button,anchor);else nav.appendChild(button);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openPage();});
  }

  function openPage(){
    const page=ensurePage();if(!page)return;
    document.querySelectorAll('.page').forEach(node=>node.classList.remove('active'));page.classList.add('active');
    document.querySelectorAll('.staff-nav-item').forEach(node=>node.classList.toggle('active',node.dataset.page==='breakglass'));
    const title=document.getElementById('pageTitle');if(title)title.textContent='Break Glass Emergency Access';
    const tag=document.getElementById('staffHeaderTagline');if(tag)tag.textContent='Time-limited, justified, logged, and reviewable emergency access.';
    window.scrollTo({top:0,behavior:'smooth'});
    if(selectedTarget?.id)checkStatus(selectedTarget.id);
    loadReviews();
  }

  function showError(message=''){
    const holder=document.getElementById('breakGlassError');if(!holder)return;
    holder.innerHTML=message?`<div class="break-glass-error">${esc(message)}</div>`:'';
  }

  async function searchTargets(){
    showError('');
    const q=document.getElementById('breakGlassTargetSearch')?.value.trim()||'';
    const holder=document.getElementById('breakGlassTargets');if(holder)holder.innerHTML='<div class="break-glass-note">Searching…</div>';
    try{
      const data=await api(`/api/staff/break-glass/targets?q=${encodeURIComponent(q)}`);
      const targets=data.targets||[];
      if(holder)holder.innerHTML=targets.length?targets.map((t,i)=>`<button type="button" class="break-glass-target" data-index="${i}"><span><strong>${esc(t.display_name||t.email||t.id)}</strong><span>${esc(t.email||'')} • ${esc(t.id)}</span></span><em>${t.ticket_id?`Ticket ${esc(t.ticket_id)}`:'Select'}</em></button>`).join(''):'<div class="break-glass-note">No eligible member records found.</div>';
      holder?.querySelectorAll('[data-index]').forEach(button=>button.addEventListener('click',()=>selectTarget(targets[Number(button.dataset.index)])));
    }catch(error){if(holder)holder.innerHTML='';showError(error.message);}
  }

  function selectTarget(target){
    selectedTarget={id:target.id,name:target.display_name||target.email||target.id,email:target.email||'',ticketId:target.ticket_id||'',incidentId:target.incident_id||''};
    const member=document.getElementById('breakGlassMemberId');if(member)member.value=`${selectedTarget.name} — ${selectedTarget.id}`;
    const ticket=document.getElementById('breakGlassTicketId');if(ticket&&selectedTarget.ticketId)ticket.value=selectedTarget.ticketId;
    const incident=document.getElementById('breakGlassIncidentId');if(incident&&selectedTarget.incidentId)incident.value=selectedTarget.incidentId;
    document.getElementById('breakGlassTargets').innerHTML=`<div class="break-glass-note">Selected: ${esc(selectedTarget.name)} (${esc(selectedTarget.id)})</div>`;
    checkStatus(selectedTarget.id);
  }

  function chosenScopes(){return [...document.querySelectorAll('.break-glass-scope input:checked')].map(input=>input.value);}

  async function activate(){
    showError('');
    if(!selectedTarget){showError('Choose a member first.');return;}
    const button=document.getElementById('breakGlassActivate');if(button)button.disabled=true;
    try{
      const data=await api('/api/staff/break-glass/activate',{method:'POST',body:JSON.stringify({memberUserId:selectedTarget.id,relatedTicketId:document.getElementById('breakGlassTicketId')?.value.trim()||null,relatedIncidentId:document.getElementById('breakGlassIncidentId')?.value.trim()||null,scopes:chosenScopes(),reason:document.getElementById('breakGlassReason')?.value.trim()||'',acknowledged:Boolean(document.getElementById('breakGlassAck')?.checked)})});
      activeGrant=data.grant;renderStatus();await loadSnapshot();loadReviews();
    }catch(error){if(error.status===409&&error.data?.grant){activeGrant=error.data.grant;renderStatus();}showError(error.message);}finally{if(button)button.disabled=false;}
  }

  async function checkStatus(memberUserId){
    try{const data=await api(`/api/staff/break-glass/status?memberUserId=${encodeURIComponent(memberUserId)}`);activeGrant=data.grant||null;renderStatus();}catch(error){showError(error.message);}
  }

  function renderStatus(){
    const holder=document.getElementById('breakGlassStatus');if(!holder)return;
    if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
    if(!activeGrant?.active){holder.innerHTML='<div class="break-glass-inactive">No active Break Glass grant.</div>';document.getElementById('breakGlassSnapshotCard').hidden=true;return;}
    holder.innerHTML=`<div class="break-glass-active"><div class="break-glass-active-head"><div><span class="break-glass-pill">● BREAK GLASS ACTIVE</span><div class="break-glass-countdown" id="breakGlassCountdown">--:--</div><small>Grant ${esc(activeGrant.id)}</small></div><button class="break-glass-btn danger" id="breakGlassRevoke" type="button">Revoke now</button></div><div class="break-glass-note">Scopes: ${activeGrant.scopes.map(esc).join(', ')}<br>Expires: ${esc(new Date(activeGrant.expiresAt).toLocaleString())}</div><div class="break-glass-actions"><button class="break-glass-btn" id="breakGlassLoadSnapshot" type="button">Load emergency snapshot</button></div></div>`;
    document.getElementById('breakGlassRevoke')?.addEventListener('click',revoke);
    document.getElementById('breakGlassLoadSnapshot')?.addEventListener('click',loadSnapshot);
    const tick=()=>{
      const seconds=Math.max(0,Math.floor((new Date(activeGrant.expiresAt).getTime()-Date.now())/1000));
      const node=document.getElementById('breakGlassCountdown');if(node)node.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      if(seconds<=0){activeGrant.active=false;renderStatus();loadReviews();}
    };
    tick();countdownTimer=setInterval(tick,1000);
  }

  async function revoke(){
    if(!activeGrant)return;
    try{const data=await api(`/api/staff/break-glass/grants/${encodeURIComponent(activeGrant.id)}/revoke`,{method:'POST'});activeGrant=data.grant;renderStatus();loadReviews();}catch(error){showError(error.message);}
  }

  async function loadSnapshot(){
    if(!selectedTarget||!activeGrant?.active)return;
    const card=document.getElementById('breakGlassSnapshotCard');const holder=document.getElementById('breakGlassSnapshot');if(card)card.hidden=false;if(holder)holder.innerHTML='<div class="break-glass-note">Loading emergency snapshot…</div>';
    try{const data=await api(`/api/staff/break-glass/snapshot?memberUserId=${encodeURIComponent(selectedTarget.id)}`);renderSnapshot(data);}catch(error){if(holder)holder.innerHTML=`<div class="break-glass-error">${esc(error.message)}</div>`;}
  }

  function renderSnapshot(data){
    const holder=document.getElementById('breakGlassSnapshot');if(!holder)return;
    const sections=[];
    sections.push(`<div class="break-glass-snapshot-section"><h4>Member</h4><div class="break-glass-data-row"><strong>${esc(data.member?.name||'Member')}</strong><br>${esc(data.member?.email||'')} • ${esc(data.member?.id||'')}</div></div>`);
    if(Array.isArray(data.medications))sections.push(`<div class="break-glass-snapshot-section"><h4>Medication summary</h4>${data.medications.length?data.medications.map(m=>`<div class="break-glass-data-row"><strong>${esc(m.name)}</strong> — ${esc(m.dose_text)}${m.notes?`<br>${esc(m.notes)}`:''}</div>`).join(''):'<div class="break-glass-data-row">No active medications recorded.</div>'}</div>`);
    if(Array.isArray(data.conversation))sections.push(`<div class="break-glass-snapshot-section"><h4>Recent conversation</h4>${data.conversation.length?data.conversation.map(m=>`<div class="break-glass-message ${esc(m.role)}"><strong>${esc(m.role)}</strong> • ${esc(new Date(m.created_at).toLocaleString())}<br>${esc(m.content)}</div>`).join(''):'<div class="break-glass-data-row">No conversation messages recorded.</div>'}</div>`);
    if(data.lifeline)sections.push(`<div class="break-glass-snapshot-section"><h4>Lifeline history</h4>${(data.lifeline.incidents||[]).map(i=>`<div class="break-glass-data-row"><strong>${esc(i.id)}</strong> • ${esc(i.status)} • Risk: ${esc(i.current_risk_level)}<br>Started ${esc(new Date(i.started_at).toLocaleString())}</div>`).join('')||'<div class="break-glass-data-row">No Lifeline incidents recorded.</div>'}</div>`);
    holder.innerHTML=sections.join('');
  }

  async function loadReviews(){
    const card=document.getElementById('breakGlassReviewCard');const holder=document.getElementById('breakGlassReviews');if(!card||!holder)return;
    try{
      const data=await api('/api/staff/break-glass/reviews');card.hidden=false;
      holder.innerHTML=(data.reviews||[]).length?(data.reviews||[]).map(review=>{
        const active=review.active;const pending=review.reviewStatus!=='reviewed';
        return `<div class="break-glass-review-item"><div class="break-glass-review-item-head"><div><strong>${esc(review.member?.name||review.memberUserId)}</strong><span>Used by ${esc(review.actor?.name||'Staff')} • ${esc(new Date(review.startedAt).toLocaleString())}</span></div><span class="break-glass-pill">${active?'ACTIVE':review.revokedAt?'REVOKED':'EXPIRED'}</span></div><span>Reason: ${esc(review.reason)}</span><span>Scopes: ${(review.scopes||[]).map(esc).join(', ')}</span>${pending&&!active?`<textarea id="review-${esc(review.id)}" placeholder="Document review findings..."></textarea><div class="break-glass-actions"><button class="break-glass-btn secondary" type="button" data-review="${esc(review.id)}">Complete review</button></div>`:`<span>${review.reviewStatus==='reviewed'?`Reviewed ${esc(review.reviewedAt?new Date(review.reviewedAt).toLocaleString():'')}`:'Review pending until access ends.'}</span>`}</div>`;
      }).join(''):'<div class="break-glass-note">No Break Glass grants have been recorded.</div>';
      holder.querySelectorAll('[data-review]').forEach(button=>button.addEventListener('click',()=>completeReview(button.dataset.review)));
    }catch(error){if(error.status===403){card.hidden=true;return;}card.hidden=false;holder.innerHTML=`<div class="break-glass-error">${esc(error.message)}</div>`;}
  }

  async function completeReview(id){
    const notes=document.getElementById(`review-${CSS.escape(id)}`)?.value.trim()||'';
    try{await api(`/api/staff/break-glass/grants/${encodeURIComponent(id)}/review`,{method:'POST',body:JSON.stringify({notes})});loadReviews();}catch(error){showError(error.message);}
  }

  function bind(){
    document.getElementById('breakGlassSearch')?.addEventListener('click',searchTargets);
    document.getElementById('breakGlassTargetSearch')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchTargets();}});
    document.getElementById('breakGlassActivate')?.addEventListener('click',activate);
  }

  function boot(){
    if(!eligible())return;
    ensurePage();ensureNav();
    const observer=new MutationObserver(()=>{ensurePage();ensureNav();});
    observer.observe(document.body,{childList:true,subtree:true});
    if(role()==='live support specialist')setTimeout(searchTargets,300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
