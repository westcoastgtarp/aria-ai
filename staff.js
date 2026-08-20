(function(){
  const core=document.createElement('script');
  core.src='staff-core.js';
  core.onload=()=>{
    const notes=document.createElement('script');
    notes.src='ticket-notes.js';
    document.body.appendChild(notes);
  };
  document.body.appendChild(core);
})();
