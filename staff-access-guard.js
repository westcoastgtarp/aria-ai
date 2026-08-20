(function(){
  const ALLOWED_ROLES=['founder / co-founder','founder','co-founder','system administrator','system admin'];

  function currentSession(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'null')||{};}catch{return {};}
  }

  function currentStaffRole(){
    const session=currentSession();
    return String(session.staffRole||session.title||session.name||'').trim();
  }

  function canAccessRestrictedLogs(){
    const session=currentSession();
    if(session.role!=='staff')return false;
    return ALLOWED_ROLES.includes(currentStaffRole().toLowerCase());
  }

  function enforceLogVisibility(){
    const allowed=canAccessRestrictedLogs();
    document.querySelectorAll('[data-page="audit"]').forEach(button=>{button.style.display=allowed?'':'none';});
    const auditPage=document.getElementById('audit-page');
    if(auditPage&&!allowed){
      auditPage.classList.remove('active');
      auditPage.setAttribute('aria-hidden','true');
    }
    document.documentElement.dataset.restrictedLogAccess=allowed?'allowed':'denied';
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page="audit"]');
    if(!target||canAccessRestrictedLogs())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('Audit logs are restricted to Founder/Co-Founder and System Administrator roles.');
  },true);

  window.AriaStaffAccess={currentStaffRole,canAccessRestrictedLogs,enforceLogVisibility};
  enforceLogVisibility();
})();
