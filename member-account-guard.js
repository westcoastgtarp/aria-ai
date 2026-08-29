(()=>{
  if(window.__ariaMemberAccountGuardLoaded)return;
  window.__ariaMemberAccountGuardLoaded=true;

  async function guard(){
    try{
      const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.authenticated)return;
      const accountType=String(data?.user?.accountType||'').trim().toLowerCase();
      if(accountType==='staff'){
        window.location.replace('/staff.html');
      }
    }catch(error){
      console.error('Member account guard failed',error);
    }
  }

  guard();
})();
