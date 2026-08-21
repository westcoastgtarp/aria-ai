(function(){
  document.body.style.visibility='hidden';

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
