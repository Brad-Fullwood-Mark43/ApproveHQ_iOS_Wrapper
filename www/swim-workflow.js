'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let swimLoaded={today:false,schedule:false,students:false,requests:false};

  function isSwim(){ return window.currentUser?.businessType==='swim_lessons'; }
  function fmt(v){ if(!v)return ''; const d=new Date(v); return d.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
  function install(){
    if($('swimTodayScreen')) return;
    const main=$('mainView'); if(!main)return;
    const footer=main.querySelector('.footer');
    const html=`
      <div id="swimTodayScreen" class="screen hidden"><div class="topbar"><div><div class="business-label">Swim Lessons</div><h2>Today</h2></div><button class="text-button" data-swim-refresh="today">Refresh</button></div><div id="swimTodayContent"></div></div>
      <div id="swimScheduleScreen" class="screen hidden"><div class="topbar"><div><div class="business-label">Availability</div><h2>Schedule</h2></div><button class="text-button" data-swim-refresh="schedule">Refresh</button></div><div id="swimScheduleContent"></div></div>
      <div id="swimStudentsScreen" class="screen hidden"><div class="topbar"><div><div class="business-label">Families</div><h2>Students</h2></div><button class="text-button" data-swim-refresh="students">Refresh</button></div><div id="swimStudentsContent"></div></div>
      <div id="swimRequestsScreen" class="screen hidden"><div class="topbar"><div><div class="business-label">Scheduling</div><h2>Requests</h2></div><button class="text-button" data-swim-refresh="requests">Refresh</button></div><div id="swimRequestsContent"></div></div>`;
    (footer||main.lastElementChild).insertAdjacentHTML('beforebegin',html);
  }
  function nav(){
    const root=$('bottomNav')?.querySelector('.bottom-inner'); if(!root)return;
    root.innerHTML=`<button class="tab active" data-swim-tab="today" type="button"><span>◷</span>Today</button><button class="tab" data-swim-tab="schedule" type="button"><span>▦</span>Schedule</button><button class="tab" data-swim-tab="students" type="button"><span>♟</span>Students</button><button class="tab" data-swim-tab="requests" type="button"><span>✓</span>Requests</button>`;
  }
  function show(name){
    ['swimTodayScreen','swimScheduleScreen','swimStudentsScreen','swimRequestsScreen'].forEach(id=>$(id)?.classList.add('hidden'));
    $('swim'+name[0].toUpperCase()+name.slice(1)+'Screen')?.classList.remove('hidden');
    document.querySelectorAll('[data-swim-tab]').forEach(b=>b.classList.toggle('active',b.dataset.swimTab===name));
    load(name);
  }
  async function load(name,force=false){
    if(!isSwim())return; if(swimLoaded[name]&&!force)return;
    const root=$('swim'+name[0].toUpperCase()+name.slice(1)+'Content'); if(!root)return;
    root.innerHTML='<div class="loading">Loading…</div>';
    try{
      const x=await get('/api/mobile/swim/'+name);
      if(!x.response.ok)throw new Error(x.data?.error||'Could not load.');
      if(name==='today') renderToday(root,x.data);
      if(name==='schedule') renderSchedule(root,x.data.slots||[]);
      if(name==='students') renderStudents(root,x.data.students||[]);
      if(name==='requests') renderRequests(root,x.data.requests||[]);
      swimLoaded[name]=true;
    }catch(e){root.innerHTML='<div class="error" style="display:block">'+esc(e.message)+'</div>';}
  }
  function renderToday(root,d){
    const slots=d.slots||[],pending=d.requests||[];
    root.innerHTML=`<div class="detail-card"><div class="section-title">Today's lessons</div>${slots.length?slots.map(slotCard).join(''):'<p class="meta">No availability remaining today.</p>'}</div><div class="detail-card"><div class="section-title">Needs confirmation</div>${pending.length?pending.map(requestCard).join(''):'<p class="meta">No scheduling requests are waiting for confirmation.</p>'}</div>`;
  }
  function slotCard(s){return `<div class="list-item"><strong>${esc(fmt(s.starts_at))}</strong><div class="meta">${esc(s.location_name||'Pool')}${s.instructor_name?' · '+esc(s.instructor_name):''}</div><div class="meta">${Number(s.reserved_count||0)} of ${Number(s.capacity||1)} reserved${s.blocked?' · Blocked':''}</div></div>`;}
  function renderSchedule(root,rows){root.innerHTML=rows.length?'<div class="list">'+rows.map(slotCard).join('')+'</div>':'<div class="detail-card"><p class="meta">No upcoming availability.</p></div>';}
  function renderStudents(root,rows){root.innerHTML=rows.length?'<div class="list">'+rows.map(s=>`<div class="list-item"><strong>${esc(s.name)}</strong><div class="meta">Parent: ${esc(s.parent_name||'—')}</div><div class="meta">${esc(s.parent_phone||'')}${s.notes?' · '+esc(s.notes):''}</div></div>`).join('')+'</div>':'<div class="detail-card"><p class="meta">No students yet.</p></div>';}
  function requestCard(r){const link=r.access_token?API_BASE+'/swim/book/'+encodeURIComponent(r.access_token):'';return `<div class="list-item"><strong>${esc(r.student_name)}</strong><div class="meta">${Number(r.selected_count||0)} of ${Number(r.sessions_required||0)} selected · ${esc(r.status)}</div><div class="meta">${esc(r.parent_name||'')} ${esc(r.parent_phone||'')}</div><div class="swim-mobile-actions">${r.status==='submitted'?'<button class="action-btn" data-confirm-request="'+Number(r.id)+'" type="button">Confirm</button>':''}${link?'<button class="action-btn secondary" data-share-link="'+esc(link)+'" type="button">Share link</button>':''}</div></div>`;}
  function renderRequests(root,rows){root.innerHTML=rows.length?'<div class="list">'+rows.map(requestCard).join('')+'</div>':'<div class="detail-card"><p class="meta">No scheduling requests.</p></div>';}
  async function share(url){
    if(navigator.share){try{await navigator.share({title:'Schedule swim lessons',text:'Choose your swim lesson times:',url});return}catch(e){if(e.name==='AbortError')return;}}
    await navigator.clipboard.writeText(url); showBanner('Scheduling link copied ✓');
  }
  document.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-swim-tab]'); if(tab){show(tab.dataset.swimTab);return;}
    const ref=e.target.closest('[data-swim-refresh]'); if(ref){swimLoaded[ref.dataset.swimRefresh]=false;load(ref.dataset.swimRefresh,true);return;}
    const shareBtn=e.target.closest('[data-share-link]'); if(shareBtn){share(shareBtn.dataset.shareLink);return;}
    const confirm=e.target.closest('[data-confirm-request]'); if(confirm){confirm.disabled=true;try{const x=await req('/api/mobile/swim/requests',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(confirm.dataset.confirmRequest),action:'confirm'})});if(!x.response.ok)throw new Error(x.data?.error||'Could not confirm.');swimLoaded.today=false;swimLoaded.requests=false;await load('requests',true);}catch(err){showBanner(err.message)}finally{confirm.disabled=false;}}
  });
  window.ApproveHQSwim={
    activate(){install();nav();['jobsScreen','customersScreen','paymentsScreen','teamScreen','nativeFeaturesScreen','detailScreen','newJobScreen','addCustomerScreen','editCustomerScreen'].forEach(id=>$(id)?.classList.add('hidden'));$('bottomNav')?.classList.remove('hidden');show('today');},
    reset(){swimLoaded={today:false,schedule:false,students:false,requests:false};}
  };
  install();
})();