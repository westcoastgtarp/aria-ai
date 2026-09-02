(()=>{
  if(window.__ariaMemberThemeLoaded)return;
  window.__ariaMemberThemeLoaded=true;
  const KEY='aria-member-theme';
  const VALID=new Set(['light','dark','night']);
  const saved=localStorage.getItem(KEY);
  const initial=VALID.has(saved)?saved:'light';

  function mountBrand(){
    const brand=document.querySelector('.sidebar .brand');
    if(!brand||brand.dataset.ariaBrandMounted==='true')return;
    brand.dataset.ariaBrandMounted='true';
    brand.innerHTML='<img src="/aria-member-brand.svg?v=20260901-1" alt="Aria AI Member Portal" style="display:block;width:100%;max-width:210px;height:auto;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.28),0 0 22px rgba(44,113,255,.14);" />';
    brand.style.display='block';
    brand.style.padding='0';
    brand.style.margin='0 0 18px';
  }

  function ensureControl(){
    const actions=document.querySelector('.topbar-actions');
    if(!actions)return null;
    let control=actions.querySelector('.member-theme-control');
    if(control)return control;
    control=document.createElement('div');
    control.className='member-theme-control';
    control.setAttribute('aria-label','Display mode');
    control.innerHTML='<button type="button" data-member-theme-choice="light">Light</button><button type="button" data-member-theme-choice="dark">Dark</button><button type="button" data-member-theme-choice="night">Night</button>';
    actions.prepend(control);
    control.addEventListener('click',event=>{
      const button=event.target.closest('[data-member-theme-choice]');
      if(!button)return;
      apply(button.dataset.memberThemeChoice,true);
    });
    return control;
  }

  function apply(theme,persist=false){
    const next=VALID.has(theme)?theme:'light';
    document.body.dataset.memberTheme=next;
    document.documentElement.style.colorScheme=next==='light'?'light':'dark';
    if(persist)localStorage.setItem(KEY,next);
    mountBrand();
    const control=ensureControl();
    control?.querySelectorAll('[data-member-theme-choice]').forEach(button=>{
      const active=button.dataset.memberThemeChoice===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  apply(initial,false);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(initial,false),{once:true});
})();
