const initialDoses = [
  { id: 'dose-a-am', medication: 'Demo Medication A', detail: '10 mg • user-entered', time: '8:00 AM', checked: true, recorded: '8:06 AM' },
  { id: 'dose-b-noon', medication: 'Demo Medication B', detail: '5 mg • user-entered', time: '12:00 PM', checked: true, recorded: '12:03 PM' },
  { id: 'dose-c-pm', medication: 'Demo Medication C', detail: '1 tablet • user-entered', time: '4:00 PM', checked: false },
  { id: 'dose-a-pm', medication: 'Demo Medication A', detail: '10 mg • user-entered', time: '8:00 PM', checked: false },
];

let doses = JSON.parse(sessionStorage.getItem('aria-demo-doses') || 'null') || structuredClone(initialDoses);
let incidents = JSON.parse(sessionStorage.getItem('aria-demo-incidents') || '[]');
let chatRisk = 'normal';

const riskLevels = ['normal', 'concern', 'high', 'critical'];
const riskCopy = {
  normal: ['Conversation normal', 'No elevated safety signal is active in this demo conversation.'],
  concern: ['Safety concern detected', 'Aria would shift to a safety-oriented check-in and make support options easier to reach.'],
  high: ['High concern', 'Care Circle contact options should be surfaced while the monitor continues evaluating the conversation.'],
  critical: ['Potential immediate danger', 'Aria should clearly advise seeking emergency help and make emergency options prominent without diagnosing the user.'],
};

function nowTime() {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date());
}

function saveDemo() {
  sessionStorage.setItem('aria-demo-doses', JSON.stringify(doses));
  sessionStorage.setItem('aria-demo-incidents', JSON.stringify(incidents));
}

function renderDoses() {
  const dashboard = document.getElementById('dashboardMedicationList');
  const medicationCards = document.getElementById('medicationCards');
  dashboard.innerHTML = '';

  doses.forEach(dose => {
    const row = document.createElement('div');
    row.className = 'dose-row';
    row.innerHTML = `
      <input class="dose-check" type="checkbox" data-dose-id="${dose.id}" ${dose.checked ? 'checked' : ''} aria-label="Mark ${dose.medication} ${dose.time} as recorded" />
      <div><strong>${escapeHtml(dose.medication)}</strong><span>${escapeHtml(dose.detail)}${dose.checked ? ` • Recorded ${dose.recorded || 'just now'}` : ' • Not recorded'}</span></div>
      <div class="dose-time">${dose.time}</div>
    `;
    dashboard.appendChild(row);
  });

  const groups = Object.groupBy(doses, d => d.medication);
  medicationCards.innerHTML = Object.entries(groups).map(([name, group]) => `
    <article class="med-card">
      <div class="med-card-top"><div class="med-icon">✚</div><span class="pill">Demo data</span></div>
      <h3>${escapeHtml(name)}</h3>
      <div class="med-meta">${escapeHtml(group[0].detail)}<br/>Schedule entered by account holder</div>
      <div class="med-doses">
        ${group.map(d => `<div class="med-dose-row"><label><input class="dose-check" type="checkbox" data-dose-id="${d.id}" ${d.checked ? 'checked' : ''}/><span>${d.time}</span></label><span class="pill ${d.checked ? 'success' : ''}">${d.checked ? 'Recorded' : 'Not recorded'}</span></div>`).join('')}
      </div>
    </article>
  `).join('');

  const done = doses.filter(d => d.checked).length;
  document.getElementById('todayProgress').textContent = `${done} of ${doses.length}`;
  document.getElementById('todayProgressBar').style.width = `${Math.round((done / doses.length) * 100)}%`;

  document.querySelectorAll('[data-dose-id]').forEach(box => {
    box.addEventListener('change', e => {
      const dose = doses.find(d => d.id === e.target.dataset.doseId);
      if (!dose) return;
      dose.checked = e.target.checked;
      dose.recorded = e.target.checked ? nowTime() : undefined;
      saveDemo();
      renderDoses();
    });
  });
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById(`${page}-page`).classList.add('active');
  const names = {
    dashboard:'Good afternoon', medications:'Medications', reminders:'Reminders', lifeline:'Lifeline Care', carecircle:'Care Circle', incidents:'Incident History', privacy:'Privacy & Security'
  };
  document.getElementById('pageTitle').textContent = names[page] || 'Aria AI';
  document.querySelector('.sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.go)));
document.getElementById('mobileMenu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

function addMessage(type, text) {
  const log = document.getElementById('chatLog');
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.innerHTML = `${escapeHtml(text)}<span class="msg-time">${nowTime()}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function detectRisk(text) {
  const t = text.toLowerCase();
  const critical = ['kill myself','suicide','want to die','can’t breathe','cant breathe','chest pain','overdose','unconscious','not safe alone','immediate danger'];
  const high = ['feel unsafe','need help now','very dizzy','severe pain','someone is hurting me','getting worse','alone and scared'];
  const concern = ['scared','worried','dizzy','pain','don’t feel right','dont feel right','bad reaction','side effect'];
  if (critical.some(k => t.includes(k))) return 'critical';
  if (high.some(k => t.includes(k))) return 'high';
  if (concern.some(k => t.includes(k))) return 'concern';
  return 'normal';
}

function applyRisk(newRisk) {
  const currentIndex = riskLevels.indexOf(chatRisk);
  const newIndex = riskLevels.indexOf(newRisk);
  chatRisk = riskLevels[Math.max(currentIndex, newIndex)];
  const badge = document.getElementById('riskBadge');
  badge.className = `risk-badge ${chatRisk}`;
  badge.textContent = chatRisk.toUpperCase().replace('HIGH','HIGH CONCERN');
  document.getElementById('safetyTitle').textContent = riskCopy[chatRisk][0];
  document.getElementById('safetyText').textContent = riskCopy[chatRisk][1];
  document.querySelectorAll('.risk-step').forEach(step => {
    const idx = riskLevels.indexOf(step.dataset.risk);
    step.classList.toggle('active', idx <= riskLevels.indexOf(chatRisk));
  });
  document.getElementById('escalationActions').classList.toggle('hidden', chatRisk === 'normal');

  if ((chatRisk === 'high' || chatRisk === 'critical') && !incidents.some(i => i.open)) {
    incidents.unshift({ id:`LFL-DEMO-${String(Date.now()).slice(-6)}`, started: nowTime(), level:chatRisk, open:true });
    saveDemo();
    renderIncidents();
  } else if (incidents[0]?.open) {
    incidents[0].level = chatRisk;
    saveDemo();
    renderIncidents();
  }
}

function ariaResponse(risk) {
  if (risk === 'critical') return 'I’m concerned that what you described may need immediate attention. Please contact local emergency services now or ask a trusted person to help you. This demo cannot dispatch help.';
  if (risk === 'high') return 'I’m concerned about your safety. If you may be in immediate danger, contact local emergency services. You can also reach out to someone in your Care Circle.';
  if (risk === 'concern') return 'I’m sorry you’re dealing with that. I can stay with you while you decide what support you need. If symptoms or safety concerns become urgent, contact local emergency services.';
  return 'I’m here. In the production design I can help with medication reminders and safety-oriented check-ins, while an independent monitor evaluates the conversation for escalation signals.';
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addMessage('user', text);
  input.value = '';
  const risk = detectRisk(text);
  applyRisk(risk);
  setTimeout(() => addMessage('aria', ariaResponse(risk)), 160);
}

document.getElementById('sendChat').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

function renderIncidents() {
  const empty = document.getElementById('incidentEmpty');
  const list = document.getElementById('incidentList');
  empty.classList.toggle('hidden', incidents.length > 0);
  list.innerHTML = incidents.map(i => `
    <div class="incident-row">
      <div><strong>${i.id}</strong><span>Started ${i.started} • Synthetic demo event • Original transcript would be preserved separately</span></div>
      <span class="risk-badge ${i.level}">${i.level.toUpperCase()}</span>
    </div>
  `).join('');
}

function openModal(html) {
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });

document.getElementById('addMedicationBtn').addEventListener('click', () => {
  openModal(`
    <div class="eyebrow">DEMO ONLY</div>
    <h2 id="modalTitle">Add demo medication</h2>
    <p>Do not enter real health information into this prototype.</p>
    <div class="form-grid">
      <label>Demo label<input id="newMedName" value="Demo Medication D" maxlength="40"/></label>
      <label>Demo dose<input id="newMedDose" value="1 tablet" maxlength="30"/></label>
      <label>Time<input id="newMedTime" value="6:00 PM" maxlength="20"/></label>
    </div>
    <div class="modal-actions"><button class="primary" id="saveDemoMed">Add to demo</button><button class="outline" id="cancelDemoMed">Cancel</button></div>
  `);
  document.getElementById('cancelDemoMed').onclick = closeModal;
  document.getElementById('saveDemoMed').onclick = () => {
    const name = document.getElementById('newMedName').value.trim() || 'Demo Medication';
    const detail = (document.getElementById('newMedDose').value.trim() || 'demo dose') + ' • user-entered';
    const time = document.getElementById('newMedTime').value.trim() || '6:00 PM';
    doses.push({ id:`dose-${Date.now()}`, medication:name, detail, time, checked:false });
    saveDemo(); renderDoses(); closeModal();
  };
});

document.getElementById('contactCareBtn').addEventListener('click', () => {
  openModal(`<div class="eyebrow">CARE CIRCLE DEMO</div><h2 id="modalTitle">Contact flow preview</h2><p>A production Aria account could offer user-authorized contact methods here. This demo does not place calls, send messages, or share private information.</p><div class="modal-actions"><button class="primary" onclick="document.getElementById('modalBackdrop').classList.add('hidden')">Understood</button></div>`);
});

document.getElementById('emergencyBtn').addEventListener('click', () => {
  openModal(`<div class="eyebrow">DEMO SAFETY NOTICE</div><h2 id="modalTitle">Emergency services</h2><p><strong>This prototype does not place or dispatch emergency calls.</strong> If you are experiencing an actual emergency, use your phone or local emergency-service method now.</p><p>The production product must verify country-specific routing, consent, responder workflows, reliability, and legal requirements before enabling live emergency integrations.</p><div class="modal-actions"><button class="danger" onclick="document.getElementById('modalBackdrop').classList.add('hidden')">Close</button></div>`);
});

document.getElementById('demoReset').addEventListener('click', () => {
  sessionStorage.removeItem('aria-demo-doses');
  sessionStorage.removeItem('aria-demo-incidents');
  location.reload();
});

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

renderDoses();
renderIncidents();
addMessage('aria', 'Hi — I’m Aria. This is a synthetic Lifeline Care demo. Do not enter real medical or emergency information here.');
