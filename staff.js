(function(){
  document.body.style.visibility='hidden';
  let authenticatedStaff=null;

  function firstName(value=''){
    const clean=String(value).trim();
    return clean?clean.split(/\s+/)[0]:'there';
  }

  function applyStaffIdentity(){
    if(!authenticatedStaff)return;
    const displayName=authenticatedStaff.name||authenticatedStaff.email?.split('@')[0]||'Staff';
    const pageTitle=document.getElementById('pageTitle');
    const eyebrow=document.querySelector('.staff-topbar .eyebrow');
    const userChip=document.querySelector('.staff-topbar .user-chip');

    if(eyebrow)eyebrow.textContent='STAFF WORKSPACE';
    if(userChip){
      userChip.textContent=displayName;
      userChip.title=[authenticatedStaff.role,authenticatedStaff.department].filter(Boolean).join(' • ');
    }
    if(pageTitle)pageTitle.textContent=`Welcome, ${firstName(displayName)}`;

    document.querySelectorAll('[data-page]').forEach(button=>{
      button.addEventListener('click',()=>{
        if(button.dataset.page==='dashboard'&&pageTitle){
          queueMicrotask(()=>{pageTitle.textContent=`Welcome, ${firstName(displayName)}`;});
        }
      });
    });
  }

  async function requireStaffSession(){
    try{
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      const user=data?.user||{};
      if(!response.ok||!data.authenticated||user.accountType!=='staff'){
        sessionStorage.removeItem('aria-auth-session');
        window.location.replace('login.html');
        return false;
      }

      authenticatedStaff=user;
      const compatibilitySession={
        role:'staff',
        name:user.name||user.email?.split('@')[0]||'Staff',
        email:user.email||'',
        staffRole:user.role||'',
        department:user.department||'',
        signedInAt:new Date().toISOString(),
        serverAuthenticated:true
      };
      sessionStorage.setItem('aria-auth-session',JSON.stringify(compatibilitySession));
      document.body.style.visibility='';
      return true;
    }catch{
      sessionStorage.removeItem('aria-auth-session');
      window.location.replace('login.html');
      return false;
    }
  }

  function loadPortal(){
    const logout=document.createElement('script');
    logout.src='portal-logout.js';
    document.body.appendChild(logout);

    const core=document.createElement('script');
    core.src='staff-core.js';
    core.onload=()=>{
      applyStaffIdentity();
      const guard=document.createElement('script');
      guard.src='staff-access-guard.js';
      guard.onload=()=>{
        const audit=document.createElement('script');
        audit.src='audit-blueprint.js';
        audit.onload=()=>{
          const notes=document.createElement('script');
          notes.src='ticket-notes.js';
          notes.onload=()=>{
            const invites=document.createElement('script');
            invites.src='account-invites.js';
            invites.onload=()=>{
              const provisioning=document.createElement('script');
              provisioning.src='staff-account-provisioning.js';
              document.body.appendChild(provisioning);
            };
            document.body.appendChild(invites);
          };
          document.body.appendChild(notes);
        };
        document.body.appendChild(audit);
      };
      document.body.appendChild(guard);
    };
    document.body.appendChild(core);
  }

  requireStaffSession().then(ok=>{if(ok)loadPortal();});
})();
