(function(){
  const addButton=document.getElementById('addEmployee');
  const saveButton=document.getElementById('saveEmployee');
  const roster=document.getElementById('employeeRoster');
  const modal=document.getElementById('employeeModal');
  if(!addButton||!saveButton||!modal)return;

  const statusSelect=document.getElementById('employeeStatus');
  if(statusSelect){
    statusSelect.innerHTML='<option value="Pending activation">Pending activation</option>';
    statusSelect.value='Pending activation';
    statusSelect.disabled=true;
  }

  const result=document.createElement('div');
  result.id='employeeProvisioningResult';
  result.hidden=true;
  result.style.marginTop='16px';
  result.innerHTML='<div class="security-alert compact"><strong>Setup link created</strong><span id="employeeSetupMessage"></span></div><label>One-time employee setup link<input id="employeeSetupLink" readonly /></label><div class="modal-actions"><button class="secondary" id="copyEmployeeSetupLink" type="button">Copy Setup Link</button></div>';
  modal.querySelector('.modal')?.appendChild(result);

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  function resetResult(){
    result.hidden=true;
    const input=document.getElementById('employeeSetupLink');
    if(input)input.value='';
  }

  function openEmployeeModal(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    ['employeeName','employeeEmail','employeeRole'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    resetResult();
    if(typeof openModal==='function')openModal('employeeModal');
  }

  async function loadRealRoster(){
    if(!roster)return;
    try{
      const response=await fetch('/api/staff/accounts',{credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)return;
      const employees=data.employees||[];
      roster.innerHTML=employees.length?employees.map(employee=>{
        const status=employee.status==='active'?'Active':employee.status==='pending'?'Pending activation':employee.status;
        const invite=employee.invitation_status==='pending'&&employee.invitation_expires_at?`<span>Setup link expires ${escapeHtml(new Date(employee.invitation_expires_at).toLocaleString())}</span>`:'';
        return `<article class="employee-card"><strong>${escapeHtml(employee.display_name||'Unnamed employee')}</strong><span>${escapeHtml(employee.email)}</span><span>${escapeHtml(employee.department||'Department pending')} • ${escapeHtml(employee.role_name||'Role pending')}</span><div class="ticket-meta"><span class="pill ${escapeHtml(String(status).toLowerCase().replaceAll(' ','-'))}">${escapeHtml(status)}</span></div>${invite}</article>`;
      }).join(''):'<div class="empty-queue">No staff accounts found.</div>';
      const active=employees.filter(e=>e.status==='active').length;
      const activeCount=document.getElementById('activeEmployeeCount');
      if(activeCount)activeCount.textContent=String(active);
    }catch{}
  }

  async function provisionEmployee(event){
    event.preventDefault();
    event.stopImmediatePropagation();

    const displayName=document.getElementById('employeeName').value.trim();
    const email=document.getElementById('employeeEmail').value.trim();
    const department=document.getElementById('employeeDepartment').value;
    const role=document.getElementById('employeeRole').value.trim();
    if(!displayName||!email||!role){alert('Name, work email, and role are required.');return;}

    saveButton.disabled=true;
    const oldText=saveButton.textContent;
    saveButton.textContent='Creating…';
    resetResult();
    try{
      const response=await fetch('/api/staff/invitations',{
        method:'POST',
        headers:{'content-type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({displayName,email,department,role})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to create the staff account invitation.');

      const setupUrl=data.invitation?.setupUrl||'';
      const input=document.getElementById('employeeSetupLink');
      const message=document.getElementById('employeeSetupMessage');
      if(input)input.value=setupUrl;
      if(message)message.textContent=' Share this link securely with the employee. It expires in 72 hours and can only be used once. Email delivery is not connected yet.';
      result.hidden=false;
      ['employeeName','employeeEmail','employeeRole'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      await loadRealRoster();
    }catch(error){
      alert(error?.message||'Unable to create the staff account invitation.');
    }finally{
      saveButton.disabled=false;
      saveButton.textContent=oldText;
    }
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('#addEmployee'))return openEmployeeModal(event);
    if(event.target.closest('#saveEmployee'))return provisionEmployee(event);
  },true);

  document.getElementById('copyEmployeeSetupLink')?.addEventListener('click',async()=>{
    const input=document.getElementById('employeeSetupLink');
    if(!input?.value)return;
    try{
      await navigator.clipboard.writeText(input.value);
      const button=document.getElementById('copyEmployeeSetupLink');
      const old=button.textContent;
      button.textContent='Copied';
      setTimeout(()=>button.textContent=old,1500);
    }catch{
      input.select();
      document.execCommand('copy');
    }
  });

  fetch('/api/auth/session',{credentials:'same-origin'})
    .then(r=>r.json().then(data=>({ok:r.ok,data})))
    .then(({ok,data})=>{
      const role=String(data?.user?.role||'').toLowerCase();
      const allowed=['founder','founder / co-founder','co-founder','system administrator','system admin'];
      if(!ok||!data.authenticated||!allowed.includes(role)){
        addButton.hidden=true;
        return;
      }
      loadRealRoster();
    })
    .catch(()=>{addButton.hidden=true;});
})();
