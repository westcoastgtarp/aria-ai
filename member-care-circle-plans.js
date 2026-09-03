(()=>{
  if(window.__ariaMemberCareCirclePlansLoaded)return;
  window.__ariaMemberCareCirclePlansLoaded=true;

  function ensurePlansSection(){
    const page=document.getElementById('carecircle-page');
    if(!page)return;

    let section=document.getElementById('memberCareCirclePlans');
    if(!section){
      section=document.createElement('section');
      section.id='memberCareCirclePlans';
      section.className='member-care-plans-section';
      section.innerHTML=`
        <div class="member-care-plans-head">
          <div>
            <div class="member-care-plans-kicker">PLANS & MEMBERSHIP</div>
            <h3>Care Circle & Lifeline plans</h3>
            <p>Care Circle is included with Aria Lifeline. Choose weekly or monthly billing after your learning period, or keep Aria Free for medication tracking and reminders.</p>
          </div>
          <div class="member-care-plans-trial">30-day Aria learning period</div>
        </div>

        <div class="member-care-plan-grid">
          <article class="member-care-plan-card free">
            <div class="member-care-plan-label">Aria Free</div>
            <div class="member-care-plan-price"><strong>$0</strong></div>
            <p class="member-care-plan-copy">Core medication tools for members who do not need Lifeline support features.</p>
            <div class="member-care-plan-features">
              <span>Medication tracking</span>
              <span>Scheduled reminders</span>
              <span>Dose checkoffs</span>
              <span class="not-included">Care Circle not included</span>
            </div>
          </article>

          <article class="member-care-plan-card lifeline weekly">
            <div class="member-care-plan-label">Aria Lifeline — Weekly</div>
            <div class="member-care-plan-price"><strong>$4.99</strong><span>/week</span></div>
            <p class="member-care-plan-copy">Full Lifeline support with flexible weekly billing.</p>
            <div class="member-care-plan-features">
              <span>Aria AI companion</span>
              <span>Care Circle</span>
              <span>Safety escalation tools</span>
              <span>Incident history</span>
              <span>Optional Lifeline-event location support</span>
            </div>
          </article>

          <article class="member-care-plan-card lifeline monthly">
            <div class="member-care-plan-label">Aria Lifeline — Monthly</div>
            <div class="member-care-plan-price"><strong>$19.99</strong><span>/month</span></div>
            <p class="member-care-plan-copy">The same Lifeline and Care Circle features with monthly billing.</p>
            <div class="member-care-plan-features">
              <span>Aria AI companion</span>
              <span>Care Circle</span>
              <span>Safety escalation tools</span>
              <span>Incident history</span>
              <span>Optional Lifeline-event location support</span>
            </div>
          </article>
        </div>

        <div class="member-care-plans-note"><strong>Member choice:</strong><span>Your learning period lets you explore Aria Lifeline before deciding which membership fits you. Plan selection does not change who is in your Care Circle or the permissions you give them.</span></div>`;
    }

    const dashboard=document.getElementById('careCircleDashboard');
    const intro=page.querySelector('.care-circle-intro-notice')||page.querySelector('.notice.info');
    const heading=page.querySelector('.section-heading');

    if(dashboard&&section.nextElementSibling!==dashboard){
      page.insertBefore(section,dashboard);
    }else if(!dashboard&&!section.isConnected){
      if(intro)intro.insertAdjacentElement('afterend',section);
      else if(heading)heading.insertAdjacentElement('afterend',section);
      else page.prepend(section);
    }
  }

  function openCareCirclePlans(){
    const nav=document.querySelector('.member-nav-item[data-page="carecircle"],.nav-item[data-page="carecircle"]');
    if(nav)nav.click();
    else if(typeof window.showPage==='function')window.showPage('carecircle');
    setTimeout(()=>document.getElementById('memberCareCirclePlans')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  }

  function ensureDashboardPreview(){
    const dashboard=document.getElementById('dashboard-page');
    if(!dashboard)return;

    const panels=[...dashboard.querySelectorAll('.member-panel')];
    const carePanel=panels.find(panel=>panel.querySelector('.member-panel-head h3')?.textContent.trim()==='Care Circle Status');
    if(!carePanel||carePanel.querySelector('.member-care-plan-preview'))return;

    const preview=document.createElement('div');
    preview.className='member-care-plan-preview';
    preview.innerHTML=`
      <div class="member-care-plan-preview-copy">
        <strong>Care Circle is included with Lifeline</strong>
        <span>$4.99/week or $19.99/month</span>
      </div>
      <button type="button">View plans</button>`;
    preview.querySelector('button')?.addEventListener('click',openCareCirclePlans);
    carePanel.appendChild(preview);
  }

  function sync(){
    ensurePlansSection();
    ensureDashboardPreview();
  }

  function boot(){
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    document.querySelectorAll('[data-page="carecircle"],#memberMessagesNav,#memberWellnessNav').forEach(node=>node.addEventListener('click',()=>setTimeout(sync,0)));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
