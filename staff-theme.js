(()=>{
  if(window.__ariaStaffThemeLoaded)return;
  window.__ariaStaffThemeLoaded=true;

  function mountBrand(){
    const brand=document.querySelector('.staff-sidebar .brand-block');
    if(!brand)return;
    brand.innerHTML='<img src="/aria-lifeline-login.png?v=8" alt="Aria Ai Lifeline" class="aria-sidebar-brand-image" />';
  }

  function loadStaffLayout(){
    document.body.dataset.staffTheme='night';
    try{localStorage.setItem('aria-staff-theme','night');}catch{}
    document.querySelectorAll('.staff-theme-control').forEach(node=>node.remove());
    mountBrand();

    if(!document.querySelector('link[data-staff-cleanup]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='staff-portal-cleanup.css?v=20260902-2';
      link.dataset.staffCleanup='true';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-staff-cleanup]')){
      const script=document.createElement('script');
      script.src='staff-portal-cleanup.js?v=20260902-2';
      script.dataset.staffCleanup='true';
      document.body.appendChild(script);
    }
  }

  loadStaffLayout();
})();
