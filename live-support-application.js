(function(){
  const form=document.getElementById('liveSupportApplicationForm');
  const button=document.getElementById('applicationSubmit');
  const success=document.getElementById('applicationSuccess');
  if(!form||!button)return;

  function value(id){return String(document.getElementById(id)?.value||'').trim();}

  form.addEventListener('submit',async event=>{
    event.preventDefault();

    if(!document.getElementById('confirmYear')?.checked||!document.getElementById('confirmRoleBoundary')?.checked||!document.getElementById('confirmCertification')?.checked||!document.getElementById('confirmPrivacy')?.checked){
      alert('Please review and confirm every Live Support Specialist requirement before submitting.');
      return;
    }

    button.disabled=true;
    const original=button.textContent;
    button.textContent='Submitting…';

    const experienceSummary=[
      'LIVE SUPPORT SPECIALIST SPECIALIZED APPLICATION',
      '',
      'Customer support experience:',value('supportExperience'),
      '',
      'De-escalation experience:',value('deescalationExperience'),
      '',
      'Emotional support / transferable experience:',value('emotionalSupportExperience')||'Not provided',
      '',
      'Relevant training / certifications:',value('supportTraining')||'Not provided',
      '',
      'Written response scenario:',value('supportScenario'),
      '',
      'Applicant confirmations: 1+ year customer support = yes; non-clinical role boundary = acknowledged; Support Specialist Certification Test required = acknowledged; privacy/access rules = acknowledged.'
    ].join('\n').slice(0,1200);

    try{
      const payload={
        fullName:value('appFullName'),
        email:value('appEmail'),
        phone:value('appPhone'),
        city:value('appCity'),
        state:value('appState'),
        department:'Operations',
        desiredRole:'Live Support Specialist',
        employmentType:value('appEmploymentType'),
        availability:value('appAvailability'),
        experienceSummary,
        whyAria:value('appWhyAria')
      };

      const response=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to submit your application.');

      form.reset();
      success?.classList.remove('hidden');
      success?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      alert(error?.message||'Unable to submit your application.');
    }finally{
      button.disabled=false;
      button.textContent=original;
    }
  });
})();
