(()=>{
  if(window.__ariaMemberNotificationPreferences)return;
  window.__ariaMemberNotificationPreferences=true;

  async function api(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
    return data;
  }
  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
  function ensureCard(){
    const page=document.getElementById('reminders-page');
    if(!page)return null;
    const existing=document.getElementById('memberNotificationPreferences');
    if(existing)return existing;
    const heading=page.querySelector('.section-heading');
    const card=document.createElement('section');
    card.id='memberNotificationPreferences';
    card.className='panel member-notification-panel';
    card.innerHTML=`
      <div class="member-notification-heading">
        <div>
          <div class="eyebrow">NOTIFICATIONS</div>
          <h3>How should Aria remind you?</h3>
          <p>Email reminders are available now. Aria keeps reminder messages private by default.</p>
        </div>
        <span class="member-notification-save-state" id="memberNotificationSaveState"></span>
      </div>
      <div class="member-notification-options">
        <label class="member-notification-toggle">
          <span><strong>Email notifications</strong><small id="memberNotificationEmailAddress">Uses the email on your Aria account</small></span>
          <input type="checkbox" id="memberNotificationEmailEnabled" checked aria-label="Email notifications" />
        </label>
      </div>
      <label class="member-notification-privacy">
        <input type="checkbox" id="memberNotificationPrivateContent" checked />
        <span><strong>Keep notification details private</strong><small>Messages say you have an Aria reminder and ask you to sign in instead of showing medication details.</small></span>
      </label>
      <div class="member-notification-actions">
        <button type="button" class="primary" id="memberNotificationSave">Save notification settings</button>
      </div>`;
    if(heading)heading.after(card);else page.prepend(card);
    return card;
  }

  async function load(){
    const card=ensureCard();if(!card)return;
    const state=document.getElementById('memberNotificationSaveState');
    try{
      const data=await api('/api/member/notification-preferences',{method:'GET',headers:{}});
      document.getElementById('memberNotificationEmailEnabled').checked=Boolean(data.emailEnabled);
      document.getElementById('memberNotificationPrivateContent').checked=Boolean(data.privateContent);
      document.getElementById('memberNotificationEmailAddress').textContent=data.email?`Uses your account email: ${data.email}`:'Uses the email on your Aria account';
      state.textContent='';
    }catch(error){
      console.error('Notification preferences load failed',error);
      state.textContent='Could not load settings';
    }
  }

  async function save(){
    const button=document.getElementById('memberNotificationSave');if(!button)return;
    const state=document.getElementById('memberNotificationSaveState');
    const payload={
      emailEnabled:document.getElementById('memberNotificationEmailEnabled').checked,
      smsEnabled:false,
      privateContent:document.getElementById('memberNotificationPrivateContent').checked
    };
    button.disabled=true;button.textContent='Saving…';state.textContent='';
    try{
      await api('/api/member/notification-preferences',{method:'PATCH',body:JSON.stringify(payload)});
      state.textContent='Saved';
    }catch(error){
      console.error('Notification preferences save failed',error);state.textContent=escapeHtml(error.message||'Could not save settings');
    }finally{
      button.disabled=false;button.textContent='Save notification settings';
    }
  }

  function boot(){
    const card=ensureCard();
    if(!card)return;
    document.getElementById('memberNotificationSave')?.addEventListener('click',save);
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
