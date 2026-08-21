(function(){
  function replaceVisibleFounderLabels(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()){
      if(walker.currentNode.nodeValue?.includes('Founder / Co-Founder'))nodes.push(walker.currentNode);
    }
    nodes.forEach(node=>{node.nodeValue=node.nodeValue.replaceAll('Founder / Co-Founder','Founder');});
  }

  function addStyles(){
    const style=document.createElement('style');
    style.textContent=`
      .staff-sidebar .footer-links{display:none!important}
      .staff-utility-footer{margin-top:42px;border-top:1px solid var(--line);padding:26px 4px 8px;display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:34px;color:var(--muted)}
      .staff-footer-group{min-width:0}
      .staff-footer-group h3{margin:0 0 10px;color:var(--text);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
      .staff-footer-links{display:flex;flex-wrap:wrap;gap:7px 16px;align-items:center}
      .staff-footer-links button,.staff-footer-links a{border:0;background:transparent;padding:0;color:#66738a;text-decoration:none;font-size:12px;cursor:pointer;text-align:left}
      .staff-footer-links button:hover,.staff-footer-links a:hover{color:#565dd0}
      .staff-footer-copy{font-size:11px;line-height:1.55;color:#8893a4;margin-top:9px;max-width:540px}
      .staff-footer-bottom{grid-column:1/-1;border-top:1px solid var(--line);padding-top:14px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:10px;color:#929cac}
      .terms-list{padding-left:20px;color:var(--muted);line-height:1.65}
      .terms-list li+li{margin-top:8px}
      .terms-callout{margin-top:18px;padding:14px 16px;border:1px solid #dfe3f7;border-radius:13px;background:#f7f8ff;color:#59667a;font-size:12px;line-height:1.55}
      @media(max-width:900px){.staff-utility-footer{grid-template-columns:1fr 1fr;gap:24px}.staff-footer-group:first-child{grid-column:1/-1}}
      @media(max-width:560px){.staff-utility-footer{grid-template-columns:1fr;padding-top:22px}.staff-footer-group:first-child{grid-column:auto}.staff-footer-links{flex-direction:column;align-items:flex-start}.staff-footer-bottom{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function addTermsPage(main){
    if(document.getElementById('terms-page'))return;
    const section=document.createElement('section');
    section.className='page';
    section.id='terms-page';
    section.innerHTML=`
      <article class="panel">
        <div class="eyebrow">TERMS OF SERVICE & ACCEPTABLE USE</div>
        <h2>Using Aria responsibly</h2>
        <p>Aria staff systems are company tools intended for authorized business use. Access should be limited to the work a staff member is assigned and the information needed to complete that work.</p>
        <ul class="terms-list">
          <li>Use only your own staff account. Do not share passwords, verification codes, sessions, or access credentials.</li>
          <li>Access member, employee, billing, Lifeline, or operational information only when your role and assigned work require it.</li>
          <li>Do not copy, export, disclose, alter, or retain sensitive information outside approved Aria systems unless an authorized workflow requires it.</li>
          <li>Keep ticket notes, audit records, HR records, and operational documentation factual, professional, and relevant to the work being performed.</li>
          <li>Do not use Aria systems to harass, threaten, discriminate against, impersonate, surveil, or improperly investigate another person.</li>
          <li>Do not bypass access controls, disable logging, falsify records, or attempt to gain permissions beyond those assigned to your account.</li>
          <li>Report suspected account compromise, privacy issues, security incidents, incorrect access, or system misuse through the appropriate internal channel.</li>
          <li>Aria is not an emergency dispatch service and staff must not represent the platform as having contacted emergency services unless that action is actually confirmed through the approved workflow.</li>
        </ul>
        <div class="terms-callout"><strong>Policy status:</strong> This is the operational acceptable-use framework for the development staff portal. Before public launch, the final customer-facing Terms of Service and formal employee policies should receive appropriate legal and company review.</div>
      </article>`;
    main.appendChild(section);
  }

  function openPage(page,title){
    if(typeof window.showPage==='function')window.showPage(page);
    else{
      document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
      document.getElementById(`${page}-page`)?.classList.add('active');
    }
    const pageTitle=document.getElementById('pageTitle');
    if(pageTitle&&title)pageTitle.textContent=title;
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function buildFooter(){
    const main=document.querySelector('.staff-main');
    if(!main||document.querySelector('.staff-utility-footer'))return;
    addTermsPage(main);

    const footer=document.createElement('footer');
    footer.className='staff-utility-footer';
    footer.innerHTML=`
      <section class="staff-footer-group">
        <h3>Company & Operations</h3>
        <div class="staff-footer-links">
          <button type="button" data-footer-page="privacy">Privacy & Compliance</button>
          <button type="button" data-footer-page="audit">Audit Log</button>
          <button type="button" data-footer-page="billing">Billing / Finance</button>
          <button type="button" data-footer-page="security">Security & Access</button>
        </div>
        <div class="staff-footer-copy">Internal tools for privacy, operational review, finance readiness, security, and accountable system access.</div>
      </section>
      <section class="staff-footer-group">
        <h3>Policies & Use</h3>
        <div class="staff-footer-links">
          <button type="button" data-footer-page="policies">System Policies</button>
          <button type="button" data-footer-page="terms">Terms of Service</button>
        </div>
        <div class="staff-footer-copy">Guidance for properly using Aria systems and treating company, member, and employee information responsibly.</div>
      </section>
      <section class="staff-footer-group">
        <h3>Contact Us</h3>
        <div class="staff-footer-links"><a href="mailto:customerservice@ariaishere.com">customerservice@ariaishere.com</a></div>
        <div class="staff-footer-copy">Customer service and general support contact for Aria AI.</div>
      </section>
      <div class="staff-footer-bottom"><span>Aria AI • Staff Workspace</span><span>Authorized use only</span></div>`;
    main.appendChild(footer);

    footer.addEventListener('click',event=>{
      const button=event.target.closest('[data-footer-page]');
      if(!button)return;
      const page=button.dataset.footerPage;
      const titles={privacy:'Privacy & Compliance',audit:'Audit Log',billing:'Billing / Finance',security:'Security & Access',policies:'System Policies',terms:'Terms of Service'};
      openPage(page,titles[page]);
    });
  }

  addStyles();
  replaceVisibleFounderLabels();
  buildFooter();
})();
