(function(){
  function replaceVisibleFounderLabels(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()){
      if(walker.currentNode.nodeValue?.includes('Founder / Co-Founder'))nodes.push(walker.currentNode);
    }
    nodes.forEach(node=>{node.nodeValue=node.nodeValue.replaceAll('Founder / Co-Founder','Founder');});
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
          <li>Do not bypass access controls, disable logging, falsify records, or attempt to gain permissions beyond those assigned to your account.</li>
          <li>Report suspected account compromise, privacy issues, security incidents, incorrect access, or system misuse through the appropriate internal channel.</li>
        </ul>
        <div class="notice"><strong>Policy status:</strong> This is the operational acceptable-use framework for the development staff portal. Final production terms and formal employee policies should receive appropriate company and legal review.</div>
      </article>`;
    main.appendChild(section);
  }

  document.querySelectorAll('.staff-sidebar .footer-links,.staff-utility-footer').forEach(node=>node.remove());
  replaceVisibleFounderLabels();
  const main=document.querySelector('.staff-main');
  if(main)addTermsPage(main);
})();
