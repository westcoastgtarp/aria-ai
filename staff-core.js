const initialCandidates=[
  {id:'cand-1001',name:'Jordan Lee',status:'Hired',department:null,role:null,onboardingStatus:'Not started'},
  {id:'cand-1002',name:'Taylor Morgan',status:'Hired',department:null,role:null,onboardingStatus:'Not started'}
];

const initialEmployees=[
  {id:'emp-2001',name:'Alex Rivera',email:'alex.rivera@aria.demo',department:'Operations',role:'Customer Support Specialist',status:'Active'},
  {id:'emp-2002',name:'Morgan Chen',email:'morgan.chen@aria.demo',department:'Operations',role:'Sales Specialist',status:'Active'},
  {id:'emp-2003',name:'Casey Brooks',email:'casey.brooks@aria.demo',department:'HR',role:'HR Coordinator',status:'Active'},
  {id:'emp-2004',name:'Sam Patel',email:'sam.patel@aria.demo',department:'IT',role:'IT Technician',status:'Active'},
  {id:'emp-2005',name:'Riley Kim',email:'riley.kim@aria.demo',department:'Engineering',role:'Systems Engineer',status:'Active'}
];

const initialTickets=[
  {id:'OPS-1001',department:'Operations',category:'Customer Service',priority:'Normal',title:'Review member billing question',details:'Follow up on a demo member billing inquiry and document the resolution.',status:'Open',progress:0,created:'Demo'},
  {id:'IT-1001',department:'IT',category:'Aria AI',priority:'High',title:'Review chatbot service health',details:'Validate demo service-health indicators and document any issue found.',status:'Open',progress:0,created:'Demo'},
  {id:'ENG-1001',department:'Engineering',category:'Infrastructure',priority:'Normal',title:'Verify backup workflow',details:'Review the prototype backup and recovery workflow.',status:'In Progress',progress:50,created:'Demo'}
];

const initialHrCases=[];
const initialFinanceLedger=[
  {id:'TXN-24081',member:'Demo Member 1042',plan:'Aria Lifeline',amount:4.99,status:'Paid',date:'Aug 19, 2026'},
  {id:'TXN-24080',member:'Demo Member 1039',plan:'Aria Lifeline',amount:4.99,status:'Paid',date:'Aug 19, 2026'},
  {id:'TXN-24079',member:'Demo Member 1034',plan:'Aria Lifeline',amount:4.99,status:'Failed',date:'Aug 18, 2026'},
  {id:'TXN-24078',member:'Demo Member 1028',plan:'Aria Lifeline',amount:4.99,status:'Refunded',date:'Aug 18, 2026'},
  {id:'TXN-24077',member:'Demo Member 1016',plan:'Aria Lifeline',amount:4.99,status:'Disputed',date:'Aug 17, 2026'}
];
const initialFinanceCases=[
  {id:'FIN-1001',type:'Payment Failure',member:'Demo Member 1034',transaction:'TXN-24079',amount:4.99,priority:'Normal',notes:'Review failed weekly Lifeline renewal and confirm account status.',status:'Open',created:'Demo'},
  {id:'FIN-1002',type:'Chargeback / Dispute',member:'Demo Member 1016',transaction:'TXN-24077',amount:4.99,priority:'High',notes:'Synthetic dispute record awaiting review.',status:'In Progress',created:'Demo'}
];
const initialSecurityReviews=[
  {id:'SEC-1001',employeeId:'emp-2004',employeeName:'Sam Patel',department:'IT',type:'Privileged Access Request',priority:'High',reason:'Review temporary elevated access for staff systems maintenance.',status:'Open',created:'Demo'}
];
const syntheticBillingProfile={activeLifelineSubscribers:128,lifelineWeeklyPrice:4.99};

function loadSession(key,fallback){
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');return Array.isArray(saved)?saved:structuredClone(fallback);}catch{return structuredClone(fallback);}
}
function escapeHtml(value=''){return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));}
function nowLabel(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
function currency(value){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);}
function statusClass(status){return String(status).toLowerCase().replaceAll(' ','-').replaceAll('/','-');}
function normalizeTicketProgress(ticket){
  const saved=Number(ticket.progress);
  if(Number.isFinite(saved))return Math.min(100,Math.max(0,saved));
  if(ticket.status==='Closed')return 100;
  if(ticket.status==='In Progress')return 50;
  return 0;
}

let candidates=loadSession('aria-staff-candidates',initialCandidates);
let employees=loadSession('aria-staff-employees',initialEmployees);
let tickets=loadSession('aria-staff-tickets',initialTickets).map(t=>({...t,progress:normalizeTicketProgress(t)}));
let hrCases=loadSession('aria-staff-hr-cases',initialHrCases);
let financeLedger=loadSession('aria-staff-finance-ledger',initialFinanceLedger);
let financeCases=loadSession('aria-staff-finance-cases',initialFinanceCases);
let securityReviews=loadSession('aria-staff-security-reviews',initialSecurityReviews);
let selectedCandidateId=null;
let ticketDepartment=null;

const titleMap={dashboard:'Staff Dashboard',hiring:'Hiring & Department Assignment',operations:'Operations Work Queue',hr:'Human Resources',it:'IT Technical Tickets',engineering:'Engineering Technical Tickets',admin:'System Administration',privacy:'Privacy & Compliance',audit:'Audit Log',billing:'Billing / Finance',security:'Security & Access',policies:'System Policies'};
const ticketCategories={
  Operations:['Customer Service','Sales','Refunds','Audits','Billing Support','Privacy & Compliance','Other Operations'],
  IT:['Aria AI','Aria Lifeline','Staff Systems','Access & Accounts','Software','Integrations','Service Health'],
  Engineering:['Infrastructure','Backups','Recovery','Hardware','Deployment','Member Recovery Tooling']
};

function saveAll(){
  sessionStorage.setItem('aria-staff-candidates',JSON.stringify(candidates));
  sessionStorage.setItem('aria-staff-employees',JSON.stringify(employees));
  sessionStorage.setItem('aria-staff-tickets',JSON.stringify(tickets));
  sessionStorage.setItem('aria-staff-hr-cases',JSON.stringify(hrCases));
  sessionStorage.setItem('aria-staff-finance-ledger',JSON.stringify(financeLedger));
  sessionStorage.setItem('aria-staff-finance-cases',JSON.stringify(financeCases));
  sessionStorage.setItem('aria-staff-security-reviews',JSON.stringify(securityReviews));
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.getElementById(`${page}-page`)?.classList.add('active');
  const title=document.getElementById('pageTitle');if(title)title.textContent=titleMap[page]||'Aria AI Staff';
  if(page==='billing')renderBilling();
  if(page==='security')renderSecurity();
}
document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
function openModal(id){document.getElementById(id)?.classList.remove('hidden');}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}
document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.closeModal)));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal(backdrop.id);}));

function updateDashboardCounts(){
  document.getElementById('pendingCount')&&(document.getElementById('pendingCount').textContent=String(candidates.filter(c=>c.status!=='Account activated').length));
  document.getElementById('openTicketCount')&&(document.getElementById('openTicketCount').textContent=String(tickets.filter(t=>t.status!=='Closed').length));
  document.getElementById('openHrCount')&&(document.getElementById('openHrCount').textContent=String(hrCases.filter(c=>c.status!=='Closed').length));
  document.getElementById('activeEmployeeCount')&&(document.getElementById('activeEmployeeCount').textContent=String(employees.filter(e=>e.status==='Active').length));
}

function renderCandidates(){
  const list=document.getElementById('candidateList');if(!list)return;
  list.innerHTML=candidates.map(c=>`<article class="candidate-card"><div class="candidate-meta"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.status)}${c.department?` • ${escapeHtml(c.department)} • ${escapeHtml(c.role||'Role pending')}`:' • Department not assigned'} • Onboarding: ${escapeHtml(c.onboardingStatus||'Not started')}</span></div><div class="candidate-actions"><span class="pill ${c.department?'assigned':''}">${c.department?'Department assigned':'Pending assignment'}</span><button class="primary assign-btn" data-id="${escapeHtml(c.id)}">${c.department?'Edit Assignment':'Assign Department'}</button><a class="secondary button-link" href="onboarding.html?candidate=${encodeURIComponent(c.id)}">Onboarding</a></div></article>`).join('');
  document.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',()=>openAssignment(btn.dataset.id)));updateDashboardCounts();
}
function openAssignment(id){
  const c=candidates.find(x=>x.id===id);if(!c)return;selectedCandidateId=id;
  document.getElementById('candidateName').textContent=`Assign ${c.name}`;
  document.getElementById('departmentSelect').value=c.department||'Operations';
  document.getElementById('roleInput').value=c.role&&c.role!=='Role pending'?c.role:'';openModal('assignModal');
}
document.getElementById('saveAssignment')?.addEventListener('click',()=>{
  const c=candidates.find(x=>x.id===selectedCandidateId);if(!c)return;
  c.department=document.getElementById('departmentSelect').value;c.role=document.getElementById('roleInput').value.trim()||'Role pending';
  c.status=c.onboardingStatus==='Submitted'?'Ready for role & permissions':'Department assigned — onboarding pending';saveAll();renderCandidates();closeModal('assignModal');selectedCandidateId=null;
});

function createTicketId(dept){const prefix={Operations:'OPS',IT:'IT',Engineering:'ENG'}[dept]||'TKT';return `${prefix}-${1000+tickets.filter(t=>t.department===dept).length+1}`;}
function progressControl(ticket){
  const progress=normalizeTicketProgress(ticket);
  return `<div style="margin-top:14px;max-width:520px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px"><span style="font-size:11px;font-weight:800;color:#657185">Progress</span><strong style="font-size:12px;color:#4d5a70">${progress}%</strong></div>
    <div style="height:8px;background:#eef1f5;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${progress}%;background:linear-gradient(90deg,#6269e5,#895fd8);border-radius:999px"></span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${[0,25,50,75,100].map(value=>`<button class="status-btn ticket-progress" data-id="${escapeHtml(ticket.id)}" data-progress="${value}" ${progress===value?'disabled style="opacity:.55;cursor:default"':''}>${value}%</button>`).join('')}
    </div>
  </div>`;
}
function renderTicketQueue(dept,elementId,summaryId){
  const queue=document.getElementById(elementId),summary=document.getElementById(summaryId);if(!queue||!summary)return;
  const items=tickets.filter(t=>t.department===dept),open=items.filter(t=>t.status==='Open').length,progress=items.filter(t=>t.status==='In Progress').length,closed=items.filter(t=>t.status==='Closed').length;
  const average=items.length?Math.round(items.reduce((sum,t)=>sum+normalizeTicketProgress(t),0)/items.length):0;
  summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span><span class="summary-chip">Queue progress <strong>${average}%</strong></span>`;
  queue.innerHTML=items.length?items.map(t=>`<article class="ticket-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(t.id)} • ${escapeHtml(t.category)} • ${escapeHtml(t.created)}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.details)}</p><div class="ticket-meta"><span class="pill ${String(t.priority).toLowerCase()}">${escapeHtml(t.priority)}</span><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span></div>${progressControl(t)}</div><div class="ticket-actions">${t.status!=='In Progress'&&t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="In Progress">Start</button>`:''}${t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Closed">Close</button>`:''}${t.status==='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Open">Reopen</button>`:''}</div></article>`).join(''):'<div class="empty-queue">No tickets in this queue.</div>';
}
function renderTickets(){
  renderTicketQueue('Operations','operationsQueue','operationsSummary');renderTicketQueue('IT','itQueue','itSummary');renderTicketQueue('Engineering','engineeringQueue','engineeringSummary');
  document.querySelectorAll('.ticket-status').forEach(btn=>btn.addEventListener('click',()=>{
    const t=tickets.find(x=>x.id===btn.dataset.id);if(!t)return;
    t.status=btn.dataset.status;
    if(t.status==='Closed')t.progress=100;
    else if(t.status==='In Progress'&&normalizeTicketProgress(t)===0)t.progress=25;
    else if(t.status==='Open'&&normalizeTicketProgress(t)===100)t.progress=0;
    saveAll();renderTickets();updateDashboardCounts();
  }));
  document.querySelectorAll('.ticket-progress').forEach(btn=>btn.addEventListener('click',()=>{
    const t=tickets.find(x=>x.id===btn.dataset.id);if(!t)return;
    const progress=Number(btn.dataset.progress);
    t.progress=progress;
    if(progress>=100)t.status='Closed';
    else if(progress>0)t.status='In Progress';
    else t.status='Open';
    saveAll();renderTickets();updateDashboardCounts();
  }));
}
function openTicketCreator(dept){ticketDepartment=dept;document.getElementById('ticketModalTitle').textContent=`Create ${dept} ticket`;document.getElementById('ticketCategory').innerHTML=ticketCategories[dept].map(c=>`<option>${escapeHtml(c)}</option>`).join('');document.getElementById('ticketPriority').value='Normal';document.getElementById('ticketTitle').value='';document.getElementById('ticketDetails').value='';openModal('ticketModal');}
document.getElementById('addOperationsTicket')?.addEventListener('click',()=>openTicketCreator('Operations'));
document.querySelectorAll('[data-ticket-create]').forEach(btn=>btn.addEventListener('click',()=>openTicketCreator(btn.dataset.ticketCreate)));
document.getElementById('saveTicket')?.addEventListener('click',()=>{if(!ticketDepartment)return;const title=document.getElementById('ticketTitle').value.trim(),details=document.getElementById('ticketDetails').value.trim();if(!title||!details){alert('Please enter a title and details.');return;}tickets.unshift({id:createTicketId(ticketDepartment),department:ticketDepartment,category:document.getElementById('ticketCategory').value,priority:document.getElementById('ticketPriority').value,title,details,status:'Open',progress:0,created:nowLabel()});saveAll();renderTickets();updateDashboardCounts();closeModal('ticketModal');});

function employeeOptions(selectId){
  const select=document.getElementById(selectId);if(!select)return;
  const depts=['Operations','HR','IT','Engineering'];
  select.innerHTML=depts.map(dept=>{const group=employees.filter(e=>e.department===dept);return group.length?`<optgroup label="${dept}">${group.map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} — ${escapeHtml(e.role)}</option>`).join('')}</optgroup>`:'';}).join('');
}
function buildEmployeeOptions(){employeeOptions('hrEmployee');}
document.getElementById('addHrCase')?.addEventListener('click',()=>{buildEmployeeOptions();openModal('hrModal');});
function renderHrCases(){
  const queue=document.getElementById('hrQueue'),summary=document.getElementById('hrSummary');if(!queue||!summary)return;
  const open=hrCases.filter(c=>c.status==='Open').length,closed=hrCases.filter(c=>c.status==='Closed').length;summary.innerHTML=`<span class="summary-chip">Open cases <strong>${open}</strong></span><span class="summary-chip">Closed cases <strong>${closed}</strong></span>`;
  queue.innerHTML=hrCases.length?hrCases.map(c=>`<article class="ticket-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(c.id)} • ${escapeHtml(c.employeeDepartment)} • ${escapeHtml(c.created)}</div><h3>${escapeHtml(c.actionType)} — ${escapeHtml(c.employeeName)}</h3><p><strong>${escapeHtml(c.reason)}</strong><br>${escapeHtml(c.notes)}</p><div class="ticket-meta"><span class="pill ${statusClass(c.status)}">${escapeHtml(c.status)}</span></div></div><div class="ticket-actions"><button class="status-btn hr-status" data-id="${escapeHtml(c.id)}" data-status="${c.status==='Open'?'Closed':'Open'}">${c.status==='Open'?'Close Case':'Reopen'}</button></div></article>`).join(''):'<div class="empty-queue">No disciplinary-action cases have been created.</div>';
  document.querySelectorAll('.hr-status').forEach(btn=>btn.addEventListener('click',()=>{const c=hrCases.find(x=>x.id===btn.dataset.id);if(!c)return;c.status=btn.dataset.status;saveAll();renderHrCases();updateDashboardCounts();}));
}
document.getElementById('saveHrCase')?.addEventListener('click',()=>{const employee=employees.find(e=>e.id===document.getElementById('hrEmployee').value),reason=document.getElementById('hrReason').value.trim(),notes=document.getElementById('hrNotes').value.trim();if(!employee||!reason){alert('Select an employee and enter a reason.');return;}hrCases.unshift({id:`HR-${1000+hrCases.length+1}`,employeeId:employee.id,employeeName:employee.name,employeeDepartment:employee.department,actionType:document.getElementById('hrActionType').value,reason,notes:notes||'No additional notes entered.',status:'Open',created:nowLabel()});document.getElementById('hrReason').value='';document.getElementById('hrNotes').value='';saveAll();renderHrCases();updateDashboardCounts();closeModal('hrModal');});

function renderEmployees(){
  const roster=document.getElementById('employeeRoster');if(!roster)return;
  roster.innerHTML=employees.length?employees.map(e=>`<article class="employee-card"><strong>${escapeHtml(e.name)}</strong><span>${escapeHtml(e.email)}</span><span>${escapeHtml(e.department)} • ${escapeHtml(e.role)}</span><div class="ticket-meta"><span class="pill ${statusClass(e.status)}">${escapeHtml(e.status)}</span></div></article>`).join(''):'<div class="empty-queue">No employees have been added.</div>';updateDashboardCounts();
}
document.getElementById('addEmployee')?.addEventListener('click',()=>openModal('employeeModal'));
document.getElementById('saveEmployee')?.addEventListener('click',()=>{const name=document.getElementById('employeeName').value.trim(),email=document.getElementById('employeeEmail').value.trim(),role=document.getElementById('employeeRole').value.trim();if(!name||!email||!role){alert('Name, work email, and role are required.');return;}employees.unshift({id:`emp-${Date.now()}`,name,email,department:document.getElementById('employeeDepartment').value,role,status:document.getElementById('employeeStatus').value});['employeeName','employeeEmail','employeeRole'].forEach(id=>document.getElementById(id).value='');saveAll();renderEmployees();buildEmployeeOptions();renderSecurity();closeModal('employeeModal');});

function renderFinanceMetrics(){const active=syntheticBillingProfile.activeLifelineSubscribers,weekly=active*syntheticBillingProfile.lifelineWeeklyPrice,pending=financeCases.filter(c=>c.status!=='Closed').length;document.getElementById('billingActiveSubscribers')&&(document.getElementById('billingActiveSubscribers').textContent=String(active));document.getElementById('billingWeeklyRevenue')&&(document.getElementById('billingWeeklyRevenue').textContent=currency(weekly));document.getElementById('billingPendingCases')&&(document.getElementById('billingPendingCases').textContent=String(pending));}
function renderFinanceLedger(){const body=document.getElementById('financeLedger');if(!body)return;const search=(document.getElementById('financeSearch')?.value||'').trim().toLowerCase(),status=document.getElementById('financeStatusFilter')?.value||'All',filtered=financeLedger.filter(i=>(!search||[i.id,i.member,i.plan,i.status].some(v=>String(v).toLowerCase().includes(search)))&&(status==='All'||i.status===status));body.innerHTML=filtered.length?filtered.map(i=>`<tr><td><strong>${escapeHtml(i.id)}</strong></td><td>${escapeHtml(i.member)}</td><td>${escapeHtml(i.plan)}</td><td>${currency(i.amount)}</td><td><span class="pill finance-${statusClass(i.status)}">${escapeHtml(i.status)}</span></td><td>${escapeHtml(i.date)}</td></tr>`).join(''):'<tr><td colspan="6" class="finance-empty">No matching finance records.</td></tr>';}
function renderFinanceCases(){
  const queue=document.getElementById('financeCaseQueue'),summary=document.getElementById('financeCaseSummary');if(!queue||!summary)return;const open=financeCases.filter(c=>c.status==='Open').length,progress=financeCases.filter(c=>c.status==='In Progress').length,closed=financeCases.filter(c=>c.status==='Closed').length;summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span>`;queue.innerHTML=financeCases.length?financeCases.map(c=>`<article class="ticket-card finance-case-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(c.id)} • ${escapeHtml(c.type)} • ${escapeHtml(c.created)}</div><h3>${escapeHtml(c.member)}${c.transaction?` — ${escapeHtml(c.transaction)}`:''}</h3><p>${escapeHtml(c.notes)}</p><div class="ticket-meta"><span class="pill ${String(c.priority).toLowerCase()}">${escapeHtml(c.priority)}</span><span class="pill ${statusClass(c.status)}">${escapeHtml(c.status)}</span>${Number(c.amount)>0?`<span class="pill amount-pill">${currency(c.amount)}</span>`:''}</div></div><div class="ticket-actions">${c.status==='Open'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="In Progress">Start Review</button>`:''}${c.status!=='Closed'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="Closed">Resolve</button>`:''}${c.status==='Closed'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="Open">Reopen</button>`:''}</div></article>`).join(''):'<div class="empty-queue">No finance cases have been created.</div>';document.querySelectorAll('.finance-case-status').forEach(btn=>btn.addEventListener('click',()=>{const c=financeCases.find(x=>x.id===btn.dataset.id);if(!c)return;c.status=btn.dataset.status;saveAll();renderBilling();}));
}
function renderBilling(){renderFinanceMetrics();renderFinanceLedger();renderFinanceCases();}
document.getElementById('financeSearch')?.addEventListener('input',renderFinanceLedger);document.getElementById('financeStatusFilter')?.addEventListener('change',renderFinanceLedger);
document.getElementById('addFinanceCase')?.addEventListener('click',()=>{['financeMemberRef','financeTransactionRef','financeAmount','financeNotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('financePriority').value='Normal';openModal('financeModal');});
document.getElementById('saveFinanceCase')?.addEventListener('click',()=>{const type=document.getElementById('financeCaseType').value,member=document.getElementById('financeMemberRef').value.trim(),transaction=document.getElementById('financeTransactionRef').value.trim(),amount=Number(document.getElementById('financeAmount').value||0),priority=document.getElementById('financePriority').value,notes=document.getElementById('financeNotes').value.trim();if(!member||!notes){alert('Member/account reference and notes are required.');return;}financeCases.unshift({id:`FIN-${1000+financeCases.length+1}`,type,member,transaction,amount:Number.isFinite(amount)?amount:0,priority,notes,status:'Open',created:nowLabel()});saveAll();renderBilling();closeModal('financeModal');});

function renderSecurityMetrics(){
  const active=employees.filter(e=>e.status==='Active').length,pending=employees.filter(e=>e.status==='Pending activation').length,suspended=employees.filter(e=>e.status==='Suspended').length,reviews=securityReviews.filter(r=>r.status!=='Closed').length;
  document.getElementById('securityActiveCount')&&(document.getElementById('securityActiveCount').textContent=String(active));
  document.getElementById('securityPendingCount')&&(document.getElementById('securityPendingCount').textContent=String(pending));
  document.getElementById('securitySuspendedCount')&&(document.getElementById('securitySuspendedCount').textContent=String(suspended));
  document.getElementById('securityReviewCount')&&(document.getElementById('securityReviewCount').textContent=String(reviews));
}
function renderSecurityEmployees(){
  const body=document.getElementById('securityEmployeeTable');if(!body)return;
  const search=(document.getElementById('securityEmployeeSearch')?.value||'').trim().toLowerCase();
  const filtered=employees.filter(e=>!search||[e.name,e.email,e.department,e.role,e.status].some(v=>String(v).toLowerCase().includes(search)));
  body.innerHTML=filtered.length?filtered.map(e=>`<tr><td><strong>${escapeHtml(e.name)}</strong><span class="table-subtext">${escapeHtml(e.email)}</span></td><td>${escapeHtml(e.department)}</td><td>${escapeHtml(e.role)}</td><td><span class="pill ${statusClass(e.status)}">${escapeHtml(e.status)}</span></td><td><div class="access-actions">${e.status!=='Active'?`<button class="status-btn employee-access" data-id="${escapeHtml(e.id)}" data-status="Active">Activate</button>`:''}${e.status!=='Suspended'?`<button class="status-btn employee-access danger-action" data-id="${escapeHtml(e.id)}" data-status="Suspended">Suspend</button>`:''}${e.status!=='Pending activation'?`<button class="status-btn employee-access" data-id="${escapeHtml(e.id)}" data-status="Pending activation">Set Pending</button>`:''}<button class="status-btn open-review" data-id="${escapeHtml(e.id)}">Review</button></div></td></tr>`).join(''):'<tr><td colspan="5" class="finance-empty">No matching employees.</td></tr>';
  document.querySelectorAll('.employee-access').forEach(btn=>btn.addEventListener('click',()=>{const e=employees.find(x=>x.id===btn.dataset.id);if(!e)return;e.status=btn.dataset.status;saveAll();renderEmployees();renderSecurity();}));
  document.querySelectorAll('.open-review').forEach(btn=>btn.addEventListener('click',()=>openAccessReview(btn.dataset.id)));
}
function renderSecurityReviews(){
  const queue=document.getElementById('securityReviewQueue'),summary=document.getElementById('securityReviewSummary');if(!queue||!summary)return;
  const open=securityReviews.filter(r=>r.status==='Open').length,progress=securityReviews.filter(r=>r.status==='In Progress').length,closed=securityReviews.filter(r=>r.status==='Closed').length;
  summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span>`;
  queue.innerHTML=securityReviews.length?securityReviews.map(r=>`<article class="ticket-card security-review-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(r.id)} • ${escapeHtml(r.type)} • ${escapeHtml(r.created)}</div><h3>${escapeHtml(r.employeeName)} — ${escapeHtml(r.department)}</h3><p>${escapeHtml(r.reason)}</p><div class="ticket-meta"><span class="pill ${String(r.priority).toLowerCase()}">${escapeHtml(r.priority)}</span><span class="pill ${statusClass(r.status)}">${escapeHtml(r.status)}</span></div></div><div class="ticket-actions">${r.status==='Open'?`<button class="status-btn security-review-status" data-id="${escapeHtml(r.id)}" data-status="In Progress">Start Review</button>`:''}${r.status!=='Closed'?`<button class="status-btn security-review-status" data-id="${escapeHtml(r.id)}" data-status="Closed">Close Review</button>`:''}${r.status==='Closed'?`<button class="status-btn security-review-status" data-id="${escapeHtml(r.id)}" data-status="Open">Reopen</button>`:''}</div></article>`).join(''):'<div class="empty-queue">No access reviews have been created.</div>';
  document.querySelectorAll('.security-review-status').forEach(btn=>btn.addEventListener('click',()=>{const r=securityReviews.find(x=>x.id===btn.dataset.id);if(!r)return;r.status=btn.dataset.status;saveAll();renderSecurity();}));
}
function openAccessReview(employeeId=''){
  employeeOptions('accessReviewEmployee');
  if(employeeId&&document.getElementById('accessReviewEmployee'))document.getElementById('accessReviewEmployee').value=employeeId;
  document.getElementById('accessReviewType').value='Role Access Review';document.getElementById('accessReviewPriority').value='Normal';document.getElementById('accessReviewReason').value='';openModal('accessReviewModal');
}
function renderSecurity(){renderSecurityMetrics();renderSecurityEmployees();renderSecurityReviews();}
document.getElementById('securityEmployeeSearch')?.addEventListener('input',renderSecurityEmployees);
document.getElementById('addAccessReview')?.addEventListener('click',()=>openAccessReview());
document.getElementById('saveAccessReview')?.addEventListener('click',()=>{const employee=employees.find(e=>e.id===document.getElementById('accessReviewEmployee').value),type=document.getElementById('accessReviewType').value,priority=document.getElementById('accessReviewPriority').value,reason=document.getElementById('accessReviewReason').value.trim();if(!employee||!reason){alert('Select an employee and enter a reason for the review.');return;}securityReviews.unshift({id:`SEC-${1000+securityReviews.length+1}`,employeeId:employee.id,employeeName:employee.name,department:employee.department,type,priority,reason,status:'Open',created:nowLabel()});saveAll();renderSecurity();closeModal('accessReviewModal');});

renderCandidates();renderTickets();renderHrCases();renderEmployees();buildEmployeeOptions();renderBilling();renderSecurity();updateDashboardCounts();showPage('dashboard');