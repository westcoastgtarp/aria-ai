(()=>{
  if(window.__ariaCareCirclePremiumLoaded)return;
  window.__ariaCareCirclePremiumLoaded=true;

  const page=document.getElementById('carecircle-page');
  const brandMark=document.querySelector('.sidebar .brand-mark');
  const topbar=document.querySelector('.topbar');
  if(!page)return;

  const sync=()=>{
    const active=page.classList.contains('active');
    document.body.classList.toggle('care-circle-premium-active',active);
    if(brandMark){
      brandMark.classList.toggle('care-logo-mark',active);
      brandMark.textContent=active?'':'A';
    }
    if(topbar)topbar.classList.toggle('care-circle-premium-topbar',active);
  };

  const observer=new MutationObserver(sync);
  observer.observe(page,{attributes:true,attributeFilter:['class']});
  sync();
})();
