(()=>{
  if(window.__ariaMemberPortalRedesignLoaded)return;
  window.__ariaMemberPortalRedesignLoaded=true;

  const iconMap={
    dashboard:'⌂',medications:'◒',reminders:'♢',carecircle:'♧',messages:'◌',wellness:'♡',incidents:'▥',privacy:'▣',settings:'⚙'
  };

  function memberName(){
    return sessionStorage.getItem('aria-member-name')||'Demo Member';
  }

  function firstName(){
    return memberName().trim().split(/\s+/)[0]||'Member';
  }

  function initials(){
    return memberName().split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'DM';
  }

  function pageCopy(page){
    const map={
      dashboard:{welcome:`Welcome back, ${firstName()} 👋`,title:'Aria Ai Lifeline — Member Portal',tag:'Your health. Your routine. Our support.'},
      medications:{welcome:'Member Portal',title:'Medications',tag:'Review your schedule and record each dose yourself.'},
      reminders:{welcome:'Member Portal',title:'Reminders',tag:'Keep your medication and care reminders in one place.'},
      carecircle:{welcome:'Member Portal',title:'Care Circle',tag:'Trusted people you choose to include in your support network.'},
      incidents:{welcome:'Member Portal',title:'Reports',tag:'Review your account activity and Lifeline event history.'},
      privacy:{welcome:'Member Portal',title:'Resources & Settings',tag:'Privacy, security, and account information.'}
    };
    return map[page]||map.dashboard;
  }

  function updateHeader(page='dashboard'){
    const copy=pageCopy(page);
    const welcome=document.getElementById('memberWelcome');
    const title=document.getElementById('pageTitle');
    const tag=document.getElementById('memberHeaderTagline');
    if(welcome)welcome.textContent=copy.welcome;
    if(title)title.textContent=copy.title;
    if(tag)tag.textContent=copy.tag;
  }

  function buildSidebar(){
    const sidebar=document.querySelector('.sidebar');
    if(!sidebar)return;
    sidebar.innerHTML=`
      <div class="member-sidebar-inner">
        <div class="member-sidebar-logo"><img src="./aria-lifeline-login.png?v=7" alt="Aria Ai Lifeline" /></div>
        <nav class="member-nav" aria-label="Member portal navigation">
          <button class="nav-item member-nav-item active" data-page="dashboard"><span class="member-nav-icon">${iconMap.dashboard}</span><span>Dashboard</span></button>
          <button class="nav-item member-nav-item" data-page="medications"><span class="member-nav-icon">${iconMap.medications}</span><span>Medications</span></button>
          <button class="nav-item member-nav-item" data-page="reminders"><span class="member-nav-icon">${iconMap.reminders}</span><span>Reminders</span></button>
          <button class="nav-item member-nav-item" data-page="carecircle"><span class="member-nav-icon">${iconMap.carecircle}</span><span>Care Circle</span></button>
          <button class="member-nav-item" id="memberMessagesNav"><span class="member-nav-icon">${iconMap.messages}</span><span>Messages</span><span class="member-nav-badge">3</span></button>
          <button class="member-nav-item" id="memberWellnessNav"><span class="member-nav-icon">${iconMap.wellness}</span><span>Wellness Check-in</span></button>
          <button class="nav-item member-nav-item" data-page="incidents"><span class="member-nav-icon">${iconMap.incidents}</span><span>Reports</span></button>
          <button class="nav-item member-nav-item" data-page="privacy"><span class="member-nav-icon">${iconMap.privacy}</span><span>Resources</span></button>
          <button class="nav-item member-nav-item" data-page="privacy"><span class="member-nav-icon">${iconMap.settings}</span><span>Settings</span></button>
        </nav>
        <div class="member-profile-card">
          <div class="member-profile-row">
            <div class="member-profile-avatar">${initials()}</div>
            <div class="member-profile-copy"><strong>${memberName()}</strong><span>Lifeline member</span></div>
            <span aria-hidden="true">⌄</span>
          </div>
          <button class="member-logout-proxy" id="memberLogoutProxy" type="button">↻ &nbsp; Log Out</button>
        </div>
      </div>`;

    sidebar.querySelectorAll('[data-page]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const page=btn.dataset.page;
        if(typeof window.showPage==='function')window.showPage(page);
        updateHeader(page);
        sidebar.querySelectorAll('.member-nav-item').forEach(n=>n.classList.toggle('active',n===btn));
      });
    });

    document.getElementById('memberMessagesNav')?.addEventListener('click',()=>{
      document.getElementById('ariaChatLauncher')?.click();
      sidebar.classList.remove('open');
    });
    document.getElementById('memberWellnessNav')?.addEventListener('click',()=>{
      if(typeof window.showPage==='function')window.showPage('dashboard');
      updateHeader('dashboard');
      setTimeout(()=>document.getElementById('memberWellnessCard')?.scrollIntoView({behavior:'smooth',block:'center'}),50);
      sidebar.classList.remove('open');
    });
    document.getElementById('memberLogoutProxy')?.addEventListener('click',()=>document.getElementById('portalLogoutButton')?.click());
  }

  function buildHeader(){
    const topbar=document.querySelector('.topbar');
    if(!topbar)return;
    const menu=document.getElementById('mobileMenu');
    const reset=document.getElementById('demoReset');
    const logout=document.getElementById('portalLogoutButton');
    const avatar=topbar.querySelector('.avatar');

    const copy=document.createElement('div');
    copy.className='member-header-copy';
    copy.innerHTML=`<div class="member-welcome" id="memberWelcome"></div><h1 id="pageTitle"></h1><p class="member-header-tagline" id="memberHeaderTagline"></p>`;

    const actions=document.createElement('div');
    actions.className='topbar-actions';
    actions.innerHTML=`<button class="member-bell" type="button" aria-label="Notifications">♧</button><div class="member-clock"><span id="memberDate"></span><strong id="memberTime"></strong></div>`;

    topbar.replaceChildren();
    if(menu)topbar.appendChild(menu);
    topbar.appendChild(copy);
    topbar.appendChild(actions);
    if(reset)topbar.appendChild(reset);
    if(logout)topbar.appendChild(logout);
    if(avatar)topbar.appendChild(avatar);
    updateHeader('dashboard');
    updateClock();
  }

  function updateClock(){
    const now=new Date();
    const date=document.getElementById('memberDate');
    const time=document.getElementById('memberTime');
    if(date)date.textContent=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(now);
    if(time)time.textContent=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(now);
  }

  function buildDashboard(){
    const page=document.getElementById('dashboard-page');
    if(!page)return;
    page.innerHTML=`
      <div class="member-dashboard-shell">
        <div class="member-dashboard-main">
          <div class="member-kpi-grid">
            <article class="member-kpi dark-blue">
              <div class="member-kpi-label">Medication Adherence ⓘ</div>
              <div class="member-kpi-value" id="memberAdherencePercent">—</div>
              <div class="member-kpi-note"><span id="todayProgress">—</span> recorded today</div>
              <div class="progress" aria-hidden="true"><span id="todayProgressBar" style="width:0%"></span></div>
              <div class="member-kpi-orb" aria-hidden="true"></div>
            </article>
            <article class="member-kpi dark-purple">
              <div class="member-kpi-label">Wellness Score ⓘ</div>
              <div class="member-kpi-value">82 <span style="font-size:10px;font-weight:600">Very Good</span></div>
              <div class="member-kpi-note">Keep up your self-care</div>
              <div class="member-mini-spark" aria-hidden="true"></div>
            </article>
            <article class="member-kpi soft-cyan">
              <div class="member-kpi-label" style="color:#078d8b">On-Time Meds ⓘ</div>
              <div class="member-kpi-value" id="memberOnTimeCount">—</div>
              <div class="member-kpi-note" style="color:#68799d">Today</div>
              <div class="member-kpi-icon">✓</div>
            </article>
            <article class="member-kpi soft-violet">
              <div class="member-kpi-label" style="color:#4936d8">Care Circle ⓘ</div>
              <div class="member-kpi-value" id="careCircleCount">—</div>
              <div class="member-kpi-note" id="careCircleSummary">Trusted support</div>
              <div class="member-kpi-icon">♧</div>
            </article>
          </div>

          <div class="member-core-grid">
            <article class="member-panel member-medications-panel">
              <div class="member-panel-head"><div><h3>▣ &nbsp; Today's Medications</h3></div><button class="member-panel-link" data-page="medications">View full medication schedule ›</button></div>
              <div id="dashboardMedicationList" class="dose-list"></div>
            </article>

            <div class="member-stack">
              <article class="member-panel">
                <div class="member-panel-head"><div><h3>Upcoming Reminders</h3></div><button class="member-panel-link" data-page="reminders">View All</button></div>
                <div class="member-reminder-list" id="dashboardReminderList"></div>
                <div style="display:none"><span id="nextReminderTime"></span><span id="nextReminderMedication"></span></div>
              </article>
              <article class="member-panel">
                <div class="member-panel-head"><div><h3>Care Circle Status</h3></div><button class="member-panel-link" data-page="carecircle">View All</button></div>
                <div class="member-care-status">
                  <div class="member-care-avatars"><div class="member-care-avatar">P</div><div class="member-care-avatar">B</div><div class="member-care-avatar">+</div></div>
                  <div class="member-care-copy"><strong>Trusted support is ready</strong><span><i class="member-green-dot"></i>Everyone is up to date</span></div>
                </div>
              </article>
            </div>
          </div>

          <div class="member-secondary-grid">
            <article class="member-panel member-wellness-card" id="memberWellnessCard">
              <h3>Mood / Wellness Check-in</h3><p>How are you feeling today?</p>
              <div class="member-moods">
                <button class="member-mood" data-mood="Great"><span class="member-mood-face">☺</span><span>Great</span></button>
                <button class="member-mood selected" data-mood="Good"><span class="member-mood-face">●</span><span>Good</span></button>
                <button class="member-mood" data-mood="Okay"><span class="member-mood-face">•</span><span>Okay</span></button>
                <button class="member-mood" data-mood="Not Great"><span class="member-mood-face">⌢</span><span>Not Great</span></button>
                <button class="member-mood" data-mood="Struggling"><span class="member-mood-face">☹</span><span>Struggling</span></button>
              </div>
            </article>
            <article class="member-panel member-aria-card">
              <h3>Aria Ai Assistant</h3>
              <div class="member-aria-body">
                <img class="member-aria-avatar" src="./aria-lifeline-login.png?v=7" alt="Aria Ai" />
                <div class="member-aria-copy"><strong>Hi ${firstName()}! I’m Aria.</strong><p>I’m here to help you stay on track with your health, answer questions, and support your wellness journey.</p><button class="member-gradient-btn" id="memberTalkToAria" type="button">◌ &nbsp; Chat with Aria</button></div>
              </div>
            </article>
          </div>

          <article class="member-panel member-activity">
            <div class="member-panel-head"><div><h3>Recent Activity</h3></div><button class="member-panel-link" type="button">View All Activity ›</button></div>
            <div class="member-activity-row">
              <div class="member-activity-item"><div class="member-activity-icon">✓</div><div><strong>Medication recorded</strong><span>Your latest dose update</span></div></div>
              <div class="member-activity-item"><div class="member-activity-icon" style="background:#f1e9ff;color:#6f37e9">◌</div><div><strong>Care Circle message</strong><span>Support contact activity</span></div></div>
              <div class="member-activity-item"><div class="member-activity-icon" style="background:#e9f1ff;color:#2870e7">♡</div><div><strong>Wellness Check-in</strong><span>Completed recently</span></div></div>
              <div class="member-activity-item"><div class="member-activity-icon" style="background:#e8faf6;color:#16a88a">♢</div><div><strong>Reminder updated</strong><span>Schedule is current</span></div></div>
            </div>
          </article>
        </div>

        <aside class="member-right-rail" aria-label="Member dashboard tools">
          <article class="member-rail-card">
            <div class="member-rail-title"><span style="font-size:19px;color:#6c37ef">?</span><strong>Quick Help</strong></div>
            <button class="member-help-link"><span class="member-help-icon">◒</span><span>How do I take my medications?</span><span>›</span></button>
            <button class="member-help-link"><span class="member-help-icon">♢</span><span>Managing side effects</span><span>›</span></button>
            <button class="member-help-link"><span class="member-help-icon">▣</span><span>Refill a prescription</span><span>›</span></button>
            <button class="member-help-link" data-page="privacy"><span class="member-help-icon">?</span><span>View all help topics</span><span>›</span></button>
          </article>

          <article class="member-rail-card member-summary">
            <div class="member-summary-head"><strong>Reminder Summary</strong><span>This Week</span></div>
            <div class="member-summary-body"><div class="member-donut" aria-label="Reminder completion chart"></div><div class="member-summary-legend"><div><i></i><span>Taken on time &nbsp; 70%</span></div><div><i></i><span>Taken late &nbsp; 17%</span></div><div><i></i><span>Not recorded &nbsp; 13%</span></div></div></div>
            <div class="member-next-seven"><strong>▣ &nbsp; Next 7 Days</strong>Upcoming reminders are scheduled.</div>
          </article>

          <article class="member-rail-card member-lifeline-card">
            <h3>Need Immediate Help?</h3><p>Our Lifeline is here for you 24/7.</p><button class="member-call-btn" id="memberCallLifeline" type="button">☎ &nbsp; Call Lifeline</button><div class="member-emergency-note">Emergency? Call 911 or your local emergency number.</div>
          </article>

          <button class="member-rail-card member-talk-card" id="memberTalkRail" type="button"><img src="./aria-lifeline-login.png?v=7" alt="Aria Ai"/><span><strong>Talk to Aria</strong><span>Get answers, guidance, and support</span></span><span class="member-talk-arrow">›</span></button>
        </aside>
      </div>`;

    page.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{
      const target=btn.dataset.page;
      if(typeof window.showPage==='function')window.showPage(target);
      updateHeader(target);
      document.querySelectorAll('.member-nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===target));
    }));

    page.querySelectorAll('.member-mood').forEach(btn=>btn.addEventListener('click',()=>{
      page.querySelectorAll('.member-mood').forEach(m=>m.classList.remove('selected'));
      btn.classList.add('selected');
      sessionStorage.setItem('aria-member-mood',btn.dataset.mood||'');
    }));

    const storedMood=sessionStorage.getItem('aria-member-mood');
    if(storedMood){
      page.querySelectorAll('.member-mood').forEach(m=>m.classList.toggle('selected',m.dataset.mood===storedMood));
    }

    document.getElementById('memberTalkToAria')?.addEventListener('click',()=>document.getElementById('ariaChatLauncher')?.click());
    document.getElementById('memberTalkRail')?.addEventListener('click',()=>document.getElementById('ariaChatLauncher')?.click());
    document.getElementById('memberCallLifeline')?.addEventListener('click',()=>{
      if(typeof window.openModal==='function')window.openModal('<div class="eyebrow">LIFELINE SUPPORT</div><h2 id="modalTitle">Reach Lifeline support</h2><p>This prototype cannot place a real call. If you are in immediate danger or experiencing a medical emergency, call 911 or your local emergency number now.</p><p>For non-emergency support, you can open Aria and ask for help reaching your Care Circle.</p>');
      else alert('This prototype cannot place a real call. For an emergency, call 911 or your local emergency number.');
    });
  }

  function syncDashboardReminders(){
    const list=document.getElementById('dashboardReminderList');
    const rows=[...document.querySelectorAll('#dashboardMedicationList .dose-row')];
    if(!list)return;
    const data=rows.map(row=>{
      const input=row.querySelector('input[type="checkbox"]');
      return {checked:Boolean(input?.checked),medication:row.querySelector('strong')?.textContent||'Medication',detail:row.querySelector('.dose-time')?.textContent||'Reminder'};
    }).filter(v=>!v.checked).slice(0,3);
    list.innerHTML=(data.length?data:[{medication:'No remaining medication reminders',detail:'All recorded',checked:false}]).map((v,i)=>`<div class="member-reminder-row"><div class="member-reminder-icon">◷</div><div><strong>${v.detail}</strong><span>${v.medication}</span></div><span class="member-reminder-chip">${i===0?'Next':'Upcoming'}</span></div>`).join('');
  }

  function syncMetrics(){
    const boxes=[...document.querySelectorAll('#dashboardMedicationList .dose-check')];
    const total=boxes.length;
    const done=boxes.filter(b=>b.checked).length;
    const pct=total?Math.round(done/total*100):0;
    const adherence=document.getElementById('memberAdherencePercent');
    const onTime=document.getElementById('memberOnTimeCount');
    if(adherence)adherence.textContent=`${pct}%`;
    if(onTime)onTime.textContent=`${done} / ${total}`;
    syncDashboardReminders();
  }

  function wireDashboardObserver(){
    const list=document.getElementById('dashboardMedicationList');
    if(!list)return;
    const observer=new MutationObserver(()=>setTimeout(syncMetrics,0));
    observer.observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['checked']});
    list.addEventListener('change',()=>setTimeout(syncMetrics,0));
  }

  function boot(){
    document.body.classList.add('member-redesign');
    buildSidebar();
    buildHeader();
    buildDashboard();
    if(typeof window.renderDoses==='function')window.renderDoses();
    if(typeof window.renderReminders==='function')window.renderReminders();
    if(typeof window.renderDashboardSummary==='function')window.renderDashboardSummary();
    syncMetrics();
    wireDashboardObserver();
    setInterval(updateClock,30000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
