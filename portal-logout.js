(function(){
  function ensureStaffActions(staffTarget){
    let actions=staffTarget?.querySelector('.staff-topbar-actions');
    if(actions)return actions;
    if(!staffTarget)return null;

    actions=document.createElement('div');
    actions.className='staff-topbar-actions';

    const chip=staffTarget.querySelector('.user-chip');
    if(chip)actions.appendChild(chip);
    staffTarget.appendChild(actions);
    return actions;
  }

  function addLogoutButton(){
    const staffTarget=document.querySelector('.staff-topbar');
    const memberTarget=document.querySelector('.topbar-actions');
    const target=staffTarget?ensureStaffActions(staffTarget):memberTarget;
    if(!target||document.getElementById('portalLogoutButton'))return;

    const button=document.createElement('button');
    button.id='portalLogoutButton';
    button.type='button';
    button.textContent='Sign out';
    button.className=staffTarget?'portal-logout-btn':'ghost-btn';
    button.setAttribute('aria-label','Sign out of Aria');

    button.addEventListener('click',async()=>{
      if(button.disabled)return;
      button.disabled=true;
      button.textContent='Signing out…';
      try{
        await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});
      }catch{}
      sessionStorage.removeItem('aria-auth-session');
      sessionStorage.removeItem('aria-member-name');
      window.location.replace('login.html');
    });

    target.appendChild(button);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLogoutButton);
  else addLogoutButton();
})();
