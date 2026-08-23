(function(){
  const button=document.getElementById('backToOnboarding');
  if(!button)return;

  button.addEventListener('click',()=>{
    try{
      const referrer=document.referrer?new URL(document.referrer):null;
      if(referrer&&referrer.origin===location.origin&&referrer.pathname.endsWith('/onboarding.html')){
        location.href=referrer.href;
        return;
      }
    }catch{}

    if(history.length>1){
      history.back();
      return;
    }

    location.href='/onboarding.html';
  });
})();
