(function(){
  const ACCOUNT_LOG_ROLES=['founder / co-founder','founder','co-founder','system administrator','system admin'];
  const HISTORY_REVIEW_ROLES=['founder','lead supervisor'];
  const BREAK_GLASS_ROLES=['founder','lead supervisor','supervisor of live support','live support specialist'];
  const GLOBAL_ADMIN_ROLES=['founder / co-founder','founder','co-founder','system administrator','system admin'];

  function currentSession(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'null')||{};}catch{return {};}
  }

  function currentStaffRole(){
    const session=currentSession();
    return String(session.staffRole||session.title||session.name||'').trim();
  }

  function currentDepartment(){
    return String(currentSession().department||'').trim();
  }

  function roleKey(){return currentStaffRole().toLowerCase();}
  function departmentKey(){return currentDepartment().toLowerCase();}
  function isStaff(){return currentSession().role==='staff';}
  function isGlobalAdmin(){return isStaff()&&GLOBAL_ADMIN_ROLES.includes(roleKey());}
  function canAccessRestrictedLogs(){return isStaff()&&ACCOUNT_LOG_ROLES.includes(roleKey());}
  function canAccessHistoryReview(){return isStaff()&&HISTORY_REVIEW_ROLES.includes(roleKey());}
  function canAccessAuditLogs(){return canAccessHistoryReview();}
  function canUseBreakGlass(){return isStaff()&&BREAK_GLASS_ROLES.includes(roleKey());}

  function allowedPages(){
    if(isGlobalAdmin())return new Set(['dashboard','hiring','operations','ariachat','hr','it','engineering','admin','billing','security','audit','privacy','policies','breakglass']);

    const role=roleKey();
    const department=departmentKey();
    const pages=new Set(['dashboard','policies']);

    if(department==='hr'){
      pages.add('hr');
      pages.add('hiring');
    }

    if(department==='operations'){
      pages.add('operations');
      if(role.includes('hiring'))pages.add('hiring');
      if(role.includes('billing')||role.includes('finance'))pages.add('billing');
      if(role.includes('privacy')||role.includes('compliance'))pages.add('privacy');
    }

    if(department==='it'){
      pages.add('it');
      if(role.includes('security')||role.includes('access'))pages.add('security');
    }

    if(department==='engineering')pages.add('engineering');
    if(department==='finance'||role.includes('finance')||role.includes('billing'))pages.add('billing');
    if(department==='security'||role.includes('security'))pages.add('security');
    if(department.includes('privacy')||department.includes('compliance')||role.includes('privacy')||role.includes('compliance'))pages.add('privacy');

    if(canAccessHistoryReview()){
      pages.add('ariachat');
      pages.add('audit');
    }
    if(canUseBreakGlass())pages.add('breakglass');

    return pages;
  }

  function enforcePageVisibility(){
    const allowed=allowedPages();
    document.querySelectorAll('[data-page]').forEach(button=>{
      const page=String(button.dataset.page||'').toLowerCase();
      if(!page)return;
      button.style.display=allowed.has(page)?'':'none';
      button.setAttribute('aria-hidden',allowed.has(page)?'false':'true');
      if(!allowed.has(page))button.tabIndex=-1;
      else button.removeAttribute('tabindex');
    });

    document.querySelectorAll('.page[id$="-page"]').forEach(page=>{
      const name=String(page.id).replace(/-page$/,'').toLowerCase();
      if(allowed.has(name)){
        page.removeAttribute('aria-hidden');
        return;
      }
      page.classList.remove('active');
      page.setAttribute('aria-hidden','true');
    });

    const active=document.querySelector('.page.active[id$="-page"]');
    const activeName=active?String(active.id).replace(/-page$/,'').toLowerCase():'';
    if(activeName&&!allowed.has(activeName)&&typeof showPage==='function')showPage('dashboard');

    document.documentElement.dataset.staffAllowedPages=[...allowed].join(',');
  }

  function enforceLogVisibility(){
    const historyAllowed=canAccessHistoryReview();
    const breakGlassAllowed=canUseBreakGlass();
    document.querySelectorAll('[data-page="audit"]').forEach(button=>{button.style.display=historyAllowed?'':'none';});
    document.querySelectorAll('[data-page="ariachat"]').forEach(button=>{button.style.display=historyAllowed?'':'none';});
    document.querySelectorAll('[data-page="breakglass"]').forEach(button=>{button.style.display=breakGlassAllowed?'':'none';});

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

    const breakGlassPage=document.getElementById('breakglass-page');
    if(breakGlassPage&&!breakGlassAllowed){
      breakGlassPage.classList.remove('active');
      breakGlassPage.setAttribute('aria-hidden','true');
    }else if(breakGlassPage){
      breakGlassPage.removeAttribute('aria-hidden');
    }

    document.documentElement.dataset.auditLogAccess=historyAllowed?'allowed':'denied';
    document.documentElement.dataset.chatHistoryAccess=historyAllowed?'allowed':'denied';
    document.documentElement.dataset.accountLogAccess=canAccessRestrictedLogs()?'allowed':'denied';
    document.documentElement.dataset.breakGlassAccess=breakGlassAllowed?'allowed':'denied';
  }

  function enforceAll(){
    enforcePageVisibility();
    enforceLogVisibility();
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page]');
    if(!target)return;
    const requested=String(target.dataset.page||'').toLowerCase();
    if(allowedPages().has(requested))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('This staff area is not available for your assigned role and department.');
  },true);

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page="audit"],[data-page="ariachat"]');
    if(!target||canAccessHistoryReview())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('Full conversation and audit history is restricted to Founder and Lead Supervisor.');
  },true);

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-page="breakglass"]');
    if(!target||canUseBreakGlass())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(typeof showPage==='function')showPage('dashboard');
    alert('Break Glass emergency access is restricted to authorized Lifeline safety roles.');
  },true);

  window.AriaStaffAccess={currentStaffRole,currentDepartment,allowedPages,canAccessRestrictedLogs,canAccessAuditLogs,canAccessHistoryReview,canUseBreakGlass,enforceLogVisibility,enforcePageVisibility,enforceAll};
  enforceAll();
  const observer=new MutationObserver(enforceAll);
  observer.observe(document.body,{childList:true,subtree:true});
})();
