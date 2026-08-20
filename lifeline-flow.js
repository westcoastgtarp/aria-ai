(function(){
  const EVENT_KEY='aria-demo-lifeline-events';
  const PREF_KEY='aria-demo-lifeline-preferences';
  let timerId=null;
  let secondsRemaining=120;
  let flowActive=false;

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
      window.openModal?.('<div class="eyebrow">CARE CIRCLE CONSENT</div><h2 id="modalTitle">Confirm your emergency contact is informed</h2><p>Before enabling Lifeline location sharing, confirm that the person you list as your emergency contact has agreed to be contacted by Aria during a serious distress event.</p><p><strong>No real message or location is sent in this prototype.</strong></p>');
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
        window.openModal?.(`<div class="eyebrow">LIFELINE LOCATION</div><h2 id="modalTitle">Location support enabled</h2><p>During a qualifying Lifeline event, Aria may make your current location available to your approved emergency contact according to this preference.</p><p><strong>Prototype:</strong> no location is transmitted to another person.</p>`);
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
    logEvent('member_response_window_stopped',{reason,secondsRemaining});
  }

  function directCall911(){
    logEvent('direct_911_call_selected',{method:'device_tel_link'});
    window.location.href='tel:911';
  }

  function showContactOptions(){
    const log=document.getElementById('ariaBubbleLog');
    if(!log)return;
    const existing=log.querySelector('.lifeline-contact-options');
    if(existing)existing.remove();
    const wrap=document.createElement('div');
    wrap.className='aria-bubble-actions lifeline-contact-options';
    wrap.innerHTML='<div style="width:100%;font-size:12px;line-height:1.45;margin-bottom:8px"><strong>Emergency contact view — prototype</strong><br>Alert prepared. Location is included only if the member previously allowed it.</div><button class="contact" id="lifelineCheckIn">Send Check-In</button><button class="contact" id="lifelineViewLocation">View Location</button><button class="emergency" id="lifelineCallMember">Call Member</button>';
    log.appendChild(wrap);
    document.getElementById('lifelineCheckIn').onclick=()=>{
      logEvent('emergency_contact_action_selected',{action:'send_check_in'});
      window.openModal?.('<div class="eyebrow">CHECK-IN</div><h2 id="modalTitle">Calm check-in message</h2><p>Production would let the emergency contact send a calm check-in first. No message is sent in this prototype.</p>');
    };
    document.getElementById('lifelineViewLocation').onclick=()=>{
      logEvent('emergency_contact_action_selected',{action:'view_location'});
      const current=prefs();
      window.openModal?.(`<div class="eyebrow">LOCATION</div><h2 id="modalTitle">Member location</h2><p>${current.locationMode==='never'?'The member has not enabled Lifeline location sharing.':'Production would display the member\'s permitted current Lifeline-event location here.'}</p><p><strong>Prototype:</strong> no location is shared externally.</p>`);
    };
    document.getElementById('lifelineCallMember').onclick=()=>{
      logEvent('emergency_contact_action_selected',{action:'call_member'});
      window.openModal?.('<div class="eyebrow">CALL MEMBER</div><h2 id="modalTitle">Call option</h2><p>The emergency contact could choose to call the member if appropriate. Aria presents check-in messaging first to avoid unnecessarily increasing anxiety.</p><p><strong>Prototype:</strong> no call is placed.</p>');
    };
    log.scrollTop=log.scrollHeight;
  }

  function expireMemberWindow(container){
    stopTimer('expired');
    const current=prefs();
    logEvent('emergency_contact_alert_prepared',{locationPermitted:current.locationMode!=='never'});
    container.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45"><strong>2-minute response window ended.</strong><br>Prototype emergency-contact alert prepared${current.locationMode!=='never'?' with permitted location support':''}. No real notification was sent.</div>`;
    showContactOptions();
  }

  function activateMemberWindow(actions){
    if(flowActive||actions.dataset.lifelineEnhanced==='true')return;
    actions.dataset.lifelineEnhanced='true';
    flowActive=true;
    secondsRemaining=120;
    logEvent('member_response_window_started',{durationSeconds:120});
    actions.innerHTML=`<div style="width:100%;font-size:12px;line-height:1.45;margin-bottom:8px"><strong>Would you like to call your emergency contact?</strong><br>You have <span id="lifelineCountdown">2:00</span> to choose. If you do not press the button, Aria's prototype flow will prepare the approved emergency-contact alert.</div><button class="contact" id="lifelineMemberCall">Call Emergency Contact</button><button class="emergency" id="lifelineCall911">Call 911</button>`;
    const countdown=actions.querySelector('#lifelineCountdown');
    actions.querySelector('#lifelineMemberCall').onclick=()=>{
      stopTimer('member_pressed_call');
      actions.innerHTML='<div style="width:100%;font-size:12px;line-height:1.45"><strong>Call selected.</strong><br>Automatic emergency-contact notification is paused in this prototype. No call was placed.</div>';
      window.openModal?.('<div class="eyebrow">CARE CIRCLE</div><h2 id="modalTitle">Call Emergency Contact</h2><p>Production would open the member\'s approved emergency-contact calling option. Because the member acted within the two-minute window, the automatic contact alert is not sent at this stage.</p><p><strong>Prototype:</strong> no call is placed.</p>');
    };
    actions.querySelector('#lifelineCall911').onclick=()=>{
      stopTimer('member_selected_911');
      directCall911();
    };
    timerId=setInterval(()=>{
      secondsRemaining-=1;
      if(countdown)countdown.textContent=formatCountdown(Math.max(0,secondsRemaining));
      if(secondsRemaining<=0)expireMemberWindow(actions);
    },1000);
  }

  const observer=new MutationObserver(()=>{
    document.querySelectorAll('#ariaBubbleLog .aria-bubble-actions').forEach(actions=>{
      if(actions.querySelector('#bubbleContactCare'))activateMemberWindow(actions);
    });
  });
  const chatLog=document.getElementById('ariaBubbleLog');
  if(chatLog)observer.observe(chatLog,{childList:true,subtree:true});

  renderPreferences();
})();
