(function(){
  function addLogoutButton(){
    const staffTarget=document.querySelector('.staff-topbar');
    const memberTarget=document.querySelector('.topbar-actions');
    const target=staffTarget||memberTarget;
    if(!target||document.getElementById('portalLogoutButton'))return;

    const button=document.createElement('button');
    button.id='portalLogoutButton';
    button.type='button';
    button.textContent='Log out';
    button.className=staffTarget?'secondary':'ghost-btn';

    button.addEventListener('click',async()=>{
      button.disabled=true;
      const original=button.textContent;
      button.textContent='Logging out…';
      try{
        await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
      }catch{}
      sessionStorage.removeItem('aria-auth-session');
      sessionStorage.removeItem('aria-member-name');
      window.location.href='login.html';
      setTimeout(()=>{button.disabled=false;button.textContent=original;},1500);
    });

    target.appendChild(button);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLogoutButton);
  else addLogoutButton();
})();
