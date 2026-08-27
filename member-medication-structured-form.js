(()=>{
  if(window.__ariaStructuredMedicationForm)return;
  window.__ariaStructuredMedicationForm=true;

  const units=[
    ['mcg','mcg'],['mg','mg'],['g','g'],['mL','mL'],['L','L'],['fl oz','fl oz'],['oz','oz'],
    ['tsp','tsp'],['tbsp','tbsp'],['IU','IU'],['unit','unit'],['units','units'],
    ['tablet','tablet'],['tablets','tablets'],['capsule','capsule'],['capsules','capsules'],
    ['softgel','softgel'],['softgels','softgels'],['drop','drop'],['drops','drops'],
    ['puff','puff'],['puffs','puffs'],['spray','spray'],['sprays','sprays'],
    ['patch','patch'],['patches','patches'],['packet','packet'],['packets','packets'],
    ['scoop','scoop'],['scoops','scoops'],['lozenge','lozenge'],['lozenges','lozenges'],
    ['suppository','suppository'],['suppositories','suppositories'],
    ['inhalation','inhalation'],['inhalations','inhalations'],
    ['application','application'],['applications','applications'],['other','Other']
  ];
  const knownUnits=new Set(units.filter(([value])=>value!=='other').map(([value])=>value));

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
  function timeOptions(selected=''){
    let html='<option value="">Select time</option>';
    for(let minute=0;minute<24*60;minute+=15){
      const h=Math.floor(minute/60);const m=minute%60;
      const value=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      html+=`<option value="${value}" ${value===selected?'selected':''}>${displayTime(value)}</option>`;
    }
    return html;
  }
  function slotLabels(count){
    if(count===1)return ['Reminder time'];
    if(count===2)return ['AM time','Night time'];
    if(count===3)return ['AM time','Afternoon time','Night time'];
    return ['AM time','Midday time','Evening time','Night time'];
  }
  function unitOptions(selected=''){
    return units.map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
  }
  function parseDose(med){
    const raw=String(med?.strengthText||med?.doseText||'').trim();
    const match=raw.match(/^([0-9][0-9./\s]*?)\s*([A-Za-zµμ].*)$/);
    if(match){
      const unit=match[2].trim();
      return {amount:match[1].trim(),unit:knownUnits.has(unit)?unit:'other',customUnit:knownUnits.has(unit)?'':unit};
    }
    return {amount:raw,unit:'mg',customUnit:''};
  }
  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
    return data;
  }
  async function fetchMedication(id){
    const data=await api(`/api/member/medications?date=${encodeURIComponent(localDate())}`,{method:'GET',headers:{}});
    return (data.medications||[]).find(item=>item.id===id)||null;
  }

  function renderTimes(count,selectedTimes=[]){
    const container=document.getElementById('structuredMedicationTimes');if(!container)return;
    const labels=slotLabels(count);
    container.innerHTML=labels.map((label,index)=>`
      <label>${escapeHtml(label)}
        <select class="structured-time" data-time-index="${index}">${timeOptions(selectedTimes[index]||'')}</select>
      </label>`).join('');
  }

  function openForm(med=null){
    if(typeof window.openModal!=='function')return;
    const dose=parseDose(med);
    const schedules=(med?.schedules||[]).slice().sort((a,b)=>String(a.timeLocal||'').localeCompare(String(b.timeLocal||'')));
    const currentCount=med?.asNeeded?1:Math.min(4,Math.max(1,schedules.length||1));
    const currentTimes=schedules.map(item=>item.timeLocal);
    const currentUnit=dose.unit||'mg';

    window.openModal(`
      <div class="eyebrow">MEDICATION</div>
      <h2 id="modalTitle">${med?'Edit medication':'Add medication'}</h2>
      <p>Enter the medication exactly as you take it. Aria records your selections and does not choose a dose or schedule for you.</p>

      <div class="structured-med-grid">
        <label class="structured-wide">Medication name
          <input id="structuredMedName" maxlength="100" autocomplete="off" placeholder="Tylenol" value="${escapeHtml(med?.name||'')}" />
        </label>
        <label>Dose amount
          <input id="structuredDoseAmount" maxlength="20" autocomplete="off" inputmode="decimal" placeholder="200" value="${escapeHtml(dose.amount||'')}" />
        </label>
        <label>Dose unit / form
          <select id="structuredDoseUnit">${unitOptions(currentUnit)}</select>
        </label>
        <label class="structured-wide" id="structuredOtherUnitWrap" ${currentUnit==='other'?'':'hidden'}>Other dose unit / form
          <input id="structuredOtherUnit" maxlength="40" autocomplete="off" placeholder="Enter unit or form" value="${escapeHtml(dose.customUnit||'')}" />
        </label>
        <label>Schedule type
          <select id="structuredScheduleType">
            <option value="scheduled" ${med?.asNeeded?'':'selected'}>Scheduled</option>
            <option value="needed" ${med?.asNeeded?'selected':''}>As needed</option>
          </select>
        </label>
        <label id="structuredTimesPerDayWrap">How many times per day
          <select id="structuredTimesPerDay">
            <option value="1" ${currentCount===1?'selected':''}>Once</option>
            <option value="2" ${currentCount===2?'selected':''}>Twice</option>
            <option value="3" ${currentCount===3?'selected':''}>Three times</option>
            <option value="4" ${currentCount===4?'selected':''}>Four times</option>
          </select>
        </label>
      </div>

      <div class="structured-time-heading" id="structuredTimeHeading">Reminder times</div>
      <div class="structured-time-grid" id="structuredMedicationTimes"></div>
      <div class="small muted structured-note">Choose each time yourself. Aria will not infer medication timing.</div>

      <div class="modal-actions">
        <button class="primary" id="saveStructuredMedication">${med?'Save changes':'Add medication'}</button>
        <button class="outline" id="cancelStructuredMedication">Cancel</button>
      </div>`);

    const type=document.getElementById('structuredScheduleType');
    const count=document.getElementById('structuredTimesPerDay');
    const countWrap=document.getElementById('structuredTimesPerDayWrap');
    const heading=document.getElementById('structuredTimeHeading');
    const timesContainer=document.getElementById('structuredMedicationTimes');
    const unit=document.getElementById('structuredDoseUnit');
    const otherWrap=document.getElementById('structuredOtherUnitWrap');

    function updateScheduleVisibility(){
      const needed=type.value==='needed';
      countWrap.hidden=needed;heading.hidden=needed;timesContainer.hidden=needed;
      if(!needed){
        const existing=[...timesContainer.querySelectorAll('.structured-time')].map(select=>select.value);
        renderTimes(Number(count.value),existing.length?existing:currentTimes);
      }
    }
    unit.onchange=()=>{otherWrap.hidden=unit.value!=='other';};
    count.onchange=()=>{
      const existing=[...document.querySelectorAll('.structured-time')].map(select=>select.value);
      renderTimes(Number(count.value),existing);
    };
    type.onchange=updateScheduleVisibility;
    renderTimes(currentCount,currentTimes);
    updateScheduleVisibility();

    document.getElementById('cancelStructuredMedication').onclick=()=>window.closeModal?.();
    document.getElementById('saveStructuredMedication').onclick=async()=>{
      const name=document.getElementById('structuredMedName').value.trim();
      const doseAmount=document.getElementById('structuredDoseAmount').value.trim();
      const doseUnit=document.getElementById('structuredDoseUnit').value;
      const customDoseUnit=document.getElementById('structuredOtherUnit').value.trim();
      const asNeeded=type.value==='needed';
      const timesPerDay=asNeeded?0:Number(count.value);
      const scheduleTimes=asNeeded?[]:[...document.querySelectorAll('.structured-time')].map(select=>select.value);
      if(!name||!doseAmount){alert('Enter the medication name and dose amount.');return;}
      if(doseUnit==='other'&&!customDoseUnit){alert('Enter the Other dose unit or form.');return;}
      if(!asNeeded&&scheduleTimes.some(time=>!time)){alert('Select a time for each scheduled dose.');return;}

      const save=document.getElementById('saveStructuredMedication');
      save.disabled=true;save.textContent='Saving…';
      try{
        await api(med?`/api/member/medications/${encodeURIComponent(med.id)}`:'/api/member/medications',{
          method:med?'PATCH':'POST',
          body:JSON.stringify({
            name,doseAmount,doseUnit,customDoseUnit,asNeeded,timesPerDay,scheduleTimes,
            timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null
          })
        });
        window.closeModal?.();
        location.reload();
      }catch(error){
        console.error('Structured medication save failed',error);
        save.disabled=false;save.textContent=med?'Save changes':'Add medication';
        alert(error.message||'Aria could not save that medication.');
      }
    };
  }

  document.addEventListener('click',async event=>{
    const addButton=event.target.closest?.('#addMedicationBtn');
    const editButton=event.target.closest?.('[data-edit-medication]');
    if(!addButton&&!editButton)return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if(addButton){openForm(null);return;}
    const id=editButton.dataset.editMedication;if(!id)return;
    const original=editButton.textContent;editButton.disabled=true;editButton.textContent='Loading…';
    try{
      const med=await fetchMedication(id);
      if(!med)throw new Error('Medication not found.');
      openForm(med);
    }catch(error){
      console.error('Medication editor load failed',error);
      alert(error.message||'Aria could not load that medication.');
    }finally{
      editButton.disabled=false;editButton.textContent=original;
    }
  },true);
})();
