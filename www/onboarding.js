'use strict';
(function () {
  const byId = id => document.getElementById(id);
  const style = document.createElement('style');
  style.textContent = `
    .onboarding-overlay{position:fixed;inset:0;z-index:120;background:rgba(8,25,43,.58);display:grid;place-items:end center;padding:20px 16px calc(env(safe-area-inset-bottom) + 20px)}
    .onboarding-sheet{width:100%;max-width:528px;background:#fff;border-radius:24px;padding:24px;box-shadow:0 18px 60px rgba(20,32,51,.24)}
    .onboarding-brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}.onboarding-brand .mark{flex:0 0 48px;width:48px;height:48px;font-size:23px}.onboarding-sheet h2{font-size:25px;margin:0}.onboarding-sheet>p{color:#68758a;line-height:1.5;margin-bottom:18px}
    .onboarding-step{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid #edf0f4}.onboarding-step:first-of-type{border-top:0}.onboarding-number{flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#eaf3fb;color:#0b63a7;font-weight:850}.onboarding-step strong{display:block;margin:2px 0 3px}.onboarding-step span{display:block;color:#68758a;font-size:13px;line-height:1.4}.onboarding-actions{display:grid;gap:9px;margin-top:18px}
    .getting-started{border:1px solid #d9e7f4;background:linear-gradient(180deg,#fff,#f8fbfe)}.getting-started-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.getting-started-progress{font-size:12px;font-weight:800;color:#0b63a7;background:#eaf3fb;border-radius:999px;padding:6px 9px;white-space:nowrap}.getting-started-bar{height:7px;background:#e6edf4;border-radius:999px;overflow:hidden;margin:12px 0 6px}.getting-started-fill{height:100%;background:#0b63a7;border-radius:999px;transition:width .2s ease}.getting-started-item{display:grid;grid-template-columns:32px 1fr;gap:10px;padding:13px 0;border-top:1px solid #edf0f4}.getting-started-check{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#eef3f8;color:#68758a;font-weight:900}.getting-started-item.done .getting-started-check{background:#daf6e4;color:#18733b}.getting-started-copy strong{display:block;font-size:15px}.getting-started-copy p{font-size:13px;color:#68758a;line-height:1.4;margin:3px 0 9px}.getting-started-item.done .getting-started-copy p{margin-bottom:0}.getting-started-item .action-btn{min-height:40px;font-size:14px}.onboarding-help-card .help-link{display:flex;width:100%;justify-content:space-between;align-items:center;background:transparent;color:#142033;text-align:left;padding:13px 0;border-top:1px solid #edf0f4}.onboarding-help-card .help-link:first-of-type{border-top:0}.help-chevron{color:#0b63a7;font-weight:900}
  `;
  document.head.appendChild(style);

  const key = suffix => `approvehq:onboarding:${window.approveHQCurrentUser?.businessId || 'unknown'}:${suffix}`;
  let state = { customers: false, jobs: false, sent: false };
  let refreshing = false;

  function ensureWelcome() {
    if (document.getElementById('onboardingWelcome')) return;
    const wrap = document.createElement('div');
    wrap.id = 'onboardingWelcome';
    wrap.className = 'onboarding-overlay hidden';
    wrap.innerHTML = `<div class="onboarding-sheet" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <div class="onboarding-brand"><div class="mark">A✓</div><div><h2 id="onboardingTitle">Welcome to ApproveHQ</h2><div class="meta">Customer approvals, simplified.</div></div></div>
      <p>Get your first customer approval moving in three simple steps.</p>
      <div class="onboarding-step"><div class="onboarding-number">1</div><div><strong>Add a customer</strong><span>Add the person you're doing work for.</span></div></div>
      <div class="onboarding-step"><div class="onboarding-number">2</div><div><strong>Create their job</strong><span>Add the work, photos and details they need to review.</span></div></div>
      <div class="onboarding-step"><div class="onboarding-number">3</div><div><strong>Send for approval</strong><span>ApproveHQ texts your customer a secure approval link.</span></div></div>
      <div class="onboarding-actions"><button id="onboardingStart" class="primary" type="button">Get started</button><button id="onboardingLater" class="action-btn secondary" type="button">Not now</button></div>
    </div>`;
    document.body.appendChild(wrap);
    byId('onboardingStart').addEventListener('click', () => dismissWelcome(true));
    byId('onboardingLater').addEventListener('click', () => dismissWelcome(false));
  }

  function dismissWelcome(start) {
    localStorage.setItem(key('welcome-seen'), '1');
    byId('onboardingWelcome')?.classList.add('hidden');
    if (start) {
      document.getElementById('gettingStartedCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function maybeShowWelcome() {
    ensureWelcome();
    if (!window.approveHQCurrentUser || byId('mainView')?.classList.contains('hidden')) return;
    if (!localStorage.getItem(key('welcome-seen'))) byId('onboardingWelcome').classList.remove('hidden');
  }

  async function refreshState() {
    if (refreshing || !window.approveHQCurrentUser) return;
    refreshing = true;
    try {
      const [customersResult, jobsResult] = await Promise.all([get('/api/mobile/customers'), get('/api/mobile/jobs')]);
      const customers = customersResult.response.ok && Array.isArray(customersResult.data?.customers) ? customersResult.data.customers : [];
      const jobs = jobsResult.response.ok && Array.isArray(jobsResult.data?.jobs) ? jobsResult.data.jobs : [];
      state = { customers: customers.length > 0, jobs: jobs.length > 0, sent: jobs.some(job => !!job.sent_at) };
      renderChecklist();
    } catch (err) {
      console.warn('Could not refresh onboarding state', err);
    } finally { refreshing = false; }
  }

  function actionFor(step) {
    if (step === 'customers') {
      selectTab('customers', true).then(() => byId('addCustomerBtn')?.click());
    } else if (step === 'jobs') {
      selectTab('jobs', true).then(() => byId('newJobBtn')?.click());
    } else if (step === 'sent') {
      selectTab('jobs', true);
    }
  }

  function renderChecklist() {
    const screen = byId('jobsScreen');
    if (!screen) return;
    let card = byId('gettingStartedCard');
    const doneCount = [state.customers, state.jobs, state.sent].filter(Boolean).length;
    if (doneCount === 3) { card?.remove(); localStorage.setItem(key('core-complete'), '1'); return; }
    if (!card) {
      card = document.createElement('div');
      card.id = 'gettingStartedCard';
      card.className = 'detail-card getting-started';
      const topbar = screen.querySelector('.topbar');
      if (topbar?.nextSibling) screen.insertBefore(card, topbar.nextSibling); else screen.appendChild(card);
    }
    const items = [
      ['customers','Add your first customer','Add the person you’re doing work for.','Add Customer'],
      ['jobs','Create your first job','Add the work, details and photos your customer needs.','Create Job'],
      ['sent','Send it for approval','Open the job when it’s ready and send the approval text.','View Jobs']
    ];
    card.innerHTML = `<div class="getting-started-head"><div><div class="section-title" style="margin-bottom:4px">Getting Started</div><div class="meta">Follow these steps to send your first approval.</div></div><div class="getting-started-progress">${doneCount} of 3</div></div>
      <div class="getting-started-bar"><div class="getting-started-fill" style="width:${doneCount/3*100}%"></div></div>
      ${items.map(([id,title,copy,label]) => `<div class="getting-started-item ${state[id]?'done':''}"><div class="getting-started-check">${state[id]?'✓':items.findIndex(v=>v[0]===id)+1}</div><div class="getting-started-copy"><strong>${title}</strong><p>${state[id]?'Complete':copy}</p>${state[id]?'':`<button class="action-btn ${id==='customers'?'':'secondary'}" data-onboarding-action="${id}" type="button">${label}</button>`}</div></div>`).join('')}`;
    card.querySelectorAll('[data-onboarding-action]').forEach(button => button.addEventListener('click', () => actionFor(button.dataset.onboardingAction)));
  }

  function enhanceEmptyStates() {
    const jobsMessage = byId('jobsMessage');
    if (jobsMessage && jobsMessage.textContent.trim() === 'No jobs yet.') jobsMessage.innerHTML = '<strong>Create your first job</strong><div class="meta">Add the work you’re doing, attach photos, then send it to your customer for approval.</div>';
    const customersMessage = byId('customersMessage');
    if (customersMessage && customersMessage.textContent.trim() === 'No customers yet.') customersMessage.innerHTML = '<strong>Start by adding a customer</strong><div class="meta">Customers are the people you’ll send jobs, approvals and payment requests to.</div>';
  }

  function ensureHelp() {
    const screen = byId('nativeFeaturesScreen');
    if (!screen || byId('onboardingHelpCard')) return;
    const card = document.createElement('div');
    card.id = 'onboardingHelpCard';
    card.className = 'detail-card onboarding-help-card';
    card.innerHTML = `<div class="section-title">Getting Started & Help</div><p class="meta">Need a refresher? Follow the core ApproveHQ workflow anytime.</p>
      <button class="help-link" data-help-action="customers" type="button"><span><strong>1. Add a customer</strong><span class="meta">Who the job is for</span></span><span class="help-chevron">›</span></button>
      <button class="help-link" data-help-action="jobs" type="button"><span><strong>2. Create a job</strong><span class="meta">Add details and photos</span></span><span class="help-chevron">›</span></button>
      <button class="help-link" data-help-action="sent" type="button"><span><strong>3. Send for approval</strong><span class="meta">Text the customer their approval link</span></span><span class="help-chevron">›</span></button>
      <button id="replayWelcome" class="action-btn secondary" type="button" style="width:100%;margin-top:12px">Replay welcome</button>`;
    screen.appendChild(card);
    card.querySelectorAll('[data-help-action]').forEach(button => button.addEventListener('click', () => actionFor(button.dataset.helpAction)));
    byId('replayWelcome').addEventListener('click', () => { ensureWelcome(); byId('onboardingWelcome').classList.remove('hidden'); });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#createCustomerSubmit,#createJobSubmit,#sendApprovalBtn')) setTimeout(refreshState, 900);
  }, true);

  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { maybeShowWelcome(); ensureHelp(); enhanceEmptyStates(); if (!byId('mainView')?.classList.contains('hidden')) refreshState(); }, 180);
  });

  function init() {
    ensureWelcome(); ensureHelp();
    observer.observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });
    setTimeout(() => { maybeShowWelcome(); refreshState(); enhanceEmptyStates(); }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
