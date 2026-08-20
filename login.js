const roleInput=document.getElementById('loginRole');
const emailInput=document.getElementById('loginEmail');
const passwordInput=document.getElementById('loginPassword');
const errorBox=document.getElementById('loginError');
const credentialsBox=document.getElementById('demoCredentials');

const INVITE_KEY='aria-member-invitations';
const ACCOUNT_KEY='aria-demo-member-accounts';
const demoUsers={
  member:{email:'member@aria.demo',password:'AriaDemo1!',name:'Demo Member',destination:'index.html'},
  staff:{email:'staff@aria.demo',password:'StaffDemo1!',name:'Founder / Co-Founder',staffRole:'Founder / Co-Founder',destination:'staff.html'}
};
let registrationContext={email:null,inviteId:null,verificationCode:null};

function loadArray(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function saveArray(key,value){localStorage.setItem(key,JSON.stringify(value));}
function setError(el,message=''){el.textContent=message;el.hidden=!message;}
function setRole(role){
  roleInput.value=role;
  document.querySelectorAll('.portal-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.role===role));
  const demo=demoUsers[role];
  emailInput.placeholder=demo.email;
  passwordInput.value='';
  errorBox.hidden=true;
  credentialsBox.innerHTML=`<strong>Demo ${role} login</strong><span>Email: ${demo.email}</span><span>Password: ${demo.password}</span>`;
  document.getElementById('openRegistration').hidden=role!=='member';
  emailInput.focus();
}

document.querySelectorAll('.portal-tab').forEach(btn=>btn.addEventListener('click',()=>setRole(btn.dataset.role)));
document.getElementById('togglePassword').addEventListener('click',e=>{
  const showing=passwordInput.type==='text';
  passwordInput.type=showing?'password':'text';
  e.currentTarget.textContent=showing?'Show':'Hide';
});
document.getElementById('forgotPassword').addEventListener('click',()=>setError(errorBox,'Password recovery is not connected in this prototype.'));

document.getElementById('loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  const role=roleInput.value;
  const email=emailInput.value.trim().toLowerCase();
  const password=passwordInput.value;
  let user=null;
  if(role==='member'){
    const created=loadArray(ACCOUNT_KEY).find(a=>a.email===email&&a.password===password&&a.status==='Active');
    if(created)user={email:created.email,name:created.name||created.email.split('@')[0],destination:'index.html'};
    else if(email===demoUsers.member.email&&password===demoUsers.member.password)user=demoUsers.member;
  }else if(email===demoUsers.staff.email&&password===demoUsers.staff.password)user=demoUsers.staff;
  if(!user){setError(errorBox,`Incorrect ${role} credentials.`);return;}
  const session={role,name:user.name,email:user.email,signedInAt:new Date().toISOString()};
  if(role==='staff')session.staffRole=user.staffRole||user.name;
  sessionStorage.setItem('aria-auth-session',JSON.stringify(session));
  if(role==='member')sessionStorage.setItem('aria-member-name',user.name);
  if(document.getElementById('rememberDemo').checked)localStorage.setItem('aria-demo-last-role',role);else localStorage.removeItem('aria-demo-last-role');
  window.location.href=user.destination;
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

document.getElementById('checkEligibility').addEventListener('click',()=>{
  const email=document.getElementById('registrationEmail').value.trim().toLowerCase();
  const code=document.getElementById('registrationAccessCode').value.trim().toUpperCase();
  const invitations=loadArray(INVITE_KEY);
  if(!email||!email.includes('@')){setError(document.getElementById('registrationError'),'Enter the email used on your Aria application.');return;}
  const emailMatch=invitations.find(i=>i.email===email&&i.status==='Pending');
  let invite=emailMatch;
  if(!emailMatch){
    document.getElementById('accessCodeWrap').hidden=false;
    if(!code){setError(document.getElementById('registrationError'),'This email does not match an approved invitation. Enter your Aria access code.');return;}
    invite=invitations.find(i=>String(i.code).toUpperCase()===code&&i.status==='Pending');
    if(!invite){setError(document.getElementById('registrationError'),'That access code is invalid, expired, used, or revoked.');return;}
  }
  const accounts=loadArray(ACCOUNT_KEY);
  if(accounts.some(a=>a.email===email&&a.status==='Active')){setError(document.getElementById('registrationError'),'An account already exists for this email. Sign in instead.');return;}
  registrationContext.email=email;
  registrationContext.inviteId=invite.id;
  registrationContext.verificationCode=String(Math.floor(100000+Math.random()*900000));
  document.getElementById('eligibilityStep').hidden=true;
  document.getElementById('verificationStep').hidden=false;
  document.getElementById('registrationStatus').textContent='Step 2 of 3 — Verify your email';
  document.getElementById('prototypeVerificationCode').textContent=`Prototype verification code: ${registrationContext.verificationCode}`;
  setError(document.getElementById('registrationError'));
});

document.getElementById('verifyEmailCode').addEventListener('click',()=>{
  const entered=document.getElementById('emailVerificationCode').value.trim();
  if(entered!==registrationContext.verificationCode){setError(document.getElementById('verificationError'),'Incorrect verification code.');return;}
  document.getElementById('verificationStep').hidden=true;
  document.getElementById('passwordStep').hidden=false;
  document.getElementById('registrationStatus').textContent='Step 3 of 3 — Secure your account';
  setError(document.getElementById('verificationError'));
});

document.getElementById('createMemberAccount').addEventListener('click',()=>{
  const password=document.getElementById('newMemberPassword').value;
  const confirm=document.getElementById('confirmMemberPassword').value;
  if(password.length<8){setError(document.getElementById('passwordError'),'Password must be at least 8 characters.');return;}
  if(password!==confirm){setError(document.getElementById('passwordError'),'Passwords do not match.');return;}
  const accounts=loadArray(ACCOUNT_KEY);
  accounts.push({id:`MEM-${Date.now()}`,email:registrationContext.email,password,name:registrationContext.email.split('@')[0],status:'Active',createdAt:new Date().toISOString()});
  saveArray(ACCOUNT_KEY,accounts);
  const invites=loadArray(INVITE_KEY);
  const invite=invites.find(i=>i.id===registrationContext.inviteId);
  if(invite){invite.status='Used';invite.usedAt=new Date().toISOString();}
  saveArray(INVITE_KEY,invites);
  showSignIn();
  setRole('member');
  emailInput.value=registrationContext.email;
  setError(errorBox,'Member account created. Sign in with your new password.');
});

const lastRole=localStorage.getItem('aria-demo-last-role');
if(lastRole&&demoUsers[lastRole])setRole(lastRole);else setRole('member');
