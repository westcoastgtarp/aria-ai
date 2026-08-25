(function(){
  const launcher=document.getElementById('ariaChatLauncher');
  if(!launcher)return;

  let entitlementState=null;

  function loadScript(src,key){
    if(document.querySelector(`script[data-${key}]`))return;
    const script=document.createElement('script');
    script.src=src;
    script.dataset[key]='true';
    document.body.appendChild(script);
  }

  function loadMemberExperience(){
    loadScript('/care-circle-live.js?v=20260824-1','careCircleLive');
    loadScript('/member-assistant-live.js?v=20260825-1','memberAssistantLive');
    loadScript('/member-training.js?v=20260825-1','memberTraining');
  }

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function formatDate(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(date);
  }

  function ensureStatusBanner(){
    let banner=document.getElementById('ariaTrialStatus');
    if(banner)return banner;
    const dashboard=document.getElementById('dashboard-page');
    if(!dashboard)return null;
    banner=document.createElement('div');
    banner.id='ariaTrialStatus';
    banner.className='notice info';
    banner.style.marginBottom='16px';
    dashboard.prepend(banner);
    return banner;
  }

  function showExpiredModal(){
    const body=document.getElementById('modalBody');
    const backdrop=document.getElementById('modalBackdrop');
    if(!body||!backdrop)return;
    body.innerHTML=`
      <div class="eyebrow">ARIA ASSISTANT</div>
      <h2 id="modalTitle">Aria Assistant is paused</h2>
      <p>Your 30-day Assistant trial has ended. Medication tracking, reminders, and dose records stay available.</p>
      <div class="notice info"><strong>Still available:</strong> you can contact people you approved in Care Circle directly. Emergency calling from your own device is never blocked by membership status.</div>
      <div class="aria-form-actions">
        <button class="primary" type="button" id="trialOpenContacts">Open Care Circle</button>
        <a class="secondary" href="tel:911" style="text-decoration:none;display:inline-flex;align-items:center">Call 911</a>
      </div>
      <p class="small muted">Membership options are shown inside the member dashboard after the Aria training experience. Aria does not automatically interrupt you with a purchase prompt.</p>`;
    backdrop.classList.remove('hidden');
    document.getElementById('trialOpenContacts')?.addEventListener('click',()=>{
      backdrop.classList.add('hidden');
      document.querySelector('[data-page="carecircle"]')?.click();
    });
  }

  function applyState(data){
    entitlementState=data;
    const banner=ensureStatusBanner();
    if(!banner)return;

    if(data.mode==='lifeline'){
      banner.innerHTML='<strong>Aria Lifeline active.</strong> Your Assistant and Lifeline features are available with your active membership.';
      launcher.removeAttribute('data-trial-locked');
      launcher.setAttribute('aria-label','Open Aria Assistant');
      return;
    }

    if(data.trial?.active){
      const days=Number(data.trial.daysRemaining)||0;
      const ending=formatDate(data.trial.endsAt);
      banner.innerHTML=`<strong>30-day Aria learning period:</strong> ${escapeHtml(days)} day${days===1?'':'s'} remaining${ending?` • Ends ${escapeHtml(ending)}`:''}. Use the guided training to learn medication tools, reminders, Care Circle, Aria Assistant, and Lifeline before deciding on membership.`;
      launcher.removeAttribute('data-trial-locked');
      launcher.setAttribute('aria-label','Open Aria Assistant — trial active');
      return;
    }

    banner.innerHTML='<strong>Aria Free:</strong> medication tracking and reminders remain available, and you can still contact approved Care Circle contacts directly.';
    launcher.dataset.trialLocked='true';
    launcher.setAttribute('aria-label','Aria Assistant paused — approved Care Circle contacts remain available');
    const panel=document.getElementById('ariaBubblePanel');
    if(panel)panel.hidden=true;
  }

  async function loadEntitlements(){
    try{
      const response=await fetch('/api/member/entitlements',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load membership status.');
      applyState(data);
    }catch(error){
      console.error('Member entitlements unavailable',error);
    }finally{
      loadMemberExperience();
    }
  }

  launcher.addEventListener('click',event=>{
    if(entitlementState?.entitlements?.ariaAssistant!==false)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showExpiredModal();
  },true);

  document.getElementById('ariaBubbleSend')?.addEventListener('click',event=>{
    if(entitlementState?.entitlements?.ariaAssistant!==false)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showExpiredModal();
  },true);

  document.getElementById('ariaBubbleInput')?.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||entitlementState?.entitlements?.ariaAssistant!==false)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showExpiredModal();
  },true);

  loadEntitlements();
})();
