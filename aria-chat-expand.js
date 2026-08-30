(()=>{
  if(window.__ariaChatExpandLoaded)return;
  window.__ariaChatExpandLoaded=true;

  const EXPAND_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M9 9 3.8 3.8M15 9l5.2-5.2M9 15l-5.2 5.2M15 15l5.2 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const RESTORE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  let expanded=false;

  function panel(){return document.getElementById('ariaBubblePanel');}
  function button(){return document.getElementById('ariaChatExpand');}

  function syncButton(){
    const btn=button();
    if(!btn)return;
    btn.innerHTML=expanded?RESTORE_ICON:EXPAND_ICON;
    btn.setAttribute('aria-label',expanded?'Restore compact chat':'Maximize chat');
    btn.title=expanded?'Restore compact chat':'Maximize chat';
    btn.setAttribute('aria-pressed',expanded?'true':'false');
  }

  function setExpanded(next){
    const chat=panel();
    if(!chat)return;
    expanded=Boolean(next);
    chat.classList.toggle('aria-chat-expanded',expanded);
    document.body.classList.toggle('aria-chat-fullscreen-open',expanded&&!chat.hidden);
    syncButton();
    requestAnimationFrame(()=>{
      const log=document.getElementById('ariaBubbleLog');
      if(log)log.scrollTop=log.scrollHeight;
      document.getElementById('ariaBubbleInput')?.focus();
    });
  }

  function buildControls(){
    const head=document.querySelector('#ariaBubblePanel .aria-bubble-head');
    const close=document.getElementById('ariaChatClose');
    if(!head||!close)return false;
    if(document.getElementById('ariaChatExpand'))return true;

    const controls=document.createElement('div');
    controls.className='aria-chat-head-actions';

    const expand=document.createElement('button');
    expand.type='button';
    expand.id='ariaChatExpand';
    expand.className='aria-chat-expand';
    expand.setAttribute('aria-label','Maximize chat');
    expand.setAttribute('aria-pressed','false');
    expand.title='Maximize chat';
    expand.innerHTML=EXPAND_ICON;
    expand.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      setExpanded(!expanded);
    });

    controls.appendChild(expand);
    controls.appendChild(close);
    head.appendChild(controls);

    close.addEventListener('click',()=>{
      if(expanded)setExpanded(false);
      document.body.classList.remove('aria-chat-fullscreen-open');
    });

    return true;
  }

  function watchVisibility(){
    const chat=panel();
    if(!chat)return;
    const observer=new MutationObserver(()=>{
      document.body.classList.toggle('aria-chat-fullscreen-open',expanded&&!chat.hidden);
    });
    observer.observe(chat,{attributes:true,attributeFilter:['hidden']});
  }

  function boot(){
    if(!buildControls()){
      setTimeout(boot,100);
      return;
    }
    watchVisibility();
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&expanded)setExpanded(false);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
