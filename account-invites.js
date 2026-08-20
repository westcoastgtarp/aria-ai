(function(){
  const access=window.AriaStaffAccess;
  if(!access?.canAccessRestrictedLogs?.())return;

  const adminPage=document.getElementById('admin-page');
  if(!adminPage)return;

  const STORAGE_KEY='aria-member-invitations';
  const DEMO_SEED=[
    {id:'INV-DEMO-1001',email:'approved.member@aria.demo',code:'ARIA-7K4P-92XM',status:'Pending',issuedBy:'Founder / Co-Founder',issuedAt:'Demo',usedAt:null}
  ];

  function escapeInvite(value=''){
    return String(value).replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[ch]));
  }
  function loadInvites(){
    try{
      const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(Array.isArray(stored))return stored;
    }catch{}
    localStorage.setItem(STORAGE_KEY,JSON.stringify(DEMO_SEED));
    return structuredClone(DEMO_SEED);
  }
  function saveInvites(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}
  function currentStaffName(){
    try{
      const session=JSON.parse(sessionStorage.getItem('aria-auth-session')||'null');
      if(session?.role==='staff'&&session.name)return session.name;
    }catch{}
    return 'Founder / Co-Founder';
  }
  function now(){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
  function randomCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block=n=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
    return `ARIA-${block(4)}-${block(4)}`;
  }

  const panel=document.createElement('article');
  panel.className='panel';
  panel.innerHTML=`
    <div class="panel-head">
      <div><div class="eyebrow">MEMBER ACCOUNT ACCESS</div><h2>Account Invitations</h2></div>
      <button class="primary" id="createMemberInvite" type="button">Issue Access Code</button>
    </div>
    <p>Member registration is invitation-only. Enter the same email the member used on their approved application. If the signup email does not match, the member must provide the unique access code issued here.</p>
    <div class="security-alert"><strong>Restricted log:</strong> invitation history and access-code activity are visible only to Founder/Co-Founder and System Administrator roles. Prototype records are stored in this browser only; production controls must be enforced server-side.</div>
    <div id="memberInviteForm" style="display:none;border:1px solid #e5eaf1;border-radius:14px;padding:16px;margin:16px 0;background:#fafbfe">
      <label style="display:block;font-size:12px;font-weight:700;color:#59667a">Approved member email<input id="inviteEmail" type="email" placeholder="member@example.com" style="width:100%;margin-top:7px;border:1px solid #dfe5ed;border-radius:11px;padding:11px 12px" /></label>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="primary" id="generateInviteCode" type="button">Generate Code</button><button class="secondary" id="cancelInviteCode" type="button">Cancel</button></div>
    </div>
    <div id="memberInviteList"></div>`;
  adminPage.appendChild(panel);

  const form=document.getElementById('memberInviteForm');
  const input=document.getElementById('inviteEmail');
  document.getElementById('createMemberInvite').addEventListener('click',()=>{form.style.display='block';input.focus();});
  document.getElementById('cancelInviteCode').addEventListener('click',()=>{form.style.display='none';input.value='';});

  function render(){
    if(!access.canAccessRestrictedLogs())return;
    const invites=loadInvites();
    const list=document.getElementById('memberInviteList');
    list.innerHTML=invites.length?invites.map(inv=>`<div style="display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(150px,1fr) auto auto;gap:12px;align-items:center;padding:13px 0;border-top:1px solid #e8edf3">
      <div><strong style="display:block;font-size:13px">${escapeInvite(inv.email)}</strong><span style="display:block;color:#7b8797;font-size:10px;margin-top:3px">Issued ${escapeInvite(inv.issuedAt)} by ${escapeInvite(inv.issuedBy)}</span></div>
      <code style="font-weight:800;color:#555dcc">${escapeInvite(inv.code)}</code>
      <span class="pill ${String(inv.status).toLowerCase()}">${escapeInvite(inv.status)}</span>
      <div style="display:flex;gap:6px">${inv.status==='Pending'?`<button class="status-btn invite-action" data-id="${escapeInvite(inv.id)}" data-action="Revoke">Revoke</button>`:''}${inv.status==='Revoked'?`<button class="status-btn invite-action" data-id="${escapeInvite(inv.id)}" data-action="Restore">Restore</button>`:''}</div>
    </div>`).join(''):'<div class="empty-queue">No member invitations have been issued.</div>';
    document.querySelectorAll('.invite-action').forEach(btn=>btn.addEventListener('click',()=>{
      if(!access.canAccessRestrictedLogs())return;
      const items=loadInvites();
      const target=items.find(i=>i.id===btn.dataset.id);if(!target)return;
      target.status=btn.dataset.action==='Revoke'?'Revoked':'Pending';
      saveInvites(items);render();
    }));
  }

  document.getElementById('generateInviteCode').addEventListener('click',()=>{
    if(!access.canAccessRestrictedLogs()){alert('This action is restricted to Founder/Co-Founder and System Administrator roles.');return;}
    const email=input.value.trim().toLowerCase();
    if(!email||!email.includes('@')){alert('Enter a valid approved member email.');return;}
    const invites=loadInvites();
    invites.unshift({id:`INV-${Date.now()}`,email,code:randomCode(),status:'Pending',issuedBy:currentStaffName(),issuedAt:now(),usedAt:null});
    saveInvites(invites);input.value='';form.style.display='none';render();
  });

  render();
})();
