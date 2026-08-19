const initialDoses = [
  { id:'dose-a-am', medication:'Demo Medication A', detail:'10 mg • user-entered', time:'8:00 AM', checked:true, recorded:'8:06 AM' },
  { id:'dose-b-noon', medication:'Demo Medication B', detail:'5 mg • user-entered', time:'12:00 PM', checked:true, recorded:'12:03 PM' },
  { id:'dose-c-pm', medication:'Demo Medication C', detail:'1 tablet • user-entered', time:'4:00 PM', checked:false },
  { id:'dose-a-pm', medication:'Demo Medication A', detail:'10 mg • user-entered', time:'8:00 PM', checked:false },
];

let doses = JSON.parse(sessionStorage.getItem('aria-demo-doses') || 'null') || structuredClone(initialDoses);
let incidents = JSON.parse(sessionStorage.getItem('aria-demo-incidents') || '[]');
let chatRisk = 'normal';
const riskLevels = ['normal','concern','high','critical'];
const memberName = sessionStorage.getItem('aria-member-name') || 'Demo Member';

function nowTime(){
  return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());
}

function greetingForNow(){
  const hour=new Date().getHours();
  if(hour<12)return `Good morning, ${memberName}`;
  if(hour<18)return `Good afternoon, ${memberName}`;
  return `Good evening, ${memberName}`;
}

function saveDemo(){
  sessionStorage.setItem('aria-demo-doses',JSON.stringify(doses));
  sessionStorage.setItem('aria-demo-incidents',JSON.stringify(incidents));
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
}

function renderDoses(){
  const dashboard=document.getElementById('dashboardMedicationList');
  const medicationCards=document.getElementById('medicationCards');
  dashboard.innerHTML='';

  doses.forEach(dose=>{
    const row=document.createElement('div');
    row.className='dose-row';
    row.innerHTML=`
      <input class="dose-check" type="checkbox" data-dose-id="${dose.id}" ${dose.checked?'checked':''} aria-label="Mark ${escapeHtml(dose.medication)} ${dose.time} as recorded" />
      <div><strong>${escapeHtml(dose.medication)}</strong><span>${escapeHtml(dose.detail)}${dose.checked?` • Recorded ${dose.recorded||'just now'}`:' • Not recorded'}</span></div>
      <div class="dose-time">${dose.time}</div>`;
    dashboard.appendChild(row);
  });

  const groups=Object.groupBy(doses,d=>d.medication);
  medicationCards.innerHTML=Object.entries(groups).map(([name,group])=>`
    <article class="med-card">
      <div class="med-card-top"><div class="med-icon">✚</div><span class="pill">Your entry</span></div>
      <h3>${escapeHtml(name)}</h3>
      <div class="med-meta">${escapeHtml(group[0].detail)}<br/>Schedule entered by account holder</div>
      <div class="med-doses">
        ${group.map(d=>`<div class="med-dose-row"><label><input class="dose-check" type="checkbox" data-dose-id="${d.id}" ${d.checked?'checked':''}/><span>${d.time}</span></label><span class="pill ${d.checked?'success':''}">${d.checked?'Recorded':'Not recorded'}</span></div>`).join('')}
      </div>
    </article>`).join('');

  const done=doses.filter(d=>d.checked).length;
  document.getElementById('todayProgress').textContent=`${done} of ${doses.length}`;
  document.getElementById('todayProgressBar').style.width=`${Math.round((done/doses.length)*100)}%`;

  document.querySelectorAll('[data-dose-id]').forEach(box=>{
    box.addEventListener('change',e=>{
      const dose=doses.find(d=>d.id===e.target.dataset.doseId);
      if(!dose)return;
      dose.checked=e.target.checked;
      dose.recorded=e.target.checked?nowTime():undefined;
      saveDemo();
      renderDoses();
      renderReminders();
    });
  });
}

function renderReminders(){
  const timeline=document.getElementById('reminderTimeline');
  timeline.innerHTML=doses.map(d=>`
    <div class="timeline-row ${d.checked?'complete':''}">
      <div class="timeline-time">${d.time}</div>
      <div><strong>${escapeHtml(d.medication)}</strong><span>${d.checked?`Recorded by user at ${d.recorded||'just now'}`:'Scheduled reminder'}</span></div>
      <div class="pill ${d.checked?'success':''}">${d.checked?'Recorded':'Upcoming'}</div>
    </div>`).join('');
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));
  const target=document.getElementById(`${page}-page`);
  if(target)target.classList.add('active');
  const names={dashboard:greetingForNow(),medications:'Medications',reminders:'Reminders',carecircle:'Care Circle',incidents:'Incident History & Timeline',privacy:'Privacy & Security'};
  document.getElementById('pageTitle').textContent=names[page]||'Aria AI';
  document.querySelector('.sidebar').classList.remove('open');
}

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
document.getElementById('mobileMenu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));

function detectRisk(text){
  const t=text.toLowerCase();
  const critical=['kill myself','suicide','want to die','can’t breathe','cant breathe','chest pain','overdose','unconscious','not safe alone','immediate danger'];
  const high=['feel unsafe','need help now','very dizzy','severe pain','someone is hurting me','getting worse','alone and scared'];
  const concern=['scared','worried','dizzy','pain','don’t feel right','dont feel right','bad reaction','side effect'];
  if(critical.some(k=>t.includes(k)))return 'critical';
  if(high.some(k=>t.includes(k)))return 'high';
  if(concern.some(k=>t.includes(k)))return 'concern';
  return 'normal';
}

function applyRisk(newRisk){
  const currentIndex=riskLevels.indexOf(chatRisk);
  const newIndex=riskLevels.indexOf(newRisk);
  chatRisk=riskLevels[Math.max(currentIndex,newIndex)];

  if((chatRisk==='high'||chatRisk==='critical')&&!incidents.some(i=>i.open)){
    incidents.unshift({id:`LFL-DEMO-${String(Date.now()).slice(-6)}`,started:nowTime(),level:chatRisk,open:true});
    saveDemo();
    renderIncidents();
  }else if(incidents[0]?.open){
    incidents[0].level=chatRisk;
    saveDemo();
    renderIncidents();
  }
}

function ariaResponse(risk){
  if(risk==='critical')return 'I’m concerned that what you described may need immediate medical attention. Please contact local emergency services now or reach someone you trust who can stay with you.';
  if(risk==='high')return 'I’m concerned about what you’re describing. Would you like help reaching someone in your Care Circle? If you may be in immediate danger, contact local emergency services now.';
  if(risk==='concern')return 'I’m here with you. Tell me a little more about what you’re experiencing. If it becomes severe or you feel unsafe, seek immediate medical help.';
  return 'I’m here to help with your medication schedule, reminders, and day-to-day support. What can I help you with?';
}

function medicationStatusIntent(text){
  const t=text.toLowerCase();
  const phrases=['did i take','have i taken','did i already take','have i already taken','was my medication taken','was my medicine taken'];
  return phrases.some(phrase=>t.includes(phrase));
}

function doseMinutes(time){
  const match=String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!match)return Number.MAX_SAFE_INTEGER;
  let hour=Number(match[1])%12;
  const minute=Number(match[2]);
  if(match[3].toUpperCase()==='PM')hour+=12;
  return (hour*60)+minute;
}

function findMedicationStatus(text){
  if(!medicationStatusIntent(text))return null;

  const t=text.toLowerCase();
  const medicationNames=[...new Set(doses.map(d=>d.medication))];
  const matchedName=medicationNames
    .sort((a,b)=>b.length-a.length)
    .find(name=>t.includes(name.toLowerCase()));

  if(!matchedName)return null;

  const matches=doses.filter(d=>d.medication===matchedName);
  const now=new Date();
  const currentMinutes=(now.getHours()*60)+now.getMinutes();
  const due=matches
    .filter(d=>doseMinutes(d.time)<=currentMinutes)
    .sort((a,b)=>doseMinutes(b.time)-doseMinutes(a.time));
  const dose=due[0] || matches.sort((a,b)=>doseMinutes(a.time)-doseMinutes(b.time))[0];

  return {
    medication:dose.medication,
    taken:dose.checked?'Yes':'No',
    recorded:dose.checked?(dose.recorded||'Recorded'):'Not recorded'
  };
}

function medicationStatusMessage(status){
  return `Medication: ${status.medication}\nTaken: ${status.taken}\nRecorded: ${status.recorded}`;
}

function openAria(){
  document.getElementById('ariaBubblePanel').hidden=false;
  document.getElementById('ariaBubbleInput').focus();
}
function closeAria(){document.getElementById('ariaBubblePanel').hidden=true;}

document.getElementById('ariaChatLauncher').addEventListener('click',()=>{
  const panel=document.getElementById('ariaBubblePanel');
  panel.hidden=!panel.hidden;
  if(!panel.hidden)document.getElementById('ariaBubbleInput').focus();
});
document.getElementById('ariaChatClose').addEventListener('click',closeAria);
document.getElementById('openAriaFromHero').addEventListener('click',openAria);
document.getElementById('openAriaCard').addEventListener('click',openAria);

function addBubbleMessage(type,text){
  const log=document.getElementById('ariaBubbleLog');
  const div=document.createElement('div');
  div.className=`aria-bubble-msg ${type}`;
  div.innerHTML=`${escapeHtml(text).replace(/\n/g,'<br>')}<span class="aria-bubble-time">${nowTime()}</span>`;
  log.appendChild(div);
  log.scrollTop=log.scrollHeight;
}

function addSafetyActions(){
  const log=document.getElementById('ariaBubbleLog');
  if(log.querySelector('.aria-bubble-actions'))return;
  const wrap=document.createElement('div');
  wrap.className='aria-bubble-actions';
  wrap.innerHTML='<button class="contact" id="bubbleContactCare">Contact Care Circle</button><button class="emergency" id="bubbleEmergency">Emergency services</button>';
  log.appendChild(wrap);
  document.getElementById('bubbleContactCare').onclick=()=>openModal('<div class="eyebrow">CARE CIRCLE</div><h2 id="modalTitle">Reach someone you trust</h2><p>In production, Aria can surface your configured contact methods here. This demo does not place calls or send messages.</p>');
  document.getElementById('bubbleEmergency').onclick=()=>openModal('<div class="eyebrow">EMERGENCY SUPPORT</div><h2 id="modalTitle">Emergency services</h2><p><strong>This demo cannot place or dispatch emergency calls.</strong> If this is a real emergency, use your phone or local emergency-service method now.</p>');
  log.scrollTop=log.scrollHeight;
}

function sendBubbleMessage(){
  const input=document.getElementById('ariaBubbleInput');
  const text=input.value.trim();
  if(!text)return;
  addBubbleMessage('user',text);
  input.value='';

  const medicationStatus=findMedicationStatus(text);
  if(medicationStatus){
    setTimeout(()=>addBubbleMessage('aria',medicationStatusMessage(medicationStatus)),180);
    return;
  }

  const risk=detectRisk(text);
  applyRisk(risk);
  setTimeout(()=>{
    addBubbleMessage('aria',ariaResponse(risk));
    if(risk==='high'||risk==='critical')addSafetyActions();
  },180);
}

document.getElementById('ariaBubbleSend').addEventListener('click',sendBubbleMessage);
document.getElementById('ariaBubbleInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendBubbleMessage();});

function renderIncidents(){
  const empty=document.getElementById('incidentEmpty');
  const list=document.getElementById('incidentList');
  empty.classList.toggle('hidden',incidents.length>0);
  list.innerHTML=incidents.map(i=>`
    <div class="incident-row">
      <div><strong>${i.id}</strong><span>Started ${i.started} • Synthetic demo event • Timestamped conversation retained separately in production</span></div>
      <span class="risk-badge ${i.level}">${i.level.toUpperCase()}</span>
    </div>`).join('');
}

function openModal(html){
  document.getElementById('modalBody').innerHTML=html;
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function closeModal(){document.getElementById('modalBackdrop').classList.add('hidden');}
document.getElementById('modalClose').addEventListener('click',closeModal);
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});

document.getElementById('addMedicationBtn').addEventListener('click',()=>{
  openModal(`
    <div class="eyebrow">MEDICATION</div>
    <h2 id="modalTitle">Add medication</h2>
    <p>For this public demo, use synthetic information only.</p>
    <div class="form-grid">
      <label>Medication<input id="newMedName" value="Demo Medication D" maxlength="40"/></label>
      <label>Dose<input id="newMedDose" value="1 tablet" maxlength="30"/></label>
      <label>Time<input id="newMedTime" value="6:00 PM" maxlength="20"/></label>
    </div>
    <div class="modal-actions"><button class="primary" id="saveDemoMed">Add medication</button><button class="outline" id="cancelDemoMed">Cancel</button></div>`);
  document.getElementById('cancelDemoMed').onclick=closeModal;
  document.getElementById('saveDemoMed').onclick=()=>{
    const name=document.getElementById('newMedName').value.trim()||'Demo Medication';
    const detail=(document.getElementById('newMedDose').value.trim()||'demo dose')+' • user-entered';
    const time=document.getElementById('newMedTime').value.trim()||'6:00 PM';
    doses.push({id:`dose-${Date.now()}`,medication:name,detail,time,checked:false});
    saveDemo();renderDoses();renderReminders();closeModal();
  };
});

document.getElementById('demoReset').addEventListener('click',()=>{
  sessionStorage.removeItem('aria-demo-doses');
  sessionStorage.removeItem('aria-demo-incidents');
  location.reload();
});

renderDoses();
renderReminders();
renderIncidents();
showPage('dashboard');
addBubbleMessage('aria','Hi I’m Aria, your health companion.');
