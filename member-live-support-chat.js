(()=>{
  if(window.__ariaMemberLiveSupportChatLoaded)return;
  window.__ariaMemberLiveSupportChatLoaded=true;

  let active=false;
  let seen=new Set();
  let pollTimer=null;
  let sending=false;
  let lastSupportName='';
  let stateResetTimer=null;
  window.__ariaHumanSupportActive=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function time(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(d);}
  function log(){return document.getElementById('ariaBubbleLog');}

  function headerNodes(){return {title:document.querySelector('.aria-bubble-title strong'),subtitle:document.querySelector('.aria-bubble-title span')};}
  function showAriaHeader(){const {title,subtitle}=headerNodes();if(title)title.textContent='Aria AI';if(subtitle)subtitle.textContent='Your health companion';}
  function showSupportHeader(name){const safe=String(name||'').trim();if(!safe){showAriaHeader();return;}const {title,subtitle}=headerNodes();if(title)title.textContent=`${safe} • Aria Support`;if(subtitle)subtitle.textContent='Live support connected';}

  function ensureStateBar(){let state=document.getElementById('ariaLiveSupportState');if(state)return state;const head=document.querySelector('.aria-bubble-head');if(!head)return null;state=document.createElement('div');state.id='ariaLiveSupportState';state.className='aria-live-support-state';state.hidden=true;head.insertAdjacentElement('afterend',state);return state;}
  function setStateBar(mode,name=''){
    const state=ensureStateBar();if(!state)return;
    if(stateResetTimer){clearTimeout(stateResetTimer);stateResetTimer=null;}
    if(mode==='connected'){const safe=String(name||'Support').trim()||'Support';state.className='aria-live-support-state connected';state.innerHTML=`<span class="aria-live-support-dot" aria-hidden="true"></span><strong>${esc(safe)} is connected</strong><span>Human support is leading this conversation.</span>`;state.hidden=false;return;}
    if(mode==='ended'){state.className='aria-live-support-state ended';state.innerHTML='<strong>Live support ended</strong><span>You’re back with Aria.</span>';state.hidden=false;stateResetTimer=setTimeout(()=>{state.hidden=true;},8000);return;}
    state.hidden=true;
  }

  function addTransitionNotice(name){const box=log();if(!box)return;const safe=String(name||'Your support specialist').trim()||'Your support specialist';const div=document.createElement('div');div.className='aria-live-support-transition';div.textContent=`${safe} has ended the live support conversation. You’re back with Aria now.`;box.appendChild(div);box.scrollTop=box.scrollHeight;}
  function ensureTypingIndicator(){let indicator=document.getElementById('ariaLiveTyping');if(indicator)return indicator;const inputRow=document.querySelector('.aria-bubble-input');if(!inputRow)return null;indicator=document.createElement('div');indicator.id='ariaLiveTyping';indicator.className='aria-live-typing';indicator.hidden=true;inputRow.parentNode.insertBefore(indicator,inputRow);return indicator;}
  function showTyping(data){const indicator=ensureTypingIndicator();if(!indicator)return;const name=String(data?.typingName||data?.displayName||'Support').trim();indicator.textContent=data?.agentTyping?`${name} is typing…`:'';indicator.hidden=!data?.agentTyping;}
  function supportName(){return String(window.__ariaHumanSupportName||lastSupportName||'Brandon').trim()||'Brandon';}

  function renderMessage(message){const box=log();if(!box||!message?.id||seen.has(message.id))return;seen.add(message.id);const div=document.createElement('div');const role=message.role==='member'?'user':message.role==='staff'?'support':'aria';div.className=`aria-bubble-msg ${role}`;div.dataset.messageId=message.id;const label=message.role==='staff'?`<span class="aria-support-sender">${esc(supportName())}</span>`:'';div.innerHTML=`${label}${esc(message.content).replace(/\n/g,'<br>')}<span class="aria-bubble-time">${esc(time(message.createdAt))}</span>`;box.appendChild(div);box.scrollTop=box.scrollHeight;}

  function activate(data){const incomingName=String(data.displayName||'').trim();if(incomingName)lastSupportName=incomingName;if(!active){active=true;seen=new Set();const box=log();if(box)box.innerHTML='';}window.__ariaHumanSupportActive=true;window.__ariaHumanSupportName=incomingName;showSupportHeader(incomingName);setStateBar('connected',incomingName);showTyping(data);(data.messages||[]).forEach(renderMessage);}
  function deactivate(){const wasActive=active;const endingName=String(window.__ariaHumanSupportName||lastSupportName||'Your support specialist').trim();active=false;window.__ariaHumanSupportActive=false;window.__ariaHumanSupportName='';showAriaHeader();showTyping({agentTyping:false});if(wasActive){setStateBar('ended');addTransitionNotice(endingName);}else{const state=document.getElementById('ariaLiveSupportState');if(state&&!state.classList.contains('ended'))state.hidden=true;}}

  async function refresh(){try{const r=await fetch('/api/member/lifeline/live-chat',{credentials:'same-origin',cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)return;if(data.active&&data.assigned)activate(data);else deactivate();}catch(error){console.error('Member live support chat refresh failed',error);}}

  async function sendLive(text){if(sending||!text)return;sending=true;try{const r=await fetch('/api/member/lifeline/live-chat/messages',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({content:text})});const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error(data.error||'Message could not be sent.');renderMessage(data.message);}catch(error){const box=log();if(box){const div=document.createElement('div');div.className='aria-live-chat-error';div.textContent=error.message;box.appendChild(div);box.scrollTop=box.scrollHeight;}}finally{sending=false;}}

  function intercept(event){
    if(!(active||window.__ariaHumanSupportActive===true))return;
    const isClick=event.type==='click'&&Boolean(event.target?.closest?.('#ariaBubbleSend'));
    const isEnter=event.type==='keydown'&&event.key==='Enter'&&event.target?.id==='ariaBubbleInput';
    if(!isClick&&!isEnter)return;
    const input=document.getElementById('ariaBubbleInput');if(!input)return;
    const text=input.value.trim();if(!text)return;
    event.preventDefault();event.stopImmediatePropagation();input.value='';sendLive(text);
  }

  function boot(){ensureStateBar();ensureTypingIndicator();document.addEventListener('click',intercept,true);document.addEventListener('keydown',intercept,true);refresh();pollTimer=setInterval(refresh,2000);}
  window.addEventListener('beforeunload',()=>{if(stateResetTimer)clearTimeout(stateResetTimer);if(pollTimer)clearInterval(pollTimer);document.removeEventListener('click',intercept,true);document.removeEventListener('keydown',intercept,true);},{once:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
