const candidates = [
  { id:'cand-1001', name:'Jordan Lee', status:'Hired', department:null, role:null },
  { id:'cand-1002', name:'Taylor Morgan', status:'Hired', department:null, role:null }
];

let selectedCandidateId = null;

const titleMap = {
  dashboard:'Staff Dashboard', hiring:'Hiring & Department Assignment', operations:'Operations',
  hr:'Human Resources', it:'IT', engineering:'Engineering', admin:'System Administration',
  privacy:'Privacy & Compliance', audit:'Audit Log', billing:'Billing / Finance',
  security:'Security & Access', policies:'System Policies'
};

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  const target=document.getElementById(`${page}-page`);
  if(target) target.classList.add('active');
  document.getElementById('pageTitle').textContent=titleMap[page]||'Aria AI Staff';
}

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));

function renderCandidates(){
  const list=document.getElementById('candidateList');
  list.innerHTML=candidates.map(c=>`
    <article class="candidate-card">
      <div class="candidate-meta">
        <strong>${c.name}</strong>
        <span>${c.status}${c.department ? ` • ${c.department} • ${c.role || 'Role pending'}` : ' • Department not assigned'}</span>
      </div>
      <div class="candidate-actions">
        <span class="pill ${c.department ? 'assigned' : ''}">${c.department ? 'Assigned' : 'Pending assignment'}</span>
        <button class="primary assign-btn" data-id="${c.id}">${c.department ? 'Edit Assignment' : 'Assign Department'}</button>
      </div>
    </article>
  `).join('');
  document.querySelectorAll('.assign-btn').forEach(btn=>btn.addEventListener('click',()=>openAssignment(btn.dataset.id)));
  document.getElementById('pendingCount').textContent=String(candidates.filter(c=>!c.department).length);
}

function openAssignment(id){
  const c=candidates.find(x=>x.id===id);
  if(!c) return;
  selectedCandidateId=id;
  document.getElementById('candidateName').textContent=`Assign ${c.name}`;
  document.getElementById('departmentSelect').value=c.department||'Operations';
  document.getElementById('roleInput').value=c.role||'';
  document.getElementById('assignModal').classList.remove('hidden');
}

function closeAssignment(){
  document.getElementById('assignModal').classList.add('hidden');
  selectedCandidateId=null;
}

document.getElementById('closeModal').addEventListener('click', closeAssignment);
document.getElementById('cancelAssignment').addEventListener('click', closeAssignment);
document.getElementById('assignModal').addEventListener('click', e=>{ if(e.target.id==='assignModal') closeAssignment(); });

document.getElementById('saveAssignment').addEventListener('click',()=>{
  const c=candidates.find(x=>x.id===selectedCandidateId);
  if(!c) return;
  c.department=document.getElementById('departmentSelect').value;
  c.role=document.getElementById('roleInput').value.trim()||'Role pending';
  c.status='Ready for account activation';
  renderCandidates();
  closeAssignment();
});

renderCandidates();
