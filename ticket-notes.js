(function(){
  let ticketSyncBusy=false;

  function formatTicketDate(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
  }

  async function ticketApi(path,options={}){
    const response=await fetch(path,{
      credentials:'same-origin',
      cache:'no-store',
      ...options,
      headers:{'content-type':'application/json',...(options.headers||{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Ticket request failed.');
    return data;
  }

  function ticketNotesMarkup(ticket){
    const notes=Array.isArray(ticket.notes)?ticket.notes:[];
    const history=notes.length
      ? notes.slice().reverse().map(note=>`<div style="padding:10px 0;border-top:1px solid #e8edf3"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><strong style="font-size:11px;color:#4d5a70">${escapeHtml(note.author||'Staff')}</strong><span style="font-size:10px;color:#8a95a5">${escapeHtml(formatTicketDate(note.created))}</span></div><div style="font-size:12px;color:#59667a;line-height:1.55;margin-top:4px;white-space:pre-wrap">${escapeHtml(note.text||'')}</div></div>`).join('')
      : '<div style="font-size:11px;color:#8a95a5;padding:8px 0">No progress notes yet.</div>';
    return `<div style="margin-top:16px;width:100%;max-width:none;border:1px solid #e3e8f0;border-radius:14px;background:#fafbfe;padding:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><strong style="font-size:12px;color:#46536a">Team Notes</strong><span style="font-size:10px;color:#8a95a5">Saved to Aria</span></div>
      <div style="font-size:10px;color:#8a95a5;line-height:1.45;margin-top:4px">Progress updates, blockers, troubleshooting, and handoffs are stored with the staff member and timestamp that created them.</div>
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
    queue.innerHTML=items.length?items.map(t=>`<article class="ticket-card"><div class="ticket-main"><div class="ticket-id">${escapeHtml(t.id)} • ${escapeHtml(t.category)} • ${escapeHtml(formatTicketDate(t.created))}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.details)}</p><div class="ticket-meta"><span class="pill ${String(t.priority).toLowerCase()}">${escapeHtml(t.priority)}</span><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span>${t.createdBy?`<span class="pill">Opened by ${escapeHtml(t.createdBy)}</span>`:''}</div>${progressControl(t)}${ticketNotesMarkup(t)}</div><div class="ticket-actions">${t.status!=='In Progress'&&t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="In Progress">Start</button>`:''}${t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Closed">Close</button>`:''}${t.status==='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Open">Reopen</button>`:''}</div></article>`).join(''):'<div class="empty-queue">No tickets in this queue.</div>';
  };

  renderTickets=function(){
    renderTicketQueue('Operations','operationsQueue','operationsSummary');
    renderTicketQueue('IT','itQueue','itSummary');
    renderTicketQueue('Engineering','engineeringQueue','engineeringSummary');
  };

  async function loadTickets(){
    try{
      const data=await ticketApi('/api/staff/tickets');
      tickets=(data.tickets||[]).map(ticket=>({...ticket,progress:normalizeTicketProgress(ticket),notes:Array.isArray(ticket.notes)?ticket.notes:[]}));
      sessionStorage.removeItem('aria-staff-tickets');
      renderTickets();
      updateDashboardCounts();
    }catch(error){
      console.error(error);
      ['operationsQueue','itQueue','engineeringQueue'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.innerHTML='<div class="empty-queue">Could not load the live ticket queue. Refresh or sign in again.</div>';
      });
    }
  }

  async function createLiveTicket(){
    if(ticketSyncBusy||!ticketDepartment)return;
    const title=document.getElementById('ticketTitle')?.value.trim()||'';
    const details=document.getElementById('ticketDetails')?.value.trim()||'';
    if(!title||!details){alert('Please enter a title and details.');return;}
    ticketSyncBusy=true;
    const button=document.getElementById('saveTicket');
    if(button){button.disabled=true;button.textContent='Creating...';}
    try{
      await ticketApi('/api/staff/tickets',{method:'POST',body:JSON.stringify({
        department:ticketDepartment,
        category:document.getElementById('ticketCategory')?.value||'',
        priority:document.getElementById('ticketPriority')?.value||'Normal',
        title,details
      })});
      closeModal('ticketModal');
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{
      ticketSyncBusy=false;
      if(button){button.disabled=false;button.textContent='Create Ticket';}
    }
  }

  async function updateLiveTicket(id,changes,button){
    if(ticketSyncBusy)return;
    ticketSyncBusy=true;
    if(button)button.disabled=true;
    try{
      await ticketApi(`/api/staff/tickets/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(changes)});
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{ticketSyncBusy=false;if(button)button.disabled=false;}
  }

  async function addLiveNote(id,button){
    if(ticketSyncBusy)return;
    const input=document.querySelector(`[data-ticket-note-input="${CSS.escape(id)}"]`);
    const note=input?.value.trim()||'';
    if(!note)return;
    ticketSyncBusy=true;
    if(button){button.disabled=true;button.textContent='Saving...';}
    try{
      await ticketApi(`/api/staff/tickets/${encodeURIComponent(id)}/notes`,{method:'POST',body:JSON.stringify({note})});
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{ticketSyncBusy=false;if(button){button.disabled=false;button.textContent='Add Note';}}
  }

  document.addEventListener('click',event=>{
    const save=event.target.closest('#saveTicket');
    if(save){event.preventDefault();event.stopImmediatePropagation();createLiveTicket();return;}

    const statusButton=event.target.closest('.ticket-status');
    if(statusButton){
      event.preventDefault();event.stopImmediatePropagation();
      const status=statusButton.dataset.status;
      const changes=status==='Closed'?{status,progress:100}:status==='Open'?{status,progress:0}:{status};
      updateLiveTicket(statusButton.dataset.id,changes,statusButton);return;
    }

    const progressButton=event.target.closest('.ticket-progress');
    if(progressButton){
      event.preventDefault();event.stopImmediatePropagation();
      updateLiveTicket(progressButton.dataset.id,{progress:Number(progressButton.dataset.progress)},progressButton);return;
    }

    const noteButton=event.target.closest('.ticket-note-add');
    if(noteButton){event.preventDefault();event.stopImmediatePropagation();addLiveNote(noteButton.dataset.id,noteButton);}
  },true);

  tickets=[];
  renderTickets();
  updateDashboardCounts();
  loadTickets();
})();
