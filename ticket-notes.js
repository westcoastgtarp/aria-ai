function ticketNoteAuthor(){
  try{
    const session=JSON.parse(sessionStorage.getItem('aria-auth-session')||'null');
    if(session?.role==='staff'&&session.name)return session.name;
  }catch{}
  return 'Founder / Co-Founder';
}

function ticketNotesMarkup(ticket){
  const notes=Array.isArray(ticket.notes)?ticket.notes:[];
  const history=notes.length
    ? notes.slice().reverse().map(note=>`<div style="padding:10px 0;border-top:1px solid #e8edf3"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><strong style="font-size:11px;color:#4d5a70">${escapeHtml(note.author||'Staff')}</strong><span style="font-size:10px;color:#8a95a5">${escapeHtml(note.created||'')}</span></div><div style="font-size:12px;color:#59667a;line-height:1.55;margin-top:4px;white-space:pre-wrap">${escapeHtml(note.text||'')}</div></div>`).join('')
    : '<div style="font-size:11px;color:#8a95a5;padding:8px 0">No progress notes yet.</div>';
  return `<div style="margin-top:16px;width:100%;max-width:none;border:1px solid #e3e8f0;border-radius:14px;background:#fafbfe;padding:13px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><strong style="font-size:12px;color:#46536a">Team Notes</strong><span style="font-size:10px;color:#8a95a5">Authorized ticket team</span></div>
    <div style="font-size:10px;color:#8a95a5;line-height:1.45;margin-top:4px">Use notes for progress updates, blockers, troubleshooting, handoffs, and problems encountered. Prototype note access is not yet enforced by backend permissions.</div>
    <div style="max-height:190px;overflow:auto;margin-top:8px">${history}</div>
    <div style="display:flex;gap:10px;align-items:flex-end;margin-top:10px;width:100%">
      <textarea class="ticket-note-input" data-ticket-note-input="${escapeHtml(ticket.id)}" maxlength="600" placeholder="Add a progress update, blocker, or problem encountered..." style="flex:1 1 auto;width:100%;min-width:0;min-height:90px;resize:vertical;border:1px solid #dfe5ed;border-radius:10px;padding:9px 10px;font:inherit;font-size:12px;outline:none"></textarea>
      <button class="status-btn ticket-note-add" data-id="${escapeHtml(ticket.id)}" style="flex:0 0 auto;align-self:flex-end">Add Note</button>
    </div>
  </div>`;
}

renderTicketQueue=function(dept,elementId,summaryId){
  const queue=document.getElementById(elementId),summary=document.getElementById(summaryId);if(!queue||!summary)return;
  const items=tickets.filter(t=>t.department===dept),open=items.filter(t=>t.status==='Open').length,progress=items.filter(t=>t.status==='In Progress').length,closed=items.filter(t=>t.status==='Closed').length;
  const average=items.length?Math.round(items.reduce((sum,t)=>sum+normalizeTicketProgress(t),0)/items.length):0;
  summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span><span class="summary-chip">Queue progress <strong>${average}%</strong></span>`;
  queue.innerHTML=items.length?items.map(t=>`<article class="ticket-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(t.id)} • ${escapeHtml(t.category)} • ${escapeHtml(t.created)}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.details)}</p><div class="ticket-meta"><span class="pill ${String(t.priority).toLowerCase()}">${escapeHtml(t.priority)}</span><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span></div>${progressControl(t)}${ticketNotesMarkup(t)}</div><div class="ticket-actions">${t.status!=='In Progress'&&t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="In Progress">Start</button>`:''}${t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Closed">Close</button>`:''}${t.status==='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Open">Reopen</button>`:''}</div></article>`).join(''):'<div class="empty-queue">No tickets in this queue.</div>';
};

tickets=tickets.map(ticket=>({...ticket,notes:Array.isArray(ticket.notes)?ticket.notes:[]}));
saveAll();

document.addEventListener('click',event=>{
  const button=event.target.closest('.ticket-note-add');
  if(!button)return;
  const ticket=tickets.find(item=>item.id===button.dataset.id);if(!ticket)return;
  const input=document.querySelector(`[data-ticket-note-input="${CSS.escape(ticket.id)}"]`);
  const text=input?.value.trim();
  if(!text)return;
  if(!Array.isArray(ticket.notes))ticket.notes=[];
  ticket.notes.push({id:`NOTE-${Date.now()}`,author:ticketNoteAuthor(),text,created:nowLabel()});
  saveAll();
  renderTickets();
});

renderTickets();
