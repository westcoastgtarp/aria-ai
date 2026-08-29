(function(){
  document.body.style.visibility='hidden';
  let authenticatedStaff=null;

  function loadPolishStyles(){
    if(!document.querySelector('link[data-staff-polish]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='staff-polish.css?v=20260828-3';
      link.dataset.staffPolish='true';
      document.head.appendChild(link);
    }
    if(!document.querySelector('link[data-staff-note-fix]')){
      const noteFix=document.createElement('link');
      noteFix.rel='stylesheet';
      noteFix.href='staff-note-fix.css?v=20260828-1';
      noteFix.dataset.staffNoteFix='true';
      document.head.appendChild(noteFix);
    }
    if(!document.querySelector('link[data-live-support-chat]')){
      const chatStyles=document.createElement('link');
      chatStyles.rel='stylesheet';
      chatStyles.href='live-support-chat.css?v=20260828-3';
      chatStyles.dataset.liveSupportChat='true';
      document.head.appendChild(chatStyles);
    }
    if(!document.querySelector('link[data-aria-chat-archive-lock]')){
      const archiveLock=document.createElement('link');
      archiveLock.rel='stylesheet';
      archiveLock.href='aria-chat-archive-lock.css?v=20260828-1';
      archiveLock.dataset.ariaChatArchiveLock='true';
      document.head.appendChild(archiveLock);
    }
  }

  function firstName(value=''){
    const clean=String(value).trim();
    return clean?clean.split(/\s+/)[0]:'there';
  }

  function ensureTopbarActions(){
    const topbar=document.querySelector('.staff-topbar');
    if(!topbar)return null;
    let actions=topbar.querySelector('.staff-topbar-actions');
    if(actions)return actions;
    actions=document.createElement('div');
    actions.className='staff-topbar-actions';
    const chip=topbar.querySelector('.user-chip');
    if(chip)actions.appendChild(chip);
    topbar.appendChild(actions);
    return actions;
  }

  function applyStaffIdentity(){
    if(!authenticatedStaff)return;
    const displayName=authenticatedStaff.name||authenticatedStaff.email?.split('@')[0]||'Staff';
    const pageTitle=document.getElementById('pageTitle');
    const eyebrow=document.querySelector('.staff-topbar .eyebrow');
    const userChip=document.querySelector('.staff-topbar .user-chip');

    ensureTopbarActions();
    if(eyebrow)eyebrow.textContent='STAFF WORKSPACE';
    if(userChip){
      userChip.textContent=authenticatedStaff.role||'Staff';
      userChip.title=[displayName,authenticatedStaff.department].filter(Boolean).join(' • ');
    }
    if(pageTitle)pageTitle.textContent=`Welcome, ${firstName(displayName)}`;

    document.querySelectorAll('[data-page]').forEach(button=>{
      button.addEventListener('click',()=>{
        if(button.dataset.page==='dashboard'&&pageTitle){
          queueMicrotask(()=>{pageTitle.textContent=`Welcome, ${firstName(displayName)}`;});
        }
        if(button.dataset.page==='ariachat'&&pageTitle){
          queueMicrotask(()=>{pageTitle.textContent='Aria Chat';});
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
    loadPolishStyles();

    const logout=document.createElement('script');
    logout.src='portal-logout.js?v=20260821-2';
    document.body.appendChild(logout);

    const chat=document.createElement('script');
    chat.src='staff-live-support-chat.js?v=20260828-6';
    document.body.appendChild(chat);

    const core=document.createElement('script');
    core.src='staff-core.js';
    core.onload=()=>{
      applyStaffIdentity();

      const hiring=document.createElement('script');
      hiring.src='hiring-live.js?v=20260821-d1-applications';
      hiring.onload=()=>{
        const candidateActions=document.createElement('script');
        candidateActions.src='candidate-actions.js?v=20260821-launch1';
        document.body.appendChild(candidateActions);
      };
      document.body.appendChild(hiring);

      const hr=document.createElement('script');
      hr.src='hr-live.js?v=20260821-d1-1';
      document.body.appendChild(hr);

      const footer=document.createElement('script');
      footer.src='staff-footer.js?v=20260821-3';
      document.body.appendChild(footer);

      const guard=document.createElement('script');
      guard.src='staff-access-guard.js';
      guard.onload=()=>{
        const audit=document.createElement('script');
        audit.src='audit-blueprint.js?v=20260828-2';
        audit.onload=()=>{
          const notes=document.createElement('script');
          notes.src='ticket-notes.js?v=20260828-ariachat2';
          notes.onload=()=>{
            const invites=document.createElement('script');
            invites.src='account-invites.js';
            invites.onload=()=>{
              const provisioning=document.createElement('script');
              provisioning.src='staff-account-provisioning.js?v=20260821-d1-roster';
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
