(()=>{
  if(window.__ariaMemberRemindersLive)return;
  window.__ariaMemberRemindersLive=true;

  let selectedDate=localDate();
  let customReminders=[];
  let refreshToken=0;

  function localDate(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function displayTime(value){
    const [h,m]=String(value||'').split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return value||'';
    return `${(h%12)||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
  }
  function displayDateTime(value){
    const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(d);
  }
  function minutes(value){
    const [h,m]=String(value||'').split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?(h*60)+m:Number.MAX_SAFE_INTEGER;
  }
  function prettyDate(value){
    const [y,m,d]=String(value||'').split('-').map(Number);
    if(!y||!m||!d)return value;
    return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(y,m-1,d));
  }
  function categoryLabel(value){
    return ({general:'General',appointment:'Appointment',care:'Care task',other:'Other'})[value]||'Reminder';
  }
  function isDue(date,time){
    const today=localDate();
    if(date<today)return true;
    if(date>today)return false;
    const now=new Date();
    return minutes(time)<=((now.getHours()*60)+now.getMinutes());
  }
  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(data.error||`Request failed (${response.status})`);error.status=response.status;throw error;}
    return data;
  }

  function ensurePageControls(){
    const page=document.getElementById('reminders-page');if(!page)return;
    const heading=page.querySelector('.section-heading');
    if(heading&&!document.getElementById('addReminderBtn')){
      const button=document.createElement('button');
      button.type='button';button.className='primary';button.id='addReminderBtn';button.textContent='Add reminder';
      heading.appendChild(button);
    }
    const panel=document.getElementById('reminderTimeline')?.closest('.panel');
    if(panel&&!document.getElementById('reminderToolbar')){
      const toolbar=document.createElement('div');
      toolbar.className='reminder-toolbar';toolbar.id='reminderToolbar';
      toolbar.innerHTML=`
        <button type="button" class="outline reminder-day-step" id="reminderPrevDay" aria-label="Previous day">‹</button>
        <label class="reminder-date-label">Date<input type="date" id="reminderDatePicker" value="${selectedDate}" /></label>
        <button type="button" class="outline" id="reminderTodayBtn">Today</button>
        <button type="button" class="outline reminder-day-step" id="reminderNextDay" aria-label="Next day">›</button>`;
      panel.before(toolbar);
    }
  }

  function shiftDate(days){
    const [y,m,d]=selectedDate.split('-').map(Number);
    const date=new Date(y,m-1,d);date.setDate(date.getDate()+days);
    selectedDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const picker=document.getElementById('reminderDatePicker');if(picker)picker.value=selectedDate;
    refreshTimeline();
  }

  function medicationRows(medicationsData,eventsData){
    const events=Array.isArray(eventsData?.events)?eventsData.events:[];
    const eventFor=(dose)=>events.find(event=>event.scheduleId===dose.scheduleId&&event.scheduledDate===selectedDate)||null;
    return (medicationsData?.doses||[]).map(dose=>{
      const event=eventFor(dose);
      const snoozed=Boolean(event?.status==='due'&&event?.snoozed&&event?.snoozedUntil&&Date.parse(event.snoozedUntil)>Date.now());
      const state=dose.checked
        ?'recorded'
        :event?.status==='dismissed'
          ?'dismissed'
          :event?.status==='expired'
            ?'not-recorded'
            :snoozed
              ?'snoozed'
              :event?.status==='due'
                ?'due'
                :'upcoming';
      return {
        type:'medication',
        id:dose.id,
        eventId:event?.id||null,
        snoozedUntil:event?.snoozedUntil||null,
        timeLocal:dose.timeLocal||'',
        time:dose.time||displayTime(dose.timeLocal),
        title:dose.medication,
        detail:state==='recorded'
          ?`Recorded by user${dose.recorded?` at ${dose.recorded}`:''}`
          :state==='due'
            ?'Medication reminder is due'
            :state==='snoozed'
              ?`Snoozed until ${displayDateTime(event.snoozedUntil)}`
              :state==='dismissed'
                ?'Medication reminder dismissed'
                :state==='not-recorded'
                  ?'No dose confirmation was recorded for this scheduled time'
                  :'Medication reminder',
        state,
        label:state==='recorded'?'Recorded':state==='due'?'Due':state==='snoozed'?'Snoozed':state==='dismissed'?'Dismissed':state==='not-recorded'?'Not recorded':'Upcoming'
      };
    });
  }

  function customRows(reminders){
    return reminders.map(reminder=>{
      let state=reminder.status;
      if(state==='scheduled')state=isDue(reminder.scheduledDate,reminder.timeLocal)?'due':'upcoming';
      const label=state==='completed'?'Completed':state==='dismissed'?'Dismissed':state==='due'?'Due':'Upcoming';
      return {
        type:'custom',id:reminder.id,timeLocal:reminder.timeLocal,time:reminder.time||displayTime(reminder.timeLocal),
        title:reminder.title,detail:[categoryLabel(reminder.category),reminder.notes].filter(Boolean).join(' • '),state,label,raw:reminder
      };
    });
  }

  function renderCombined(medicationsData,eventsData,remindersData){
    const timeline=document.getElementById('reminderTimeline');if(!timeline)return;
    customReminders=Array.isArray(remindersData?.reminders)?remindersData.reminders:[];
    const rows=[...medicationRows(medicationsData,eventsData),...customRows(customReminders)]
      .sort((a,b)=>minutes(a.timeLocal)-minutes(b.timeLocal)||a.title.localeCompare(b.title));
    if(!rows.length){
      timeline.innerHTML=`<div class="reminder-empty"><div class="reminder-empty-icon">✓</div><h3>No reminders for ${escapeHtml(prettyDate(selectedDate))}</h3><p>Add a care or personal reminder, or create a medication schedule from Medications.</p></div>`;
      return;
    }
    timeline.innerHTML=rows.map(item=>{
      const success=item.state==='recorded'||item.state==='completed';
      const customActions=item.type==='custom'?`
        <div class="reminder-row-actions">
          ${item.state!=='completed'?`<button type="button" class="reminder-mini" data-reminder-complete="${escapeHtml(item.id)}">Complete</button>`:''}
          ${item.state!=='dismissed'?`<button type="button" class="reminder-mini" data-reminder-dismiss="${escapeHtml(item.id)}">Dismiss</button>`:''}
          <button type="button" class="reminder-mini" data-reminder-edit="${escapeHtml(item.id)}">Edit</button>
          <button type="button" class="reminder-mini danger-text" data-reminder-delete="${escapeHtml(item.id)}">Delete</button>
        </div>`:'';
      const medicationActions=item.type==='medication'&&item.state==='due'&&item.eventId?`
        <div class="reminder-row-actions medication-snooze-actions" aria-label="Snooze medication reminder">
          <button type="button" class="reminder-mini" data-medication-snooze="${escapeHtml(item.eventId)}" data-snooze-minutes="10">10 min</button>
          <button type="button" class="reminder-mini" data-medication-snooze="${escapeHtml(item.eventId)}" data-snooze-minutes="30">30 min</button>
          <button type="button" class="reminder-mini" data-medication-snooze="${escapeHtml(item.eventId)}" data-snooze-minutes="60">1 hour</button>
        </div>`:'';
      return `<div class="timeline-row reminder-live-row ${success?'complete':''}">
        <div class="timeline-time">${escapeHtml(item.time)}</div>
        <div class="reminder-row-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail||'Reminder')}</span>
          ${item.type==='custom'?'<span class="reminder-source">Personal reminder</span>':'<span class="reminder-source">Medication schedule</span>'}
        </div>
        <div class="reminder-row-end"><div class="pill ${success?'success':''}">${escapeHtml(item.label)}</div>${customActions}${medicationActions}</div>
      </div>`;
    }).join('');
  }

  async function refreshTimeline(){
    const token=++refreshToken;
    const timeline=document.getElementById('reminderTimeline');
    if(timeline)timeline.innerHTML='<div class="reminder-loading">Loading reminders…</div>';
    try{
      const q=encodeURIComponent(selectedDate);
      const [medications,events,reminders]=await Promise.all([
        api(`/api/member/medications?date=${q}`,{method:'GET',headers:{}}),
        api(`/api/member/reminder-events?date=${q}`,{method:'GET',headers:{}}),
        api(`/api/member/reminders?date=${q}`,{method:'GET',headers:{}})
      ]);
      if(token!==refreshToken)return;
      renderCombined(medications,events,reminders);
    }catch(error){
      if(token!==refreshToken)return;
      console.error('Reminder timeline load failed',error);
      if(timeline)timeline.innerHTML=`<div class="reminder-empty"><h3>Reminders could not load</h3><p>${escapeHtml(error.message||'Please try again.')}</p></div>`;
    }
  }

  function openReminderForm(reminder=null){
    if(typeof window.openModal!=='function'&&typeof openModal!=='function')return;
    const modalOpen=window.openModal||openModal;
    const date=reminder?.scheduledDate||selectedDate;
    const time=reminder?.timeLocal||'';
    modalOpen(`
      <div class="eyebrow">REMINDER</div>
      <h2 id="modalTitle">${reminder?'Edit reminder':'Add reminder'}</h2>
      <p>Create a personal care reminder. Medication dose reminders should continue to be managed from the Medications page.</p>
      <div class="form-grid">
        <label class="form-span-2">Reminder title<input id="memberReminderTitle" maxlength="120" autocomplete="off" placeholder="Doctor appointment" value="${escapeHtml(reminder?.title||'')}" /></label>
        <label>Category<select id="memberReminderCategory">
          <option value="general" ${reminder?.category==='general'||!reminder?'selected':''}>General</option>
          <option value="appointment" ${reminder?.category==='appointment'?'selected':''}>Appointment</option>
          <option value="care" ${reminder?.category==='care'?'selected':''}>Care task</option>
          <option value="other" ${reminder?.category==='other'?'selected':''}>Other</option>
        </select></label>
        <label>Date<input id="memberReminderDate" type="date" value="${escapeHtml(date)}" /></label>
        <label>Time<input id="memberReminderTime" type="time" value="${escapeHtml(time)}" /></label>
        <label class="form-span-2">Notes<textarea id="memberReminderNotes" maxlength="500" rows="3" placeholder="Optional details">${escapeHtml(reminder?.notes||'')}</textarea></label>
      </div>
      <div class="modal-actions"><button class="primary" id="saveMemberReminder">${reminder?'Save changes':'Add reminder'}</button><button class="outline" id="cancelMemberReminder">Cancel</button></div>`);
    document.getElementById('cancelMemberReminder').onclick=()=>window.closeModal?.();
    document.getElementById('saveMemberReminder').onclick=async()=>{
      const payload={
        title:document.getElementById('memberReminderTitle').value.trim(),
        category:document.getElementById('memberReminderCategory').value,
        scheduledDate:document.getElementById('memberReminderDate').value,
        timeLocal:document.getElementById('memberReminderTime').value,
        notes:document.getElementById('memberReminderNotes').value.trim(),
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null
      };
      if(!payload.title||!payload.scheduledDate||!payload.timeLocal){alert('Enter a reminder title, date, and time.');return;}
      const save=document.getElementById('saveMemberReminder');save.disabled=true;save.textContent='Saving…';
      try{
        await api(reminder?`/api/member/reminders/${encodeURIComponent(reminder.id)}`:'/api/member/reminders',{
          method:reminder?'PATCH':'POST',body:JSON.stringify(payload)
        });
        selectedDate=payload.scheduledDate;
        const picker=document.getElementById('reminderDatePicker');if(picker)picker.value=selectedDate;
        window.closeModal?.();await refreshTimeline();
      }catch(error){
        console.error('Reminder save failed',error);save.disabled=false;save.textContent=reminder?'Save changes':'Add reminder';alert(error.message||'Aria could not save that reminder.');
      }
    };
  }

  async function updateStatus(id,status){
    try{await api(`/api/member/reminders/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status})});await refreshTimeline();}
    catch(error){console.error('Reminder status update failed',error);alert(error.message||'Aria could not update that reminder.');}
  }
  async function snoozeMedicationReminder(id,snoozeMinutes,button){
    if(button){button.disabled=true;button.textContent='Snoozing…';}
    try{
      await api(`/api/member/reminder-events/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({snoozeMinutes})});
      await refreshTimeline();
    }catch(error){
      console.error('Medication reminder snooze failed',error);
      if(button){button.disabled=false;button.textContent=snoozeMinutes===60?'1 hour':`${snoozeMinutes} min`;}
      alert(error.message||'Aria could not snooze that medication reminder.');
    }
  }
  async function deleteReminder(id){
    const reminder=customReminders.find(item=>item.id===id);if(!reminder)return;
    if(!confirm(`Delete “${reminder.title}”?`))return;
    try{await api(`/api/member/reminders/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshTimeline();}
    catch(error){console.error('Reminder delete failed',error);alert(error.message||'Aria could not delete that reminder.');}
  }

  ensurePageControls();
  document.getElementById('addReminderBtn')?.addEventListener('click',()=>openReminderForm());
  document.getElementById('reminderDatePicker')?.addEventListener('change',event=>{if(event.target.value){selectedDate=event.target.value;refreshTimeline();}});
  document.getElementById('reminderTodayBtn')?.addEventListener('click',()=>{selectedDate=localDate();document.getElementById('reminderDatePicker').value=selectedDate;refreshTimeline();});
  document.getElementById('reminderPrevDay')?.addEventListener('click',()=>shiftDate(-1));
  document.getElementById('reminderNextDay')?.addEventListener('click',()=>shiftDate(1));

  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('[data-reminder-edit]');
    const complete=event.target.closest?.('[data-reminder-complete]');
    const dismiss=event.target.closest?.('[data-reminder-dismiss]');
    const del=event.target.closest?.('[data-reminder-delete]');
    const snooze=event.target.closest?.('[data-medication-snooze]');
    if(edit){const reminder=customReminders.find(item=>item.id===edit.dataset.reminderEdit);if(reminder)openReminderForm(reminder);return;}
    if(complete){updateStatus(complete.dataset.reminderComplete,'completed');return;}
    if(dismiss){updateStatus(dismiss.dataset.reminderDismiss,'dismissed');return;}
    if(snooze){snoozeMedicationReminder(snooze.dataset.medicationSnooze,Number(snooze.dataset.snoozeMinutes),snooze);return;}
    if(del)deleteReminder(del.dataset.reminderDelete);
  });

  window.renderReminders=refreshTimeline;
  try{renderReminders=refreshTimeline;}catch{}
  refreshTimeline();
  setInterval(()=>{if(selectedDate===localDate())refreshTimeline();},60000);
})();
