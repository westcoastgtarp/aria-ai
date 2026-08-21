const roleInput=document.getElementById('loginRole');
const emailInput=document.getElementById('loginEmail');
const passwordInput=document.getElementById('loginPassword');
const errorBox=document.getElementById('loginError');
const credentialsBox=document.getElementById('demoCredentials');

const portalDefaults={
  member:{placeholder:'member@example.com',destination:'index.html'},
  staff:{placeholder:'staff@example.com',destination:'staff.html'}
};

let registrationContext={
  email:null,
  accessCode:'',
  consentVersion:'2026-08-20-v1',
  displayName:'',
  password:''
};

function setError(el,message=''){el.textContent=message;el.hidden=!message;}
function setRole(role){
  roleInput.value=role;
  document.querySelectorAll('.portal-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.role===role));
  emailInput.placeholder=portalDefaults[role].placeholder;
  passwordInput.value='';
  errorBox.hidden=true;
  credentialsBox.hidden=true;
  document.getElementById('openRegistration').hidden=role!=='member';
  emailInput.focus();
}

async function apiJson(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'Unable to complete this request.');
  return data;
}

function setRegistrationStep(stepId,status){
  ['eligibilityStep','consentStep','verificationStep','passwordStep','planStep','successStep'].forEach(id=>{
    document.getElementById(id).hidden=id!==stepId;
  });
  document.getElementById('registrationStatus').textContent=status;
}

async function loadSignupConfig(){
  try{
    const data=await apiJson('/api/member-signup/config');
    if(data.consentVersion)registrationContext.consentVersion=data.consentVersion;
  }catch{}
  document.getElementById('consentVersionLabel').textContent=registrationContext.consentVersion;
}

document.querySelectorAll('.portal-tab').forEach(btn=>btn.addEventListener('click',()=>setRole(btn.dataset.role)));
document.getElementById('togglePassword').addEventListener('click',e=>{
  const showing=passwordInput.type==='text';
  passwordInput.type=showing?'password':'text';
  e.currentTarget.textContent=showing?'Show':'Hide';
});
document.getElementById('forgotPassword').addEventListener('click',()=>setError(errorBox,'Password recovery is not connected yet.'));

document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const requestedPortal=roleInput.value;
  const email=emailInput.value.trim().toLowerCase();
  const password=passwordInput.value;
  const submit=e.currentTarget.querySelector('button[type="submit"]');

  setError(errorBox);
  if(!email||!password){setError(errorBox,'Email and password are required.');return;}

  submit.disabled=true;
  submit.textContent='Signing in…';
  try{
    const data=await apiJson('/api/auth/login',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})
    });

    const sessionData=await apiJson('/api/auth/session');
    if(!sessionData.authenticated)throw new Error('Your session could not be verified. Please try again.');

    const user=sessionData.user||data.user||{};
    const actualPortal=user.accountType==='staff'?'staff':'member';
    if(actualPortal!==requestedPortal){
      await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).catch(()=>{});
      throw new Error(`This account belongs to the ${actualPortal} portal. Choose ${actualPortal[0].toUpperCase()+actualPortal.slice(1)} and try again.`);
    }

    const compatibilitySession={
      role:actualPortal,
      name:user.name||email.split('@')[0],
      email:user.email||email,
      signedInAt:new Date().toISOString(),
      serverAuthenticated:true
    };
    if(actualPortal==='staff'){
      compatibilitySession.staffRole=user.role||'';
      compatibilitySession.department=user.department||'';
    }
    sessionStorage.setItem('aria-auth-session',JSON.stringify(compatibilitySession));
    if(actualPortal==='member')sessionStorage.setItem('aria-member-name',compatibilitySession.name);

    if(document.getElementById('rememberDemo').checked)localStorage.setItem('aria-last-portal',actualPortal);
    else localStorage.removeItem('aria-last-portal');

    window.location.href=portalDefaults[actualPortal].destination;
  }catch(error){
    setError(errorBox,error?.message||'Unable to sign in.');
  }finally{
    submit.disabled=false;
    submit.textContent='Sign in';
  }
});

function showRegistration(){
  document.getElementById('signInView').hidden=true;
  document.getElementById('registrationView').hidden=false;
  resetRegistration();
  loadSignupConfig();
}
function showSignIn(){
  document.getElementById('registrationView').hidden=true;
  document.getElementById('signInView').hidden=false;
  resetRegistration();
}
function resetRegistration(){
  registrationContext={email:null,accessCode:'',consentVersion:'2026-08-20-v1',displayName:'',password:''};
  ['registrationEmail','registrationAccessCode','emailVerificationCode','newMemberName','newMemberPassword','confirmMemberPassword'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('memberConsentRequired').checked=false;
  document.querySelector('input[name="ariaPlan"][value="free"]').checked=true;
  updatePlanCards();
  document.getElementById('accessCodeWrap').hidden=false;
  document.getElementById('prototypeVerificationCode').hidden=true;
  document.getElementById('prototypeVerificationCode').textContent='';
  document.getElementById('verificationCopy').textContent='A verification code is required before you can create the account.';
  setRegistrationStep('eligibilityStep','Step 1 of 5 — Confirm invitation');
  ['registrationError','consentError','verificationError','passwordError','planError'].forEach(id=>setError(document.getElementById(id)));
}
document.getElementById('openRegistration').addEventListener('click',showRegistration);
document.getElementById('backToSignIn').addEventListener('click',showSignIn);
document.getElementById('returnToSignIn').addEventListener('click',showSignIn);

document.getElementById('checkEligibility').addEventListener('click',async()=>{
  const email=document.getElementById('registrationEmail').value.trim().toLowerCase();
  const accessCode=document.getElementById('registrationAccessCode').value.trim().toUpperCase();
  const error=document.getElementById('registrationError');
  const button=document.getElementById('checkEligibility');
  setError(error);
  if(!email||!email.includes('@')){setError(error,'Enter the email used on your Aria invitation.');return;}

  button.disabled=true;button.textContent='Checking…';
  try{
    const data=await apiJson('/api/invitations/eligibility',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,code:accessCode})
    });
    if(!data.eligible){
      setError(error,data.accessCodeRequired?'This email does not match an active approved invitation. Check the email or enter the Aria access code.':'This invitation is not eligible.');
      return;
    }
    registrationContext.email=email;
    registrationContext.accessCode=accessCode;
    setRegistrationStep('consentStep','Step 2 of 5 — Review consent');
  }catch(err){setError(error,err?.message||'Unable to check invitation eligibility.');}
  finally{button.disabled=false;button.textContent='Continue';}
});

document.getElementById('acceptConsent').addEventListener('click',async()=>{
  const error=document.getElementById('consentError');
  const button=document.getElementById('acceptConsent');
  const accepted=document.getElementById('memberConsentRequired').checked;
  setError(error);
  if(!accepted){setError(error,'Review the consent summary and check the agreement box before continuing.');return;}
  if(!registrationContext.email){setError(error,'Your invitation session expired. Start signup again.');return;}

  button.disabled=true;button.textContent='Recording consent…';
  try{
    const data=await apiJson('/api/member-signup/consent',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        email:registrationContext.email,
        accessCode:registrationContext.accessCode,
        accepted:true,
        consentVersion:registrationContext.consentVersion
      })
    });
    const verification=data.emailVerification||{};
    if(verification.developmentCode){
      const codeBox=document.getElementById('prototypeVerificationCode');
      codeBox.textContent=`Development verification code: ${verification.developmentCode}`;
      codeBox.hidden=false;
      document.getElementById('verificationCopy').textContent='Email delivery is not connected. A development-only verification code is shown below for this approved invitation.';
    }else{
      document.getElementById('verificationCopy').textContent=verification.message||'A verification code was created. Email delivery is not connected yet.';
    }
    setRegistrationStep('verificationStep','Step 3 of 5 — Verify email');
  }catch(err){setError(error,err?.message||'Unable to record consent.');}
  finally{button.disabled=false;button.textContent='Accept & Continue';}
});

document.getElementById('verifyEmailCode').addEventListener('click',async()=>{
  const code=document.getElementById('emailVerificationCode').value.trim();
  const error=document.getElementById('verificationError');
  const button=document.getElementById('verifyEmailCode');
  setError(error);
  if(!/^\d{6}$/.test(code)){setError(error,'Enter the 6-digit verification code.');return;}

  button.disabled=true;button.textContent='Verifying…';
  try{
    await apiJson('/api/member-signup/verify-email',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:registrationContext.email,verificationCode:code})
    });
    setRegistrationStep('passwordStep','Step 4 of 5 — Secure your account');
  }catch(err){setError(error,err?.message||'Unable to verify email.');}
  finally{button.disabled=false;button.textContent='Verify Email';}
});

document.getElementById('continueToPlan').addEventListener('click',()=>{
  const name=document.getElementById('newMemberName').value.trim();
  const password=document.getElementById('newMemberPassword').value;
  const confirm=document.getElementById('confirmMemberPassword').value;
  const error=document.getElementById('passwordError');
  setError(error);
  if(!name){setError(error,'Enter your name.');return;}
  if(password.length<14){setError(error,'Use a password with at least 14 characters.');return;}
  if(password!==confirm){setError(error,'The passwords do not match.');return;}
  registrationContext.displayName=name;
  registrationContext.password=password;
  setRegistrationStep('planStep','Step 5 of 5 — Choose your plan');
});

function updatePlanCards(){
  const selected=document.querySelector('input[name="ariaPlan"]:checked')?.value;
  document.querySelectorAll('[data-plan-card]').forEach(card=>card.classList.toggle('selected',card.dataset.planCard===selected));
}
document.querySelectorAll('input[name="ariaPlan"]').forEach(input=>input.addEventListener('change',updatePlanCards));

document.getElementById('createMemberAccount').addEventListener('click',async()=>{
  const planCode=document.querySelector('input[name="ariaPlan"]:checked')?.value;
  const error=document.getElementById('planError');
  const button=document.getElementById('createMemberAccount');
  setError(error);
  if(!planCode){setError(error,'Choose an Aria plan.');return;}
  if(!registrationContext.password||!registrationContext.displayName){setError(error,'Your registration session expired. Return to the previous step.');return;}

  button.disabled=true;button.textContent='Creating account…';
  try{
    const data=await apiJson('/api/member-signup/complete',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        email:registrationContext.email,
        displayName:registrationContext.displayName,
        password:registrationContext.password,
        planCode
      })
    });
    registrationContext.password='';
    document.getElementById('newMemberPassword').value='';
    document.getElementById('confirmMemberPassword').value='';
    document.getElementById('successMessage').textContent=data.message||'Your Aria account is ready.';
    setRegistrationStep('successStep','Account setup complete');
  }catch(err){setError(error,err?.message||'Unable to create the account.');}
  finally{button.disabled=false;button.textContent='Create Account';}
});

const lastRole=localStorage.getItem('aria-last-portal');
if(lastRole&&portalDefaults[lastRole])setRole(lastRole);else setRole('member');
