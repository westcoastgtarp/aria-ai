(function(){
  function replaceVisibleFounderLabels(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()){
      if(walker.currentNode.nodeValue?.includes('Founder / Co-Founder'))nodes.push(walker.currentNode);
    }
    nodes.forEach(node=>{node.nodeValue=node.nodeValue.replaceAll('Founder / Co-Founder','Founder');});
  }

  function removeSidebarFooter(){
    document.querySelectorAll('.staff-sidebar .footer-links').forEach(node=>node.remove());
  }

  function addStyles(){
    const style=document.createElement('style');
    style.textContent=`
      .staff-utility-footer{margin-top:52px;padding:0 0 12px;color:var(--muted)}
      .staff-footer-shell{display:grid;gap:14px}
      .staff-footer-kicker{display:flex;align-items:center;gap:9px;margin:0 0 14px 4px;font-size:11px;font-weight:750;color:#718097}
      .staff-footer-kicker::before{content:'◇';width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:#eef1ff;color:#6269e5;font-size:15px}
      .staff-footer-card{display:grid;grid-template-columns:62px 1fr;gap:22px;align-items:start;background:linear-gradient(180deg,#fff,#fcfdff);border:1px solid #e3e8f0;border-radius:22px;padding:24px 26px;box-shadow:0 14px 34px rgba(17,31,56,.055)}
      .staff-footer-icon{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#f0f1ff,#f7f3ff);color:#5f66dc;font-size:24px;font-weight:800}
      .staff-footer-content{min-width:0}
      .staff-footer-group-title{margin:0;color:var(--text);font-size:21px;letter-spacing:-.015em}
      .staff-footer-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
      .staff-footer-actions.two{grid-template-columns:repeat(2,minmax(0,240px))}
      .staff-footer-link{appearance:none;-webkit-appearance:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;border:1px solid #dfe5ef;background:#fff;color:#24324a;border-radius:14px;padding:0 14px;font:inherit;font-size:13px;font-weight:700;text-align:left;text-decoration:none;cursor:pointer;box-shadow:0 2px 7px rgba(17,31,56,.025);transition:.16s ease}
      .staff-footer-link:hover{border-color:#cbd0f4;background:#fafaff;color:#5158ca;transform:translateY(-1px);box-shadow:0 8px 18px rgba(17,31,56,.06)}
      .staff-footer-link .footer-link-left{display:flex;align-items:center;gap:10px;min-width:0}
      .staff-footer-link .footer-link-icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#f1f3ff;color:#6269e5;font-size:14px;flex:0 0 auto}
      .staff-footer-link .footer-chevron{color:#6269e5;font-size:18px;line-height:1}
      .staff-footer-copy{font-size:12px;line-height:1.6;color:#7d899b;margin-top:14px;max-width:900px}
      .staff-footer-contact-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
      .staff-footer-contact{display:inline-flex;align-items:center;gap:8px;color:#565dd0;text-decoration:none;font-size:13px;font-weight:750}
      .staff-footer-contact:hover{text-decoration:underline;text-underline-offset:3px}
      .staff-footer-contact::before{content:'✉';font-size:15px}
      .staff-footer-bottom{margin-top:14px;padding:14px 4px 0;border-top:1px solid #edf0f4;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:10px;color:#9aa4b3}
      .staff-footer-bottom strong{color:#69768a;font-weight:750}
      .terms-list{padding-left:20px;color:var(--muted);line-height:1.65}
      .terms-list li+li{margin-top:8px}
      .terms-callout{margin-top:18px;padding:14px 16px;border:1px solid #dfe3f7;border-radius:13px;background:#f7f8ff;color:#59667a;font-size:12px;line-height:1.55}
      @media(max-width:1120px){.staff-footer-actions{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:760px){.staff-footer-card{grid-template-columns:1fr;padding:21px}.staff-footer-icon{width:50px;height:50px}.staff-footer-actions,.staff-footer-actions.two{grid-template-columns:1fr}.staff-footer-group-title{font-size:19px}}
      @media(max-width:520px){.staff-utility-footer{margin-top:36px}.staff-footer-card{padding:18px;border-radius:18px}.staff-footer-kicker{margin-left:0}.staff-footer-bottom{flex-direction:column;gap:4px}}
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

  function tile(page,label,icon){
    return `<button type="button" class="staff-footer-link" data-footer-page="${page}"><span class="footer-link-left"><span class="footer-link-icon">${icon}</span><span>${label}</span></span><span class="footer-chevron">›</span></button>`;
  }

  function buildFooter(){
    const main=document.querySelector('.staff-main');
    if(!main||document.querySelector('.staff-utility-footer'))return;
    addTermsPage(main);

    const footer=document.createElement('footer');
    footer.className='staff-utility-footer';
    footer.innerHTML=`
      <div class="staff-footer-kicker">Internal workspace</div>
      <div class="staff-footer-shell">
        <section class="staff-footer-card">
          <div class="staff-footer-icon">▣</div>
          <div class="staff-footer-content">
            <h3 class="staff-footer-group-title">Company & Operations</h3>
            <div class="staff-footer-actions">
              ${tile('privacy','Privacy & Compliance','◈')}
              ${tile('audit','Audit Log','▤')}
              ${tile('billing','Billing / Finance','▥')}
              ${tile('security','Security & Access','▦')}
            </div>
            <div class="staff-footer-copy">Privacy, operational review, finance readiness, security, and accountable system access.</div>
          </div>
        </section>

        <section class="staff-footer-card">
          <div class="staff-footer-icon">▧</div>
          <div class="staff-footer-content">
            <h3 class="staff-footer-group-title">Policies & Use</h3>
            <div class="staff-footer-actions two">
              ${tile('policies','System Policies','▤')}
              ${tile('terms','Terms of Service','⚖')}
            </div>
            <div class="staff-footer-copy">Guidance for using Aria systems and handling company, member, and employee information responsibly.</div>
          </div>
        </section>

        <section class="staff-footer-card">
          <div class="staff-footer-icon">◉</div>
          <div class="staff-footer-content">
            <h3 class="staff-footer-group-title">Contact Us</h3>
            <div class="staff-footer-contact-row"><a class="staff-footer-contact" href="mailto:customerservice@ariaishere.com">customerservice@ariaishere.com</a></div>
            <div class="staff-footer-copy">Customer service and general support for Aria AI.</div>
            <div class="staff-footer-bottom"><strong>Aria AI · Staff Workspace</strong><span>Authorized use only</span></div>
          </div>
        </section>
      </div>`;
    main.appendChild(footer);

    footer.addEventListener('click',event=>{
      const button=event.target.closest('[data-footer-page]');
      if(!button)return;
      const page=button.dataset.footerPage;
      const titles={privacy:'Privacy & Compliance',audit:'Audit Log',billing:'Billing / Finance',security:'Security & Access',policies:'System Policies',terms:'Terms of Service'};
      openPage(page,titles[page]);
    });
  }

  removeSidebarFooter();
  addStyles();
  replaceVisibleFounderLabels();
  buildFooter();
})();
