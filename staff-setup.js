const params=new URLSearchParams(window.location.search);
const token=params.get('token')||'';
const heading=document.getElementById('setupHeading');
const summary=document.getElementById('setupSummary');
const errorBox=document.getElementById('setupError');
const form=document.getElementById('staffSetupForm');
const identity=document.getElementById('staffIdentity');
const password=document.getElementById('staffPassword');
const confirmPassword=document.getElementById('staffPasswordConfirm');
const success=document.getElementById('setupSuccess');

function showError(message=''){
  errorBox.textContent=message;
  errorBox.hidden=!message;
}

async function validateLink(){
  if(!token){
    heading.textContent='Setup link unavailable';
    summary.textContent='This staff setup link is missing its secure token.';
    showError('Ask your Aria administrator for a new staff setup link.');
    return;
  }

  try{
    const response=await fetch(`/api/staff/setup/validate?token=${encodeURIComponent(token)}`,{credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.valid)throw new Error(data.error||'This setup link could not be validated.');

    const employee=data.employee||{};
    heading.textContent=`Welcome, ${employee.displayName||'Aria team member'}`;
    summary.textContent='Create your password to activate your staff account.';
    identity.textContent=[employee.email,employee.department,employee.role].filter(Boolean).join(' • ');
    form.hidden=false;
  }catch(error){
    heading.textContent='Setup link unavailable';
    summary.textContent='This invitation cannot be used.';
    showError(error?.message||'This setup link is invalid, expired, or already used.');
  }
}

document.getElementById('toggleStaffPassword').addEventListener('click',e=>{
  const showing=password.type==='text';
  password.type=showing?'password':'text';
  e.currentTarget.textContent=showing?'Show':'Hide';
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  showError();
  const value=password.value;
  const confirm=confirmPassword.value;
  if(value.length<14){showError('Password must be at least 14 characters.');return;}
  if(value!==confirm){showError('Passwords do not match.');return;}

  const button=document.getElementById('activateStaffAccount');
  button.disabled=true;
  button.textContent='Activating…';
  try{
    const response=await fetch('/api/staff/setup/complete',{
      method:'POST',
      headers:{'content-type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({token,password:value})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Account activation failed.');

    form.hidden=true;
    success.hidden=false;
    heading.textContent='Your account is ready';
    summary.textContent='Staff activation completed successfully.';
    history.replaceState(null,'','staff-setup.html');
  }catch(error){
    showError(error?.message||'Account activation failed.');
  }finally{
    button.disabled=false;
    button.textContent='Activate Staff Account';
  }
});

validateLink();
