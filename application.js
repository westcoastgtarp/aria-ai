(function(){
  const form=document.getElementById('applicationForm');
  const button=document.getElementById('applicationSubmit');
  const success=document.getElementById('applicationSuccess');
  const desiredRole=document.getElementById('appDesiredRole');
  if(!form||!button)return;

  function isLiveSupportRole(value=''){
    return String(value).trim().toLowerCase()==='live support specialist';
  }

  function routeSpecialistApplicant(){
    if(isLiveSupportRole(desiredRole?.value)){
      window.location.href='/live-support-application.html';
      return true;
    }
    return false;
  }

  desiredRole?.addEventListener('change',routeSpecialistApplicant);
  desiredRole?.addEventListener('blur',routeSpecialistApplicant);

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(routeSpecialistApplicant())return;

    button.disabled=true;
    const original=button.textContent;
    button.textContent='Submitting…';
    try{
      const payload={
        fullName:document.getElementById('appFullName').value.trim(),
        email:document.getElementById('appEmail').value.trim(),
        phone:document.getElementById('appPhone').value.trim(),
        city:document.getElementById('appCity').value.trim(),
        state:document.getElementById('appState').value.trim(),
        department:document.getElementById('appDepartment').value,
        desiredRole:desiredRole.value.trim(),
        employmentType:document.getElementById('appEmploymentType').value,
        availability:document.getElementById('appAvailability').value.trim(),
        experienceSummary:document.getElementById('appExperience').value.trim(),
        whyAria:document.getElementById('appWhyAria').value.trim()
      };
      const response=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'Unable to submit your application.');
      form.reset();
      success.classList.remove('hidden');
      success.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){alert(error?.message||'Unable to submit your application.');}
    finally{button.disabled=false;button.textContent=original;}
  });
})();
