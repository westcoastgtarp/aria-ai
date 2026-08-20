const roleInput=document.getElementById('loginRole');
const emailInput=document.getElementById('loginEmail');
const passwordInput=document.getElementById('loginPassword');
const errorBox=document.getElementById('loginError');
const credentialsBox=document.getElementById('demoCredentials');

const demoUsers={
  member:{email:'member@aria.demo',password:'AriaDemo1!',name:'Demo Member',destination:'index.html'},
  staff:{email:'staff@aria.demo',password:'StaffDemo1!',name:'Founder / Co-Founder',destination:'staff.html'}
};

function setRole(role){
  roleInput.value=role;
  document.querySelectorAll('.portal-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.role===role));
  const demo=demoUsers[role];
  emailInput.placeholder=demo.email;
  passwordInput.value='';
  errorBox.hidden=true;
  credentialsBox.innerHTML=`<strong>Demo ${role} login</strong><span>Email: ${demo.email}</span><span>Password: ${demo.password}</span>`;
  emailInput.focus();
}

document.querySelectorAll('.portal-tab').forEach(btn=>btn.addEventListener('click',()=>setRole(btn.dataset.role)));

document.getElementById('togglePassword').addEventListener('click',e=>{
  const showing=passwordInput.type==='text';
  passwordInput.type=showing?'password':'text';
  e.currentTarget.textContent=showing?'Show':'Hide';
  e.currentTarget.setAttribute('aria-label',showing?'Show password':'Hide password');
});

document.getElementById('forgotPassword').addEventListener('click',()=>{
  errorBox.textContent='Password recovery is not connected in this prototype. Use the demo credentials shown below.';
  errorBox.hidden=false;
});

document.getElementById('loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  const role=roleInput.value;
  const demo=demoUsers[role];
  const email=emailInput.value.trim().toLowerCase();
  const password=passwordInput.value;

  if(email!==demo.email||password!==demo.password){
    errorBox.textContent=`Incorrect demo ${role} credentials. Use the credentials shown below.`;
    errorBox.hidden=false;
    return;
  }

  const session={role,name:demo.name,email:demo.email,signedInAt:new Date().toISOString()};
  sessionStorage.setItem('aria-auth-session',JSON.stringify(session));
  if(role==='member')sessionStorage.setItem('aria-member-name',demo.name);
  if(document.getElementById('rememberDemo').checked)localStorage.setItem('aria-demo-last-role',role);
  else localStorage.removeItem('aria-demo-last-role');
  window.location.href=demo.destination;
});

const lastRole=localStorage.getItem('aria-demo-last-role');
if(lastRole&&demoUsers[lastRole])setRole(lastRole);
else setRole('member');
