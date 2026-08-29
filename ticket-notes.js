(function(){
  let ticketSyncBusy=false;
  let liveSupportViewer=null;
  let queueRefreshTimer=null;
  let waitClockTimer=null;

  function formatTicketDate(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
  }

  function formatWait(seconds){
    const total=Math.max(0,Number(seconds)||0);
    const minutes=Math.floor(total/60);
    const remainder=total%60;
    return `${minutes}:${String(remainder).padStart(2,'0')}`;
  }

  function isLiveSupportQueue(){
    return String(liveSupportViewer?.role||'').toLowerCase()==='live support specialist';
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

  function liveSupportWaitMarkup(ticket){
    if(!isLiveSupportQueue()||ticket.category!=='Member Communication'||ticket.assignedToUserId)return '';
    const waiting=Math.max(0,Number(ticket.waitingSeconds)||0);
    const overdue=Boolean(ticket.overdue||waiting>120);
    return `<div data-lifeline-wait-wrap="${escapeHtml(ticket.id)}" data-created-at="${escapeHtml(ticket.created||'')}" style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span data-lifeline-wait="${escapeHtml(ticket.id)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;${overdue?'background:#fff0f0;color:#b42318;border:1px solid #f5b7b1':'background:#eef7ff;color:#245c8f;border:1px solid #c9e3f8'}">Waiting ${formatWait(waiting)}</span>
      <span data-lifeline-overdue="${escapeHtml(ticket.id)}" style="${overdue?'display:inline-flex':'display:none'};align-items:center;padding:6px 10px;border-radius:999px;background:#b42318;color:#fff;font-size:10px;font-weight:900;letter-spacing:.04em">OVER 2 MIN</span>
      <span style="font-size:10px;color:#7b8798">Target: claim within 2:00</span>
    </div>`;
  }

  function liveSupportActions(ticket){
    if(!isLiveSupportQueue()||ticket.category!=='Member Communication')return null;
    if(!ticket.assignedToUserId){
      return `<button class="status-btn lifeline-claim" data-id="${escapeHtml(ticket.id)}" style="font-weight:800">Claim conversation</button>`;
    }
    return '';
  }

  renderTicketQueue=function(dept,elementId,summaryId){
    const queue=document.getElementById(elementId),summary=document.getElementById(summaryId);if(!queue||!summary)return;
    const items=tickets.filter(t=>t.department===dept),open=items.filter(t=>t.status==='Open').length,progress=items.filter(t=>t.status==='In Progress').length,closed=items.filter(t=>t.status==='Closed').length;
    const average=items.length?Math.round(items.reduce((sum,t)=>sum+normalizeTicketProgress(t),0)/items.length):0;
    const overdue=isLiveSupportQueue()&&dept==='Operations'?items.filter(t=>t.category==='Member Communication'&&!t.assignedToUserId&&(t.overdue||Number(t.waitingSeconds)>120)).length:0;
    summary.innerHTML=`<span class="summary-chip">Open <strong>${open}</strong></span><span class="summary-chip">In Progress <strong>${progress}</strong></span><span class="summary-chip">Closed <strong>${closed}</strong></span>${isLiveSupportQueue()&&dept==='Operations'?`<span class="summary-chip" style="${overdue?'background:#fff0f0;color:#b42318;border-color:#f5b7b1':''}">Over 2 min <strong>${overdue}</strong></span>`:`<span class="summary-chip">Queue progress <strong>${average}%</strong></span>`}`;
    queue.innerHTML=items.length?items.map(t=>{
      const specialActions=liveSupportActions(t);
      const genericActions=`${t.status!=='In Progress'&&t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="In Progress">Start</button>`:''}${t.status!=='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Closed">Close</button>`:''}${t.status==='Closed'?`<button class="status-btn ticket-status" data-id="${escapeHtml(t.id)}" data-status="Open">Reopen</button>`:''}`;
      const actions=specialActions===null?genericActions:(specialActions||genericActions);
      const canWork=!isLiveSupportQueue()||t.category!=='Member Communication'||Boolean(t.assignedToUserId);
      return `<article class="ticket-card" data-lifeline-ticket="${escapeHtml(t.id)}"><div class="ticket-main"><div class="ticket-id">${escapeHtml(t.id)} • ${escapeHtml(t.category)} • ${escapeHtml(formatTicketDate(t.created))}</div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.details)}</p><div class="ticket-meta"><span class="pill ${String(t.priority).toLowerCase()}">${escapeHtml(t.priority)}</span><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span>${t.createdBy?`<span class="pill">Opened by ${escapeHtml(t.createdBy)}</span>`:''}${t.assignedTo?`<span class="pill">Assigned to ${escapeHtml(t.assignedTo)}</span>`:''}</div>${liveSupportWaitMarkup(t)}${canWork?progressControl(t):''}${canWork?ticketNotesMarkup(t):''}</div><div class="ticket-actions">${actions}</div></article>`;
    }).join(''):'<div class="empty-queue">No tickets in this queue.</div>';
  };

  renderTickets=function(){
    renderTicketQueue('Operations','operationsQueue','operationsSummary');
    renderTicketQueue('IT','itQueue','itSummary');
    renderTicketQueue('Engineering','engineeringQueue','engineeringSummary');
  };

  function tickWaitClocks(){
    document.querySelectorAll('[data-lifeline-wait-wrap]').forEach(wrap=>{
      const created=new Date(wrap.dataset.createdAt||'').getTime();
      if(!Number.isFinite(created))return;
      const seconds=Math.max(0,Math.floor((Date.now()-created)/1000));
      const wait=wrap.querySelector('[data-lifeline-wait]');
      const overdue=wrap.querySelector('[data-lifeline-overdue]');
      if(wait){
        wait.textContent=`Waiting ${formatWait(seconds)}`;
        if(seconds>120){
          wait.style.background='#fff0f0';wait.style.color='#b42318';wait.style.borderColor='#f5b7b1';
        }
      }
      if(overdue&&seconds>120)overdue.style.display='inline-flex';
    });
  }

  async function loadTickets({silent=false}={}){
    if(ticketSyncBusy)return;
    try{
      const data=await ticketApi('/api/staff/tickets');
      liveSupportViewer=data.viewer||null;
      tickets=(data.tickets||[]).map(ticket=>({...ticket,progress:normalizeTicketProgress(ticket),notes:Array.isArray(ticket.notes)?ticket.notes:[]}));
      sessionStorage.removeItem('aria-staff-tickets');
      renderTickets();
      updateDashboardCounts();
      tickWaitClocks();
    }catch(error){
      console.error(error);
      if(!silent){
        ['operationsQueue','itQueue','engineeringQueue'].forEach(id=>{
          const el=document.getElementById(id);if(el)el.innerHTML='<div class="empty-queue">Could not load the live ticket queue. Refresh or sign in again.</div>';
        });
      }
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
      ticketSyncBusy=false;
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{
      ticketSyncBusy=false;
      if(button){button.disabled=false;button.textContent='Create Ticket';}
    }
  }

  async function claimLiveSupport(id,button){
    if(ticketSyncBusy)return;
    ticketSyncBusy=true;
    if(button){button.disabled=true;button.textContent='Claiming...';}
    try{
      const data=await ticketApi(`/api/staff/live-support/tickets/${encodeURIComponent(id)}/claim`,{method:'POST',body:'{}'});
      if(data.responseWithinTarget===false){
        console.warn(`Live Support response target exceeded for ${id}: ${data.responseSeconds}s`);
      }
      ticketSyncBusy=false;
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{ticketSyncBusy=false;if(button){button.disabled=false;button.textContent='Claim conversation';}}
  }

  async function updateLiveTicket(id,changes,button){
    if(ticketSyncBusy)return;
    ticketSyncBusy=true;
    if(button)button.disabled=true;
    try{
      await ticketApi(`/api/staff/tickets/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(changes)});
      ticketSyncBusy=false;
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
      ticketSyncBusy=false;
      await loadTickets();
    }catch(error){alert(error.message);}
    finally{ticketSyncBusy=false;if(button){button.disabled=false;button.textContent='Add Note';}}
  }

  document.addEventListener('click',event=>{
    const save=event.target.closest('#saveTicket');
    if(save){event.preventDefault();event.stopImmediatePropagation();createLiveTicket();return;}

    const claimButton=event.target.closest('.lifeline-claim');
    if(claimButton){event.preventDefault();event.stopImmediatePropagation();claimLiveSupport(claimButton.dataset.id,claimButton);return;}

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
  waitClockTimer=setInterval(tickWaitClocks,1000);
  queueRefreshTimer=setInterval(()=>{
    const focused=document.activeElement;
    if(focused?.classList?.contains('ticket-note-input'))return;
    loadTickets({silent:true});
  },10000);
  window.addEventListener('beforeunload',()=>{
    if(waitClockTimer)clearInterval(waitClockTimer);
    if(queueRefreshTimer)clearInterval(queueRefreshTimer);
  },{once:true});
})();
