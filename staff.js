(function(){
  const core=document.createElement('script');
  core.src='staff-core.js';
  core.onload=()=>{
    const guard=document.createElement('script');
    guard.src='staff-access-guard.js';
    guard.onload=()=>{
      const notes=document.createElement('script');
      notes.src='ticket-notes.js';
      notes.onload=()=>{
        const invites=document.createElement('script');
        invites.src='account-invites.js';
        document.body.appendChild(invites);
      };
      document.body.appendChild(notes);
    };
    document.body.appendChild(guard);
  };
  document.body.appendChild(core);
})();
