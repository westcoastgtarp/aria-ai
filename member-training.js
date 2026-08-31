(function(){
  const dashboard=document.getElementById('dashboard-page');
  if(!dashboard)return;

  if(!document.querySelector('link[data-aria-training-css]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/member-training.css?v=20260830-2';
    link.dataset.ariaTrainingCss='true';
    document.head.appendChild(link);
  }

  const KEY='aria-member-training-v1';
  let state={step:0,complete:false};
  try{state={...state,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{}

  const steps=[
    {
      title:'Start with your medication schedule',
      body:'Add and review the medications you enter yourself. Aria records your schedule and your own dose checkoffs; it does not prescribe, change doses, or silently mark anything taken.',
      action:'medications'
    },
    {
      title:'Learn your reminders',
      body:'Use Reminders to see what is scheduled for your day. If you do not check something off, Aria shows it as Not recorded rather than assuming what happened.',
      action:'reminders'
    },
    {
      title:'Build your Care Circle',
      body:'Add trusted people who have agreed to be approved contacts. Their direct calling option remains available even if Aria Assistant access later pauses.',
      action:'carecircle'
    },
    {
      title:'Meet Aria Assistant',
      body:'Ask Aria everyday questions, get help understanding app features, and use general educational support. Personalized medical decisions still belong with a qualified clinician or pharmacist.',
      action:'assistant'
    },
    {
      title:'Understand Lifeline',
      body:'Lifeline is the separate safety layer that watches for serious distress signals and can surface Care Circle or emergency calling options. Aria does not claim emergency services were contacted unless you actually call them.',
      action:'lifeline'
    }
  ];

  function save(){localStorage.setItem(KEY,JSON.stringify(state));}

  function goTo(action){
    if(action==='assistant'){
      document.getElementById('ariaChatLauncher')?.click();
      return;
    }
    if(action==='lifeline'){
      document.getElementById('ariaChatLauncher')?.click();
      return;
    }
    document.querySelector(`[data-page="${action}"]`)?.click();
  }

  function membershipCard(){
    return `
      <section class="aria-membership-intro" id="ariaMembershipIntro">
        <div class="eyebrow">WHEN YOU'RE READY</div>
        <h3>Continue with Aria Lifeline</h3>
        <p>You have time to learn Aria during your 30-day Assistant trial. Membership is introduced here after training so you can decide after seeing how the experience works.</p>
        <div class="aria-membership-options">
          <div class="aria-membership-option"><strong>Weekly</strong><span class="aria-membership-price">$4.99</span><span>per week • Aria Assistant, Care Circle, Lifeline safety features, incident history, and supported escalation tools.</span></div>
          <div class="aria-membership-option"><strong>Monthly</strong><span class="aria-membership-price">$19.99</span><span>per month • Same Lifeline membership features with monthly billing instead of yearly billing.</span></div>
        </div>
        <p class="aria-membership-note">Billing is not connected yet. This section introduces the membership without forcing a purchase or interrupting the member experience.</p>
      </section>`;
  }

  function render(){
    document.getElementById('ariaTrainingCard')?.remove();
    document.getElementById('ariaMembershipIntro')?.remove();

    const anchor=document.getElementById('ariaTrialStatus')||dashboard.firstElementChild;
    if(state.complete){
      const wrapper=document.createElement('div');
      wrapper.innerHTML=membershipCard();
      dashboard.insertBefore(wrapper.firstElementChild,anchor?.nextSibling||dashboard.firstChild);
      return;
    }

    const step=Math.max(0,Math.min(Number(state.step)||0,steps.length-1));
    const item=steps[step];
    const card=document.createElement('section');
    card.className='aria-training-card';
    card.id='ariaTrainingCard';
    card.innerHTML=`
      <div class="aria-training-head">
        <div><div class="eyebrow">GET COMFORTABLE WITH ARIA</div><h3>Your Aria training</h3><p>Take a quick guided tour before we introduce membership options.</p></div>
        <span class="aria-training-complete">Step ${step+1} of ${steps.length}</span>
      </div>
      <div class="aria-training-progress">${steps.map((_,i)=>`<span class="${i<=step?'active':''}"></span>`).join('')}</div>
      <div class="aria-training-step"><strong>${item.title}</strong><p>${item.body}</p></div>
      <div class="aria-training-actions">
        <button class="aria-training-skip" type="button" id="ariaTrainingLater">Do this later</button>
        <div class="right">
          <button class="outline" type="button" id="ariaTrainingTry">Show me</button>
          <button class="primary" type="button" id="ariaTrainingNext">${step===steps.length-1?'Finish training':'Next'}</button>
        </div>
      </div>`;
    dashboard.insertBefore(card,anchor?.nextSibling||dashboard.firstChild);

    document.getElementById('ariaTrainingTry')?.addEventListener('click',()=>goTo(item.action));
    document.getElementById('ariaTrainingLater')?.addEventListener('click',()=>card.remove());
    document.getElementById('ariaTrainingNext')?.addEventListener('click',()=>{
      if(step>=steps.length-1){state.complete=true;state.step=steps.length;}
      else state.step=step+1;
      save();
      render();
    });
  }

  render();
})();
