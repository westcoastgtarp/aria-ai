(function(){
  const access=window.AriaStaffAccess;
  const auditPage=document.getElementById('audit-page');
  if(!auditPage)return;

  const AUDIT_KEY='aria-infrastructure-audit-log';
  const ESCALATION_KEY='aria-hr-audit-escalations';

  const seed=[
    {id:'AUD-1001',category:'Physical Access',asset:'Server Room 1',action:'Badge entry',employee:'Sam Patel',badge:'BADGE-IT-204',ticket:'IT-1842',time:'Demo • 10:42 AM',notes:'Authorized entry recorded.'},
    {id:'AUD-1002',category:'Switch / Network Equipment',asset:'SW-CORE-01',action:'Port 24 cable reseated',employee:'Sam Patel',badge:'BADGE-IT-204',ticket:'IT-1842',time:'Demo • 10:48 AM',notes:'Connectivity restored after reseat.'},
    {id:'AUD-1003',category:'Rack Activity',asset:'Rack A3',action:'Rack opened for inspection',employee:'Riley Kim',badge:'BADGE-ENG-118',ticket:'ENG-1904',time:'Demo • 2:16 PM',notes:'Inspection only; no component replacement.'}
  ];

  function load(key,fallback=[]){try{const v=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(v))return v;}catch{}localStorage.setItem(key,JSON.stringify(fallback));return structuredClone(fallback);}
  function save(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function esc(v=''){return String(v).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));}
  function now(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
  function founderName(){try{const s=JSON.parse(sessionStorage.getItem('aria-auth-session')||'null');return s?.name||'Founder / Co-Founder';}catch{return 'Founder / Co-Founder';}}

  if(!access?.canAccessAuditLogs?.()){
    auditPage.innerHTML='<article class="panel"><h2>Audit Log</h2><p>This area is restricted to Founder / Co-Founder access.</p></article>';
    return;
  }

  auditPage.innerHTML=`
    <div class="section-head action-head">
      <div><div class="eyebrow">FOUNDER-ONLY AUDIT</div><h2>Infrastructure & Physical Access Audit Log</h2><p>Central accountability record for server-room badge activity and changes involving racks, switches, cabling, UPS/power, and server hardware.</p></div>
      <button class="primary" id="newAuditEscalation">Escalate to HR</button>
    </div>
    <div class="security-alert"><strong>Access rule:</strong> full audit history is Founder / Co-Founder only. HR receives only the specific records a Founder attaches to an escalation case.</div>
    <div class="queue-summary" id="auditCategorySummary"></div>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">EVENT HISTORY</div><h2>Recorded activity</h2></div></div>
      <div id="auditLogList"></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">HR ESCALATIONS</div><h2>Founder-approved escalations</h2></div></div>
      <p>Escalations expose only the selected audit records to the assigned HR representative for personnel review.</p>
      <div id="auditEscalationList"></div>
    </article>
    <div class="modal-backdrop hidden" id="auditEscalationModal"><div class="modal"><button class="close" id="closeAuditEscalation">×</button><div class="eyebrow">FOUNDER ESCALATION</div><h2>Send specific records to HR</h2><label>HR representative<input id="auditHrMember" maxlength="80" placeholder="Example: HR Coordinator" /></label><label>Reason<textarea id="auditEscalationReason" maxlength="500" placeholder="Why does HR need this record set?"></textarea></label><label>Audit record IDs<input id="auditRecordIds" maxlength="180" placeholder="Example: AUD-1001, AUD-1002" /></label><div class="modal-actions"><button class="primary" id="saveAuditEscalation">Create Escalation</button><button class="secondary" id="cancelAuditEscalation">Cancel</button></div></div></div>`;

  function render(){
    const logs=load(AUDIT_KEY,seed);
    const counts={};logs.forEach(l=>counts[l.category]=(counts[l.category]||0)+1);
    document.getElementById('auditCategorySummary').innerHTML=Object.entries(counts).map(([k,v])=>`<span class="summary-chip">${esc(k)} <strong>${v}</strong></span>`).join('');
    document.getElementById('auditLogList').innerHTML=logs.map(l=>`<div style="padding:14px 0;border-top:1px solid #e8edf3"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>${esc(l.id)} • ${esc(l.category)}</strong><span style="font-size:11px;color:#7e8999">${esc(l.time)}</span></div><div style="margin-top:6px;font-size:13px"><strong>${esc(l.asset)}</strong> — ${esc(l.action)}</div><div style="font-size:11px;color:#6b778a;margin-top:5px">Employee: ${esc(l.employee)} • Badge: ${esc(l.badge)} • Ticket: ${esc(l.ticket)}</div><div style="font-size:11px;color:#7e8999;margin-top:4px">${esc(l.notes)}</div></div>`).join('');
    const escalations=load(ESCALATION_KEY,[]);
    document.getElementById('auditEscalationList').innerHTML=escalations.length?escalations.map(e=>`<div style="padding:14px 0;border-top:1px solid #e8edf3"><strong>${esc(e.id)} • ${esc(e.hrMember)}</strong><div style="font-size:11px;color:#6b778a;margin-top:5px">Records: ${esc(e.recordIds.join(', '))}</div><div style="font-size:12px;margin-top:5px">${esc(e.reason)}</div><div style="font-size:10px;color:#8a95a5;margin-top:5px">Approved by ${esc(e.approvedBy)} • ${esc(e.createdAt)}</div></div>`).join(''):'<div class="empty-queue">No HR escalations have been created.</div>';
  }

  const modal=document.getElementById('auditEscalationModal');
  const open=()=>modal.classList.remove('hidden');
  const close=()=>modal.classList.add('hidden');
  document.getElementById('newAuditEscalation').addEventListener('click',open);
  document.getElementById('closeAuditEscalation').addEventListener('click',close);
  document.getElementById('cancelAuditEscalation').addEventListener('click',close);
  document.getElementById('saveAuditEscalation').addEventListener('click',()=>{
    if(!access.canAccessAuditLogs())return;
    const hrMember=document.getElementById('auditHrMember').value.trim();
    const reason=document.getElementById('auditEscalationReason').value.trim();
    const ids=document.getElementById('auditRecordIds').value.split(',').map(v=>v.trim()).filter(Boolean);
    const logs=load(AUDIT_KEY,seed);
    const valid=ids.filter(id=>logs.some(l=>l.id===id));
    if(!hrMember||!reason||!valid.length){alert('Enter an HR representative, a reason, and at least one valid audit record ID.');return;}
    const items=load(ESCALATION_KEY,[]);
    items.unshift({id:`HRESC-${Date.now()}`,hrMember,reason,recordIds:valid,approvedBy:founderName(),createdAt:now(),status:'Open'});
    save(ESCALATION_KEY,items);
    close();render();
  });

  render();
})();
