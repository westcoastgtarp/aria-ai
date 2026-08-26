(()=>{
  let liveEnabled=false;

  function localDate(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function to24Hour(value){
    const raw=String(value||'').trim();
    if(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw))return raw;
    const match=raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if(!match)return null;
    let hour=Number(match[1]);const minute=Number(match[2]);
    if(hour<1||hour>12||minute<0||minute>59)return null;
    hour%=12;if(match[3].toUpperCase()==='PM')hour+=12;
    return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }
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
      console.error('Dose record persistence failed',error);
      await load();
      alert(error.message||'Aria could not save that dose record. Please try again.');
    }
  }

  document.addEventListener('change',event=>{
    if(!liveEnabled||!event.target.matches('[data-dose-id]'))return;
    const dose=doses.find(item=>item.id===event.target.dataset.doseId);
    if(dose?.scheduleId)persistDose(dose,event.target.checked);
  });

  const addButton=document.getElementById('addMedicationBtn');
  addButton?.addEventListener('click',event=>{
    if(!liveEnabled)return;
    event.preventDefault();event.stopImmediatePropagation();
    openModal(`
      <div class="eyebrow">MEDICATION</div>
      <h2 id="modalTitle">Add medication</h2>
      <p>Enter the medication, dose text, and reminder time exactly as you want Aria to record them.</p>
      <div class="form-grid">
        <label>Medication<input id="newMedName" maxlength="100" autocomplete="off"/></label>
        <label>Dose<input id="newMedDose" maxlength="100" autocomplete="off"/></label>
        <label>Time<input id="newMedTime" placeholder="6:00 PM" maxlength="20" autocomplete="off"/></label>
      </div>
      <div class="modal-actions"><button class="primary" id="saveLiveMed">Add medication</button><button class="outline" id="cancelLiveMed">Cancel</button></div>`);
    document.getElementById('cancelLiveMed').onclick=closeModal;
    document.getElementById('saveLiveMed').onclick=async()=>{
      const name=document.getElementById('newMedName').value.trim();
      const doseText=document.getElementById('newMedDose').value.trim();
      const enteredTime=document.getElementById('newMedTime').value.trim();
      const timeLocal=to24Hour(enteredTime);
      if(!name||!doseText||!timeLocal){alert('Enter a medication name, dose text, and a valid time such as 6:00 PM.');return;}
      const save=document.getElementById('saveLiveMed');save.disabled=true;save.textContent='Saving…';
      try{
        await api('/api/member/medications',{method:'POST',body:JSON.stringify({name,doseText,timeLocal,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null})});
        closeModal();await load();
      }catch(error){
        console.error('Medication create failed',error);save.disabled=false;save.textContent='Add medication';alert(error.message||'Aria could not add that medication.');
      }
    };
  },true);

  load();
})();
