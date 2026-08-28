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
    if(!page||document.getElementById('memberNotificationPreferences'))return null;
    const heading=page.querySelector('.section-heading');
    const card=document.createElement('section');
    card.id='memberNotificationPreferences';
    card.className='panel member-notification-panel';
    card.innerHTML=`
      <div class="member-notification-heading">
        <div>
          <div class="eyebrow">NOTIFICATIONS</div>
          <h3>How should Aria remind you?</h3>
          <p>Email and text notifications are included. Aria keeps reminder messages private by default.</p>
        </div>
        <span class="member-notification-save-state" id="memberNotificationSaveState"></span>
      </div>
      <div class="member-notification-options">
        <label class="member-notification-toggle">
          <span><strong>Email</strong><small id="memberNotificationEmailAddress">Your account email</small></span>
          <input type="checkbox" id="memberNotificationEmailEnabled" checked />
        </label>
        <label class="member-notification-toggle">
          <span><strong>Text message</strong><small>Send reminder alerts to your mobile number</small></span>
          <input type="checkbox" id="memberNotificationSmsEnabled" checked />
        </label>
      </div>
      <label class="member-notification-phone" for="memberNotificationMobileNumber">
        <span>Mobile number</span>
        <input id="memberNotificationMobileNumber" type="tel" autocomplete="tel" inputmode="tel" placeholder="(555) 123-4567" />
        <small>Used only for Aria text notifications. You can change it anytime.</small>
      </label>
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
      document.getElementById('memberNotificationSmsEnabled').checked=Boolean(data.smsEnabled);
      document.getElementById('memberNotificationPrivateContent').checked=Boolean(data.privateContent);
      document.getElementById('memberNotificationMobileNumber').value=data.mobileNumber||'';
      document.getElementById('memberNotificationEmailAddress').textContent=data.email?`Send to ${data.email}`:'Your account email';
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
      smsEnabled:document.getElementById('memberNotificationSmsEnabled').checked,
      mobileNumber:document.getElementById('memberNotificationMobileNumber').value.trim(),
      privateContent:document.getElementById('memberNotificationPrivateContent').checked
    };
    if(payload.smsEnabled&&!payload.mobileNumber){
      state.textContent='Add a mobile number for text alerts';
      document.getElementById('memberNotificationMobileNumber').focus();
      return;
    }
    button.disabled=true;button.textContent='Saving…';state.textContent='';
    try{
      const data=await api('/api/member/notification-preferences',{method:'PATCH',body:JSON.stringify(payload)});
      document.getElementById('memberNotificationMobileNumber').value=data.mobileNumber||'';
      state.textContent='Saved';
    }catch(error){
      console.error('Notification preferences save failed',error);
      state.textContent=escapeHtml(error.message||'Could not save settings');
    }finally{
      button.disabled=false;button.textContent='Save notification settings';
    }
  }

  function boot(){
    if(!ensureCard())return;
    document.getElementById('memberNotificationSave')?.addEventListener('click',save);
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
