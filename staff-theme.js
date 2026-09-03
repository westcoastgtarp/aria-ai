(()=>{
  if(window.__ariaStaffThemeLoaded)return;
  window.__ariaStaffThemeLoaded=true;

  function mountBrand(){
    const brand=document.querySelector('.staff-sidebar .brand-block');
    if(!brand)return;
    brand.innerHTML='<img src="/aria-lifeline-login.png?v=8" alt="Aria Ai Lifeline" class="aria-sidebar-brand-image" />';
  }

  function loadStylesheet(selector,href,key){
    if(document.querySelector(selector))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.dataset[key]='true';document.head.appendChild(link);
  }

  function loadScript(selector,src,key){
    if(document.querySelector(selector))return;
    const script=document.createElement('script');
    script.src=src;script.dataset[key]='true';document.body.appendChild(script);
  }

  function loadStaffLayout(){
    document.body.dataset.staffTheme='night';
    try{localStorage.setItem('aria-staff-theme','night');}catch{}
    document.querySelectorAll('.staff-theme-control').forEach(node=>node.remove());
    mountBrand();

    loadStylesheet('link[data-staff-cleanup]','staff-portal-cleanup.css?v=20260902-2','staffCleanup');
    loadStylesheet('link[data-break-glass]','break-glass.css?v=20260902-1','breakGlass');
    loadScript('script[data-staff-cleanup]','staff-portal-cleanup.js?v=20260902-2','staffCleanup');
    loadScript('script[data-break-glass]','break-glass-ui.js?v=20260902-1','breakGlass');
    loadScript('script[data-qa-test-helper]','staff-qa-test-helper.js?v=20260902-1','qaTestHelper');
    loadScript('script[data-header-signout-cleanup]','staff-header-signout-cleanup.js?v=20260902-1','headerSignoutCleanup');
    loadScript('script[data-closed-chat-escalation-cleanup]','closed-chat-escalation-cleanup.js?v=20260902-1','closedChatEscalationCleanup');
  }

  loadStaffLayout();
})();