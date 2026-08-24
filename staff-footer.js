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

  function tile(page,label){
    return `<button type="button" class="staff-footer-link" data-footer-page="${page}">${label}</button>`;
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
          <div class="staff-footer-icon">OPS</div>
          <div class="staff-footer-content">
            <h3 class="staff-footer-group-title">Company & Operations</h3>
            <div class="staff-footer-actions">
              ${tile('privacy','Privacy & Compliance')}
              ${tile('audit','Audit Log')}
              ${tile('billing','Billing / Finance')}
              ${tile('security','Security & Access')}
            </div>
            <div class="staff-footer-copy">Privacy, operational review, finance readiness, security, and accountable system access.</div>
          </div>
        </section>

        <section class="staff-footer-card">
          <div class="staff-footer-icon">POL</div>
          <div class="staff-footer-content">
            <h3 class="staff-footer-group-title">Policies & Use</h3>
            <div class="staff-footer-actions two">
              ${tile('policies','System Policies')}
              ${tile('terms','Terms of Service')}
            </div>
            <div class="staff-footer-copy">Guidance for using Aria systems and handling company, member, and employee information responsibly.</div>
          </div>
        </section>

        <section class="staff-footer-card">
          <div class="staff-footer-icon">SUP</div>
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
  replaceVisibleFounderLabels();
  buildFooter();
})();
