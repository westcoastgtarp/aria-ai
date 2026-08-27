(()=>{
  const container=document.getElementById('medicationCards');
  if(!container)return;

  function addDeleteButtons(){
    container.querySelectorAll('[data-edit-medication]').forEach(editButton=>{
      const id=editButton.dataset.editMedication;
      if(!id||editButton.parentElement?.querySelector(`[data-delete-medication="${CSS.escape(id)}"]`))return;
      const button=document.createElement('button');
      button.type='button';
      button.className='outline';
      button.dataset.deleteMedication=id;
      button.textContent='Delete';
      button.style.color='#b42318';
      button.style.borderColor='#f2b8b5';
      button.setAttribute('aria-label','Delete medication');
      editButton.insertAdjacentElement('afterend',button);
    });
  }

  async function deleteMedication(id,button){
    const card=button.closest('.med-card');
    const name=card?.querySelector('h3')?.textContent?.trim()||'this medication';
    const confirmed=window.confirm(`Delete ${name}? This will remove it from your active medication list and stop future reminders. Existing audit history will be preserved.`);
    if(!confirmed)return;

    button.disabled=true;
    const original=button.textContent;
    button.textContent='Deleting…';
    try{
      const response=await fetch(`/api/member/medications/${encodeURIComponent(id)}`,{
        method:'DELETE',
        credentials:'same-origin',
        headers:{'content-type':'application/json'}
      });
      let data={};try{data=await response.json();}catch{}
      if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
      location.reload();
    }catch(error){
      console.error('Medication delete failed',error);
      button.disabled=false;
      button.textContent=original;
      alert(error.message||'Aria could not delete that medication. Please try again.');
    }
  }

  container.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-delete-medication]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    deleteMedication(button.dataset.deleteMedication,button);
  });

  addDeleteButtons();
  new MutationObserver(addDeleteButtons).observe(container,{childList:true,subtree:true});
})();
