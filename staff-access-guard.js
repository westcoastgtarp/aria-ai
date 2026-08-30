(function(){
  const ACCOUNT_LOG_ROLES=['founder / co-founder','founder','co-founder','system administrator','system admin'];
  const HISTORY_REVIEW_ROLES=['founder','lead supervisor'];

  function currentSession(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'null')||{};}catch{return {};}
  }

  function currentStaffRole(){
    const session=currentSession();
    return String(session.staffRole||session.title||session.name||'').trim();
  }

  function isStaff(){return currentSession().role==='staff';}
  function canAccessRestrictedLogs(){return isStaff()&&ACCOUNT_LOG_ROLES.includes(currentStaffRole().toLowerCase());}
  function canAccessHistoryReview(){return isStaff()&&HISTORY_REVIEW_ROLES.includes(currentStaffRole().toLowerCase());}
  function canAccessAuditLogs(){return canAccessHistoryReview();}

  function enforceLogVisibility(){
    const historyAllowed=canAccessHistoryReview();
    document.querySelectorAll('[data-page="audit"]').forEach(button=>{button.style.display=historyAllowed?'':'none';});
    document.querySelectorAll('[data-page="ariachat"]').forEach(button=>{button.style.display=historyAllowed?'':'none';});

    const auditPage=document.getElementById('audit-page');
    if(auditPage&&!historyAllowed){
      auditPage.classList.remove('active');
      auditPage.setAttribute('aria-hidden','true');
    }else if(auditPage){
      auditPage.removeAttribute('aria-hidden');
    }

    const chatArchivePage=document.getElementById('ariachat-page');
    if(chatArchivePage&&!historyAllowed){
      chatArchivePage.classList.remove('active');
      chatArchivePage.setAttribute('aria-hidden','true');
    }else if(chatArchivePage){
      chatArchivePage.removeAttribute('aria-hidden');
    }

    document.documentElement.dataset.auditLogAccess=historyAllowed?'allowed':'denied';
    document.documentElement.dataset.chatHistoryAccess=historyAllowed?'allowed':'denied';
    document.documentElement.dataset.accountLogAccess=canAccessRestrictedLogs()?'allowed':'denied';
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page="audit"],[data-page="ariachat"]');
    if(!target||canAccessHistoryReview())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('Full conversation and audit history is restricted to Founder and Lead Supervisor.');
  },true);

  window.AriaStaffAccess={currentStaffRole,canAccessRestrictedLogs,canAccessAuditLogs,canAccessHistoryReview,enforceLogVisibility};
  enforceLogVisibility();
})();
