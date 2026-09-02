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

  function ensureMemberActions(){
    let actions=document.querySelector('.topbar-actions');
    if(actions)return actions;

    const topbar=document.querySelector('.topbar');
    if(!topbar)return null;

    actions=document.createElement('div');
    actions.className='topbar-actions';

    const theme=document.querySelector('.member-theme-control');
    const avatar=[...topbar.children].find(node=>node!==actions&&node!==theme&&(/avatar|user|chip/i.test(String(node.className||''))||String(node.textContent||'').trim()==='DM'));
    if(theme&&theme.parentElement===topbar)actions.appendChild(theme);
    if(avatar&&avatar.parentElement===topbar)actions.appendChild(avatar);

    topbar.appendChild(actions);
    return actions;
  }

  function addLogoutButton(){
    const staffTarget=document.querySelector('.staff-topbar');
    const target=staffTarget?ensureStaffActions(staffTarget):ensureMemberActions();
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

      if(!staffTarget){
        try{
          await fetch('/api/member/conversations/close',{
            method:'POST',
            credentials:'same-origin',
            cache:'no-store',
            headers:{'content-type':'application/json'}
          });
        }catch(error){
          console.error('Member conversation close on logout failed',error);
        }
      }

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
