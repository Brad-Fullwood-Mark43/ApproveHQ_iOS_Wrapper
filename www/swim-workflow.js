'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let swimLoaded={today:false,schedule:false,students:false,requests:false};
  let defaultNavHTML=null;
  let scheduleData={slots:[],locations:[],instructors:[]};
  let scheduleEditing=false;

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
    if(defaultNavHTML===null) defaultNavHTML=root.innerHTML;
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
      let path='/api/mobile/swim/'+name;
      if(name==='today'){
        const start=new Date(); start.setHours(0,0,0,0);
        const end=new Date(start); end.setDate(end.getDate()+2);
        path+='?from='+encodeURIComponent(start.toISOString())+'&to='+encodeURIComponent(end.toISOString());
      }
      const x=await get(path);
      if(!x.response.ok)throw new Error(x.data?.error||'Could not load.');
      if(name==='today') renderToday(root,x.data);
      if(name==='schedule'){scheduleData={slots:x.data.slots||[],locations:x.data.locations||[],instructors:x.data.instructors||[]};renderSchedule(root,scheduleData);}
      if(name==='students') renderStudents(root,x.data.students||[]);
      if(name==='requests') renderRequests(root,x.data.requests||[]);
      swimLoaded[name]=true;
    }catch(e){root.innerHTML='<div class="error" style="display:block">'+esc(e.message)+'</div>';}
  }
  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function lessonCard(s){return `<div class="list-item"><strong>${esc(new Date(s.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))} · ${esc(s.student_name)}</strong><div class="meta">${esc(s.location_name||'Pool')}${s.instructor_name?' · '+esc(s.instructor_name):''}</div><div class="meta">${esc(s.status)}</div></div>`;}
  function renderToday(root,d){
    const lessons=d.lessons||[],pending=d.requests||[],now=new Date(),tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const today=lessons.filter(x=>sameDay(new Date(x.starts_at),now)),next=lessons.filter(x=>sameDay(new Date(x.starts_at),tomorrow));
    root.innerHTML=`<div class="detail-card"><div class="section-title">Today's lessons</div>${today.length?today.map(lessonCard).join(''):'<p class="meta">No lessons today.</p>'}</div><div class="detail-card"><div class="section-title">Tomorrow's lessons</div>${next.length?next.map(lessonCard).join(''):'<p class="meta">No lessons tomorrow.</p>'}</div><div class="detail-card"><div class="section-title">Needs confirmation</div>${pending.length?pending.map(requestCard).join(''):'<p class="meta">No scheduling requests are waiting for confirmation.</p>'}</div>`;
  }
  function slotCard(s){return `<div class="list-item"><strong>${esc(fmt(s.starts_at))}</strong><div class="meta">${esc(s.location_name||'Pool')}${s.instructor_name?' · '+esc(s.instructor_name):''}</div><div class="meta">${Number(s.reserved_count||0)} of ${Number(s.capacity||1)} reserved${s.blocked?' · Blocked':''}</div></div>`;}
  function dateKey(v){const d=new Date(v);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function renderSchedule(root,data){
    const rows=data.slots||[],groups={};
    rows.forEach(s=>(groups[dateKey(s.starts_at)] ||= []).push(s));
    const editor=scheduleEditing?`<div class="detail-card"><div class="section-title">Create availability</div><div class="field"><label>Date</label><input id="swimNewDate" type="date"></div><div class="row"><div class="field" style="flex:1"><label>Start</label><input id="swimNewStart" type="time"></div><div class="field" style="flex:1"><label>End</label><input id="swimNewEnd" type="time"></div></div><div class="row"><div class="field" style="flex:1"><label>Lesson minutes</label><input id="swimNewMinutes" type="number" value="30" min="15" step="5"></div><div class="field" style="flex:1"><label>Capacity</label><input id="swimNewCapacity" type="number" value="1" min="1"></div></div><div class="field"><label>Pool</label><select id="swimNewLocation">${data.locations.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+'</option>').join('')}</select></div><div class="field"><label>Instructor</label><select id="swimNewInstructor"><option value="">Any / unassigned</option>${data.instructors.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+'</option>').join('')}</select></div><button class="action-btn" data-create-slots type="button" style="width:100%">Create schedule</button><div id="swimScheduleStatus" class="form-status"></div></div>`:'';
    const dates=Object.entries(groups).map(([key,slots],idx)=>`<div class="detail-card" style="padding:0;overflow:hidden"><button class="action-btn secondary swim-date-toggle" data-schedule-date="${esc(key)}" type="button" style="width:100%;border:0;border-radius:0;display:flex;justify-content:space-between"><strong>${esc(new Date(slots[0].starts_at).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'}))}</strong><span>›</span></button><div id="scheduleDate-${esc(key)}" class="hidden" style="padding:12px">${slots.map(s=>`<div class="list-item"><strong>${esc(new Date(s.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}–${esc(new Date(s.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</strong><div class="meta">${esc(s.location_name||'Pool')}${s.instructor_name?' · '+esc(s.instructor_name):''} · ${Number(s.reserved_count||0)}/${Number(s.capacity||1)} reserved${s.blocked?' · Closed':''}</div>${scheduleEditing?`<button class="action-btn ${s.blocked?'':'danger'}" data-toggle-slot="${Number(s.id)}" data-blocked="${s.blocked?'1':'0'}" type="button" style="width:100%;margin-top:8px">${s.blocked?'Reopen time':'Close time'}</button>`:''}</div>`).join('')}</div></div>`).join('');
    root.innerHTML=`<div class="row" style="margin-bottom:12px"><button class="action-btn secondary" data-edit-schedule type="button">${scheduleEditing?'Done editing':'Edit schedule'}</button></div>${editor}${dates||'<div class="detail-card"><p class="meta">No upcoming availability.</p></div>'}`;
  }
  function renderStudents(root,rows){root.innerHTML=rows.length?'<div class="list">'+rows.map(s=>`<button class="list-item" data-student-id="${Number(s.id)}" type="button" style="width:100%;text-align:left"><strong>${esc(s.name)}</strong><div class="meta">Parent: ${esc(s.parent_name||'—')}</div><div class="meta">${esc(s.parent_phone||'')}</div></button>`).join('')+'</div>':'<div class="detail-card"><p class="meta">No students yet.</p></div>';}
  async function openStudent(id){
    const root=$('swimStudentsContent');root.innerHTML='<div class="loading">Loading student…</div>';
    try{const x=await get('/api/mobile/swim/students?id='+Number(id));if(!x.response.ok)throw new Error(x.data?.error||'Could not load student.');const s=x.data.student,appts=s.upcoming_bookings||[];root.innerHTML=`<button class="text-button" data-back-students type="button">‹ Students</button><div class="detail-card"><h2>${esc(s.name)}</h2><div class="meta">Parent: ${esc(s.parent_name||'—')}</div><div class="meta">${esc(s.parent_phone||'')}</div>${s.notes?'<p>'+esc(s.notes)+'</p>':''}<button class="action-btn" data-remind-student="${Number(s.id)}" type="button" style="width:100%;margin-top:12px">Send appointment reminder</button><div id="swimReminderStatus" class="form-status"></div></div><div class="detail-card"><div class="section-title">Upcoming appointments</div>${appts.length?appts.map(lessonCard).join(''):'<p class="meta">No upcoming appointments.</p>'}</div>`;}catch(e){root.innerHTML='<div class="error" style="display:block">'+esc(e.message)+'</div>';}
  }
  function requestCard(r){const link=r.access_token?API_BASE+'/swim/book/'+encodeURIComponent(r.access_token):'';return `<div class="list-item"><strong>${esc(r.student_name)}</strong><div class="meta">${Number(r.selected_count||0)} of ${Number(r.sessions_required||0)} selected · ${esc(r.status)}</div><div class="meta">${esc(r.parent_name||'')} ${esc(r.parent_phone||'')}</div><div class="swim-mobile-actions">${r.status==='submitted'?'<button class="action-btn" data-confirm-request="'+Number(r.id)+'" type="button">Confirm</button>':''}${link?'<button class="action-btn secondary" data-share-link="'+esc(link)+'" type="button">Share link</button>':''}</div></div>`;}
  function renderRequests(root,rows){root.innerHTML=rows.length?'<div class="list">'+rows.map(requestCard).join('')+'</div>':'<div class="detail-card"><p class="meta">No scheduling requests.</p></div>';}
  async function share(url){
    if(navigator.share){try{await navigator.share({title:'Schedule swim lessons',text:'Choose your swim lesson times:',url});return}catch(e){if(e.name==='AbortError')return;}}
    await navigator.clipboard.writeText(url); showBanner('Scheduling link copied ✓');
  }
  document.addEventListener('click',async e=>{
    const dateBtn=e.target.closest('[data-schedule-date]'); if(dateBtn){const box=$('scheduleDate-'+dateBtn.dataset.scheduleDate);box?.classList.toggle('hidden');dateBtn.querySelector('span').textContent=box?.classList.contains('hidden')?'›':'⌄';return;}
    const edit=e.target.closest('[data-edit-schedule]'); if(edit){scheduleEditing=!scheduleEditing;renderSchedule($('swimScheduleContent'),scheduleData);return;}
    const toggle=e.target.closest('[data-toggle-slot]'); if(toggle){toggle.disabled=true;try{const x=await req('/api/mobile/swim/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(toggle.dataset.toggleSlot),blocked:toggle.dataset.blocked!=='1',reason:'Closed from iPhone'})});if(!x.response.ok)throw new Error(x.data?.error||'Could not update time.');swimLoaded.schedule=false;await load('schedule',true);}catch(err){showBanner(err.message)}return;}
    const create=e.target.closest('[data-create-slots]'); if(create){const status=$('swimScheduleStatus');try{const date=$('swimNewDate').value,start=$('swimNewStart').value,end=$('swimNewEnd').value,mins=Number($('swimNewMinutes').value),cap=Number($('swimNewCapacity').value);if(!date||!start||!end)throw new Error('Choose a date, start and end time.');let cursor=new Date(date+'T'+start),finish=new Date(date+'T'+end),slots=[];while(cursor<finish){const next=new Date(cursor.getTime()+mins*60000);if(next>finish)break;slots.push({startsAt:cursor.toISOString(),endsAt:next.toISOString()});cursor=next;}if(!slots.length)throw new Error('That range does not contain a complete lesson slot.');status.textContent='Creating…';const x=await req('/api/mobile/swim/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locationId:Number($('swimNewLocation').value),instructorId:$('swimNewInstructor').value?Number($('swimNewInstructor').value):null,capacity:cap,slots})});if(!x.response.ok)throw new Error(x.data?.error||'Could not create schedule.');swimLoaded.schedule=false;await load('schedule',true);}catch(err){status.textContent=err.message}return;}
    const student=e.target.closest('[data-student-id]'); if(student){openStudent(Number(student.dataset.studentId));return;}
    const backStudents=e.target.closest('[data-back-students]'); if(backStudents){swimLoaded.students=false;load('students',true);return;}
    const remind=e.target.closest('[data-remind-student]'); if(remind){const status=$('swimReminderStatus');remind.disabled=true;try{status.textContent='Sending…';const x=await post('/api/mobile/swim/reminder',{studentId:Number(remind.dataset.remindStudent)});if(!x.response.ok)throw new Error(x.data?.error||'Could not send reminder.');status.textContent='Reminder sent ✓';}catch(err){status.textContent=err.message}finally{remind.disabled=false}return;}
    const tab=e.target.closest('[data-swim-tab]'); if(tab){show(tab.dataset.swimTab);return;}
    const ref=e.target.closest('[data-swim-refresh]'); if(ref){swimLoaded[ref.dataset.swimRefresh]=false;load(ref.dataset.swimRefresh,true);return;}
    const shareBtn=e.target.closest('[data-share-link]'); if(shareBtn){share(shareBtn.dataset.shareLink);return;}
    const confirm=e.target.closest('[data-confirm-request]'); if(confirm){confirm.disabled=true;try{const x=await req('/api/mobile/swim/requests',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(confirm.dataset.confirmRequest),action:'confirm'})});if(!x.response.ok)throw new Error(x.data?.error||'Could not confirm.');swimLoaded.today=false;swimLoaded.requests=false;await load('requests',true);}catch(err){showBanner(err.message)}finally{confirm.disabled=false;}}
  });
  window.ApproveHQSwim={
    activate(){
      install();
      nav();
      ['jobsScreen','customersScreen','paymentsScreen','teamScreen','nativeFeaturesScreen','detailScreen','newJobScreen','addCustomerScreen','editCustomerScreen'].forEach(id=>$(id)?.classList.add('hidden'));
      $('bottomNav')?.classList.remove('hidden');
      show('today');
    },
    deactivate(){
      ['swimTodayScreen','swimScheduleScreen','swimStudentsScreen','swimRequestsScreen'].forEach(id=>$(id)?.classList.add('hidden'));
      const root=$('bottomNav')?.querySelector('.bottom-inner');
      if(root && defaultNavHTML!==null) root.innerHTML=defaultNavHTML;
    },
    reset(){swimLoaded={today:false,schedule:false,students:false,requests:false};}
  };
  install();
})();