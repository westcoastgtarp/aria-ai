const initialCandidates = [
  { id:'cand-1001', name:'Jordan Lee', status:'Hired', department:null, role:null },
  { id:'cand-1002', name:'Taylor Morgan', status:'Hired', department:null, role:null }
];

let candidates = JSON.parse(sessionStorage.getItem('aria-staff-candidates') || 'null') || structuredClone(initialCandidates);
let selectedCandidateId = null;

const titleMap = {
  dashboard:'Staff Dashboard', hiring:'Hiring & Department Assignment', operations:'Operations',
  hr:'Human Resources', it:'IT', engineering:'Engineering', admin:'System Administration',
  privacy:'Privacy & Compliance', audit:'Audit Log', billing:'Billing / Finance',
  security:'Security & Access', policies:'System Policies'
};

function escapeHtml(value=''){
  return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
}

function saveCandidates(){
  sessionStorage.setItem('aria-staff-candidates',JSON.stringify(candidates));
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const target=document.getElementById(`${page}-page`);
  if(target)target.classList.add('active');
  const title=document.getElementById('pageTitle');
  if(title)title.textContent=titleMap[page]||'Aria AI Staff';
}

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));

function renderCandidates(){
  const list=document.getElementById('candidateList');
  if(!list)return;
  list.innerHTML=candidates.map(c=>`
    <article class="candidate-card">
      <div class="candidate-meta">
        <strong>${escapeHtml(c.name)}</strong>
        <span>${escapeHtml(c.status)}${c.department ? ` • ${escapeHtml(c.department)} • ${escapeHtml(c.role || 'Role pending')}` : ' • Department not assigned'}</span>
      </div>
      <div class="candidate-actions">
        <span class="pill ${c.department ? 'assigned' : ''}">${c.department ? 'Assigned' : 'Pending assignment'}</span>
        <button class="primary assign-btn" data-id="${escapeHtml(c.id)}">${c.department ? 'Edit Assignment' : 'Assign Department'}</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',()=>openAssignment(btn.dataset.id)));
  const pending=document.getElementById('pendingCount');
  if(pending)pending.textContent=String(candidates.filter(c=>!c.department).length);
}

function openAssignment(id){
  const candidate=candidates.find(x=>x.id===id);
  if(!candidate)return;
  selectedCandidateId=id;
  const name=document.getElementById('candidateName');
  const department=document.getElementById('departmentSelect');
  const role=document.getElementById('roleInput');
  const modal=document.getElementById('assignModal');
  if(name)name.textContent=`Assign ${candidate.name}`;
  if(department)department.value=candidate.department||'Operations';
  if(role)role.value=candidate.role&&candidate.role!=='Role pending'?candidate.role:'';
  modal?.classList.remove('hidden');
}

function closeAssignment(){
  document.getElementById('assignModal')?.classList.add('hidden');
  selectedCandidateId=null;
}

document.getElementById('closeModal')?.addEventListener('click',closeAssignment);
document.getElementById('cancelAssignment')?.addEventListener('click',closeAssignment);
document.getElementById('assignModal')?.addEventListener('click',e=>{if(e.target.id==='assignModal')closeAssignment();});

document.getElementById('saveAssignment')?.addEventListener('click',()=>{
  const candidate=candidates.find(x=>x.id===selectedCandidateId);
  if(!candidate)return;
  const department=document.getElementById('departmentSelect')?.value;
  const role=document.getElementById('roleInput')?.value.trim();
  if(!department)return;
  candidate.department=department;
  candidate.role=role||'Role pending';
  candidate.status='Ready for account activation';
  saveCandidates();
  renderCandidates();
  closeAssignment();
});

renderCandidates();
showPage('dashboard');
