(()=>{
  if(window.__ariaLiveSupportHeaderLoaded)return;
  window.__ariaLiveSupportHeaderLoaded=true;

  function headerNodes(){
    const title=document.querySelector('.aria-bubble-title strong');
    const subtitle=document.querySelector('.aria-bubble-title span');
    return {title,subtitle};
  }

  function showAriaHeader(){
    const {title,subtitle}=headerNodes();
    if(title)title.textContent='Aria AI';
    if(subtitle)subtitle.textContent='Your health companion';
  }

  function showStaffHeader(firstName){
    const safe=String(firstName||'').trim();
    if(!safe){showAriaHeader();return;}
    const {title,subtitle}=headerNodes();
    if(title)title.textContent=`${safe} • Aria Support`;
    if(subtitle)subtitle.textContent='Here with you now';
  }

  async function refreshHeader(){
    try{
      const response=await fetch('/api/member/lifeline/support-status',{
        credentials:'same-origin',
        headers:{accept:'application/json'}
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)return;
      if(data.assigned&&data.displayName)showStaffHeader(data.displayName);
      else showAriaHeader();
    }catch(error){
      console.error('Live support header status failed',error);
    }
  }

  function loadMemberPortalRedesign(){
    if(document.querySelector('script[data-member-redesign]'))return;
    const script=document.createElement('script');
    script.src='member-portal-redesign.js?v=2';
    script.dataset.memberRedesign='true';
    script.defer=true;
    document.body.appendChild(script);
  }

  function loadCareCirclePlans(){
    if(!document.querySelector('link[data-member-care-plans]')){
      const style=document.createElement('link');
      style.rel='stylesheet';
      style.href='member-care-circle-plans.css?v=20260902-1';
      style.dataset.memberCarePlans='true';
      document.head.appendChild(style);
    }
    if(!document.querySelector('script[data-member-care-plans]')){
      const script=document.createElement('script');
      script.src='member-care-circle-plans.js?v=20260902-1';
      script.dataset.memberCarePlans='true';
      script.defer=true;
      document.body.appendChild(script);
    }
  }

  function boot(){
    showAriaHeader();
    refreshHeader();
    loadMemberPortalRedesign();
    loadCareCirclePlans();
    setInterval(refreshHeader,10000);
    document.getElementById('ariaChatLauncher')?.addEventListener('click',()=>setTimeout(refreshHeader,0));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
