(function(){
  const auditPage=document.getElementById('audit-page');
  if(!auditPage)return;

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function formatTime(value){
    if(!value)return 'Unknown time';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return value;
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
  }

  function humanize(value=''){
    return String(value).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
  }

  function detailPairs(details){
    if(!details||typeof details!=='object')return [];
    return Object.entries(details).filter(([,v])=>v!==null&&v!==undefined&&v!=='').slice(0,12);
  }

  auditPage.innerHTML=`
    <div class="section-head action-head audit-head">
      <div>
        <div class="eyebrow">FOUNDER-ONLY AUDIT</div>
        <h2>Company Audit Log</h2>
        <p>Search and review accountability records for staff actions, access changes, Lifeline activity, tickets, and system events.</p>
      </div>
      <button class="secondary audit-refresh" id="auditRefresh" type="button">Refresh</button>
    </div>

    <div class="audit-access-note"><strong>Founder access only.</strong> These are live D1-backed audit records.</div>

    <article class="panel audit-filter-panel">
      <div class="audit-filter-row">
        <input id="auditSearch" type="search" placeholder="Search audit activity" />
        <select id="auditCategory"><option value="">All categories</option></select>
        <input id="auditActor" type="search" placeholder="Actor or email" />
        <input id="auditAction" type="search" placeholder="Action" />
        <input id="auditFrom" type="date" aria-label="Audit start date" />
        <input id="auditTo" type="date" aria-label="Audit end date" />
      </div>
    </article>

    <div class="audit-summary-row" id="auditCategorySummary"></div>

    <article class="panel audit-history-panel">
      <div class="audit-history-head">
        <div><div class="eyebrow">EVENT HISTORY</div><h2>Recorded activity</h2></div>
        <span id="auditCount" class="audit-count">0 events</span>
      </div>
      <div id="auditLogList" class="audit-log-list"><div class="empty-queue">Loading audit events…</div></div>
    </article>`;

  const list=document.getElementById('auditLogList');
  const count=document.getElementById('auditCount');
  const categorySelect=document.getElementById('auditCategory');
  const summary=document.getElementById('auditCategorySummary');
  let filterTimer=null;

  function buildQuery(){
    const params=new URLSearchParams();
    const values={
      q:document.getElementById('auditSearch').value.trim(),
      category:categorySelect.value,
      actor:document.getElementById('auditActor').value.trim(),
      action:document.getElementById('auditAction').value.trim(),
      from:document.getElementById('auditFrom').value,
      to:document.getElementById('auditTo').value
    };
    Object.entries(values).forEach(([k,v])=>{if(v)params.set(k,v)});
    params.set('limit','250');
    return params.toString();
  }

  function renderEvent(event){
    const actor=event.actor_name||event.actor_email||event.actor_user_id||'System';
    const actorMeta=[event.actor_department,event.actor_role].filter(Boolean).join(' • ');
    const context=[
      event.room_or_zone?`Zone: ${event.room_or_zone}`:'',
      event.asset_id?`Asset: ${event.asset_id}`:'',
      event.badge_id?`Badge: ${event.badge_id}`:'',
      event.related_ticket_id?`Ticket: ${event.related_ticket_id}`:'',
      event.subject_type||event.subject_id?`Subject: ${[event.subject_type,event.subject_id].filter(Boolean).join(' / ')}`:''
    ].filter(Boolean);
    const details=detailPairs(event.details);

    return `<article class="audit-event">
      <div class="audit-event-time">${esc(formatTime(event.occurred_at))}</div>
      <div class="audit-event-main">
        <div class="audit-event-topline">
          <strong>${esc(humanize(event.event_type))}</strong>
          <span class="audit-category">${esc(event.category)}</span>
        </div>
        <div class="audit-event-actor">${esc(actor)}${actorMeta?` <span>• ${esc(actorMeta)}</span>`:''}</div>
        ${context.length?`<div class="audit-event-context">${context.map(esc).join(' • ')}</div>`:''}
        ${details.length?`<details class="audit-details"><summary>View technical details</summary><div class="audit-details-grid">${details.map(([k,v])=>`<div><span>${esc(humanize(k))}</span><strong>${esc(typeof v==='object'?JSON.stringify(v):v)}</strong></div>`).join('')}</div></details>`:''}
      </div>
      <div class="audit-event-id">${esc(event.id)}</div>
    </article>`;
  }

  async function load(){
    list.innerHTML='<div class="empty-queue">Loading audit events…</div>';
    try{
      const response=await fetch(`/api/staff/audit/events?${buildQuery()}`,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load audit events.');

      const events=data.events||[];
      count.textContent=`${events.length} event${events.length===1?'':'s'}`;
      list.innerHTML=events.length?events.map(renderEvent).join(''):'<div class="empty-queue">No audit events match these filters.</div>';

      const current=categorySelect.value;
      categorySelect.innerHTML='<option value="">All categories</option>'+((data.categories||[]).map(c=>`<option value="${esc(c.category)}">${esc(c.category)} (${Number(c.count)||0})</option>`).join(''));
      categorySelect.value=current;
      summary.innerHTML=(data.categories||[]).slice(0,8).map(c=>`<span class="audit-summary-chip">${esc(c.category)} <strong>${Number(c.count)||0}</strong></span>`).join('');
    }catch(error){
      count.textContent='Unavailable';
      list.innerHTML=`<div class="empty-queue">${esc(error?.message||'Unable to load audit events.')}</div>`;
    }
  }

  function scheduleLoad(){
    clearTimeout(filterTimer);
    filterTimer=setTimeout(load,250);
  }

  ['auditSearch','auditActor','auditAction'].forEach(id=>document.getElementById(id).addEventListener('input',scheduleLoad));
  ['auditCategory','auditFrom','auditTo'].forEach(id=>document.getElementById(id).addEventListener('change',load));
  document.getElementById('auditRefresh').addEventListener('click',load);

  load();
})();
