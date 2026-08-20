const params=new URLSearchParams(location.search);
const candidateId=params.get('candidate');

function loadList(key,fallback=[]){
  try{
    const value=JSON.parse(sessionStorage.getItem(key)||'null');
    return Array.isArray(value)?value:fallback;
  }catch{return fallback;}
}

function saveList(key,value){sessionStorage.setItem(key,JSON.stringify(value));}

let candidates=loadList('aria-staff-candidates',[]);
let submissions=loadList('aria-onboarding-submissions',[]);
const candidate=candidates.find(c=>c.id===candidateId);

if(candidate){
  document.getElementById('candidateIntro').textContent=`${candidate.name}, complete the information below so Aria AI staff can prepare your department, role, and account access.`;
  document.getElementById('legalName').value=candidate.name||'';
  if(candidate.department)document.getElementById('onboardingDepartment').value=candidate.department;
  if(candidate.role&&candidate.role!=='Role pending')document.getElementById('expectedRole').value=candidate.role;
}

const existing=submissions.find(s=>s.candidateId===candidateId);
if(existing){
  const fields=['legalName','preferredName','personalEmail','phone','city','state','onboardingDepartment','expectedRole','startDate','availability','emergencyContact','notes'];
  fields.forEach(id=>{if(existing[id]!==undefined&&document.getElementById(id))document.getElementById(id).value=existing[id];});
}

document.getElementById('onboardingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const submission={
    id:existing?.id||`ONB-${Date.now()}`,
    candidateId:candidateId||null,
    legalName:document.getElementById('legalName').value.trim(),
    preferredName:document.getElementById('preferredName').value.trim(),
    personalEmail:document.getElementById('personalEmail').value.trim(),
    phone:document.getElementById('phone').value.trim(),
    city:document.getElementById('city').value.trim(),
    state:document.getElementById('state').value.trim(),
    onboardingDepartment:document.getElementById('onboardingDepartment').value,
    expectedRole:document.getElementById('expectedRole').value.trim(),
    startDate:document.getElementById('startDate').value,
    availability:document.getElementById('availability').value,
    emergencyContact:document.getElementById('emergencyContact').value.trim(),
    notes:document.getElementById('notes').value.trim(),
    status:'Submitted',
    submittedAt:new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date())
  };

  const index=submissions.findIndex(s=>s.candidateId===candidateId&&candidateId);
  if(index>=0)submissions[index]=submission;else submissions.unshift(submission);
  saveList('aria-onboarding-submissions',submissions);

  if(candidate){
    candidate.onboardingStatus='Submitted';
    candidate.department=submission.onboardingDepartment||candidate.department;
    candidate.role=submission.expectedRole||candidate.role;
    candidate.status='Ready for role & permissions';
    saveList('aria-staff-candidates',candidates);
  }

  const banner=document.getElementById('submissionBanner');
  banner.classList.remove('hidden');
  banner.scrollIntoView({behavior:'smooth',block:'start'});
});
