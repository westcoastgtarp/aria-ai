(()=>{
  if(window.__ariaStaffHeaderSignoutCleanupLoaded)return;
  window.__ariaStaffHeaderSignoutCleanupLoaded=true;

  function removeHeaderSignout(){
    document.getElementById('staffHeaderSignout')?.remove();

    // Keep the header clock/date, but remove only redundant header logout controls.
    document.querySelectorAll('.staff-header-actions button').forEach(button=>{
      const text=String(button.textContent||'').trim().toLowerCase();
      if(text.includes('sign out'))button.remove();
    });
  }

  removeHeaderSignout();
  const observer=new MutationObserver(removeHeaderSignout);
  observer.observe(document.body,{childList:true,subtree:true});
})();