(()=>{
  if(window.__ariaClosedChatEscalationCleanupLoaded)return;
  window.__ariaClosedChatEscalationCleanupLoaded=true;

  function isClosedReviewWorkspace(){
    const workspace=document.getElementById('liveSupportWorkspace');
    if(!workspace||workspace.hidden)return false;
    const text=String(workspace.textContent||'').toLowerCase();
    return text.includes('closed • review only')||
      text.includes('closed · review only')||
      text.includes('closed conversation • review only')||
      (text.includes('closed conversation')&&text.includes('review only'));
  }

  function enforce(){
    if(!isClosedReviewWorkspace())return;
    document.getElementById('liveSupportEscalationPanel')?.remove();
  }

  enforce();
  const observer=new MutationObserver(enforce);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
})();