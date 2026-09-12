'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const mainView = $('mainView');
  const loginPhone = $('phone');
  const businessField = $('businessField');
  const businessSelect = $('business');
  if (!mainView || !loginPhone || !businessField || !businessSelect) return;

  let memberships = [];
  let currentBusinessId = null;
  let probeTimer = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const switchBar = document.createElement('div');
  switchBar.id = 'businessSwitchBar';
  switchBar.className = 'business-switch-bar hidden';
  switchBar.innerHTML = `
    <button id="businessSwitchButton" class="business-switch-button" type="button">
      <span><span class="business-switch-eyebrow">Business</span><strong id="businessSwitchName">ApproveHQ</strong></span>
      <span class="business-switch-chevron">⌄</span>
    </button>`;
  mainView.insertBefore(switchBar, mainView.firstChild);

  const sheet = document.createElement('div');
  sheet.id = 'businessSwitchSheet';
  sheet.className = 'business-switch-sheet hidden';
  sheet.innerHTML = `
    <button class="business-switch-backdrop" data-close-business-switch type="button" aria-label="Close"></button>
    <div class="business-switch-panel">
      <div class="row"><div><div class="eyebrow">ApproveHQ</div><div class="title">Switch business</div></div><button class="text-button" data-close-business-switch type="button">Done</button></div>
      <p class="meta">Choose which business you want to manage. You do not need to sign out.</p>
      <div id="businessSwitchList" class="business-switch-list"><div class="loading">Loading businesses…</div></div>
      <div id="businessSwitchStatus" class="form-status"></div>
    </div>`;
  document.body.appendChild(sheet);

  function setCurrentLabel() {
    const user = window.currentUser;
    currentBusinessId = Number(user?.businessId || 0) || null;
    $('businessSwitchName').textContent = user?.businessName || 'ApproveHQ';
  }

  function renderMemberships() {
    const root = $('businessSwitchList');
    if (!memberships.length) {
      root.innerHTML = '<div class="meta">No businesses were returned for this account in the current environment.</div>';
      return;
    }
    root.innerHTML = memberships.map(m => {
      const active = Number(m.businessId) === Number(currentBusinessId);
      const type = m.businessType === 'dumpster_rental' ? 'Roll Off / Dumpster Rental' : 'Jobs & Customer Approvals';
      return `<button class="business-choice ${active ? 'active' : ''}" data-business-id="${Number(m.businessId)}" type="button" ${active ? 'disabled' : ''}>
        <span><strong>${esc(m.businessName)}</strong><span class="meta">${esc(type)}</span></span>
        <span>${active ? 'Current ✓' : 'Switch ›'}</span>
      </button>`;
    }).join('');
  }

  async function saveSecureToken(token) {
    if (!token) return;
    try {
      const cap = window.Capacitor;
      let plugin = cap?.Plugins?.SecureSession || null;
      if (!plugin && typeof cap?.registerPlugin === 'function') plugin = cap.registerPlugin('SecureSession');
      if (plugin?.set) await plugin.set({ value: token });
    } catch (err) {
      console.error('Could not persist switched business session', err);
    }
  }

  async function loadMemberships() {
    if (!mobileToken) return;
    const status = $('businessSwitchStatus');
    status.textContent = '';
    const x = await get('/api/mobile/auth/businesses');
    if (!x.response.ok) throw new Error(x.data?.error || 'Could not load businesses.');
    memberships = Array.isArray(x.data.memberships) ? x.data.memberships : [];
    currentBusinessId = Number(x.data.currentBusinessId || window.currentUser?.businessId || 0) || null;
    setCurrentLabel();
    switchBar.classList.remove('hidden');
    renderMemberships();
    if (memberships.length === 1) {
      status.textContent = 'Only one business is linked to this phone in the current environment.';
    }
  }

  async function openSwitcher() {
    sheet.classList.remove('hidden');
    $('businessSwitchList').innerHTML = '<div class="loading">Loading businesses…</div>';
    try { await loadMemberships(); }
    catch (err) { $('businessSwitchList').innerHTML = `<div class="error" style="display:block">${esc(err.message || 'Could not load businesses.')}</div>`; }
  }

  function closeSwitcher() {
    sheet.classList.add('hidden');
  }

  async function switchBusiness(businessId, button) {
    const status = $('businessSwitchStatus');
    status.textContent = 'Switching business…';
    button.disabled = true;
    try {
      const x = await post('/api/mobile/auth/businesses', { businessId, deviceName: 'ApproveHQ iOS' });
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not switch business.');
      mobileToken = x.data.token;
      await saveSecureToken(mobileToken);

      const me = await get('/api/mobile/auth/me');
      if (!me.response.ok || !me.data?.user) throw new Error('Business switched, but account details could not be loaded.');

      window.currentUser = me.data.user;
      currentJobId = null;
      currentCustomerId = null;
      loaded = { jobs: false, customers: false, payments: false, team: false };
      const businessName = $('businessName');
      if (businessName) businessName.textContent = me.data.user.businessName || 'ApproveHQ';
      const owner = me.data.user.role === 'owner' || me.data.user.isMaster === true;
      $('paymentsTab')?.classList.toggle('hidden', !owner);
      $('teamTab')?.classList.toggle('hidden', !owner);
      setCurrentLabel();
      closeSwitcher();
      showBanner('');
      await window.selectTab('jobs', true);
      loadMemberships().catch(() => {});
    } catch (err) {
      status.textContent = err.message || 'Could not switch business.';
      button.disabled = false;
    }
  }

  $('businessSwitchButton').addEventListener('click', openSwitcher);
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-close-business-switch]')) closeSwitcher();
    const button = e.target.closest('[data-business-id]');
    if (button) switchBusiness(Number(button.dataset.businessId), button);
  });

  async function probeLoginBusinesses() {
    const phone = loginPhone.value.trim();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      businessField.classList.add('hidden');
      return;
    }
    try {
      const x = await post('/api/mobile/auth/login', { phone, probe: true });
      const rows = Array.isArray(x.data?.memberships) ? x.data.memberships : [];
      if (x.response.ok && rows.length >= 1) {
        businessSelect.innerHTML = rows.map(m => `<option value="${Number(m.businessId)}">${esc(m.businessName)}</option>`).join('');
        let hint = $('businessLoginHint');
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'businessLoginHint';
          hint.className = 'meta';
          hint.style.marginTop = '6px';
          businessField.appendChild(hint);
        }
        hint.textContent = rows.length > 1
          ? 'This phone has access to multiple businesses. Choose one to continue.'
          : 'Only one business is linked to this phone in the current environment.';
        businessField.classList.remove('hidden');
      } else {
        businessField.classList.add('hidden');
      }
    } catch {}
  }

  loginPhone.addEventListener('input', () => {
    clearTimeout(probeTimer);
    probeTimer = setTimeout(probeLoginBusinesses, 350);
  });
  loginPhone.addEventListener('blur', probeLoginBusinesses);

  const observer = new MutationObserver(() => {
    if (!mainView.classList.contains('hidden') && mobileToken && window.currentUser) {
      setCurrentLabel();
      loadMemberships().catch(() => {});
    }
  });
  observer.observe(mainView, { attributes: true, attributeFilter: ['class'] });
})();
