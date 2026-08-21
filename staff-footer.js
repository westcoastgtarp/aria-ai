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
      .staff-utility-footer{margin-top:46px;background:linear-gradient(180deg,#ffffff,#fafbfe);border:1px solid var(--line);border-radius:20px;box-shadow:0 14px 34px rgba(17,31,56,.06);overflow:hidden;color:var(--muted)}
      .staff-footer-grid{display:grid;grid-template-columns:1.45fr 1fr 1fr;gap:0}
      .staff-footer-group{min-width:0;padding:24px 26px}
      .staff-footer-group+.staff-footer-group{border-left:1px solid var(--line)}
      .staff-footer-kicker{font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#8a95a5;margin-bottom:7px}
      .staff-footer-group h3{margin:0 0 12px;color:var(--text);font-size:15px;letter-spacing:0}
      .staff-footer-links{display:flex;flex-wrap:wrap;gap:8px}
      .staff-footer-links button,.staff-footer-links a{appearance:none;-webkit-appearance:none;border:1px solid #e1e5f0;background:#fff;border-radius:999px;padding:8px 11px;color:#59667a;text-decoration:none;font-size:11px;font-weight:700;line-height:1;cursor:pointer;box-shadow:0 2px 5px rgba(17,31,56,.03)}
      .staff-footer-links button:hover,.staff-footer-links a:hover{border-color:#bfc3f3;background:#f5f5ff;color:#565dd0;transform:translateY(-1px)}
      .staff-footer-copy{font-size:11px;line-height:1.55;color:#8b95a5;margin-top:12px;max-width:520px}
      .staff-footer-contact{display:inline-flex;align-items:center;gap:8px;color:#565dd0!important;background:#f5f5ff!important;border-color:#d8daf8!important}
      .staff-footer-contact:before{content:'✉';font-size:12px}
      .staff-footer-bottom{border-top:1px solid var(--line);padding:13px 26px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;background:#f7f8fb;font-size:10px;color:#929cac}
      .staff-footer-bottom strong{color:#687487;font-weight:750}
      .terms-list{padding-left:20px;color:var(--muted);line-height:1.65}
      .terms-list li+li{margin-top:8px}
      .terms-callout{margin-top:18px;padding:14px 16px;border:1px solid #dfe3f7;border-radius:13px;background:#f7f8ff;color:#59667a;font-size:12px;line-height:1.55}
      @media(max-width:900px){.staff-footer-grid{grid-template-columns:1fr 1fr}.staff-footer-group:first-child{grid-column:1/-1;border-bottom:1px solid var(--line)}.staff-footer-group:nth-child(2){border-left:0}}
      @media(max-width:560px){.staff-utility-footer{border-radius:16px}.staff-footer-grid{grid-template-columns:1fr}.staff-footer-group,.staff-footer-group:first-child{grid-column:auto;padding:20px}.staff-footer-group+.staff-footer-group{border-left:0;border-top:1px solid var(--line)}.staff-footer-links{gap:7px}.staff-footer-bottom{padding:12px 20px;flex-direction:column;gap:5px}}
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
      <div class="staff-footer-grid">
        <section class="staff-footer-group">
          <div class="staff-footer-kicker">Internal workspace</div>
          <h3>Company & Operations</h3>
          <div class="staff-footer-links">
            <button type="button" data-footer-page="privacy">Privacy & Compliance</button>
            <button type="button" data-footer-page="audit">Audit Log</button>
            <button type="button" data-footer-page="billing">Billing / Finance</button>
            <button type="button" data-footer-page="security">Security & Access</button>
          </div>
          <div class="staff-footer-copy">Privacy, operational review, finance readiness, security, and accountable system access.</div>
        </section>
        <section class="staff-footer-group">
          <div class="staff-footer-kicker">Standards</div>
          <h3>Policies & Use</h3>
          <div class="staff-footer-links">
            <button type="button" data-footer-page="policies">System Policies</button>
            <button type="button" data-footer-page="terms">Terms of Service</button>
          </div>
          <div class="staff-footer-copy">Guidance for using Aria systems and handling company, member, and employee information responsibly.</div>
        </section>
        <section class="staff-footer-group">
          <div class="staff-footer-kicker">Need help?</div>
          <h3>Contact Us</h3>
          <div class="staff-footer-links"><a class="staff-footer-contact" href="mailto:customerservice@ariaishere.com">customerservice@ariaishere.com</a></div>
          <div class="staff-footer-copy">Customer service and general support for Aria AI.</div>
        </section>
      </div>
      <div class="staff-footer-bottom"><strong>Aria AI · Staff Workspace</strong><span>Authorized use only</span></div>`;
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
