(()=>{
  let liveEnabled=false;
  let liveMedications=[];
  const baseRenderDoses=renderDoses;

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
        <div class="med-card-top"><div class="med-icon">✚</div><span class="pill">Your entry</span></div>
        <h3>${escapeHtml(med.name)}</h3>
        <div class="med-meta">${escapeHtml(instructionText(med))}<br/>${scheduleText}</div>
        <div class="small muted" style="margin-top:10px">Entered and maintained by the account holder.</div>
      </article>`;
    }).join('');
  }
  renderDoses=function(){
    baseRenderDoses();
    if(liveEnabled)renderLiveMedicationCards();
  };

  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(data.error||`Request failed (${response.status})`);error.status=response.status;throw error;}
    return data;
  }
  async function load(){
    try{
      const data=await api(`/api/member/medications?date=${encodeURIComponent(localDate())}`,{method:'GET',headers:{}});
      liveEnabled=true;
      liveMedications=Array.isArray(data.medications)?data.medications:[];
      doses=Array.isArray(data.doses)?data.doses:[];
      const reset=document.getElementById('demoReset');if(reset)reset.hidden=true;
      renderDoses();renderReminders();renderDashboardSummary();
    }catch(error){
      if(error.status!==401)console.error('Medication persistence load failed',error);
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
      renderDoses();renderReminders();
    }catch(error){
      console.error('Dose record persistence failed',error);await load();alert(error.message||'Aria could not save that dose record. Please try again.');
    }
  }

  document.addEventListener('change',event=>{
    if(!liveEnabled||!event.target.matches('[data-dose-id]'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const dose=doses.find(item=>item.id===event.target.dataset.doseId);
    if(dose?.scheduleId)persistDose(dose,event.target.checked);
  },true);

  const addButton=document.getElementById('addMedicationBtn');
  addButton?.addEventListener('click',event=>{
    if(!liveEnabled)return;
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
})();
