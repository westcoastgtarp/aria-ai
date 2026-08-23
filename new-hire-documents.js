(function(){
  const button=document.getElementById('backToOnboarding');
  if(!button)return;

  const params=new URLSearchParams(location.search);
  const token=params.get('token')||'';

  button.addEventListener('click',()=>{
    if(token){
      location.href=`/onboarding.html?token=${encodeURIComponent(token)}`;
      return;
    }

    location.href='/onboarding.html';
  });
})();
