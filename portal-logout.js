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
    const topbar=document.querySelector('.topbar');
    if(!topbar)return null;

    let actions=topbar.querySelector('.topbar-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='topbar-actions';
      topbar.appendChild(actions);
    }

    const theme=topbar.querySelector('.member-theme-control')||document.querySelector('.member-theme-control');
    const avatar=topbar.querySelector('.avatar');
    if(theme&&theme.parentElement!==actions)actions.appendChild(theme);
    if(avatar&&avatar.parentElement!==actions)actions.appendChild(avatar);

    return actions;
  }

  function createLogoutButton(staffTarget){
    const button=document.createElement('button');
    button.id='portalLogoutButton';
    button.type='button';
    button.textContent='Sign out';
    button.className=staffTarget?'portal-logout-btn':'ghost-btn portal-member-logout-btn';
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

    return button;
  }

  function addLogoutButton(){
    const staffTarget=document.querySelector('.staff-topbar');
    const target=staffTarget?ensureStaffActions(staffTarget):ensureMemberActions();
    if(!target)return;

    let button=document.getElementById('portalLogoutButton');
    if(!button)button=createLogoutButton(staffTarget);

    if(button.parentElement!==target){
      const avatar=!staffTarget?target.querySelector('.avatar'):null;
      if(avatar)target.insertBefore(button,avatar);
      else target.appendChild(button);
    }
  }

  let scheduled=false;
  function scheduleEnsure(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      addLogoutButton();
    });
  }

  function start(){
    addLogoutButton();
    const topbar=document.querySelector('.topbar')||document.querySelector('.staff-topbar');
    if(topbar){
      const observer=new MutationObserver(scheduleEnsure);
      observer.observe(topbar,{childList:true,subtree:true});
    }
    setTimeout(addLogoutButton,250);
    setTimeout(addLogoutButton,1000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
