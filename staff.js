(function(){
  const core=document.createElement('script');
  core.src='staff-core.js';
  core.onload=()=>{
    const notes=document.createElement('script');
    notes.src='ticket-notes.js';
    notes.onload=()=>{
      const invites=document.createElement('script');
      invites.src='account-invites.js';
      document.body.appendChild(invites);
    };
    document.body.appendChild(notes);
  };
  document.body.appendChild(core);
})();
