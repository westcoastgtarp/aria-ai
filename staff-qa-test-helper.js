(function(){
  if(window.__ariaQaTestHelperLoaded)return;
  window.__ariaQaTestHelperLoaded=true;

  const profiles={
    restricted:{
      buttonId:'ariaQaTestCreateButton',
      buttonText:'Create QA Restricted Staff',
      creatingText:'Creating restricted QA…',
      displayName:'QA Restricted Staff',
      emailPrefix:'qa-restricted',
      department:'HR',
      role:'HR Specialist',
      title:'Restricted QA staff account is ready',
      expected:'No Live Support takeover'
    },
    supervisor:{
      buttonId:'ariaQaSupervisorCreateButton',
      buttonText:'Create QA Supervisor',
      creatingText:'Creating QA Supervisor…',
      displayName:'QA Supervisor',
      emailPrefix:'qa-supervisor',
      department:'Operations',
      role:'Supervisor',
      title:'QA Supervisor account is ready',
      expected:'Can pick up Supervisor escalation'
    }
  };

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[ch]));
  }

  function ensureStyles(){
    if(document.getElementById('ariaQaTestHelperStyles'))return;
    const style=document.createElement('style');
    style.id='ariaQaTestHelperStyles';
    style.textContent=`
      .aria-qa-create-button{margin-left:10px;border:1px solid rgba(102,164,255,.38);background:linear-gradient(135deg,rgba(21,128,255,.18),rgba(125,77,255,.22));color:#eaf3ff;border-radius:12px;padding:10px 14px;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(16,86,180,.14)}
      .aria-qa-create-button:hover{border-color:rgba(107,185,255,.7);transform:translateY(-1px)}
      .aria-qa-create-button:disabled{opacity:.55;cursor:wait;transform:none}
      #ariaQaSupervisorCreateButton{background:linear-gradient(135deg,rgba(17,185,129,.18),rgba(59,130,246,.22));border-color:rgba(69,214,177,.4)}
      .aria-qa-overlay{position:fixed;inset:0;z-index:100000;background:rgba(1,8,22,.76);backdrop-filter:blur(8px);display:grid;place-items:center;padding:24px}
      .aria-qa-card{width:min(620px,100%);background:linear-gradient(180deg,#0b1830,#071225);border:1px solid rgba(95,164,255,.34);border-radius:22px;box-shadow:0 26px 80px rgba(0,0,0,.48);padding:24px;color:#eef6ff}
      .aria-qa-card h2{margin:4px 0 8px;font-size:24px;color:#fff}
      .aria-qa-card p{margin:0 0 16px;color:#a9bddb;line-height:1.55}
      .aria-qa-kicker{font-size:11px;font-weight:900;letter-spacing:.14em;color:#73b7ff}
      .aria-qa-field{display:grid;gap:6px;margin:12px 0}
      .aria-qa-field label{font-size:12px;font-weight:800;color:#b9cae2}
      .aria-qa-field input{width:100%;box-sizing:border-box;border:1px solid rgba(91,139,207,.35);border-radius:12px;background:#050e1d;color:#fff;padding:12px 13px;font:inherit}
      .aria-qa-meta{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      .aria-qa-chip{padding:6px 9px;border-radius:999px;background:rgba(42,118,232,.15);border:1px solid rgba(79,148,255,.24);font-size:11px;font-weight:800;color:#cfe4ff}
      .aria-qa-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
      .aria-qa-actions button{border:1px solid rgba(95,164,255,.34);border-radius:12px;padding:10px 14px;font:inherit;font-weight:800;cursor:pointer}
      .aria-qa-primary{background:linear-gradient(135deg,#1877f2,#7b4dff);color:#fff}
      .aria-qa-secondary{background:#0a1930;color:#dcecff}
      .aria-qa-danger{background:rgba(183,48,72,.14);color:#ffdce3;border-color:rgba(255,100,128,.35)!important}
      .aria-qa-note{margin-top:14px!important;font-size:12px;color:#8fa7c8!important}
    `;
    document.head.appendChild(style);
  }

  function randomPassword(){
    const bytes=crypto.getRandomValues(new Uint8Array(18));
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let out='AriaQA!';
    for(const byte of bytes)out+=alphabet[byte%alphabet.length];
    return out;
  }

  function qaEmail(profile){
    const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
    const suffix=crypto.getRandomValues(new Uint16Array(1))[0].toString(36);
    return `${profile.emailPrefix}-${stamp}-${suffix}@ariaishere.test`;
  }

  async function api(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||`Request failed (${response.status}).`);
    return data;
  }

  async function copyText(text,button){
    try{
      await navigator.clipboard.writeText(text);
    }catch{
      const area=document.createElement('textarea');
      area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    if(button){
      const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1400);
    }
  }

  function showCredentials({email,password,userId,profile}){
    document.getElementById('ariaQaTestOverlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='ariaQaTestOverlay';
    overlay.className='aria-qa-overlay';
    overlay.innerHTML=`
      <div class="aria-qa-card" role="dialog" aria-modal="true" aria-labelledby="ariaQaTitle">
        <div class="aria-qa-kicker">PHASE 3 • QA IDENTITY</div>
        <h2 id="ariaQaTitle">${escapeHtml(profile.title)}</h2>
        <p>This temporary account was created through Aria's normal staff provisioning flow and activated with a random password. Use it only for the E2E permission tests, then suspend it.</p>
        <div class="aria-qa-meta"><span class="aria-qa-chip">Department: ${escapeHtml(profile.department)}</span><span class="aria-qa-chip">Role: ${escapeHtml(profile.role)}</span><span class="aria-qa-chip">Expected: ${escapeHtml(profile.expected)}</span></div>
        <div class="aria-qa-field"><label>Email</label><input id="ariaQaEmail" readonly value="${escapeHtml(email)}" /></div>
        <div class="aria-qa-field"><label>Temporary password</label><input id="ariaQaPassword" readonly value="${escapeHtml(password)}" /></div>
        <p class="aria-qa-note">Open an InPrivate/Incognito browser window and sign in with these credentials so your Founder session stays active separately.</p>
        <div class="aria-qa-actions">
          <button type="button" class="aria-qa-primary" id="ariaQaCopyCredentials">Copy credentials</button>
          <button type="button" class="aria-qa-secondary" id="ariaQaCloseHelper">Close</button>
          <button type="button" class="aria-qa-danger" id="ariaQaSuspendAccount">Suspend QA account</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#ariaQaCopyCredentials')?.addEventListener('click',event=>copyText(`Email: ${email}\nPassword: ${password}`,event.currentTarget));
    overlay.querySelector('#ariaQaCloseHelper')?.addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove();});
    overlay.querySelector('#ariaQaSuspendAccount')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      if(!confirm(`Suspend ${profile.displayName}? This will revoke its active sessions.`))return;
      button.disabled=true;button.textContent='Suspending…';
      try{
        await api(`/api/staff/accounts/${encodeURIComponent(userId)}/status`,{
          method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'suspended'})
        });
        button.textContent='QA account suspended';
      }catch(error){
        alert(error.message||'Unable to suspend the QA account.');
        button.disabled=false;button.textContent='Suspend QA account';
      }
    });
  }

  async function createQaAccount(button,profile){
    if(button.disabled)return;
    button.disabled=true;
    const old=button.textContent;
    button.textContent=profile.creatingText;
    try{
      const email=qaEmail(profile);
      const password=randomPassword();
      const invitation=await api('/api/staff/invitations',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({displayName:profile.displayName,email,department:profile.department,role:profile.role})
      });
      const setupUrl=String(invitation.invitation?.setupUrl||'');
      const userId=String(invitation.employee?.id||'');
      const token=new URL(setupUrl,location.origin).searchParams.get('token')||'';
      if(!token||!userId)throw new Error('Aria created the invitation but did not return a usable setup token.');

      await api('/api/staff/setup/complete',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password})
      });
      showCredentials({email,password,userId,profile});
      window.dispatchEvent(new CustomEvent('aria:qa-staff-created',{detail:{userId,email,department:profile.department,role:profile.role}}));
    }catch(error){
      alert(error.message||'Unable to create the QA staff account.');
    }finally{
      button.disabled=false;
      button.textContent=old;
    }
  }

  function createButton(profile){
    const button=document.createElement('button');
    button.type='button';
    button.id=profile.buttonId;
    button.className='aria-qa-create-button';
    button.textContent=profile.buttonText;
    button.title=`Create temporary ${profile.department} / ${profile.role} identity for Phase 3 E2E testing`;
    button.addEventListener('click',()=>createQaAccount(button,profile));
    return button;
  }

  function mountButtons(){
    const adminPage=document.getElementById('admin-page');
    const actionHead=adminPage?.querySelector('.section-head.action-head');
    const addEmployee=document.getElementById('addEmployee');
    const host=actionHead||document.querySelector('.staff-topbar-actions');
    if(!host)return;

    for(const profile of [profiles.restricted,profiles.supervisor]){
      if(document.getElementById(profile.buttonId))continue;
      const button=createButton(profile);
      if(addEmployee?.parentElement===host)host.insertBefore(button,addEmployee);
      else host.appendChild(button);
    }
  }

  async function start(){
    ensureStyles();
    try{
      const session=await api('/api/auth/session');
      const role=String(session.user?.role||'').trim().toLowerCase();
      if(role!=='founder')return;
      mountButtons();
      document.querySelectorAll('[data-page="admin"]').forEach(node=>node.addEventListener('click',()=>setTimeout(mountButtons,0)));
      const observer=new MutationObserver(()=>mountButtons());
      observer.observe(document.body,{childList:true,subtree:true});
    }catch{}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();