(()=>{
  if(window.__ariaStaffThemeLoaded)return;
  window.__ariaStaffThemeLoaded=true;
  const KEY='aria-staff-theme';
  const THEMES=['light','dark','night'];

  function savedTheme(){
    try{
      const value=localStorage.getItem(KEY);
      return THEMES.includes(value)?value:'light';
    }catch{return 'light';}
  }

  function apply(theme){
    const next=THEMES.includes(theme)?theme:'light';
    document.body.dataset.staffTheme=next;
    try{localStorage.setItem(KEY,next);}catch{}
    document.querySelectorAll('.staff-theme-control button').forEach(button=>{
      const active=button.dataset.theme===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function mount(){
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

  apply(savedTheme());
  if(!mount()){
    const timer=setInterval(()=>{if(mount())clearInterval(timer);},100);
    setTimeout(()=>clearInterval(timer),10000);
  }
})();
