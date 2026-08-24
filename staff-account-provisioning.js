(function(){
  const addButton=document.getElementById('addEmployee');
  const saveButton=document.getElementById('saveEmployee');
  const roster=document.getElementById('employeeRoster');
  const modal=document.getElementById('employeeModal');
  if(!addButton||!saveButton||!modal)return;

  let realEmployees=[];
  let viewer={id:null,role:''};

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

  function statusLabel(value=''){
    const status=String(value).toLowerCase();
    if(status==='active')return 'Active';
    if(status==='pending')return 'Pending activation';
    if(status==='suspended')return 'Suspended';
    if(status==='disabled')return 'Disabled';
    return value||'Unknown';
  }

  function statusClass(value=''){
    return String(statusLabel(value)).toLowerCase().replaceAll(' ','-');
  }

  function isFounder(employee){
    return String(employee?.role_name||'').trim().toLowerCase()==='founder';
  }

  function mayManage(employee){
    if(!employee||isFounder(employee)||employee.id===viewer.id||employee.status==='pending')return false;
    const viewerRole=String(viewer.role||'').trim().toLowerCase();
    const targetRole=String(employee.role_name||'').trim().toLowerCase();
    if(['system administrator','system admin'].includes(targetRole)&&viewerRole!=='founder')return false;
    return ['founder','system administrator','system admin'].includes(viewerRole);
  }

  function invitationLine(employee){
    if(employee.invitation_status!=='pending'||!employee.invitation_expires_at)return '';
    const expires=new Date(employee.invitation_expires_at);
    const expired=Number.isNaN(expires.getTime())?false:expires.getTime()<=Date.now();
    return `<span class="table-subtext">Setup link ${expired?'expired':'expires'} ${escapeHtml(Number.isNaN(expires.getTime())?employee.invitation_expires_at:expires.toLocaleString())}</span>`;
  }

  function sessionLine(employee){
    const sessions=Number(employee.active_sessions)||0;
    return `<span class="table-subtext">${sessions} active session${sessions===1?'':'s'}</span>`;
  }

  function accountAction(employee){
    if(isFounder(employee))return '<span class="table-subtext">Protected Founder account</span>';
    if(employee.id===viewer.id)return '<span class="table-subtext">Current account</span>';
    if(employee.status==='pending')return '<span class="table-subtext">Awaiting setup</span>';
    if(!mayManage(employee))return '<span class="table-subtext">No management action</span>';
    if(employee.status==='suspended')return `<button class="status-btn staff-account-status" data-user-id="${escapeHtml(employee.id)}" data-next-status="active">Reactivate</button>`;
    if(employee.status==='active')return `<button class="status-btn danger-action staff-account-status" data-user-id="${escapeHtml(employee.id)}" data-next-status="suspended">Suspend</button>`;
    return '<span class="table-subtext">No action available</span>';
  }

  function setupLiveSecurityPage(){
    const page=document.getElementById('security-page');
    if(!page)return;

    const head=page.querySelector('.section-head');
    if(head){
      const eyebrow=head.querySelector('.eyebrow');
      const heading=head.querySelector('h2');
      const paragraph=head.querySelector('p');
      if(eyebrow)eyebrow.textContent='SECURITY & ACCESS';
      if(heading)heading.textContent='Identity, Roles & Account Control';
      if(paragraph)paragraph.textContent='Live staff identity and account controls backed by Aria D1. Department membership does not grant blanket access; permissions are assigned by role and approved responsibility.';
    }

    const addReview=document.getElementById('addAccessReview');
    if(addReview)addReview.remove();

    const alerts=[...page.querySelectorAll('.security-alert')];
    if(alerts[0])alerts[0].innerHTML='<strong>Live controls:</strong> staff status, active-session counts, suspension and reactivation are connected to production authentication. Suspending an account revokes its active sessions.';

    const roleMatrix=page.querySelector('.role-matrix');
    if(roleMatrix){
      roleMatrix.innerHTML=`
        <div class="role-card"><strong>Founder</strong><span>Highest company escalation authority, privileged account oversight and protected administrative controls.</span></div>
        <div class="role-card"><strong>Operations</strong><span>Umbrella department. Customer Service, Hiring Committee, supervisors and other Operations positions receive separate role-level permissions.</span></div>
        <div class="role-card"><strong>HR</strong><span>Staff personnel records, employment documentation, disciplinary cases and controlled workforce information.</span></div>
        <div class="role-card"><strong>IT</strong><span>Staff systems, approved devices, access support, integrations and service-health responsibilities within assigned privileges.</span></div>
        <div class="role-card"><strong>Engineering</strong><span>Infrastructure, deployment, backups, recovery and approved technical systems within assigned privileges.</span></div>`;
    }

    const reviewQueue=document.getElementById('securityReviewQueue');
    const reviewSummary=document.getElementById('securityReviewSummary');
    const reviewCount=document.getElementById('securityReviewCount');
    const reviewPanel=reviewQueue?.closest('.panel');
    if(reviewPanel)reviewPanel.remove();
    if(reviewSummary)reviewSummary.remove();
    if(reviewCount){
      const card=reviewCount.closest('.card');
      if(card){
        card.querySelector('span')?.replaceChildren(document.createTextNode('Account control source'));
        reviewCount.textContent='D1';
        const small=card.querySelector('small');
        if(small)small.textContent='Live staff records';
      }
    }

    if(!document.getElementById('securityBoundaryNotice')){
      const tablePanel=document.getElementById('securityEmployeeTable')?.closest('.panel');
      if(tablePanel){
        const note=document.createElement('div');
        note.id='securityBoundaryNotice';
        note.className='security-alert';
        note.style.marginTop='16px';
        note.innerHTML='<strong>Access boundary:</strong> this screen manages staff account state. Future badge, approved-device, personal-device enrollment and restricted-record approvals will be separate audited security controls rather than blanket department permissions.';
        tablePanel.appendChild(note);
      }
    }
  }

  function setupSystemAdministrationPage(){
    const page=document.getElementById('admin-page');
    if(!page)return;

    const head=page.querySelector('.section-head');
    if(head){
      const eyebrow=head.querySelector('.eyebrow');
      const heading=head.querySelector('h2');
      const paragraph=head.querySelector('p');
      if(eyebrow)eyebrow.textContent='SYSTEM ADMINISTRATION';
      if(heading)heading.textContent='Staff Account Provisioning';
      if(paragraph)paragraph.textContent='Create and review real staff accounts backed by Aria D1. Department placement organizes the employee; the assigned role controls what that employee may actually access.';
    }

    addButton.setAttribute('aria-label','Create staff account invitation');
    addButton.setAttribute('title','Create staff account invitation');

    const modalHeading=modal.querySelector('h2');
    if(modalHeading)modalHeading.textContent='Create Staff Account';
    const roleInput=document.getElementById('employeeRole');
    if(roleInput)roleInput.placeholder='Specific role — permissions follow role, not department';

    if(!document.getElementById('adminProvisioningNotice')){
      const note=document.createElement('div');
      note.id='adminProvisioningNotice';
      note.className='security-alert';
      note.style.margin='0 0 18px';
      note.innerHTML='<strong>Provisioning boundary:</strong> new accounts begin Pending activation and use a one-time setup link. Founder access is protected and cannot be created here. System Administrator is a privileged role and can only be assigned by Founder. Department membership alone never grants blanket permissions.';
      const list=roster;
      list?.parentNode?.insertBefore(note,list);
    }
  }

  function renderRoster(){
    if(!roster)return;
    roster.innerHTML=realEmployees.length?realEmployees.map(employee=>{
      const status=statusLabel(employee.status);
      return `<article class="employee-card" data-real-staff-id="${escapeHtml(employee.id)}">
        <strong>${escapeHtml(employee.display_name||'Unnamed staff member')}</strong>
        <span>${escapeHtml(employee.email)}</span>
        <span>${escapeHtml(employee.department||'Department pending')} • ${escapeHtml(employee.role_name||'Role pending')}</span>
        <div class="ticket-meta"><span class="pill ${escapeHtml(statusClass(employee.status))}">${escapeHtml(status)}</span>${isFounder(employee)?'<span class="pill assigned">Protected</span>':''}</div>
        ${invitationLine(employee)}${sessionLine(employee)}
      </article>`;
    }).join(''):'<div class="empty-queue">No staff accounts found.</div>';
  }

  function renderSecurityAccess(){
    const active=realEmployees.filter(e=>e.status==='active').length;
    const pending=realEmployees.filter(e=>e.status==='pending').length;
    const suspended=realEmployees.filter(e=>e.status==='suspended'||e.status==='disabled').length;
    const activeCount=document.getElementById('securityActiveCount');
    const pendingCount=document.getElementById('securityPendingCount');
    const suspendedCount=document.getElementById('securitySuspendedCount');
    if(activeCount)activeCount.textContent=String(active);
    if(pendingCount)pendingCount.textContent=String(pending);
    if(suspendedCount)suspendedCount.textContent=String(suspended);

    const table=document.getElementById('securityEmployeeTable');
    if(!table)return;
    const search=String(document.getElementById('securityEmployeeSearch')?.value||'').trim().toLowerCase();
    const filtered=realEmployees.filter(employee=>{
      if(!search)return true;
      return [employee.display_name,employee.email,employee.department,employee.role_name,employee.status].some(value=>String(value||'').toLowerCase().includes(search));
    });
    table.innerHTML=filtered.length?filtered.map(employee=>`<tr>
      <td><strong>${escapeHtml(employee.display_name||'Unnamed staff member')}</strong><span class="table-subtext">${escapeHtml(employee.email)}</span>${sessionLine(employee)}</td>
      <td>${escapeHtml(employee.department||'—')}</td>
      <td>${escapeHtml(employee.role_name||'—')}${isFounder(employee)?'<span class="table-subtext">Protected account</span>':''}</td>
      <td><span class="pill ${escapeHtml(statusClass(employee.status))}">${escapeHtml(statusLabel(employee.status))}</span>${invitationLine(employee)}</td>
      <td><div class="access-actions">${accountAction(employee)}</div></td>
    </tr>`).join(''):'<tr><td colspan="5" class="finance-empty">No staff accounts match this search.</td></tr>';
  }

  function renderDashboardCount(){
    const activeCount=document.getElementById('activeEmployeeCount');
    if(activeCount)activeCount.textContent=String(realEmployees.filter(e=>e.status==='active').length);
  }

  function renderAllRealStaff(){
    setupLiveSecurityPage();
    setupSystemAdministrationPage();
    renderRoster();
    renderSecurityAccess();
    renderDashboardCount();
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
    try{
      const response=await fetch('/api/staff/accounts',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load staff accounts.');
      realEmployees=Array.isArray(data.employees)?data.employees:[];
      viewer=data.viewer||viewer;
      renderAllRealStaff();
      return true;
    }catch(error){
      console.error('Staff roster load failed',error);
      if(roster)roster.innerHTML='<div class="empty-queue">Unable to load the live staff roster.</div>';
      return false;
    }
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
        method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({displayName,email,department,role})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to create the staff account invitation.');

      const setupUrl=data.invitation?.setupUrl||'';
      const input=document.getElementById('employeeSetupLink');
      const message=document.getElementById('employeeSetupMessage');
      if(input)input.value=setupUrl;
      if(message)message.textContent=' Share this link securely with the employee. It expires in 72 hours and can only be used once.';
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

  async function changeAccountStatus(button){
    const userId=button.dataset.userId;
    const nextStatus=button.dataset.nextStatus;
    const employee=realEmployees.find(item=>item.id===userId);
    if(!employee)return;
    const verb=nextStatus==='suspended'?'Suspend':'Reactivate';
    if(nextStatus==='suspended'&&!confirm(`Suspend ${employee.display_name||employee.email}? Their active sessions will be revoked.`))return;

    button.disabled=true;
    const oldText=button.textContent;
    button.textContent=nextStatus==='suspended'?'Suspending…':'Reactivating…';
    try{
      const response=await fetch(`/api/staff/accounts/${encodeURIComponent(userId)}/status`,{
        method:'PATCH',headers:{'content-type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({status:nextStatus})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||`${verb} failed.`);
      await loadRealRoster();
    }catch(error){
      alert(error?.message||`${verb} failed.`);
      button.disabled=false;
      button.textContent=oldText;
    }
  }

  setupLiveSecurityPage();
  setupSystemAdministrationPage();

  document.addEventListener('click',event=>{
    if(event.target.closest('#addEmployee'))return openEmployeeModal(event);
    if(event.target.closest('#saveEmployee'))return provisionEmployee(event);
    const statusButton=event.target.closest('.staff-account-status');
    if(statusButton)return changeAccountStatus(statusButton);
  },true);

  document.getElementById('securityEmployeeSearch')?.addEventListener('input',renderSecurityAccess);
  document.querySelectorAll('[data-page="admin"],[data-page="security"],[data-page="dashboard"]').forEach(button=>{
    button.addEventListener('click',()=>queueMicrotask(renderAllRealStaff));
  });

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

  fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'})
    .then(r=>r.json().then(data=>({ok:r.ok,data})))
    .then(({ok,data})=>{
      const role=String(data?.user?.role||'').toLowerCase();
      const allowed=['founder','system administrator','system admin'];
      if(!ok||!data.authenticated||!allowed.includes(role)){
        addButton.hidden=true;
        return;
      }
      loadRealRoster();
    })
    .catch(()=>{addButton.hidden=true;});
})();