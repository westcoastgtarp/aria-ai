(()=>{
  if(window.__ariaMemberLiveSupportChatLoaded)return;
  window.__ariaMemberLiveSupportChatLoaded=true;

  let active=false;
  let seen=new Set();
  let pollTimer=null;
  let sending=false;

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function time(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(d);}
  function log(){return document.getElementById('ariaBubbleLog');}

  function renderMessage(message){
    const box=log();if(!box||!message?.id||seen.has(message.id))return;
    seen.add(message.id);
    const div=document.createElement('div');
    const role=message.role==='member'?'user':message.role==='staff'?'support':'aria';
    div.className=`aria-bubble-msg ${role}`;
    div.dataset.messageId=message.id;
    const label=message.role==='staff'?'<span class="aria-support-sender">Aria Support</span>':'';
    div.innerHTML=`${label}${esc(message.content).replace(/\n/g,'<br>')}<span class="aria-bubble-time">${esc(time(message.createdAt))}</span>`;
    box.appendChild(div);box.scrollTop=box.scrollHeight;
  }

  function activate(data){
    if(!active){
      active=true;seen=new Set();
      const box=log();if(box)box.innerHTML='';
    }
    (data.messages||[]).forEach(renderMessage);
  }

  async function refresh(){
    try{
      const r=await fetch('/api/member/lifeline/live-chat',{credentials:'same-origin',cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)return;
      if(data.active&&data.assigned)activate(data);
      else active=false;
    }catch(error){console.error('Member live support chat refresh failed',error);}
  }

  async function sendLive(text){
    if(sending||!text)return;
    sending=true;
    try{
      const r=await fetch('/api/member/lifeline/live-chat/messages',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({content:text})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)throw new Error(data.error||'Message could not be sent.');
      renderMessage(data.message);
    }catch(error){
      const box=log();if(box){const div=document.createElement('div');div.className='aria-live-chat-error';div.textContent=error.message;box.appendChild(div);}
    }finally{sending=false;}
  }

  function intercept(event){
    if(!active)return;
    const input=document.getElementById('ariaBubbleInput');
    if(!input)return;
    if(event.type==='keydown'&&event.key!=='Enter')return;
    const text=input.value.trim();if(!text)return;
    event.preventDefault();event.stopImmediatePropagation();
    input.value='';sendLive(text);
  }

  function boot(){
    document.getElementById('ariaBubbleSend')?.addEventListener('click',intercept,true);
    document.getElementById('ariaBubbleInput')?.addEventListener('keydown',intercept,true);
    refresh();pollTimer=setInterval(refresh,3000);
  }
  window.addEventListener('beforeunload',()=>pollTimer&&clearInterval(pollTimer),{once:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
