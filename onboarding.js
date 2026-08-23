const params=new URLSearchParams(location.search);
const token=params.get('token')||'';
const form=document.getElementById('onboardingForm');
const banner=document.getElementById('submissionBanner');
const submitButton=form?.querySelector('button[type="submit"]');
const documentsLink=document.getElementById('newHireDocumentsLink');
let candidate=null;

if(documentsLink&&token){
  documentsLink.href=`new-hire-documents.html?token=${encodeURIComponent(token)}`;
}

function setFormEnabled(enabled){
  form?.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=!enabled;});
}

function showMessage(message,success=false){
  if(!banner)return;
  banner.textContent=message;
  banner.classList.remove('hidden');
  banner.style.background=success?'#e9f7f3':'#fff0f2';
  banner.style.color=success?'#1e7d6e':'#a73749';
}

async function validateLink(){
  if(!token){
    showMessage('This onboarding link is missing or invalid.');
    setFormEnabled(false);
    return;
  }
  try{
    const response=await fetch(`/api/onboarding/validate?token=${encodeURIComponent(token)}`,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok||!data.valid)throw new Error(data.error||'This onboarding link is invalid or expired.');
    candidate=data.candidate;
    document.getElementById('candidateIntro').textContent=`${candidate.fullName}, complete the information below so Aria AI staff can prepare your department, role, and account access.`;
    document.getElementById('legalName').value=candidate.fullName||'';
    document.getElementById('personalEmail').value=candidate.email||'';
    document.getElementById('onboardingDepartment').value=candidate.department||'';
    document.getElementById('expectedRole').value=candidate.expectedRole||'';
    if(candidate.status==='submitted')showMessage('Your onboarding information was already submitted. You can update and resubmit it while this link remains active.',true);
  }catch(error){
    showMessage(error?.message||'This onboarding link is invalid or expired.');
    setFormEnabled(false);
  }
}

form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!candidate||!token)return;

  const payload={
    token,
    legalName:document.getElementById('legalName').value.trim(),
    preferredName:document.getElementById('preferredName').value.trim(),
    personalEmail:document.getElementById('personalEmail').value.trim(),
    phone:document.getElementById('phone').value.trim(),
    city:document.getElementById('city').value.trim(),
    state:document.getElementById('state').value.trim(),
    department:document.getElementById('onboardingDepartment').value,
    expectedRole:document.getElementById('expectedRole').value.trim(),
    startDate:document.getElementById('startDate').value,
    availability:document.getElementById('availability').value,
    emergencyContact:document.getElementById('emergencyContact').value.trim(),
    notes:document.getElementById('notes').value.trim(),
    accuracyAck:document.getElementById('accuracyAck').checked,
    policyAck:document.getElementById('policyAck').checked
  };

  if(submitButton){submitButton.disabled=true;submitButton.textContent='Submitting…';}
  try{
    const response=await fetch('/api/onboarding/submit',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Unable to submit onboarding information.');
    candidate.status='submitted';
    showMessage('Onboarding information submitted for staff review.',true);
    banner?.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){
    showMessage(error?.message||'Unable to submit onboarding information.');
    banner?.scrollIntoView({behavior:'smooth',block:'start'});
  }finally{
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Submit Onboarding';}
  }
});

setFormEnabled(false);
validateLink().then(()=>{if(candidate)setFormEnabled(true);});
