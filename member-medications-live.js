(()=>{
  let liveEnabled=false;
  let liveMedications=[];
  let liveReminderEvents=[];
  const baseRenderDoses=renderDoses;
  const baseRenderReminders=renderReminders;

  function localDate(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function to24Hour(value){
    const raw=String(value||'').trim();
    if(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw))return raw;
    const match=raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!match)return null;
    let hour=Number(match[1]);const minute=Number(match[2]);if(hour<1||hour>12||minute<0||minute>59)return null;
    hour%=12;if(match[3].toUpperCase()==='PM')hour+=12;
    return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }
  function instructionText(med){
    if(med.instructionText)return med.instructionText;
    const strength=String(med.strengthText||'').trim();
    const amount=String(med.amountText||'').trim();
    const frequency=String(med.frequencyText||'').trim();
    const timing=String(med.timingText||'').trim();
    if(!strength&&!amount&&!frequency&&!timing&&!med.asNeeded)return med.doseText||'';
    const take=[amount,frequency,timing].filter(Boolean).join(' ');
    return [strength,take?`Take ${take}`:'',med.asNeeded?'as needed':''].filter(Boolean).join(' • ');
  }
  function renderLiveMedicationCards(){
    const container=document.getElementById('medicationCards');if(!container)return;
    if(!liveMedications.length){
      container.innerHTML='<article class="panel"><div class="empty-state"><h3>No medications added</h3><p>Add a medication to create your schedule.</p></div></article>';
      return;
    }
    container.innerHTML=liveMedications.map(med=>{
      const scheduleText=med.asNeeded?'As needed':med.schedules?.length?med.schedules.map(s=>escapeHtml(s.time)).join(', '):'No active reminder';
      return `<article class="med-card">
        <div class="med-card-top">
          <div class="med-icon">✚</div>
          <span class="pill">Your entry</span>
          <button type="button" class="outline" data-edit-medication="${escapeHtml(med.id)}">Edit</button>
        </div>
        <h3>${escapeHtml(med.name)}</h3>
        <div class="med-meta">${escapeHtml(instructionText(med))}<br/>${scheduleText}</div>
        <div class="small muted" style="margin-top:10px">Entered and maintained by the account holder.</div>
      </article>`;
    }).join('');
  }
  function reminderForDose(dose){
    return liveReminderEvents.find(event=>event.scheduleId===dose.scheduleId&&event.scheduledDate===(dose.scheduledDate||localDate()))||null;
  }
  renderDoses=function(){
    baseRenderDoses();
    if(liveEnabled)renderLiveMedicationCards();
  };
  renderReminders=function(){
    if(!liveEnabled){baseRenderReminders();return;}
    const timeline=document.getElementById('reminderTimeline');if(!timeline)return;
    timeline.innerHTML=doses
      .slice()
      .sort((a,b)=>doseMinutes(a.time)-doseMinutes(b.time))
      .map(d=>{
        const reminder=reminderForDose(d);
        const state=d.checked?'recorded':reminder?.status==='dismissed'?'dismissed':reminder?'due':'upcoming';
        const label=state==='recorded'?'Recorded':state==='due'?'Due':state==='dismissed'?'Dismissed':'Upcoming';
        const detail=state==='recorded'
          ?`Recorded by user at ${escapeHtml(d.recorded||'just now')}`
          :state==='due'
            ?'Reminder is due now'
            :state==='dismissed'
              ?'Reminder dismissed by user'
              :'Scheduled reminder';
        return `<div class="timeline-row ${state==='recorded'?'complete':''}">
          <div class="timeline-time">${escapeHtml(d.time)}</div>
          <div><strong>${escapeHtml(d.medication)}</strong><span>${detail}</span></div>
          <div class="pill ${state==='recorded'?'success':''}">${label}</div>
        </div>`;
      }).join('');
    renderDashboardSummary();
  };

  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(data.error||`Request failed (${response.status})`);error.status=response.status;throw error;}
    return data;
  }
  async function loadReminderEvents(render=true){
    try{
      const data=await api(`/api/member/reminder-events?date=${encodeURIComponent(localDate())}`,{method:'GET',headers:{}});
      liveReminderEvents=Array.isArray(data.events)?data.events:[];
      if(render)renderReminders();
    }catch(error){
      if(error.status!==401)console.error('Reminder event load failed',error);
    }
  }
  async function load(){
    try{
      const data=await api(`/api/member/medications?date=${encodeURIComponent(localDate())}`,{method:'GET',headers:{}});
      liveEnabled=true;
      liveMedications=Array.isArray(data.medications)?data.medications:[];
      doses=Array.isArray(data.doses)?data.doses:[];
      await loadReminderEvents(false);
      const reset=document.getElementById('demoReset');if(reset)reset.hidden=true;
      renderDoses();renderReminders();renderDashboardSummary();
    }catch(error){
      if(error.status!==401)console.error('Medication persistence load failed',error);
    }
  }
  async function syncReminderStatus(dose,checked){
    const reminder=reminderForDose(dose);if(!reminder)return;
    try{
      const result=await api(`/api/member/reminder-events/${encodeURIComponent(reminder.id)}`,{
        method:'PUT',body:JSON.stringify({status:checked?'acknowledged':'due'})
      });
      reminder.status=result.status;
      if(checked)reminder.acknowledgedAt=result.updatedAt||new Date().toISOString();
    }catch(error){
      console.error('Reminder status sync failed',error);
    }
  }
  async function persistDose(dose,checked){
    if(!dose?.scheduleId)return;
    try{
      const result=await api(`/api/member/dose-records/${encodeURIComponent(dose.scheduleId)}`,{
        method:'PUT',body:JSON.stringify({date:dose.scheduledDate||localDate(),recorded:checked})
      });
      dose.checked=Boolean(result.recorded);
      dose.recordedAt=result.recordedAt||null;
      dose.recorded=result.recordedAt?new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(result.recordedAt)):null;
      await syncReminderStatus(dose,dose.checked);
      renderDoses();renderReminders();
    }catch(error){
      console.error('Dose record persistence failed',error);await load();alert(error.message||'Aria could not save that dose record. Please try again.');
    }
  }

  function openMedicationEditor(med){
    if(!med)return;
    const schedule=med.schedules?.[0]||null;
    openModal(`
      <div class="eyebrow">MEDICATION</div>
      <h2 id="modalTitle">Edit medication</h2>
      <p>Update the information you entered. Aria will store your changes and will not infer medication instructions for you.</p>
      <div class="form-grid">
        <label>Medication name<input id="editMedName" maxlength="100" autocomplete="off"/></label>
        <label>Strength / dose unit<input id="editMedStrength" maxlength="80" autocomplete="off"/></label>
        <label>Amount to take<input id="editMedAmount" maxlength="80" autocomplete="off"/></label>
        <label>Schedule type<select id="editMedType"><option value="scheduled">Scheduled</option><option value="needed">As needed</option></select></label>
      </div>
      <div class="form-grid" id="editScheduledMedicationFields">
        <label>How often<input id="editMedFrequency" maxlength="80" autocomplete="off"/></label>
        <label>When<input id="editMedTiming" maxlength="80" autocomplete="off"/></label>
        <label>Reminder time<input id="editMedTime" placeholder="8:00 AM" maxlength="20" autocomplete="off"/></label>
      </div>
      <div class="modal-actions"><button class="primary" id="saveEditedMed">Save changes</button><button class="outline" id="cancelEditedMed">Cancel</button></div>`);

    const name=document.getElementById('editMedName');
    const strength=document.getElementById('editMedStrength');
    const amount=document.getElementById('editMedAmount');
    const type=document.getElementById('editMedType');
    const frequency=document.getElementById('editMedFrequency');
    const timing=document.getElementById('editMedTiming');
    const time=document.getElementById('editMedTime');
    const scheduledFields=document.getElementById('editScheduledMedicationFields');
    name.value=med.name||'';
    strength.value=med.strengthText||'';
    amount.value=med.amountText||'';
    frequency.value=med.frequencyText||'';
    timing.value=med.timingText||'';
    time.value=schedule?.time||'';
    type.value=med.asNeeded?'needed':'scheduled';
    scheduledFields.hidden=med.asNeeded;
    type.onchange=()=>{scheduledFields.hidden=type.value==='needed';};
    document.getElementById('cancelEditedMed').onclick=closeModal;
    document.getElementById('saveEditedMed').onclick=async()=>{
      const asNeeded=type.value==='needed';
      const enteredTime=time.value.trim();
      const timeLocal=asNeeded?null:to24Hour(enteredTime);
      const payload={
        name:name.value.trim(),
        strengthText:strength.value.trim(),
        amountText:amount.value.trim(),
        frequencyText:asNeeded?'':frequency.value.trim(),
        timingText:asNeeded?'':timing.value.trim(),
        asNeeded,
        timeLocal,
        scheduleId:schedule?.id||null,
        daysOfWeek:schedule?.daysOfWeek||[0,1,2,3,4,5,6],
        timezone:schedule?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||null
      };
      if(!payload.name||!payload.strengthText||!payload.amountText){alert('Enter the medication name, strength, and amount to take.');return;}
      if(!asNeeded&&(!payload.frequencyText||!payload.timingText||!timeLocal)){alert('For a scheduled medication, enter how often, when, and a valid reminder time such as 8:00 AM.');return;}
      const save=document.getElementById('saveEditedMed');save.disabled=true;save.textContent='Saving…';
      try{
        await api(`/api/member/medications/${encodeURIComponent(med.id)}`,{method:'PATCH',body:JSON.stringify(payload)});
        closeModal();await load();
      }catch(error){
        console.error('Medication update failed',error);save.disabled=false;save.textContent='Save changes';alert(error.message||'Aria could not update that medication.');
      }
    };
  }

  document.addEventListener('change',event=>{
    if(!liveEnabled||!event.target.matches('[data-dose-id]'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const dose=doses.find(item=>item.id===event.target.dataset.doseId);
    if(dose?.scheduleId)persistDose(dose,event.target.checked);
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-edit-medication]');
    if(!button||!liveEnabled)return;
    event.preventDefault();event.stopImmediatePropagation();
    const med=liveMedications.find(item=>item.id===button.dataset.editMedication);
    openMedicationEditor(med);
  },true);

  const addButton=document.getElementById('addMedicationBtn');
  addButton?.addEventListener('click',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    openModal(`
      <div class="eyebrow">MEDICATION</div>
      <h2 id="modalTitle">Add medication</h2>
      <p>Enter the instructions exactly as you want Aria to record them. Aria will not infer or change your medication instructions.</p>
      <div class="form-grid">
        <label>Medication name<input id="newMedName" maxlength="100" autocomplete="off" placeholder="Tylenol"/></label>
        <label>Strength / dose unit<input id="newMedStrength" maxlength="80" autocomplete="off" placeholder="200 mg"/></label>
        <label>Amount to take<input id="newMedAmount" maxlength="80" autocomplete="off" placeholder="1 tablet"/></label>
        <label>Schedule type<select id="newMedType"><option value="scheduled">Scheduled</option><option value="needed">As needed</option></select></label>
      </div>
      <div class="form-grid" id="scheduledMedicationFields">
        <label>How often<input id="newMedFrequency" maxlength="80" autocomplete="off" placeholder="once a day"/></label>
        <label>When<input id="newMedTiming" maxlength="80" autocomplete="off" placeholder="every morning"/></label>
        <label>Reminder time<input id="newMedTime" placeholder="8:00 AM" maxlength="20" autocomplete="off"/></label>
      </div>
      <div class="modal-actions"><button class="primary" id="saveLiveMed">Add medication</button><button class="outline" id="cancelLiveMed">Cancel</button></div>`);
    const type=document.getElementById('newMedType');
    const scheduledFields=document.getElementById('scheduledMedicationFields');
    type.onchange=()=>{scheduledFields.hidden=type.value==='needed';};
    document.getElementById('cancelLiveMed').onclick=closeModal;
    document.getElementById('saveLiveMed').onclick=async()=>{
      const name=document.getElementById('newMedName').value.trim();
      const strengthText=document.getElementById('newMedStrength').value.trim();
      const amountText=document.getElementById('newMedAmount').value.trim();
      const asNeeded=type.value==='needed';
      const frequencyText=document.getElementById('newMedFrequency').value.trim();
      const timingText=document.getElementById('newMedTiming').value.trim();
      const enteredTime=document.getElementById('newMedTime').value.trim();
      const timeLocal=asNeeded?null:to24Hour(enteredTime);
      if(!name||!strengthText||!amountText){alert('Enter the medication name, strength, and amount to take.');return;}
      if(!asNeeded&&(!frequencyText||!timingText||!timeLocal)){alert('For a scheduled medication, enter how often, when, and a valid reminder time such as 8:00 AM.');return;}

      if(!liveEnabled){
        const detail=[strengthText,`Take ${[amountText,frequencyText,timingText].filter(Boolean).join(' ')}`,asNeeded?'as needed':''].filter(Boolean).join(' • ')+' • user-entered';
        doses.push({id:`dose-${Date.now()}`,medication:name,detail,time:asNeeded?'As needed':enteredTime,checked:false});
        saveDemo();renderDoses();renderReminders();closeModal();return;
      }

      const save=document.getElementById('saveLiveMed');save.disabled=true;save.textContent='Saving…';
      try{
        await api('/api/member/medications',{method:'POST',body:JSON.stringify({
          name,strengthText,amountText,frequencyText:asNeeded?'':frequencyText,timingText:asNeeded?'':timingText,asNeeded,timeLocal,
          timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null
        })});
        closeModal();await load();
      }catch(error){
        console.error('Medication create failed',error);save.disabled=false;save.textContent='Add medication';alert(error.message||'Aria could not add that medication.');
      }
    };
  },true);

  load();
  setInterval(()=>{if(liveEnabled)loadReminderEvents();},60000);
})();