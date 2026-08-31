(()=>{
  if(window.__ariaMemberNavigationState)return;
  window.__ariaMemberNavigationState=true;

  const validPages=new Set(['dashboard','medications','reminders','carecircle','incidents','privacy']);

  function ensureIncidentHistory(){
    if(document.querySelector('script[data-member-incident-history]'))return;
    const script=document.createElement('script');
    script.src='/member-incident-history.js?v=20260830-1';
    script.dataset.memberIncidentHistory='true';
    document.body.appendChild(script);
  }

  function pageFromHash(){
    const page=String(location.hash||'').replace(/^#/,'').trim();
    return validPages.has(page)?page:null;
  }

  function currentPage(){
    const active=document.querySelector('.page.active[id$="-page"]');
    if(!active)return null;
    const page=active.id.replace(/-page$/,'');
    return validPages.has(page)?page:null;
  }

  function remember(page){
    if(!validPages.has(page))return;
    const next=`#${page}`;
    if(location.hash!==next)history.replaceState(null,'',next);
  }

  function openPage(page){
    if(!validPages.has(page))return;
    if(typeof window.showPage==='function'){
      window.showPage(page);
    }else{
      document.querySelector(`[data-page="${page}"]`)?.click();
    }
    remember(page);
    if(page==='incidents')ensureIncidentHistory();
  }

  const oneTime=sessionStorage.getItem('aria-return-page');
  if(oneTime)sessionStorage.removeItem('aria-return-page');

  const requested=validPages.has(oneTime)?oneTime:pageFromHash();
  if(requested)openPage(requested);
  else remember(currentPage()||'dashboard');

  document.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-page]');
    if(!control)return;
    const page=control.dataset.page;
    if(validPages.has(page))remember(page);
    if(page==='incidents')ensureIncidentHistory();
  });

  window.addEventListener('hashchange',()=>{
    const page=pageFromHash();
    if(page&&page!==currentPage())openPage(page);
  });

  ensureIncidentHistory();
})();
