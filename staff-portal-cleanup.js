(()=>{
  if(window.__ariaStaffPortalCleanupLoaded)return;
  window.__ariaStaffPortalCleanupLoaded=true;

  const pageMeta={
    dashboard:{title:'Aria Ai Lifeline — Staff Portal',tag:'Operations, staffing, systems, and support in one workspace.'},
    hiring:{title:'Hiring & Department Assignment',tag:'Move candidates through assignment, onboarding, permissions, and activation.'},
    operations:{title:'Operations Work Queue',tag:'Manage active operational work, member support requests, and service tasks.'},
    ariachat:{title:'Aria Chat Archive',tag:'Review closed member and Lifeline support conversations.'},
    hr:{title:'Human Resources',tag:'Manage controlled HR cases and employee workflows.'},
    it:{title:'IT Technical Tickets',tag:'Track Aria, Lifeline, access, integrations, and staff-system work.'},
    engineering:{title:'Engineering Technical Tickets',tag:'Track infrastructure, deployment, backup, recovery, and platform work.'},
    admin:{title:'System Administration',tag:'Manage employee records, roles, account status, and access provisioning.'},
    billing:{title:'Billing / Finance',tag:'Review subscription, refund, dispute, and finance operations.'},
    security:{title:'Security & Access',tag:'Review staff identity, account state, privileged access, and security controls.'},
    audit:{title:'Audit Log',tag:'Review accountable system, member-support, disclosure, and access records.'},
    privacy:{title:'Privacy & Compliance',tag:'Coordinate privacy, compliance, data handling, and permitted-access work.'},
    policies:{title:'System Policies',tag:'Internal operating standards for authorized Aria staff.'},
    terms:{title:'Terms of Service',tag:'Acceptable-use guidance for authorized staff systems.'}
  };

  const navItems=[
    ['dashboard','⌂','Dashboard'],
    ['hiring','♙','Hiring'],
    ['operations','▣','Operations'],
    ['ariachat','◌','Aria Chat Archive'],
    ['hr','♧','HR'],
    ['it','⚒','IT'],
    ['engineering','⚙','Engineering'],
    ['admin','⚙','System Administration'],
    ['billing','▤','Billing / Finance'],
    ['security','◇','Security & Access'],
    ['audit','▥','Audit Log'],
    ['privacy','◈','Privacy & Compliance'],
    ['policies','▦','Policies']
  ];

  function staffSession(){
    try{return JSON.parse(sessionStorage.getItem('aria-auth-session')||'{}')||{};}catch{return {};}
  }
  function staffName(){
    const session=staffSession();
    return session.name||session.email?.split('@')[0]||'Staff';
  }
  function staffRole(){
    const session=staffSession();
    return session.staffRole||session.role||'Staff';
  }
  function firstName(){return String(staffName()).trim().split(/\s+/)[0]||'Staff';}
  function initials(){return String(staffName()).trim().split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase()||'ST';}
  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function readArray(key){
    try{const value=JSON.parse(sessionStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}
  }
  function currentPage(){
    return document.querySelector('.page.active')?.id?.replace(/-page$/,'')||'dashboard';
  }

  function removeLegacyThemeControl(){
    document.querySelectorAll('.staff-theme-control').forEach(node=>node.remove());
    document.body.dataset.staffTheme='night';
    try{localStorage.setItem('aria-staff-theme','night');}catch{}
  }

  function showPage(page){
    if(typeof window.showPage==='function')window.showPage(page);
    else{
      document.querySelectorAll('.page').forEach(section=>section.classList.remove('active'));
      document.getElementById(`${page}-page`)?.classList.add('active');
    }
    updateHeader(page);
    setActiveNav(page);
    document.querySelector('.staff-sidebar')?.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
    if(page==='dashboard')setTimeout(refreshDashboard,0);
  }

  function buildSidebar(){
    const sidebar=document.querySelector('.staff-sidebar');
    if(!sidebar)return;
    sidebar.innerHTML=`
      <div class="staff-sidebar-inner">
        <div class="staff-lifeline-brand">
          <img src="./aria-lifeline-login.png?v=8" alt="Aria Ai Lifeline" />
          <span>STAFF PORTAL</span>
        </div>
        <nav class="staff-lifeline-nav" aria-label="Staff portal navigation">
          ${navItems.map(([page,icon,label])=>`<button class="nav-btn staff-nav-item${page==='dashboard'?' active':''}" type="button" data-page="${page}"><span class="staff-nav-icon">${icon}</span><span>${label}</span></button>`).join('')}
        </nav>
        <div class="staff-profile-card">
          <div class="staff-profile-row">
            <div class="staff-profile-avatar">${escapeHtml(initials())}</div>
            <div><strong>${escapeHtml(staffName())}</strong><span>${escapeHtml(staffRole())}</span></div>
            <span aria-hidden="true">⌄</span>
          </div>
          <button type="button" id="staffSidebarSignout">↻ &nbsp; Sign Out</button>
        </div>
      </div>`;

    sidebar.querySelectorAll('[data-page]').forEach(button=>{
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        showPage(button.dataset.page);
      });
    });
    document.getElementById('staffSidebarSignout')?.addEventListener('click',performLogout);
  }

  function setActiveNav(page){
    document.querySelectorAll('.staff-nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
  }

  function performLogout(){
    const original=document.getElementById('portalLogoutButton');
    if(original){original.click();return;}
    fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store'}).catch(()=>{}).finally(()=>{
      sessionStorage.removeItem('aria-auth-session');
      window.location.replace('login.html');
    });
  }

  function buildHeader(){
    const topbar=document.querySelector('.staff-topbar');
    if(!topbar)return;
    topbar.innerHTML=`
      <div class="staff-header-copy">
        <div class="staff-header-welcome">Welcome back, ${escapeHtml(firstName())} 👋</div>
        <h1 id="pageTitle"></h1>
        <p id="staffHeaderTagline"></p>
      </div>
      <div class="staff-header-actions">
        <div class="staff-header-clock"><span id="staffHeaderDate"></span><strong id="staffHeaderTime"></strong></div>
        <button type="button" id="staffHeaderSignout">↻ &nbsp; Sign Out</button>
      </div>`;
    document.getElementById('staffHeaderSignout')?.addEventListener('click',performLogout);
    updateHeader(currentPage());
    updateClock();
  }

  function updateHeader(page=currentPage()){
    const meta=pageMeta[page]||pageMeta.dashboard;
    const title=document.getElementById('pageTitle');
    const tag=document.getElementById('staffHeaderTagline');
    if(title)title.textContent=meta.title;
    if(tag)tag.textContent=meta.tag;
    setActiveNav(page);
  }

  function updateClock(){
    const now=new Date();
    const date=document.getElementById('staffHeaderDate');
    const time=document.getElementById('staffHeaderTime');
    if(date)date.textContent=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(now);
    if(time)time.textContent=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(now);
  }

  function storedNumber(id,fallback=0){
    const value=Number(document.getElementById(id)?.textContent);
    return Number.isFinite(value)?value:fallback;
  }

  function dashboardData(){
    const candidates=readArray('aria-staff-candidates');
    const employees=readArray('aria-staff-employees');
    const tickets=readArray('aria-staff-tickets');
    const hrCases=readArray('aria-staff-hr-cases');
    const financeCases=readArray('aria-staff-finance-cases');
    const securityReviews=readArray('aria-staff-security-reviews');

    const pending=candidates.length?candidates.filter(c=>c.status!=='Account activated').length:storedNumber('pendingCount',2);
    const openTickets=tickets.length?tickets.filter(t=>t.status!=='Closed').length:storedNumber('openTicketCount',0);
    const openHr=hrCases.length?hrCases.filter(c=>c.status!=='Closed').length:storedNumber('openHrCount',0);
    const activeEmployees=employees.length?employees.filter(e=>e.status==='Active').length:storedNumber('activeEmployeeCount',0);
    const urgent=tickets.filter(t=>t.status!=='Closed'&&(t.priority==='Urgent'||t.priority==='High')).length;
    const suspended=employees.filter(e=>String(e.status).toLowerCase()==='suspended').length;
    const pendingSecurity=securityReviews.filter(r=>String(r.status).toLowerCase()!=='closed').length;
    const pendingFinance=financeCases.filter(r=>String(r.status).toLowerCase()!=='closed').length;

    return {candidates,employees,tickets,hrCases,financeCases,securityReviews,pending,openTickets,openHr,activeEmployees,urgent,suspended,pendingSecurity,pendingFinance};
  }

  function buildDashboard(){
    const page=document.getElementById('dashboard-page');
    if(!page)return;
    page.innerHTML=`
      <div class="staff-dashboard-shell">
        <div class="staff-dashboard-main">
          <div class="staff-kpi-grid">
            <article class="staff-kpi"><span class="staff-kpi-icon cyan">♙</span><div><span>Pending Hires</span><strong id="pendingCount">0</strong><small>Awaiting next step</small></div></article>
            <article class="staff-kpi"><span class="staff-kpi-icon blue">▣</span><div><span>Open Work Tickets</span><strong id="openTicketCount">0</strong><small>Require attention</small></div></article>
            <article class="staff-kpi"><span class="staff-kpi-icon green">♧</span><div><span>Open HR Cases</span><strong id="openHrCount">0</strong><small>Controlled HR workflow</small></div></article>
            <article class="staff-kpi"><span class="staff-kpi-icon purple">♙</span><div><span>Active Employees</span><strong id="activeEmployeeCount">0</strong><small>Across departments</small></div></article>
          </div>

          <article class="staff-dash-panel staff-hiring-panel">
            <div class="staff-panel-head"><div><div class="eyebrow">HIRING FLOW</div><h2>Hiring through account activation</h2></div><button type="button" class="staff-text-link" data-go="hiring">Open Hiring</button></div>
            <div class="staff-flow" id="staffHiringFlow"></div>
            <div class="staff-flow-note" id="staffHiringNote"></div>
          </article>

          <div class="staff-mid-grid">
            <article class="staff-dash-panel">
              <div class="staff-panel-head"><h3>Operations Queue</h3><button type="button" class="staff-text-link" data-go="operations">View all</button></div>
              <div class="staff-queue-list" id="staffDashboardQueue"></div>
            </article>
            <article class="staff-dash-panel">
              <div class="staff-panel-head"><h3>Department Workloads</h3><button type="button" class="staff-text-link" data-go="operations">View work</button></div>
              <div class="staff-workloads" id="staffDepartmentWorkloads"></div>
            </article>
            <article class="staff-dash-panel">
              <div class="staff-panel-head"><h3>Recent Activity</h3><button type="button" class="staff-text-link" data-go="audit">Audit log</button></div>
              <div class="staff-activity-list" id="staffRecentActivity"></div>
            </article>
          </div>

          <article class="staff-dash-panel staff-system-health">
            <div class="staff-panel-head"><h3>System Workspace</h3><button type="button" class="staff-text-link" data-go="security">Security & Access</button></div>
            <div class="staff-health-grid">
              <div><span class="staff-health-check">✓</span><div><strong>Staff Portal</strong><small>Ready</small></div></div>
              <div><span class="staff-health-check">✓</span><div><strong>Live Support</strong><small>Available</small></div></div>
              <div><span class="staff-health-check">✓</span><div><strong>Access Controls</strong><small>Loaded</small></div></div>
              <div><span class="staff-health-check">✓</span><div><strong>Operations Workspace</strong><small>Ready</small></div></div>
            </div>
          </article>
        </div>

        <aside class="staff-right-rail">
          <article class="staff-dash-panel staff-quick-actions">
            <div class="staff-panel-head"><h3>⚡ Quick Actions</h3></div>
            <button type="button" data-action="ticket">Create Work Ticket <span>›</span></button>
            <button type="button" data-action="hire">Open Hiring <span>›</span></button>
            <button type="button" data-action="hr">Open HR Case <span>›</span></button>
            <button type="button" data-action="security">Request System Access <span>›</span></button>
            <button type="button" data-action="audit">View Reports <span>›</span></button>
          </article>

          <article class="staff-dash-panel staff-queue-summary">
            <div class="staff-panel-head"><h3>Queue Summary</h3><span>This Week</span></div>
            <div class="staff-summary-body"><div class="staff-donut" id="staffQueueDonut"></div><div id="staffQueueLegend"></div></div>
            <div class="staff-summary-total"><span>Total active items</span><strong id="staffQueueTotal">0</strong></div>
          </article>

          <article class="staff-dash-panel staff-service-health">
            <div class="staff-panel-head"><h3>Service Health</h3></div>
            <div class="staff-service-row"><span>Staff web application</span><strong>Ready</strong></div>
            <div class="staff-service-row"><span>Authentication</span><strong>Active session</strong></div>
            <div class="staff-service-row"><span>Member support tools</span><strong>Available</strong></div>
            <div class="staff-service-row"><span>Staff workspace</span><strong>Ready</strong></div>
          </article>

          <article class="staff-dash-panel staff-alert-card">
            <div class="staff-panel-head"><h3>⚠ Critical Alerts</h3><button type="button" class="staff-text-link" data-go="operations">View all</button></div>
            <div id="staffCriticalAlerts"></div>
          </article>

          <button type="button" class="staff-archive-card" data-go="ariachat">
            <div class="staff-archive-orb">◌</div><div><strong>Aria Chat Archive</strong><span>Review closed member and Lifeline support conversations</span></div><span>›</span>
          </button>
        </aside>
      </div>`;

    page.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.go)));
    page.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>handleQuickAction(button.dataset.action)));
  }

  function handleQuickAction(action){
    if(action==='ticket'){
      showPage('operations');
      setTimeout(()=>document.getElementById('addOperationsTicket')?.click(),50);
      return;
    }
    if(action==='hire'){showPage('hiring');return;}
    if(action==='hr'){
      showPage('hr');
      setTimeout(()=>document.getElementById('addHrCase')?.click(),50);
      return;
    }
    if(action==='security'){showPage('security');return;}
    if(action==='audit'){showPage('audit');}
  }

  function avgProgress(items){
    if(!items.length)return 0;
    const total=items.reduce((sum,item)=>{
      const value=Number(item.progress);
      if(Number.isFinite(value))return sum+Math.max(0,Math.min(100,value));
      if(item.status==='Closed')return sum+100;
      if(item.status==='In Progress')return sum+50;
      return sum;
    },0);
    return Math.round(total/items.length);
  }

  function refreshDashboard(){
    const page=document.getElementById('dashboard-page');
    if(!page)return;
    const data=dashboardData();
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=String(value);};
    set('pendingCount',data.pending);
    set('openTicketCount',data.openTickets);
    set('openHrCount',data.openHr);
    set('activeEmployeeCount',data.activeEmployees);

    const statuses={
      candidate:data.candidates.length,
      hired:data.candidates.filter(c=>String(c.status).toLowerCase().includes('hired')).length,
      department:data.candidates.filter(c=>Boolean(c.department)).length,
      onboarding:data.candidates.filter(c=>String(c.onboardingStatus).toLowerCase()==='submitted').length,
      permissions:data.candidates.filter(c=>String(c.status).toLowerCase().includes('role')).length,
      activated:data.candidates.filter(c=>String(c.status).toLowerCase()==='account activated').length
    };
    const flow=document.getElementById('staffHiringFlow');
    if(flow){
      const stages=[['1','Candidate',statuses.candidate,'done'],['2','Hired',statuses.hired,'done'],['3','Department Assignment',statuses.department,'current'],['4','Onboarding',statuses.onboarding,''],['5','Role & Permissions',statuses.permissions,''],['6','Account Activated',statuses.activated,'']];
      flow.innerHTML=stages.map(([num,label,count,state])=>`<div class="staff-flow-step ${state}"><span>${num}</span><strong>${label}</strong><small>${count}</small></div>`).join('');
    }
    const note=document.getElementById('staffHiringNote');
    if(note)note.textContent=data.pending?`${data.pending} candidate${data.pending===1?'':'s'} still moving through the hiring workflow.`:'No candidates are waiting in the hiring workflow.';

    const open=data.tickets.filter(t=>t.status!=='Closed');
    const queueRows=[
      ['Open Work Tickets',data.openTickets],
      ['High / Urgent',data.urgent],
      ['HR Cases',data.openHr],
      ['Access Reviews',data.pendingSecurity],
      ['Finance Cases',data.pendingFinance]
    ];
    const queue=document.getElementById('staffDashboardQueue');
    if(queue)queue.innerHTML=queueRows.map(([label,count],index)=>`<button type="button" data-queue-page="${index===2?'hr':index===3?'security':index===4?'billing':'operations'}"><span>${label}</span><strong>${count}</strong></button>`).join('');
    queue?.querySelectorAll('[data-queue-page]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.queuePage)));

    const depts=['Operations','HR','IT','Engineering','Finance'];
    const workloads=document.getElementById('staffDepartmentWorkloads');
    if(workloads){
      workloads.innerHTML=depts.map(dept=>{
        let pct=0;
        if(dept==='HR')pct=data.hrCases.length?Math.min(100,Math.round(data.openHr/Math.max(1,data.hrCases.length)*100)):0;
        else if(dept==='Finance')pct=data.financeCases.length?Math.min(100,Math.round(data.pendingFinance/Math.max(1,data.financeCases.length)*100)):0;
        else pct=avgProgress(data.tickets.filter(t=>t.department===dept));
        return `<div class="staff-workload-row"><span>${dept}</span><div><i style="width:${pct}%"></i></div><strong>${pct}%</strong></div>`;
      }).join('');
    }

    const activity=document.getElementById('staffRecentActivity');
    if(activity){
      const rows=[];
      const latestTicket=data.tickets[0];
      const latestCandidate=data.candidates[0];
      const latestHr=data.hrCases[0];
      if(latestTicket)rows.push(['▣',latestTicket.title||'Work ticket updated',`${latestTicket.department||'Operations'} • ${latestTicket.status||'Open'}`]);
      if(latestCandidate)rows.push(['♙',`${latestCandidate.name||'Candidate'} hiring record`,latestCandidate.status||'Hiring workflow']);
      if(latestHr)rows.push(['♧',latestHr.reason||latestHr.type||'HR case updated',latestHr.status||'Open']);
      rows.push(['◇','Security workspace','Access controls available'],['⚙','Staff portal','Dashboard workspace ready']);
      activity.innerHTML=rows.slice(0,5).map(([icon,title,sub])=>`<div class="staff-activity-row"><span>${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(sub)}</small></div></div>`).join('');
    }

    const values=[data.openTickets,data.pending,data.pendingSecurity,data.openHr];
    const total=Math.max(1,values.reduce((a,b)=>a+b,0));
    const percentages=values.map(v=>Math.round(v/total*100));
    const donut=document.getElementById('staffQueueDonut');
    if(donut){
      const p1=percentages[0],p2=p1+percentages[1],p3=p2+percentages[2];
      donut.style.background=`conic-gradient(#3e86ff 0 ${p1}%,#7b51ee ${p1}% ${p2}%,#24c7c6 ${p2}% ${p3}%,#f5a35c ${p3}% 100%)`;
    }
    const legend=document.getElementById('staffQueueLegend');
    const labels=['Open Work Tickets','Pending Hires','Access Reviews','HR Cases'];
    if(legend)legend.innerHTML=labels.map((label,i)=>`<div><i class="legend-${i}"></i><span>${label}</span><strong>${percentages[i]}%</strong></div>`).join('');
    set('staffQueueTotal',values.reduce((a,b)=>a+b,0));

    const alerts=document.getElementById('staffCriticalAlerts');
    if(alerts){
      const alertCount=data.urgent+data.suspended;
      alerts.innerHTML=alertCount
        ?`<div class="staff-alert-active"><strong>${alertCount} item${alertCount===1?'':'s'} need elevated attention</strong><span>${data.urgent} high/urgent work ticket${data.urgent===1?'':'s'} • ${data.suspended} suspended staff account${data.suspended===1?'':'s'}</span></div>`
        :'<div class="staff-alert-clear"><span class="staff-alert-shield">✓</span><div><strong>No elevated alerts</strong><span>No high-priority ticket or suspended-account alerts are currently recorded.</span></div></div>';
    }
  }

  function removeDuplicateAndLegacyViews(){
    document.querySelectorAll('.staff-theme-control,.staff-utility-footer').forEach(node=>node.remove());
    const keepFirst=selector=>{const nodes=[...document.querySelectorAll(selector)];nodes.slice(1).forEach(node=>node.remove());};
    ['#liveSupportWorkspace','.staff-topbar','#operationsSummary','#operationsQueue','#ariaChatSummary','#ariaChatQueue'].forEach(keepFirst);
  }

  function normalizeDynamicSurfaces(){
    removeLegacyThemeControl();
    removeDuplicateAndLegacyViews();
    document.querySelectorAll('[style]').forEach(node=>{
      if(!node.closest('.staff-main'))return;
      const style=node.getAttribute('style')||'';
      if(/background\s*:\s*(#fff|#ffffff|white)/i.test(style)){
        node.style.removeProperty('background');
        node.style.removeProperty('background-color');
      }
    });
  }

  function boot(){
    document.body.classList.add('staff-cleanup','staff-lifeline-layout');
    removeLegacyThemeControl();
    buildSidebar();
    buildHeader();
    buildDashboard();
    normalizeDynamicSurfaces();
    refreshDashboard();

    const observer=new MutationObserver(()=>normalizeDynamicSurfaces());
    observer.observe(document.body,{childList:true,subtree:true});
    setInterval(updateClock,30000);
    setInterval(()=>{if(document.getElementById('dashboard-page')?.classList.contains('active'))refreshDashboard();},5000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
