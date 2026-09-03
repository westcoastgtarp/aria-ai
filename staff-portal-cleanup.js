(()=>{
  if(window.__ariaStaffPortalCleanupLoaded)return;
  window.__ariaStaffPortalCleanupLoaded=true;

  function pageTitleFor(page){
    const map={
      dashboard:'Staff Dashboard',hiring:'Hiring & Department Assignment',operations:'Operations Work Queue',ariachat:'Aria Chat Archive',hr:'Human Resources',it:'IT Technical Tickets',engineering:'Engineering Technical Tickets',admin:'System Administration',privacy:'Privacy & Compliance',audit:'Audit Log',billing:'Billing / Finance',security:'Security & Access',policies:'System Policies'
    };
    return map[page]||'Staff Dashboard';
  }

  function currentPage(){
    const active=document.querySelector('.page.active');
    return active?.id?.replace(/-page$/,'')||'dashboard';
  }

  function updateClock(){
    const now=new Date();
    const date=document.getElementById('staffHeaderDate');
    const time=document.getElementById('staffHeaderTime');
    if(date)date.textContent=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(now);
    if(time)time.textContent=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(now);
  }

  function removeLegacyThemeControl(){
    document.querySelectorAll('.staff-theme-control').forEach(control=>control.remove());
    document.body.dataset.staffTheme='night';
    try{localStorage.setItem('aria-staff-theme','night');}catch{}
  }

  function normalizeHeader(){
    const topbar=document.querySelector('.staff-topbar');
    if(!topbar)return;

    const identity=topbar.querySelector(':scope > div:not(.staff-topbar-actions)');
    if(identity){
      const eyebrow=identity.querySelector('.eyebrow');
      const title=identity.querySelector('#pageTitle');
      if(eyebrow)eyebrow.textContent='STAFF OPERATIONS';
      if(title&&!title.textContent.trim())title.textContent=pageTitleFor(currentPage());
    }

    let actions=topbar.querySelector('.staff-topbar-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='staff-topbar-actions';
      const chip=topbar.querySelector('.user-chip');
      if(chip)actions.appendChild(chip);
      topbar.appendChild(actions);
    }

    removeLegacyThemeControl();

    if(!actions.querySelector('.staff-header-clock')){
      const clock=document.createElement('div');
      clock.className='staff-header-clock';
      clock.innerHTML='<span id="staffHeaderDate"></span><strong id="staffHeaderTime"></strong>';
      actions.prepend(clock);
    }

    const logout=document.getElementById('portalLogoutButton');
    if(logout&&logout.parentElement!==actions)actions.appendChild(logout);
    updateClock();
  }

  function removeDuplicateDynamicViews(){
    const keepFirst=(selector)=>{
      const nodes=[...document.querySelectorAll(selector)];
      nodes.slice(1).forEach(node=>node.remove());
    };
    keepFirst('#liveSupportWorkspace');
    keepFirst('.staff-topbar');
    keepFirst('#operationsSummary');
    keepFirst('#operationsQueue');
    keepFirst('#ariaChatSummary');
    keepFirst('#ariaChatQueue');

    document.querySelectorAll('.page').forEach(page=>{
      const seen=new Set();
      page.querySelectorAll('[id]').forEach(node=>{
        const id=node.id;
        if(!id)return;
        if(seen.has(id))node.remove();
        else seen.add(id);
      });
    });
  }

  function normalizeNavigation(){
    document.querySelectorAll('[data-page]').forEach(button=>{
      if(button.dataset.staffCleanupBound==='true')return;
      button.dataset.staffCleanupBound='true';
      button.addEventListener('click',()=>{
        const page=button.dataset.page;
        queueMicrotask(()=>{
          const title=document.getElementById('pageTitle');
          if(title)title.textContent=pageTitleFor(page);
          removeDuplicateDynamicViews();
          normalizeHeader();
        });
      });
    });
  }

  function removeWhiteInlineSurfaces(){
    document.querySelectorAll('[style]').forEach(node=>{
      const style=node.getAttribute('style')||'';
      if(/background\s*:\s*(#fff|white|#ffffff)/i.test(style)){
        node.style.removeProperty('background');
        node.style.removeProperty('background-color');
      }
      if(/color\s*:\s*(#1[0-9a-f]{5}|#2[0-9a-f]{5}|black)/i.test(style)&&node.closest('.staff-main')){
        node.style.removeProperty('color');
      }
    });
  }

  function boot(){
    document.body.classList.add('staff-cleanup');
    removeLegacyThemeControl();
    normalizeHeader();
    normalizeNavigation();
    removeDuplicateDynamicViews();
    removeWhiteInlineSurfaces();

    const observer=new MutationObserver(()=>{
      removeLegacyThemeControl();
      removeDuplicateDynamicViews();
      normalizeHeader();
      normalizeNavigation();
      removeWhiteInlineSurfaces();
    });
    observer.observe(document.body,{childList:true,subtree:true});
    setInterval(updateClock,30000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
