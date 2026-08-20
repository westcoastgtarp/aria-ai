(function(){
  const ACCOUNT_LOG_ROLES=['founder / co-founder','founder','co-founder','system administrator','system admin'];
  const AUDIT_LOG_ROLES=['founder / co-founder','founder','co-founder'];

  function currentSession(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'null')||{};}catch{return {};}
  }

  function currentStaffRole(){
    const session=currentSession();
    return String(session.staffRole||session.title||session.name||'').trim();
  }

  function isStaff(){return currentSession().role==='staff';}
  function canAccessRestrictedLogs(){return isStaff()&&ACCOUNT_LOG_ROLES.includes(currentStaffRole().toLowerCase());}
  function canAccessAuditLogs(){return isStaff()&&AUDIT_LOG_ROLES.includes(currentStaffRole().toLowerCase());}

  function enforceLogVisibility(){
    const auditAllowed=canAccessAuditLogs();
    document.querySelectorAll('[data-page="audit"]').forEach(button=>{button.style.display=auditAllowed?'':'none';});
    const auditPage=document.getElementById('audit-page');
    if(auditPage&&!auditAllowed){
      auditPage.classList.remove('active');
      auditPage.setAttribute('aria-hidden','true');
    }else if(auditPage){
      auditPage.removeAttribute('aria-hidden');
    }
    document.documentElement.dataset.auditLogAccess=auditAllowed?'allowed':'denied';
    document.documentElement.dataset.accountLogAccess=canAccessRestrictedLogs()?'allowed':'denied';
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page="audit"]');
    if(!target||canAccessAuditLogs())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('Full Audit Log access is restricted to Founder / Co-Founder roles.');
  },true);

  window.AriaStaffAccess={currentStaffRole,canAccessRestrictedLogs,canAccessAuditLogs,enforceLogVisibility};
  enforceLogVisibility();
})();
