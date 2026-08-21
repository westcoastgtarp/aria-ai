(function(){
  const access=window.AriaStaffAccess;
  if(!access?.canAccessRestrictedLogs?.())return;

  const adminPage=document.getElementById('admin-page');
  if(!adminPage)return;

  const CACHE_KEY='aria-member-invitations-server-cache';
  let serverRole='';

  function escapeInvite(value=''){
    return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
  }
  function loadInvites(){
    try{
      const stored=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]');
      return Array.isArray(stored)?stored.filter(item=>item?.serverBacked===true):[];
    }catch{return [];}
  }
  function saveInvites(items){localStorage.setItem(CACHE_KEY,JSON.stringify(items.filter(item=>item?.serverBacked===true)));}
  function currentStaffName(){
    try{
      const session=JSON.parse(sessionStorage.getItem('aria-auth-session')||'null');
      if(session?.role==='staff'&&session.name)return session.name;
    }catch{}
    return 'Authorized administrator';
  }
  function now(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
  function canDeletePermanently(){
    const role=String(serverRole||'').toLowerCase();
    return ['founder','co-founder','founder / co-founder'].includes(role);
  }

  const panel=document.createElement('article');
  panel.className='panel';
  panel.innerHTML=`
    <div class="panel-head">
      <div><div class="eyebrow">MEMBER ACCOUNT ACCESS</div><h2>Account Invitations</h2></div>
      <button class="primary" id="createMemberInvite" type="button">Issue Access Code</button>
    </div>
    <p>Issue, revoke, or remove member invitations from one place. Revoking keeps the audit record but makes the code unusable.</p>
    <div class="security-alert"><strong>Permissions:</strong> Founder/Co-Founder and System Administrator can revoke invitations. Founder/Co-Founder can permanently remove pending or revoked test invitations and their unfinished signup data. Invitations tied to an active/used member account stay protected.</div>
    <div id="memberInviteForm" style="display:none;border:1px solid #e5eaf1;border-radius:14px;padding:16px;margin:16px 0;background:#fafbfe">
      <label style="display:block;font-size:12px;font-weight:700;color:#59667a">Approved member email<input id="inviteEmail" type="email" placeholder="member@example.com" style="width:100%;margin-top:7px;border:1px solid #dfe5ed;border-radius:11px;padding:11px 12px" /></label>
      <div id="inviteServerError" class="security-alert compact" style="display:none;margin-top:12px"></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="primary" id="generateInviteCode" type="button">Generate Code</button><button class="secondary" id="cancelInviteCode" type="button">Cancel</button></div>
    </div>
    <div id="memberInviteActionMessage" class="security-alert compact" style="display:none;margin:12px 0"></div>
    <div id="memberInviteList"></div>`;
  adminPage.appendChild(panel);

  const form=document.getElementById('memberInviteForm');
  const input=document.getElementById('inviteEmail');
  const errorBox=document.getElementById('inviteServerError');
  const actionMessage=document.getElementById('memberInviteActionMessage');
  const generateButton=document.getElementById('generateInviteCode');

  async function loadServerRole(){
    try{
      const response=await fetch('/api/auth/session',{credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.authenticated)serverRole=data.user?.role||'';
    }catch{}
  }

  function showActionMessage(message,isError=false){
    actionMessage.textContent=message;
    actionMessage.style.display='block';
    actionMessage.style.borderColor=isError?'#f1cdd4':'#d9e3ff';
    actionMessage.style.background=isError?'#fff0f2':'#f6f8ff';
    actionMessage.style.color=isError?'#b23f53':'#4650ba';
  }

  document.getElementById('createMemberInvite').addEventListener('click',()=>{
    errorBox.style.display='none';errorBox.textContent='';form.style.display='block';input.focus();
  });
  document.getElementById('cancelInviteCode').addEventListener('click',()=>{
    form.style.display='none';input.value='';errorBox.style.display='none';errorBox.textContent='';
  });

  function render(){
    if(!access.canAccessRestrictedLogs())return;
    const invites=loadInvites();
    const list=document.getElementById('memberInviteList');
    list.innerHTML=invites.length?invites.map(inv=>{
      const status=String(inv.status||'Pending');
      const pending=status.toLowerCase()==='pending';
      return `<div style="display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(210px,1fr) auto minmax(170px,auto);gap:12px;align-items:center;padding:13px 0;border-top:1px solid #e8edf3">
        <div><strong style="display:block;font-size:13px">${escapeInvite(inv.email)}</strong><span style="display:block;color:#7b8797;font-size:10px;margin-top:3px">Issued ${escapeInvite(inv.issuedAt)} by ${escapeInvite(inv.issuedBy)}</span></div>
        <code style="font-weight:800;color:#555dcc">${escapeInvite(inv.code)}</code>
        <span class="pill ${pending?'pending':''}">${escapeInvite(status)}</span>
        <div style="display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap">
          ${pending?`<button class="status-btn invite-revoke" data-id="${escapeInvite(inv.id)}" type="button">Revoke</button>`:''}
          ${canDeletePermanently()?`<button class="status-btn invite-delete" data-id="${escapeInvite(inv.id)}" type="button" style="color:#b23f53;border-color:#efcbd2">Delete permanently</button>`:''}
        </div>
      </div>`;
    }).join(''):'<div class="empty-queue">No member invitations are shown on this device.</div>';

    document.querySelectorAll('.invite-revoke').forEach(btn=>btn.addEventListener('click',()=>revokeInvitation(btn.dataset.id,btn)));
    document.querySelectorAll('.invite-delete').forEach(btn=>btn.addEventListener('click',()=>deleteInvitation(btn.dataset.id,btn)));
  }

  async function revokeInvitation(id,button){
    if(!confirm('Revoke this invitation? The code will stop working, but the audit record will be kept.'))return;
    button.disabled=true;button.textContent='Revoking…';
    try{
      const response=await fetch('/api/invitations/revoke',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({invitationId:id})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to revoke invitation.');
      const items=loadInvites();
      const target=items.find(item=>item.id===id);
      if(target)target.status='Revoked';
      saveInvites(items);render();showActionMessage('Invitation revoked. The access code can no longer be used.');
    }catch(err){showActionMessage(err?.message||'Unable to revoke invitation.',true);button.disabled=false;button.textContent='Revoke';}
  }

  async function deleteInvitation(id,button){
    if(!confirm('Permanently delete this invitation? For an unfinished signup, Aria will also remove the pending consent/verification data created by this invitation. Active or used member accounts cannot be deleted here.'))return;
    button.disabled=true;button.textContent='Deleting…';
    try{
      const response=await fetch('/api/invitations/delete',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({invitationId:id})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to permanently delete invitation.');
      const items=loadInvites().filter(item=>item.id!==id);
      saveInvites(items);render();showActionMessage(data.removedPendingSignup?'Invitation and unfinished signup data permanently deleted.':'Invitation permanently deleted.');
    }catch(err){showActionMessage(err?.message||'Unable to permanently delete invitation.',true);button.disabled=false;button.textContent='Delete permanently';}
  }

  generateButton.addEventListener('click',async()=>{
    if(!access.canAccessRestrictedLogs()){alert('This action is restricted to Founder/Co-Founder and System Administrator roles.');return;}
    const email=input.value.trim().toLowerCase();
    if(!email||!email.includes('@')){errorBox.textContent='Enter a valid approved member email.';errorBox.style.display='block';return;}
    errorBox.style.display='none';errorBox.textContent='';generateButton.disabled=true;generateButton.textContent='Issuing…';
    try{
      const response=await fetch('/api/invitations/issue',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({email})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok||!data.invitation?.code)throw new Error(data.error||'Unable to issue the member invitation.');
      const invites=loadInvites();
      invites.unshift({id:data.invitation.id,email:data.invitation.email||email,code:data.invitation.code,status:'Pending',issuedBy:currentStaffName(),issuedAt:now(),expiresAt:data.invitation.expiresAt||null,serverBacked:true});
      saveInvites(invites);input.value='';form.style.display='none';render();showActionMessage('New member invitation issued.');
    }catch(err){errorBox.textContent=err?.message||'Unable to issue the member invitation.';errorBox.style.display='block';}
    finally{generateButton.disabled=false;generateButton.textContent='Generate Code';}
  });

  loadServerRole().finally(render);
})();
