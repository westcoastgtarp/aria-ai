(()=>{
  if(window.__ariaCareCircleOutreachLoaded)return;
  window.__ariaCareCircleOutreachLoaded=true;

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function mountButtons(){
    const grid=document.getElementById('careCircleLiveGrid');
    if(!grid)return;
    grid.querySelectorAll('.care-circle-live-card').forEach(card=>{
      const actions=card.querySelector('.care-circle-card-actions');
      const id=card.getAttribute('data-contact-id');
      if(!actions||!id||actions.querySelector('.care-outreach'))return;
      const button=document.createElement('button');
      button.type='button';
      button.className='primary care-outreach';
      button.dataset.id=id;
      button.textContent='Prepare support notice';
      actions.prepend(button);
    });
  }

  function previewHtml(data){
    const contact=data.contact||{};
    const items=Array.isArray(data.disclosure?.items)?data.disclosure.items:[];
    const excluded=Array.isArray(data.disclosure?.excludedScopes)?data.disclosure.excludedScopes:[];
    return `
      <div class="care-outreach-preview">
        <div class="eyebrow">CARE CIRCLE</div>
        <h2 id="modalTitle">Prepared support notice</h2>
        <p>This preview shows exactly what Aria is currently allowed to disclose to <strong>${esc(contact.displayName||'this contact')}</strong>.</p>
        <div class="notice info"><strong>Nothing has been sent.</strong> This is a member-authorized preview for consent and disclosure testing.</div>
        <div class="care-outreach-contact">
          <div><span>Contact</span><strong>${esc(contact.displayName||'Approved contact')}</strong></div>
          <div><span>Relationship</span><strong>${esc(contact.relationship||'Approved contact')}</strong></div>
          <div><span>Priority</span><strong>${esc(contact.priority||1)}</strong></div>
          <div><span>Phone</span><strong>${esc(contact.phone||'')}</strong></div>
        </div>
        <div class="care-outreach-scope">
          <div class="care-disclosure-heading"><strong>Allowed disclosure</strong><span>Only these items are included.</span></div>
          ${items.map(item=>`<div class="care-outreach-item"><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></div>`).join('')}
        </div>
        <div class="care-outreach-excluded"><strong>Blocked by current permissions</strong><span>${excluded.length?esc(excluded.join(' · ')):'None'}</span></div>
        <div class="notice info"><strong>Audit:</strong> Aria recorded that this disclosure preview was prepared, including the allowed and blocked scopes. No delivery attempt was made.</div>
        <div class="modal-actions"><button type="button" class="primary" id="ccOutreachDone">Done</button></div>
      </div>`;
  }

  async function prepare(id,button){
    const original=button?.textContent||'Prepare support notice';
    if(button){button.disabled=true;button.textContent='Preparing…';}
    try{
      const response=await fetch(`/api/member/care-circle/${encodeURIComponent(id)}/outreach-preview`,{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({authorized:true})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Care Circle notice could not be prepared.');
      if(typeof window.openModal==='function'){
        window.openModal(previewHtml(data));
        document.getElementById('ccOutreachDone')?.addEventListener('click',()=>window.closeModal?.());
      }else{
        alert('Care Circle preview prepared. Nothing has been sent.');
      }
    }catch(error){
      alert(error.message||'Care Circle notice could not be prepared.');
    }finally{
      if(button){button.disabled=false;button.textContent=original;}
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('.care-outreach');
    if(!button)return;
    event.preventDefault();
    prepare(button.dataset.id,button);
  });

  const observer=new MutationObserver(()=>mountButtons());
  function start(){
    mountButtons();
    const page=document.getElementById('carecircle-page');
    if(page)observer.observe(page,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
