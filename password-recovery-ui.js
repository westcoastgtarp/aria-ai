(function(){
  const signInView=document.getElementById('signInView');
  const registrationView=document.getElementById('registrationView');
  const forgotButton=document.getElementById('forgotPassword');
  const loginCard=document.querySelector('.login-card');
  const loginError=document.getElementById('loginError');
  if(!signInView||!forgotButton||!loginCard)return;

  let recoveryEmail='';
  let recoveryCode='';

  const view=document.createElement('div');
  view.id='passwordRecoveryView';
  view.hidden=true;
  view.innerHTML=`
    <div class="login-heading"><div class="eyebrow">ACCOUNT RECOVERY</div><h2>Reset your password</h2><p>We’ll email a 6-digit code if the address belongs to an active Aria account.</p></div>
    <div class="registration-status" id="recoveryStatus">Step 1 of 3 — Request code</div>

    <section id="recoveryRequestStep" class="registration-step">
      <label>Email<input id="recoveryEmail" type="email" autocomplete="email" placeholder="you@example.com" /></label>
      <p class="field-help">For privacy, Aria won’t confirm whether an account exists for an email address.</p>
      <div class="login-error" id="recoveryRequestError" role="alert" hidden></div>
      <button class="sign-in" id="requestRecoveryCode" type="button">Send Reset Code</button>
    </section>

    <section id="recoveryVerifyStep" class="registration-step" hidden>
      <p class="verification-copy">Enter the 6-digit code sent to your email. It expires in 15 minutes.</p>
      <label>Reset code<input id="recoveryCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" /></label>
      <div class="login-error" id="recoveryVerifyError" role="alert" hidden></div>
      <button class="sign-in" id="verifyRecoveryCode" type="button">Verify Code</button>
    </section>

    <section id="recoveryPasswordStep" class="registration-step" hidden>
      <label>New password<input id="recoveryPassword" type="password" autocomplete="new-password" minlength="14" placeholder="At least 14 characters" /></label>
      <label>Confirm new password<input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="14" placeholder="Confirm password" /></label>
      <p class="field-help">Resetting your password signs out every existing Aria session for this account.</p>
      <div class="login-error" id="recoveryPasswordError" role="alert" hidden></div>
      <button class="sign-in" id="completeRecovery" type="button">Update Password</button>
    </section>

    <section id="recoverySuccessStep" class="registration-step" hidden>
      <div class="success-panel"><div class="success-icon">✓</div><h3>Password updated</h3><p>Your old sessions were signed out. Use your new password to sign in.</p></div>
      <button class="sign-in" id="recoveryReturnSignIn" type="button">Return to Sign In</button>
    </section>

    <button class="create-account-link" id="cancelRecovery" type="button">Back to sign in</button>`;
  const footer=loginCard.querySelector('.login-footer');
  loginCard.insertBefore(view,footer||null);

  function setError(id,message=''){
    const el=document.getElementById(id);if(!el)return;
    el.textContent=message;el.hidden=!message;
  }
  async function api(url,body){
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'Unable to complete this request.');
    return data;
  }
  function showStep(step,status){
    ['recoveryRequestStep','recoveryVerifyStep','recoveryPasswordStep','recoverySuccessStep'].forEach(id=>{document.getElementById(id).hidden=id!==step;});
    document.getElementById('recoveryStatus').textContent=status;
  }
  function openRecovery(){
    if(loginError){loginError.hidden=true;loginError.textContent='';}
    registrationView.hidden=true;
    signInView.hidden=true;
    view.hidden=false;
    recoveryEmail=document.getElementById('loginEmail')?.value.trim().toLowerCase()||'';
    recoveryCode='';
    document.getElementById('recoveryEmail').value=recoveryEmail;
    document.getElementById('recoveryCode').value='';
    document.getElementById('recoveryPassword').value='';
    document.getElementById('recoveryPasswordConfirm').value='';
    ['recoveryRequestError','recoveryVerifyError','recoveryPasswordError'].forEach(id=>setError(id));
    showStep('recoveryRequestStep','Step 1 of 3 — Request code');
    document.getElementById('recoveryEmail').focus();
  }
  function closeRecovery(){
    view.hidden=true;
    registrationView.hidden=true;
    signInView.hidden=false;
    recoveryCode='';
    document.getElementById('loginPassword').value='';
    document.getElementById('loginEmail').focus();
  }

  forgotButton.addEventListener('click',openRecovery);
  document.getElementById('cancelRecovery').addEventListener('click',closeRecovery);
  document.getElementById('recoveryReturnSignIn').addEventListener('click',closeRecovery);

  document.getElementById('requestRecoveryCode').addEventListener('click',async()=>{
    const email=document.getElementById('recoveryEmail').value.trim().toLowerCase();
    const button=document.getElementById('requestRecoveryCode');
    setError('recoveryRequestError');
    if(!email||!email.includes('@')){setError('recoveryRequestError','Enter a valid email address.');return;}
    button.disabled=true;button.textContent='Sending…';
    try{
      await api('/api/password-recovery/request',{email});
      recoveryEmail=email;
      showStep('recoveryVerifyStep','Step 2 of 3 — Verify code');
      document.getElementById('recoveryCode').focus();
    }catch(err){setError('recoveryRequestError',err?.message||'Unable to request a reset code.');}
    finally{button.disabled=false;button.textContent='Send Reset Code';}
  });

  document.getElementById('verifyRecoveryCode').addEventListener('click',async()=>{
    const code=document.getElementById('recoveryCode').value.trim();
    const button=document.getElementById('verifyRecoveryCode');
    setError('recoveryVerifyError');
    if(!/^\d{6}$/.test(code)){setError('recoveryVerifyError','Enter the 6-digit reset code.');return;}
    button.disabled=true;button.textContent='Verifying…';
    try{
      await api('/api/password-recovery/verify',{email:recoveryEmail,code});
      recoveryCode=code;
      showStep('recoveryPasswordStep','Step 3 of 3 — Create new password');
      document.getElementById('recoveryPassword').focus();
    }catch(err){setError('recoveryVerifyError',err?.message||'That reset code is invalid or expired.');}
    finally{button.disabled=false;button.textContent='Verify Code';}
  });

  document.getElementById('completeRecovery').addEventListener('click',async()=>{
    const password=document.getElementById('recoveryPassword').value;
    const confirm=document.getElementById('recoveryPasswordConfirm').value;
    const button=document.getElementById('completeRecovery');
    setError('recoveryPasswordError');
    if(password.length<14){setError('recoveryPasswordError','Use a password with at least 14 characters.');return;}
    if(password!==confirm){setError('recoveryPasswordError','The passwords do not match.');return;}
    button.disabled=true;button.textContent='Updating…';
    try{
      await api('/api/password-recovery/complete',{email:recoveryEmail,code:recoveryCode,password});
      document.getElementById('recoveryPassword').value='';
      document.getElementById('recoveryPasswordConfirm').value='';
      sessionStorage.removeItem('aria-auth-session');
      sessionStorage.removeItem('aria-member-name');
      showStep('recoverySuccessStep','Password reset complete');
    }catch(err){setError('recoveryPasswordError',err?.message||'Unable to update your password.');}
    finally{button.disabled=false;button.textContent='Update Password';}
  });
})();
