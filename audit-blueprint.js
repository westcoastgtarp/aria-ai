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
    <div class="section-head action-head">
      <div>
        <div class="eyebrow">FOUNDER-ONLY AUDIT</div>
        <h2>Company Audit Log</h2>
        <p>Live D1-backed accountability history for staff actions, access changes, hiring, HR, tickets, and future physical/device security events.</p>
      </div>
      <button class="secondary" id="auditRefresh" type="button">Refresh</button>
    </div>
    <div class="security-alert"><strong>Access rule:</strong> full audit history is restricted to Founder access. This page reads real audit events from D1; demo records are no longer used.</div>
    <article class="panel" style="margin-bottom:18px">
      <div class="panel-head"><div><div class="eyebrow">FILTERS</div><h2>Find audit activity</h2></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px">
        <input id="auditSearch" type="search" placeholder="Search ID, user, ticket, device…" />
        <select id="auditCategory"><option value="">All categories</option></select>
        <input id="auditActor" type="search" placeholder="Employee / email" />
        <input id="auditAction" type="search" placeholder="Action" />
        <input id="auditFrom" type="date" aria-label="Audit start date" />
        <input id="auditTo" type="date" aria-label="Audit end date" />
      </div>
    </article>
    <div class="queue-summary" id="auditCategorySummary"></div>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">EVENT HISTORY</div><h2>Recorded activity</h2></div><span id="auditCount" class="pill pending">0 events</span></div>
      <div id="auditLogList"><div class="empty-queue">Loading audit events…</div></div>
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
    const actor=event.actor_name||event.actor_email||event.actor_user_id||'System / unauthenticated event';
    const actorMeta=[event.actor_department,event.actor_role].filter(Boolean).join(' • ');
    const context=[
      event.room_or_zone?`Zone: ${event.room_or_zone}`:'',
      event.asset_id?`Asset: ${event.asset_id}`:'',
      event.badge_id?`Badge: ${event.badge_id}`:'',
      event.related_ticket_id?`Ticket: ${event.related_ticket_id}`:'',
      event.subject_type||event.subject_id?`Subject: ${[event.subject_type,event.subject_id].filter(Boolean).join(' / ')}`:''
    ].filter(Boolean);
    const details=detailPairs(event.details);
    return `<div style="padding:15px 0;border-top:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><strong>${esc(event.id)} • ${esc(event.category)}</strong><div style="font-size:13px;margin-top:5px">${esc(humanize(event.event_type))}</div></div>
        <span style="font-size:11px;color:var(--muted)">${esc(formatTime(event.occurred_at))}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:7px">Actor: ${esc(actor)}${actorMeta?` • ${esc(actorMeta)}`:''}</div>
      ${context.length?`<div style="font-size:11px;color:var(--muted);margin-top:4px">${context.map(esc).join(' • ')}</div>`:''}
      ${details.length?`<div style="margin-top:9px;padding:10px 11px;border-radius:10px;background:#f8f9ff;font-size:11px;line-height:1.6">${details.map(([k,v])=>`<div><strong>${esc(humanize(k))}:</strong> ${esc(typeof v==='object'?JSON.stringify(v):v)}</div>`).join('')}</div>`:''}
    </div>`;
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
      summary.innerHTML=(data.categories||[]).slice(0,8).map(c=>`<span class="summary-chip">${esc(c.category)} <strong>${Number(c.count)||0}</strong></span>`).join('');
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
