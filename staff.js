const initialCandidates = [
  { id:'cand-1001', name:'Jordan Lee', status:'Hired', department:null, role:null, onboardingStatus:'Not started' },
  { id:'cand-1002', name:'Taylor Morgan', status:'Hired', department:null, role:null, onboardingStatus:'Not started' }
];

const initialEmployees = [
  {id:'emp-2001',name:'Alex Rivera',email:'alex.rivera@aria.demo',department:'Operations',role:'Customer Support Specialist',status:'Active'},
  {id:'emp-2002',name:'Morgan Chen',email:'morgan.chen@aria.demo',department:'Operations',role:'Sales Specialist',status:'Active'},
  {id:'emp-2003',name:'Casey Brooks',email:'casey.brooks@aria.demo',department:'HR',role:'HR Coordinator',status:'Active'},
  {id:'emp-2004',name:'Sam Patel',email:'sam.patel@aria.demo',department:'IT',role:'IT Technician',status:'Active'},
  {id:'emp-2005',name:'Riley Kim',email:'riley.kim@aria.demo',department:'Engineering',role:'Systems Engineer',status:'Active'}
];

const initialTickets = [
  {id:'OPS-1001',department:'Operations',category:'Customer Service',priority:'Normal',title:'Review member billing question',details:'Follow up on a demo member billing inquiry and document the resolution.',status:'Open',created:'Demo'},
  {id:'IT-1001',department:'IT',category:'Aria AI',priority:'High',title:'Review chatbot service health',details:'Validate demo service-health indicators and document any issue found.',status:'Open',created:'Demo'},
  {id:'ENG-1001',department:'Engineering',category:'Infrastructure',priority:'Normal',title:'Verify backup workflow',details:'Review the prototype backup and recovery workflow.',status:'In Progress',created:'Demo'}
];

const initialHrCases = [];

const initialFinanceLedger = [
  {id:'TXN-24081',member:'Demo Member 1042',plan:'Aria Lifeline',amount:4.99,status:'Paid',date:'Aug 19, 2026'},
  {id:'TXN-24080',member:'Demo Member 1039',plan:'Aria Lifeline',amount:4.99,status:'Paid',date:'Aug 19, 2026'},
  {id:'TXN-24079',member:'Demo Member 1034',plan:'Aria Lifeline',amount:4.99,status:'Failed',date:'Aug 18, 2026'},
  {id:'TXN-24078',member:'Demo Member 1028',plan:'Aria Lifeline',amount:4.99,status:'Refunded',date:'Aug 18, 2026'},
  {id:'TXN-24077',member:'Demo Member 1016',plan:'Aria Lifeline',amount:4.99,status:'Disputed',date:'Aug 17, 2026'}
];

const initialFinanceCases = [
  {id:'FIN-1001',type:'Payment Failure',member:'Demo Member 1034',transaction:'TXN-24079',amount:4.99,priority:'Normal',notes:'Review failed weekly Lifeline renewal and confirm account status.',status:'Open',created:'Demo'},
  {id:'FIN-1002',type:'Chargeback / Dispute',member:'Demo Member 1016',transaction:'TXN-24077',amount:4.99,priority:'High',notes:'Synthetic dispute record awaiting review.',status:'In Progress',created:'Demo'}
];

const syntheticBillingProfile = {
  activeLifelineSubscribers: 128,
  lifelineWeeklyPrice: 4.99
};

let candidates = loadSession('aria-staff-candidates',initialCandidates);
let employees = loadSession('aria-staff-employees',initialEmployees);
let tickets = loadSession('aria-staff-tickets',initialTickets);
let hrCases = loadSession('aria-staff-hr-cases',initialHrCases);
let financeLedger = loadSession('aria-staff-finance-ledger',initialFinanceLedger);
let financeCases = loadSession('aria-staff-finance-cases',initialFinanceCases);
let selectedCandidateId = null;
let ticketDepartment = null;

const titleMap = {
  dashboard:'Staff Dashboard', hiring:'Hiring & Department Assignment', operations:'Operations Work Queue',
  hr:'Human Resources', it:'IT Technical Tickets', engineering:'Engineering Technical Tickets', admin:'System Administration',
  privacy:'Privacy & Compliance', audit:'Audit Log', billing:'Billing / Finance',
  security:'Security & Access', policies:'System Policies'
};

const ticketCategories = {
  Operations:['Customer Service','Sales','Refunds','Audits','Billing Support','Privacy & Compliance','Other Operations'],
  IT:['Aria AI','Aria Lifeline','Staff Systems','Access & Accounts','Software','Integrations','Service Health'],
  Engineering:['Infrastructure','Backups','Recovery','Hardware','Deployment','Member Recovery Tooling']
};

function loadSession(key,fallback){
  try{
    const saved=JSON.parse(sessionStorage.getItem(key)||'null');
    return Array.isArray(saved)?saved:structuredClone(fallback);
  }catch{return structuredClone(fallback);}
}

function saveAll(){
  sessionStorage.setItem('aria-staff-candidates',JSON.stringify(candidates));
  sessionStorage.setItem('aria-staff-employees',JSON.stringify(employees));
  sessionStorage.setItem('aria-staff-tickets',JSON.stringify(tickets));
  sessionStorage.setItem('aria-staff-hr-cases',JSON.stringify(hrCases));
  sessionStorage.setItem('aria-staff-finance-ledger',JSON.stringify(financeLedger));
  sessionStorage.setItem('aria-staff-finance-cases',JSON.stringify(financeCases));
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
}

function nowLabel(){
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());
}

function currency(value){
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.getElementById(`${page}-page`)?.classList.add('active');
  const title=document.getElementById('pageTitle');
  if(title)title.textContent=titleMap[page]||'Aria AI Staff';
  if(page==='billing')renderBilling();
}

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));

function openModal(id){document.getElementById(id)?.classList.remove('hidden');}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}
document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.closeModal)));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal(backdrop.id);}));

function renderCandidates(){
  const list=document.getElementById('candidateList');
  if(!list)return;
  list.innerHTML=candidates.map(c=>`
    <article class="candidate-card">
      <div class="candidate-meta">
        <strong>${escapeHtml(c.name)}</strong>
        <span>${escapeHtml(c.status)}${c.department?` • ${escapeHtml(c.department)} • ${escapeHtml(c.role||'Role pending')}`:' • Department not assigned'} • Onboarding: ${escapeHtml(c.onboardingStatus||'Not started')}</span>
      </div>
      <div class="candidate-actions">
        <span class="pill ${c.department?'assigned':''}">${c.department?'Department assigned':'Pending assignment'}</span>
        <button class="primary assign-btn" data-id="${escapeHtml(c.id)}">${c.department?'Edit Assignment':'Assign Department'}</button>
        <a class="secondary button-link" href="onboarding.html?candidate=${encodeURIComponent(c.id)}">Onboarding</a>
      </div>
    </article>`).join('');
  document.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',()=>openAssignment(btn.dataset.id)));
  updateDashboardCounts();
}

function openAssignment(id){
  const candidate=candidates.find(x=>x.id===id);
  if(!candidate)return;
  selectedCandidateId=id;
  document.getElementById('candidateName').textContent=`Assign ${candidate.name}`;
  document.getElementById('departmentSelect').value=candidate.department||'Operations';
  document.getElementById('roleInput').value=candidate.role&&candidate.role!=='Role pending'?candidate.role:'';
  openModal('assignModal');
}

document.getElementById('saveAssignment')?.addEventListener('click',()=>{
  const candidate=candidates.find(x=>x.id===selectedCandidateId);
  if(!candidate)return;
  const department=document.getElementById('departmentSelect').value;
  const role=document.getElementById('roleInput').value.trim();
  candidate.department=department;
  candidate.role=role||'Role pending';
  candidate.status=candidate.onboardingStatus==='Submitted'?'Ready for role & permissions':'Department assigned — onboarding pending';
  saveAll();renderCandidates();closeModal('assignModal');selectedCandidateId=null;
});

function createTicketId(department){
  const prefix={Operations:'OPS',IT:'IT',Engineering:'ENG'}[department]||'TKT';
  const n=1000+tickets.filter(t=>t.department===department).length+1;
  return `${prefix}-${n}`;
}

function ticketStatusClass(status){return String(status).toLowerCase().replaceAll(' ','-').replaceAll('/','-');}

function renderTicketQueue(department,elementId,summaryId){
  const queue=document.getElementById(elementId);
  const summary=document.getElementById(summaryId);
  if(!queue||!summary)return;
  const items=tickets.filter(t=>t.department===department);
  const open=items.filter(t=>t.status==='Open').length;
  const progress=items.filter(t=>t.status==='In Progress').length;
  const closed=items.filter(t=>t.status==='Closed').length;
  summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span>`;
  queue.innerHTML=items.length?items.map(t=>`
    <article class="ticket-card">
      <div class="ticket-main">
        <div class="ticket-id">${escapeHtml(t.id)} • ${escapeHtml(t.category)} • ${escapeHtml(t.created)}</div>
        <h3>${escapeHtml(t.title)}</h3>
        <p>${escapeHtml(t.details)}</p>
        <div class="ticket-meta"><span class="pill ${String(t.priority).toLowerCase()}">${escapeHtml(t.priority)}</span><span class="pill ${ticketStatusClass(t.status)}">${escapeHtml(t.status)}</span></div>
      </div>
      <div class="ticket-actions">
        ${t.status!=='In Progress'&&t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="In Progress">Start</button>`:''}
        ${t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Closed">Close</button>`:''}
        ${t.status==='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Open">Reopen</button>`:''}
      </div>
    </article>`).join(''):'<div class="empty-queue">No tickets in this queue.</div>';
}

function renderTickets(){
  renderTicketQueue('Operations','operationsQueue','operationsSummary');
  renderTicketQueue('IT','itQueue','itSummary');
  renderTicketQueue('Engineering','engineeringQueue','engineeringSummary');
  document.querySelectorAll('.ticket-status').forEach(btn=>btn.addEventListener('click',()=>{
    const ticket=tickets.find(t=>t.id===btn.dataset.id);if(!ticket)return;
    ticket.status=btn.dataset.status;saveAll();renderTickets();updateDashboardCounts();
  }));
}

function openTicketCreator(department){
  ticketDepartment=department;
  document.getElementById('ticketModalTitle').textContent=`Create ${department} ticket`;
  const category=document.getElementById('ticketCategory');
  category.innerHTML=ticketCategories[department].map(c=>`<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('ticketPriority').value='Normal';
  document.getElementById('ticketTitle').value='';
  document.getElementById('ticketDetails').value='';
  openModal('ticketModal');
}

document.getElementById('addOperationsTicket')?.addEventListener('click',()=>openTicketCreator('Operations'));
document.querySelectorAll('[data-ticket-create]').forEach(btn=>btn.addEventListener('click',()=>openTicketCreator(btn.dataset.ticketCreate)));

document.getElementById('saveTicket')?.addEventListener('click',()=>{
  if(!ticketDepartment)return;
  const title=document.getElementById('ticketTitle').value.trim();
  const details=document.getElementById('ticketDetails').value.trim();
  if(!title||!details){alert('Please enter a title and details.');return;}
  tickets.unshift({id:createTicketId(ticketDepartment),department:ticketDepartment,category:document.getElementById('ticketCategory').value,priority:document.getElementById('ticketPriority').value,title,details,status:'Open',created:nowLabel()});
  saveAll();renderTickets();updateDashboardCounts();closeModal('ticketModal');
});

function buildEmployeeOptions(){
  const select=document.getElementById('hrEmployee');
  if(!select)return;
  const departments=['Operations','HR','IT','Engineering'];
  select.innerHTML=departments.map(dept=>{
    const group=employees.filter(e=>e.department===dept);
    if(!group.length)return '';
    return `<optgroup label="${dept}">${group.map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} — ${escapeHtml(e.role)}</option>`).join('')}</optgroup>`;
  }).join('');
}

document.getElementById('addHrCase')?.addEventListener('click',()=>{buildEmployeeOptions();openModal('hrModal');});

function renderHrCases(){
  const queue=document.getElementById('hrQueue');
  const summary=document.getElementById('hrSummary');
  if(!queue||!summary)return;
  const open=hrCases.filter(c=>c.status==='Open').length;
  const closed=hrCases.filter(c=>c.status==='Closed').length;
  summary.innerHTML=`<span class="summary-chip">Open cases <strong>${open}</strong></span><span class="summary-chip">Closed cases <strong>${closed}</strong></span>`;
  queue.innerHTML=hrCases.length?hrCases.map(c=>`
    <article class="ticket-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(c.id)} • ${escapeHtml(c.employeeDepartment)} • ${escapeHtml(c.created)}</div><h3>${escapeHtml(c.actionType)} — ${escapeHtml(c.employeeName)}</h3><p><strong>${escapeHtml(c.reason)}</strong><br>${escapeHtml(c.notes)}</p><div class="ticket-meta"><span class="pill ${ticketStatusClass(c.status)}">${escapeHtml(c.status)}</span></div></div><div class="ticket-actions">${c.status==='Open'?`<button class="status-btn hr-status" data-id="${escapeHtml(c.id)}" data-status="Closed">Close Case</button>`:`<button class="status-btn hr-status" data-id="${escapeHtml(c.id)}" data-status="Open">Reopen</button>`}</div></article>`).join(''):'<div class="empty-queue">No disciplinary-action cases have been created.</div>';
  document.querySelectorAll('.hr-status').forEach(btn=>btn.addEventListener('click',()=>{const item=hrCases.find(c=>c.id===btn.dataset.id);if(!item)return;item.status=btn.dataset.status;saveAll();renderHrCases();updateDashboardCounts();}));
}

document.getElementById('saveHrCase')?.addEventListener('click',()=>{
  const employee=employees.find(e=>e.id===document.getElementById('hrEmployee').value);
  const reason=document.getElementById('hrReason').value.trim();
  const notes=document.getElementById('hrNotes').value.trim();
  if(!employee||!reason){alert('Select an employee and enter a reason.');return;}
  hrCases.unshift({id:`HR-${1000+hrCases.length+1}`,employeeId:employee.id,employeeName:employee.name,employeeDepartment:employee.department,actionType:document.getElementById('hrActionType').value,reason,notes:notes||'No additional notes entered.',status:'Open',created:nowLabel()});
  document.getElementById('hrReason').value='';document.getElementById('hrNotes').value='';
  saveAll();renderHrCases();updateDashboardCounts();closeModal('hrModal');
});

function renderEmployees(){
  const roster=document.getElementById('employeeRoster');
  if(!roster)return;
  roster.innerHTML=employees.length?employees.map(e=>`<article class="employee-card"><strong>${escapeHtml(e.name)}</strong><span>${escapeHtml(e.email)}</span><span>${escapeHtml(e.department)} • ${escapeHtml(e.role)}</span><div class="ticket-meta"><span class="pill ${e.status==='Active'?'active':'pending'}">${escapeHtml(e.status)}</span></div></article>`).join(''):'<div class="empty-queue">No employees have been added.</div>';
  updateDashboardCounts();
}

document.getElementById('addEmployee')?.addEventListener('click',()=>openModal('employeeModal'));
document.getElementById('saveEmployee')?.addEventListener('click',()=>{
  const name=document.getElementById('employeeName').value.trim();
  const email=document.getElementById('employeeEmail').value.trim();
  const role=document.getElementById('employeeRole').value.trim();
  if(!name||!email||!role){alert('Name, work email, and role are required.');return;}
  employees.unshift({id:`emp-${Date.now()}`,name,email,department:document.getElementById('employeeDepartment').value,role,status:document.getElementById('employeeStatus').value});
  ['employeeName','employeeEmail','employeeRole'].forEach(id=>document.getElementById(id).value='');
  saveAll();renderEmployees();buildEmployeeOptions();closeModal('employeeModal');
});

function financeStatusClass(status){return String(status).toLowerCase().replaceAll(' ','-');}

function renderFinanceMetrics(){
  const active=syntheticBillingProfile.activeLifelineSubscribers;
  const weekly=active*syntheticBillingProfile.lifelineWeeklyPrice;
  const pending=financeCases.filter(c=>c.status!=='Closed').length;
  const activeEl=document.getElementById('billingActiveSubscribers');
  const revenueEl=document.getElementById('billingWeeklyRevenue');
  const pendingEl=document.getElementById('billingPendingCases');
  if(activeEl)activeEl.textContent=String(active);
  if(revenueEl)revenueEl.textContent=currency(weekly);
  if(pendingEl)pendingEl.textContent=String(pending);
}

function renderFinanceLedger(){
  const body=document.getElementById('financeLedger');
  if(!body)return;
  const search=(document.getElementById('financeSearch')?.value||'').trim().toLowerCase();
  const status=document.getElementById('financeStatusFilter')?.value||'All';
  const filtered=financeLedger.filter(item=>{
    const matchesSearch=!search||[item.id,item.member,item.plan,item.status].some(v=>String(v).toLowerCase().includes(search));
    const matchesStatus=status==='All'||item.status===status;
    return matchesSearch&&matchesStatus;
  });
  body.innerHTML=filtered.length?filtered.map(item=>`
    <tr>
      <td><strong>${escapeHtml(item.id)}</strong></td>
      <td>${escapeHtml(item.member)}</td>
      <td>${escapeHtml(item.plan)}</td>
      <td>${currency(item.amount)}</td>
      <td><span class="pill finance-${financeStatusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td>${escapeHtml(item.date)}</td>
    </tr>`).join(''):'<tr><td colspan="6" class="finance-empty">No matching finance records.</td></tr>';
}

function renderFinanceCases(){
  const queue=document.getElementById('financeCaseQueue');
  const summary=document.getElementById('financeCaseSummary');
  if(!queue||!summary)return;
  const open=financeCases.filter(c=>c.status==='Open').length;
  const progress=financeCases.filter(c=>c.status==='In Progress').length;
  const closed=financeCases.filter(c=>c.status==='Closed').length;
  summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span>`;
  queue.innerHTML=financeCases.length?financeCases.map(c=>`
    <article class="ticket-card finance-case-card">
      <div class="ticket-main">
        <div class="ticket-id">${escapeHtml(c.id)} • ${escapeHtml(c.type)} • ${escapeHtml(c.created)}</div>
        <h3>${escapeHtml(c.member)}${c.transaction?` — ${escapeHtml(c.transaction)}`:''}</h3>
        <p>${escapeHtml(c.notes)}</p>
        <div class="ticket-meta"><span class="pill ${String(c.priority).toLowerCase()}">${escapeHtml(c.priority)}</span><span class="pill ${ticketStatusClass(c.status)}">${escapeHtml(c.status)}</span>${Number(c.amount)>0?`<span class="pill amount-pill">${currency(c.amount)}</span>`:''}</div>
      </div>
      <div class="ticket-actions">
        ${c.status==='Open'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="In Progress">Start Review</button>`:''}
        ${c.status!=='Closed'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="Closed">Resolve</button>`:''}
        ${c.status==='Closed'?`<button class="status-btn finance-case-status" data-id="${escapeHtml(c.id)}" data-status="Open">Reopen</button>`:''}
      </div>
    </article>`).join(''):'<div class="empty-queue">No finance cases have been created.</div>';
  document.querySelectorAll('.finance-case-status').forEach(btn=>btn.addEventListener('click',()=>{
    const item=financeCases.find(c=>c.id===btn.dataset.id);if(!item)return;
    item.status=btn.dataset.status;saveAll();renderBilling();
  }));
}

function renderBilling(){
  renderFinanceMetrics();
  renderFinanceLedger();
  renderFinanceCases();
}

document.getElementById('financeSearch')?.addEventListener('input',renderFinanceLedger);
document.getElementById('financeStatusFilter')?.addEventListener('change',renderFinanceLedger);
document.getElementById('addFinanceCase')?.addEventListener('click',()=>{
  ['financeMemberRef','financeTransactionRef','financeAmount','financeNotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const priority=document.getElementById('financePriority');if(priority)priority.value='Normal';
  openModal('financeModal');
});

document.getElementById('saveFinanceCase')?.addEventListener('click',()=>{
  const type=document.getElementById('financeCaseType').value;
  const member=document.getElementById('financeMemberRef').value.trim();
  const transaction=document.getElementById('financeTransactionRef').value.trim();
  const amount=Number(document.getElementById('financeAmount').value||0);
  const priority=document.getElementById('financePriority').value;
  const notes=document.getElementById('financeNotes').value.trim();
  if(!member||!notes){alert('Member/account reference and notes are required.');return;}
  financeCases.unshift({id:`FIN-${1000+financeCases.length+1}`,type,member,transaction,amount:Number.isFinite(amount)?amount:0,priority,notes,status:'Open',created:nowLabel()});
  saveAll();renderBilling();closeModal('financeModal');
});

function updateDashboardCounts(){
  const pending=document.getElementById('pendingCount');
  const openTickets=document.getElementById('openTicketCount');
  const openHr=document.getElementById('openHrCount');
  const active=document.getElementById('activeEmployeeCount');
  if(pending)pending.textContent=String(candidates.filter(c=>c.status!=='Account activated').length);
  if(openTickets)openTickets.textContent=String(tickets.filter(t=>t.status!=='Closed').length);
  if(openHr)openHr.textContent=String(hrCases.filter(c=>c.status!=='Closed').length);
  if(active)active.textContent=String(employees.filter(e=>e.status==='Active').length);
}

renderCandidates();
renderTickets();
renderHrCases();
renderEmployees();
buildEmployeeOptions();
renderBilling();
updateDashboardCounts();
showPage('dashboard');
