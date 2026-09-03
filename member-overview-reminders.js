(()=>{
  if(window.__ariaMemberOverviewReminders)return;
  window.__ariaMemberOverviewReminders=true;

  function redesignActive(){
    return document.body?.classList.contains('member-redesign');
  }

  function removeLegacyPanel(){
    document.querySelectorAll('#overviewRemindersPanel,.overview-reminders-panel').forEach(node=>node.remove());
  }

  function localDate(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function displayTime(value){
    const [h,m]=String(value||'').split(':').map(Number);
    if(!Number.isFinite(h)||!Number.isFinite(m))return value||'';
    return `${(h%12)||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
  }
  function minutes(value){
    const [h,m]=String(value||'').split(':').map(Number);
    return Number.isFinite(h)&&Number.isFinite(m)?(h*60)+m:Number.MAX_SAFE_INTEGER;
  }
  function categoryLabel(value){
    return ({general:'General',appointment:'Appointment',care:'Care task',other:'Other'})[value]||'Reminder';
  }
  function reminderState(reminder){
    if(reminder.status==='completed')return {key:'completed',label:'Completed'};
    if(reminder.status==='dismissed')return {key:'dismissed',label:'Dismissed'};
    const now=new Date();
    const due=minutes(reminder.timeLocal)<=((now.getHours()*60)+now.getMinutes());
    return due?{key:'due',label:'Due'}:{key:'upcoming',label:'Upcoming'};
  }

  function ensurePanel(){
    if(redesignActive()){
      removeLegacyPanel();
      return null;
    }
    const dashboard=document.getElementById('dashboard-page');
    if(!dashboard)return null;
    let panel=document.getElementById('overviewRemindersPanel');
    if(panel)return panel;

    panel=document.createElement('article');
    panel.className='panel overview-reminders-panel';
    panel.id='overviewRemindersPanel';
    panel.innerHTML=`
      <div class="panel-head">
        <div><div class="eyebrow">TODAY</div><h3>Reminders</h3></div>
        <button type="button" class="text-btn" id="overviewViewAllReminders">View all</button>
      </div>
      <div id="overviewReminderList" class="overview-reminder-list">
        <div class="overview-reminder-empty">Loading reminders…</div>
      </div>`;

    const medicationPanel=document.getElementById('dashboardMedicationList')?.closest('.panel');
    if(medicationPanel)medicationPanel.insertAdjacentElement('afterend',panel);
    else dashboard.appendChild(panel);

    document.getElementById('overviewViewAllReminders')?.addEventListener('click',()=>{
      if(typeof window.showPage==='function')window.showPage('reminders');
      else document.querySelector('[data-page="reminders"]')?.click();
    });
    return panel;
  }

  function render(reminders){
    if(redesignActive()){
      removeLegacyPanel();
      return;
    }
    ensurePanel();
    const container=document.getElementById('overviewReminderList');
    if(!container)return;

    const rows=(Array.isArray(reminders)?reminders:[])
      .filter(reminder=>reminder.status!=='dismissed')
      .map(reminder=>({...reminder,state:reminderState(reminder)}))
      .sort((a,b)=>{
        const aDone=a.state.key==='completed'?1:0;
        const bDone=b.state.key==='completed'?1:0;
        return aDone-bDone||minutes(a.timeLocal)-minutes(b.timeLocal)||String(a.title).localeCompare(String(b.title));
      });

    if(!rows.length){
      container.innerHTML='<div class="overview-reminder-empty">No personal reminders scheduled for today.</div>';
      return;
    }

    const visible=rows.slice(0,4);
    container.innerHTML=visible.map(reminder=>{
      const success=reminder.state.key==='completed';
      return `<div class="overview-reminder-row ${success?'complete':''}">
        <div class="overview-reminder-time">${escapeHtml(reminder.time||displayTime(reminder.timeLocal))}</div>
        <div class="overview-reminder-copy">
          <strong>${escapeHtml(reminder.title)}</strong>
          <span>${escapeHtml(categoryLabel(reminder.category))}${reminder.notes?` • ${escapeHtml(reminder.notes)}`:''}</span>
        </div>
        <span class="pill ${success?'success':''}">${escapeHtml(reminder.state.label)}</span>
      </div>`;
    }).join('')+(rows.length>visible.length?`<button type="button" class="overview-reminder-more" id="overviewReminderMore">+${rows.length-visible.length} more reminder${rows.length-visible.length===1?'':'s'}</button>`:'');

    document.getElementById('overviewReminderMore')?.addEventListener('click',()=>{
      if(typeof window.showPage==='function')window.showPage('reminders');
      else document.querySelector('[data-page="reminders"]')?.click();
    });
  }

  async function refresh(){
    if(redesignActive()){
      removeLegacyPanel();
      return;
    }
    ensurePanel();
    try{
      const response=await fetch(`/api/member/reminders?date=${encodeURIComponent(localDate())}`,{
        credentials:'same-origin',cache:'no-store',headers:{'accept':'application/json'}
      });
      if(response.status===401)return;
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
      render(data.reminders||[]);
    }catch(error){
      console.error('Overview reminder load failed',error);
      const container=document.getElementById('overviewReminderList');
      if(container)container.innerHTML='<div class="overview-reminder-empty">Reminders could not load right now.</div>';
    }
  }

  if(!redesignActive()){
    ensurePanel();
    refresh();
  }else removeLegacyPanel();

  document.addEventListener('click',event=>{
    if(redesignActive()){
      removeLegacyPanel();
      return;
    }
    if(event.target.closest?.('[data-page="dashboard"]'))setTimeout(refresh,0);
  },true);

  setInterval(()=>{
    if(redesignActive()){
      removeLegacyPanel();
      return;
    }
    if(document.getElementById('dashboard-page')?.classList.contains('active'))refresh();
  },60000);
})();
