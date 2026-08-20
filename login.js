const roleInput=document.getElementById('loginRole');
const emailInput=document.getElementById('loginEmail');
const passwordInput=document.getElementById('loginPassword');
const errorBox=document.getElementById('loginError');
const credentialsBox=document.getElementById('demoCredentials');

const INVITE_KEY='aria-member-invitations';
const ACCOUNT_KEY='aria-demo-member-accounts';
const portalDefaults={
  member:{placeholder:'member@example.com',destination:'index.html'},
  staff:{placeholder:'staff@example.com',destination:'staff.html'}
};
let registrationContext={email:null,inviteId:null,verificationCode:null};

function loadArray(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function saveArray(key,value){localStorage.setItem(key,JSON.stringify(value));}
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
    const response=await fetch('/api/auth/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({email,password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Unable to sign in.');

    const sessionResponse=await fetch('/api/auth/session',{credentials:'same-origin'});
    const sessionData=await sessionResponse.json().catch(()=>({}));
    if(!sessionResponse.ok||!sessionData.authenticated)throw new Error('Your session could not be verified. Please try again.');

    const user=sessionData.user||{};
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
}
function showSignIn(){document.getElementById('registrationView').hidden=true;document.getElementById('signInView').hidden=false;}
function resetRegistration(){
  registrationContext={email:null,inviteId:null,verificationCode:null};
  ['registrationEmail','registrationAccessCode','emailVerificationCode','newMemberPassword','confirmMemberPassword'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('accessCodeWrap').hidden=true;
  document.getElementById('eligibilityStep').hidden=false;
  document.getElementById('verificationStep').hidden=true;
  document.getElementById('passwordStep').hidden=true;
  document.getElementById('registrationStatus').textContent='Step 1 of 3 — Confirm account eligibility';
  [document.getElementById('registrationError'),document.getElementById('verificationError'),document.getElementById('passwordError')].forEach(el=>setError(el));
}
document.getElementById('openRegistration').addEventListener('click',showRegistration);
document.getElementById('backToSignIn').addEventListener('click',showSignIn);

document.getElementById('checkEligibility').addEventListener('click',async()=>{
  const email=document.getElementById('registrationEmail').value.trim().toLowerCase();
  const code=document.getElementById('registrationAccessCode').value.trim().toUpperCase();
  const error=document.getElementById('registrationError');
  if(!email||!email.includes('@')){setError(error,'Enter the email used on your Aria application.');return;}

  try{
    const response=await fetch('/api/invitations/eligibility',{
      method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({email,code})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Unable to check invitation eligibility.');
    if(!data.eligible){
      document.getElementById('accessCodeWrap').hidden=false;
      setError(error,data.accessCodeRequired?'This email does not match an approved invitation. Enter your Aria access code.':'This invitation is not eligible.');
      return;
    }
    registrationContext.email=email;
    setError(error,'Invitation confirmed. Email verification and account creation are the next backend step and are not enabled yet.');
  }catch(err){setError(error,err?.message||'Unable to check invitation eligibility.');}
});

document.getElementById('verifyEmailCode').addEventListener('click',()=>setError(document.getElementById('verificationError'),'Server-side email verification is not connected yet.'));
document.getElementById('createMemberAccount').addEventListener('click',()=>setError(document.getElementById('passwordError'),'Server-side member account creation is not connected yet.'));

const lastRole=localStorage.getItem('aria-last-portal');
if(lastRole&&portalDefaults[lastRole])setRole(lastRole);else setRole('member');
