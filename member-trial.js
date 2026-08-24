(function(){
  const launcher=document.getElementById('ariaChatLauncher');
  if(!launcher)return;

  let entitlementState=null;

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
      <h2 id="modalTitle">Your 30-day trial has ended</h2>
      <p>Your medication tracking, reminders, and dose records stay available. Aria Assistant and the enhanced Lifeline conversation features are paused until Lifeline membership is active.</p>
      <div class="notice info"><strong>Still available:</strong> you can contact people you approved in Care Circle directly. Emergency calling from your own device is never blocked by a membership status.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        <button class="primary" type="button" id="trialOpenContacts">Contact approved contacts</button>
        <a class="ghost-btn" href="tel:911" style="text-decoration:none;display:inline-flex;align-items:center">Call 911</a>
      </div>
      <p class="small muted" style="margin-top:14px">Your approved Care Circle list is saved to your Aria account and remains available after the Assistant trial ends.</p>`;
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
      banner.innerHTML=`<strong>Aria Assistant trial:</strong> ${escapeHtml(days)} day${days===1?'':'s'} remaining${ending?` • Ends ${escapeHtml(ending)}`:''}. Explore Assistant, medication support, Care Circle, and Lifeline features during your 30-day trial.`;
      launcher.removeAttribute('data-trial-locked');
      launcher.setAttribute('aria-label','Open Aria Assistant — trial active');
      return;
    }

    banner.innerHTML='<strong>Aria Free:</strong> your 30-day Aria Assistant trial has ended. Medication tracking and reminders remain available, and you can still contact approved Care Circle contacts directly.';
    launcher.dataset.trialLocked='true';
    launcher.setAttribute('aria-label','Aria Assistant trial ended — contact approved Care Circle contacts');
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
