(function(){
  const logout=document.createElement('script');
  logout.src='portal-logout.js';
  document.body.appendChild(logout);

  const core=document.createElement('script');
  core.src='staff-core.js';
  core.onload=()=>{
    const guard=document.createElement('script');
    guard.src='staff-access-guard.js';
    guard.onload=()=>{
      const audit=document.createElement('script');
      audit.src='audit-blueprint.js';
      audit.onload=()=>{
        const notes=document.createElement('script');
        notes.src='ticket-notes.js';
        notes.onload=()=>{
          const invites=document.createElement('script');
          invites.src='account-invites.js';
          invites.onload=()=>{
            const provisioning=document.createElement('script');
            provisioning.src='staff-account-provisioning.js';
            document.body.appendChild(provisioning);
          };
          document.body.appendChild(invites);
        };
        document.body.appendChild(notes);
      };
      document.body.appendChild(audit);
    };
    document.body.appendChild(guard);
  };
  document.body.appendChild(core);
})();
