(function(){
  const EVENT_KEY='aria-demo-lifeline-events';
  const PREF_KEY='aria-demo-lifeline-preferences';
  const RESPONSE_WINDOWS={high:300,critical:120};
  let timerId=null;
  let secondsRemaining=0;
  let flowActive=false;
  let activeRisk='normal';

  function load(key,fallback){
    try{return JSON.parse(sessionStorage.getItem(key)||'null')??fallback;}catch{return fallback;}
  }
  function save(key,value){sessionStorage.setItem(key,JSON.stringify(value));}
  function prefs(){return load(PREF_KEY,{contactConsent:false,locationMode:'never'});}
  function setPrefs(next){save(PREF_KEY,{...prefs(),...next});renderPreferences();}
  function logEvent(type,details={}){
    const events=load(EVENT_KEY,[]);
    events.unshift({id:`LFL-EVT-${Date.now()}`,type,details,at:new Date().toISOString()});
    save(EVENT_KEY,events.slice(0,100));
  }
  function formatCountdown(total){
    const m=Math.floor(total/60);const s=String(total%60).padStart(2,'0');return `${m}:${s}`;
  }
  function riskLabel(risk){return risk==='critical'?'Critical':'High Risk';}
  function windowLabel(seconds){return seconds===120?'2-minute':'5-minute';}

  async function getPrimaryContact(){
    const response=await fetch('/api/member/care-circle',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load approved contacts.');
    return Array.isArray(data.contacts)&&data.contacts.length?data.contacts[0]:null;
  }

  async function callPrimaryContact(){
    const contact=await getPrimaryContact();
    if(!contact?.phone)throw new Error('No approved Care Circle contact is available.');
    logEvent('member_selected_approved_contact_call',{contactId:contact.id,priority:contact.priority});
    window.location.href=`tel:${contact.phone}`;
  }

  async function sendEscalationAlert(risk){
    const current=prefs();
    const payload={level:risk};
    if(current.locationMode!=='never')payload.location={permitted:true,mode:current.locationMode};
    const response=await fetch('/api/member/lifeline/alert',{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    return {response,data};
  }

  function renderPreferences(){
    const current=prefs();
    const consent=document.getElementById('careContactConsent');
    const status=document.getElementById('locationPreferenceStatus');
    if(consent)consent.checked=Boolean(current.contactConsent);
    if(status){
      const labels={once:'Allow once during a Lifeline event',app:'Allow while using Aria',never:'Location sharing off'};
      status.textContent=labels[current.locationMode]||labels.never;
    }
  }

  document.getElementById('careContactConsent')?.addEventListener('change',e=>{
    setPrefs({contactConsent:e.target.checked});
    logEvent('emergency_contact_consent_preference_changed',{confirmed:e.target.checked});
  });

  document.querySelectorAll('[data-location-mode]').forEach(btn=>btn.addEventListener('click',async()=>{
    const mode=btn.dataset.locationMode;
    if(mode==='never'){
      setPrefs({locationMode:'never'});
      logEvent('location_permission_preference_changed',{mode:'never'});
      return;
    }

    const current=prefs();
    if(!current.contactConsent){
      window.openModal?.('<div class="eyebrow">CARE CIRCLE CONSENT</div><h2 id="modalTitle">Confirm your emergency contact is informed</h2><p>Before enabling Lifeline location sharing, confirm that the person you list as your emergency contact has agreed to be contacted by Aria during a serious distress event.</p>');
      return;
    }

    if(!navigator.geolocation){
      window.openModal?.('<div class="eyebrow">LOCATION SUPPORT</div><h2 id="modalTitle">Location is unavailable</h2><p>This device or browser does not expose location access to Aria.</p>');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position=>{
        setPrefs({locationMode:mode});
        logEvent('location_permission_granted',{mode,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
        window.openModal?.(`<div class="eyebrow">LIFELINE LOCATION</div><h2 id="modalTitle">Location support enabled</h2><p>During a qualifying Lifeline event, Aria may make your current location available to your approved emergency contact according to this preference.</p>`);
      },
      ()=>{
        setPrefs({locationMode:'never'});
        logEvent('location_permission_denied');
        window.openModal?.('<div class="eyebrow">LIFELINE LOCATION</div><h2 id="modalTitle">Location permission was not granted</h2><p>You can continue using Lifeline without location sharing and change this preference later.</p>');
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
  }));

  function stopTimer(reason){
    if(timerId)clearInterval(timerId);
    timerId=null;
    flowActive=false;
    logEvent('member_response_window_stopped',{reason,risk:activeRisk,secondsRemaining});
    activeRisk='normal';
  }

  function directCall911(){
    logEvent('direct_911_call_selected',{method:'device_tel_link'});
    window.location.href='tel:911';
  }

  async function expireMemberWindow(container,risk,durationSeconds){
    const current=prefs();
    const label=windowLabel(durationSeconds);
    logEvent('emergency_contact_alert_requested',{risk,locationPermitted:current.locationMode!=='never',durationSeconds});
    stopTimer('expired');
    container.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45"><strong>${label} response window ended.</strong><br>Aria is attempting to alert your highest-priority approved Care Circle contact.</div>`;

    try{
      const {response,data}=await sendEscalationAlert(risk);
      if(response.ok&&data.ok&&data.sent){
        logEvent('emergency_contact_alert_sent',{risk,eventId:data.eventId||null});
        container.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45"><strong>Approved contact alert sent.</strong><br>${data.contact?.name?`${data.contact.name} was selected from your Care Circle. `:''}If you are in immediate danger, call 911 from your device.</div><button class="emergency" id="lifelinePostAlert911">Call 911</button>`;
        container.querySelector('#lifelinePostAlert911').onclick=directCall911;
        return;
      }

      const contact=data.contact||null;
      logEvent('emergency_contact_alert_not_sent',{risk,code:data.code||'unknown'});
      container.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45"><strong>Automatic alert could not be sent.</strong><br>${data.error||'The outbound alert service is unavailable.'} You can still call your approved contact or 911 directly.</div><button class="contact" id="lifelineFallbackContact">Call approved contact</button><button class="emergency" id="lifelineFallback911">Call 911</button>`;
      container.querySelector('#lifelineFallbackContact').onclick=async()=>{
        try{
          if(contact?.phone)window.location.href=`tel:${contact.phone}`;
          else await callPrimaryContact();
        }catch(error){window.openModal?.(`<div class="eyebrow">CARE CIRCLE</div><h2 id="modalTitle">Approved contact unavailable</h2><p>${error?.message||'No approved Care Circle contact is available.'}</p>`);}
      };
      container.querySelector('#lifelineFallback911').onclick=directCall911;
    }catch(error){
      logEvent('emergency_contact_alert_not_sent',{risk,code:'network_error'});
      container.innerHTML='<div style="width:100%;font-size:12px;line-height:1.45"><strong>Automatic alert could not be sent.</strong><br>The alert service could not be reached. You can still call your approved contact or 911 directly.</div><button class="contact" id="lifelineFallbackContact">Call approved contact</button><button class="emergency" id="lifelineFallback911">Call 911</button>';
      container.querySelector('#lifelineFallbackContact').onclick=async()=>{
        try{await callPrimaryContact();}catch(err){window.openModal?.(`<div class="eyebrow">CARE CIRCLE</div><h2 id="modalTitle">Approved contact unavailable</h2><p>${err?.message||'No approved Care Circle contact is available.'}</p>`);}
      };
      container.querySelector('#lifelineFallback911').onclick=directCall911;
    }
  }

  function activateMemberWindow(actions){
    if(flowActive||actions.dataset.lifelineEnhanced==='true')return;
    const risk=actions.dataset.lifelineRisk==='critical'?'critical':'high';
    const durationSeconds=RESPONSE_WINDOWS[risk];
    actions.dataset.lifelineEnhanced='true';
    flowActive=true;
    activeRisk=risk;
    secondsRemaining=durationSeconds;
    logEvent('member_response_window_started',{risk,durationSeconds});
    actions.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45;margin-bottom:8px"><strong>${riskLabel(risk)} Lifeline check-in</strong><br>Would you like to call your approved emergency contact? You have <span id="lifelineCountdown">${formatCountdown(durationSeconds)}</span> to choose. If you do not act before the timer ends, Aria will attempt to alert your highest-priority approved Care Circle contact.</div><button class="contact" id="lifelineMemberCall">Call Emergency Contact</button><button class="emergency" id="lifelineCall911">Call 911</button>`;
    const countdown=actions.querySelector('#lifelineCountdown');
    actions.querySelector('#lifelineMemberCall').onclick=async()=>{
      stopTimer('member_pressed_call');
      try{
        await callPrimaryContact();
        actions.innerHTML='<div style="width:100%;font-size:12px;line-height:1.45"><strong>Approved contact call selected.</strong><br>Because you acted within the response window, the automatic Care Circle alert was not sent.</div>';
      }catch(error){
        actions.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45"><strong>Approved contact unavailable.</strong><br>${error?.message||'No approved Care Circle contact is available.'}</div><button class="emergency" id="lifelineNoContact911">Call 911</button>`;
        actions.querySelector('#lifelineNoContact911').onclick=directCall911;
      }
    };
    actions.querySelector('#lifelineCall911').onclick=()=>{
      stopTimer('member_selected_911');
      directCall911();
    };
    timerId=setInterval(()=>{
      secondsRemaining-=1;
      if(countdown)countdown.textContent=formatCountdown(Math.max(0,secondsRemaining));
      if(secondsRemaining<=0)expireMemberWindow(actions,risk,durationSeconds);
    },1000);
  }

  const observer=new MutationObserver(()=>{
    document.querySelectorAll('#ariaBubbleLog .aria-bubble-actions').forEach(actions=>{
      if(actions.querySelector('#bubbleContactCare'))activateMemberWindow(actions);
    });
  });
  const chatLog=document.getElementById('ariaBubbleLog');
  if(chatLog)observer.observe(chatLog,{childList:true,subtree:true,attributes:true,attributeFilter:['data-lifeline-risk']});

  renderPreferences();
})();
