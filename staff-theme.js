(()=>{
  if(window.__ariaStaffThemeLoaded)return;
  window.__ariaStaffThemeLoaded=true;
  const KEY='aria-staff-theme';
  const THEMES=['light','dark','night'];

  function savedTheme(){
    try{
      const value=localStorage.getItem(KEY);
      return THEMES.includes(value)?value:'night';
    }catch{return 'night';}
  }

  function mountBrand(){
    const brand=document.querySelector('.staff-sidebar .brand-block');
    if(!brand||brand.dataset.ariaBrandMounted==='true')return;
    brand.dataset.ariaBrandMounted='true';
    brand.innerHTML='<img src="/aria-staff-brand-transparent.png?v=20260902-2" alt="Aria AI Staff Operations" class="aria-sidebar-brand-image" style="display:block;width:100%;max-width:220px;height:auto;background:transparent;border:0;border-radius:0;box-shadow:none;" />';
    brand.style.display='block';
    brand.style.padding='0';
    brand.style.margin='0 0 18px';
    brand.style.background='transparent';
    brand.style.border='0';
    brand.style.boxShadow='none';
  }

  function apply(theme){
    const next=THEMES.includes(theme)?theme:'night';
    document.body.dataset.staffTheme=next;
    try{localStorage.setItem(KEY,next);}catch{}
    mountBrand();
    document.querySelectorAll('.staff-theme-control button').forEach(button=>{
      const active=button.dataset.theme===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function mount(){
    mountBrand();
    const actions=document.querySelector('.staff-topbar-actions');
    if(!actions)return false;
    if(actions.querySelector('.staff-theme-control')){apply(savedTheme());return true;}

    const control=document.createElement('div');
    control.className='staff-theme-control';
    control.setAttribute('role','group');
    control.setAttribute('aria-label','Display mode');
    control.innerHTML=THEMES.map(theme=>`<button type="button" data-theme="${theme}" aria-pressed="false">${theme[0].toUpperCase()+theme.slice(1)}</button>`).join('');
    control.addEventListener('click',event=>{
      const button=event.target.closest('button[data-theme]');
      if(button)apply(button.dataset.theme);
    });
    actions.prepend(control);
    apply(savedTheme());
    return true;
  }

  function loadStaffCleanup(){
    if(!document.querySelector('link[data-staff-cleanup]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='staff-portal-cleanup.css?v=20260902-1';
      link.dataset.staffCleanup='true';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-staff-cleanup]')){
      const script=document.createElement('script');
      script.src='staff-portal-cleanup.js?v=20260902-1';
      script.dataset.staffCleanup='true';
      document.body.appendChild(script);
    }
  }

  apply(savedTheme());
  if(!mount()){
    const timer=setInterval(()=>{if(mount())clearInterval(timer);},100);
    setTimeout(()=>clearInterval(timer),10000);
  }
  loadStaffCleanup();
})();
