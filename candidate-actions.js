(function(){
  const list=document.getElementById('candidateList');
  if(!list)return;

  let founder=false;

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  async function getSessionRole(){
    try{
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      const role=String(data?.user?.role||'').trim().toLowerCase();
      founder=['founder','founder / co-founder','co-founder'].includes(role);
    }catch{founder=false;}
  }

  async function getCandidates(){
    const response=await fetch('/api/staff/hiring/candidates',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load hiring records.');
    return data.candidates||[];
  }

  function addActionsToCard(card,candidate){
    if(!card||card.querySelector('.candidate-launch-actions'))return;
    const actions=card.querySelector('.candidate-actions');
    if(!actions)return;

    const wrap=document.createElement('div');
    wrap.className='candidate-launch-actions';
    wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:8px';

    if(candidate.status==='reviewed'){
      wrap.innerHTML+=`<button class="secondary candidate-manage" data-id="${escapeHtml(candidate.id)}" data-action="archive" type="button">Archive</button>`;
    }else{
      wrap.innerHTML+=`<button class="secondary candidate-manage" data-id="${escapeHtml(candidate.id)}" data-action="revoke" type="button">Revoke</button>`;
    }

    if(founder){
      wrap.innerHTML+=`<button class="secondary candidate-manage danger-action" data-id="${escapeHtml(candidate.id)}" data-action="delete" type="button">Delete permanently</button>`;
    }

    actions.appendChild(wrap);
  }

  async function decorate(){
    try{
      const candidates=await getCandidates();
      const cards=[...list.querySelectorAll('.candidate-card')];
      candidates.forEach(candidate=>{
        const card=cards.find(node=>node.textContent.includes(candidate.email));
        if(card)addActionsToCard(card,candidate);
      });
    }catch{}
  }

  async function manage(id,action,button){
    const labels={revoke:'revoke this candidate and invalidate their onboarding link',archive:'archive this candidate from the active hiring queue',delete:'permanently delete this candidate and their onboarding submission'};
    const serious=action==='delete';
    const message=serious
      ? 'Permanently delete this candidate? This removes the candidate and onboarding submission from D1. This cannot be undone.'
      : `Are you sure you want to ${labels[action]}?`;
    if(!confirm(message))return;

    const old=button.textContent;
    button.disabled=true;
    button.textContent=action==='delete'?'Deleting…':action==='revoke'?'Revoking…':'Archiving…';
    try{
      const response=await fetch(`/api/staff/hiring/candidates/${encodeURIComponent(id)}/action`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({action})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to update candidate.');
      window.location.reload();
    }catch(error){
      alert(error?.message||'Unable to update candidate.');
      button.disabled=false;
      button.textContent=old;
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.candidate-manage');
    if(!button)return;
    manage(button.dataset.id,button.dataset.action,button);
  });

  const observer=new MutationObserver(()=>decorate());
  observer.observe(list,{childList:true,subtree:true});

  getSessionRole().then(()=>decorate());
})();
