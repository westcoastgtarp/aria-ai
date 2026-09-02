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
    brand.innerHTML='<img src="/aria-member-brand.svg?v=20260902-1" alt="Aria AI Member Portal" class="aria-sidebar-brand-image" style="display:block;width:100%;max-width:210px;height:auto;background:transparent;border:0;border-radius:0;box-shadow:none;mix-blend-mode:screen;filter:saturate(1.08) contrast(1.06);" />';
    brand.style.display='block';
    brand.style.padding='0';
    brand.style.margin='0 0 18px';
    brand.style.background='transparent';
    brand.style.border='0';
    brand.style.boxShadow='none';
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
