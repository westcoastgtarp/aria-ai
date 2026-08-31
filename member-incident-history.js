(()=>{
  if(window.__ariaMemberIncidentHistoryLoaded)return;
  window.__ariaMemberIncidentHistoryLoaded=true;

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function fmt(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
  }

  function render(incidents){
    const empty=document.getElementById('incidentEmpty');
    const list=document.getElementById('incidentList');
    if(!empty||!list)return;

    const rows=Array.isArray(incidents)?incidents:[];
    empty.classList.toggle('hidden',rows.length>0);
    if(!rows.length){
      list.innerHTML='';
      const heading=empty.querySelector('h2,h3,strong');
      const detail=empty.querySelector('p');
      if(heading)heading.textContent='No incidents';
      if(detail)detail.textContent='Your Lifeline and Live Support history will appear here when there is something to show.';
      return;
    }

    list.innerHTML=rows.map(item=>{
      const ended=item.closedAt?` • Ended ${esc(fmt(item.closedAt))}`:'';
      return `<div class="incident-row">
        <div>
          <strong>${esc(item.type||'Lifeline Event')}</strong>
          <span>Started ${esc(fmt(item.startedAt))}${ended}</span>
        </div>
        <span class="pill ${String(item.status||'').toLowerCase().replace(/\s+/g,'-')}">${esc(item.status||'Open')}</span>
      </div>`;
    }).join('');
  }

  async function load(){
    try{
      const response=await fetch('/api/member/incidents',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Incident history could not be loaded.');
      render(data.incidents||[]);
    }catch(error){
      console.error('Incident history load failed',error);
      const empty=document.getElementById('incidentEmpty');
      const list=document.getElementById('incidentList');
      if(empty)empty.classList.add('hidden');
      if(list)list.innerHTML='<div class="empty-queue">Incident history could not be loaded right now.</div>';
    }
  }

  document.querySelectorAll('[data-page="incidents"]').forEach(button=>button.addEventListener('click',load));
  load();
})();
