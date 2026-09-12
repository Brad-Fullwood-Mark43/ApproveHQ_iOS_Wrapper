'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const loginPhone = $('phone');
  const businessField = $('businessField');
  const businessSelect = $('business');
  const settingsScreen = $('nativeFeaturesScreen');
  if (!loginPhone || !businessField || !businessSelect || !settingsScreen) return;

  let memberships = [];
  let currentBusinessId = null;
  let probeTimer = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installSettingsCard() {
    if ($('businessSwitcherCard')) return;
    const firstCard = settingsScreen.querySelector('.detail-card');
    const card = document.createElement('div');
    card.id = 'businessSwitcherCard';
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="section-title">Business</div>
      <p class="meta">Current business</p>
      <div id="businessSwitcherCurrent" class="title" style="margin-bottom:12px">${esc(window.currentUser?.businessName || 'ApproveHQ')}</div>
      <div id="businessSwitcherList"><div class="meta">Loading businesses…</div></div>
      <div id="businessSwitcherStatus" class="form-status"></div>`;
    if (firstCard) settingsScreen.insertBefore(card, firstCard); else settingsScreen.appendChild(card);
  }

  function renderMemberships() {
    installSettingsCard();
    const root = $('businessSwitcherList');
    const current = $('businessSwitcherCurrent');
    if (current) current.textContent = window.currentUser?.businessName || 'ApproveHQ';

    if (!memberships.length) {
      root.innerHTML = '<div class="meta">No businesses are available for this account.</div>';
      return;
    }

    if (memberships.length === 1) {
      root.innerHTML = '<div class="meta">This account currently has access to one business.</div>';
      return;
    }

    root.innerHTML = memberships.map(m => {
      const active = Number(m.businessId) === Number(currentBusinessId);
      const type = m.businessType === 'dumpster_rental' ? 'Roll Off / Dumpster Rental' : 'Jobs & Customer Approvals';
      return `<button class="action-btn ${active ? 'secondary' : ''}" data-switch-business-id="${Number(m.businessId)}" type="button" style="width:100%;margin-top:8px" ${active ? 'disabled' : ''}>
        <span style="display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%">
          <span style="text-align:left"><strong>${esc(m.businessName)}</strong><br><span class="meta">${esc(type)}</span></span>
          <span>${active ? 'Current ✓' : 'Switch'}</span>
        </span>
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
    installSettingsCard();
    if (!mobileToken) return;
    const status = $('businessSwitcherStatus');
    if (status) status.textContent = '';
    const x = await get('/api/mobile/auth/businesses');
    if (!x.response.ok) throw new Error(x.data?.error || 'Could not load businesses.');
    memberships = Array.isArray(x.data.memberships) ? x.data.memberships : [];
    currentBusinessId = Number(x.data.currentBusinessId || window.currentUser?.businessId || 0) || null;
    renderMemberships();
  }

  async function switchBusiness(businessId, button) {
    const status = $('businessSwitcherStatus');
    if (status) status.textContent = 'Switching business…';
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

      if (status) status.textContent = 'Business switched ✓';
      await loadMemberships();
      await window.selectTab('jobs', true);
    } catch (err) {
      if (status) status.textContent = err.message || 'Could not switch business.';
      button.disabled = false;
    }
  }

  settingsScreen.addEventListener('click', e => {
    const button = e.target.closest('[data-switch-business-id]');
    if (button) switchBusiness(Number(button.dataset.switchBusinessId), button);
  });

  $('nativeFeaturesBtn')?.addEventListener('click', () => {
    setTimeout(() => loadMemberships().catch(err => {
      installSettingsCard();
      const root = $('businessSwitcherList');
      if (root) root.innerHTML = `<div class="error" style="display:block">${esc(err.message || 'Could not load businesses.')}</div>`;
    }), 0);
  });

  $('refreshNativeFeatures')?.addEventListener('click', () => {
    loadMemberships().catch(() => {});
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
      if (x.response.ok && rows.length > 1) {
        businessSelect.innerHTML = rows.map(m => `<option value="${Number(m.businessId)}">${esc(m.businessName)}</option>`).join('');
        let hint = $('businessLoginHint');
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'businessLoginHint';
          hint.className = 'meta';
          hint.style.marginTop = '6px';
          businessField.appendChild(hint);
        }
        hint.textContent = 'Choose which business to open.';
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

  installSettingsCard();
})();
