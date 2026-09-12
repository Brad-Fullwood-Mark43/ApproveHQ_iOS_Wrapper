'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const root = $('rentalContent');
  if (!root) return;

  let decorating = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function isRentalsScreen() {
    return root.querySelector('.topbar h2')?.textContent?.trim() === 'Rentals';
  }

  function closeSharePanel() {
    $('rentalSharePanel')?.remove();
  }

  async function openSharePanel() {
    if ($('rentalSharePanel')) return;
    const topbar = root.querySelector('.topbar');
    if (!topbar) return;

    const panel = document.createElement('div');
    panel.id = 'rentalSharePanel';
    panel.className = 'detail-card';
    panel.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Customer booking</div><div class="section-title" style="margin:2px 0 0">Send rental link</div></div>
        <button id="closeRentalShare" class="text-button" type="button">Cancel</button>
      </div>
      <p class="meta">Send a personalized booking link by text message.</p>
      <div id="rentalShareLoading" class="loading">Loading customers…</div>
      <div id="rentalShareContent" class="hidden">
        <div class="field"><label>Customer</label><select id="rentalShareCustomer"></select></div>
        <button id="showNewRentalCustomer" class="action-btn secondary" type="button" style="width:100%;margin-bottom:12px">+ Add new customer</button>
        <div id="newRentalCustomerFields" class="hidden">
          <div class="field"><label>Name</label><input id="newRentalCustomerName" autocomplete="name"></div>
          <div class="field"><label>Mobile phone</label><input id="newRentalCustomerPhone" type="tel" inputmode="tel"></div>
          <div class="field"><label>Email (optional)</label><input id="newRentalCustomerEmail" type="email"></div>
        </div>
        <button id="sendRentalLink" class="action-btn" type="button" style="width:100%">Send booking link by text</button>
        <div id="rentalShareStatus" class="form-status"></div>
      </div>`;
    topbar.insertAdjacentElement('afterend', panel);

    $('closeRentalShare')?.addEventListener('click', closeSharePanel);
    $('showNewRentalCustomer')?.addEventListener('click', () => {
      const fields = $('newRentalCustomerFields');
      const nowHidden = fields.classList.toggle('hidden');
      $('showNewRentalCustomer').textContent = nowHidden ? '+ Add new customer' : 'Use existing customer';
      $('rentalShareCustomer').disabled = !nowHidden;
    });

    try {
      const x = await get('/api/mobile/customers');
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not load customers.');
      const customers = Array.isArray(x.data?.customers) ? x.data.customers : [];
      const select = $('rentalShareCustomer');
      select.innerHTML = customers.length
        ? customers.map(c => `<option value="${Number(c.id)}">${esc(c.name)} · ${esc(c.phone || '')}</option>`).join('')
        : '<option value="">No customers yet</option>';
      $('rentalShareLoading').classList.add('hidden');
      $('rentalShareContent').classList.remove('hidden');
      if (!customers.length) $('showNewRentalCustomer')?.click();
    } catch (err) {
      $('rentalShareLoading').textContent = err?.message || 'Could not load customers.';
    }

    $('sendRentalLink')?.addEventListener('click', async () => {
      const status = $('rentalShareStatus');
      const button = $('sendRentalLink');
      button.disabled = true;
      status.textContent = 'Sending…';
      try {
        let customerId;
        const addingNew = !$('newRentalCustomerFields').classList.contains('hidden');
        if (addingNew) {
          const name = $('newRentalCustomerName').value.trim();
          const phone = $('newRentalCustomerPhone').value.trim();
          const email = $('newRentalCustomerEmail').value.trim();
          if (!name || !phone) throw new Error('Name and mobile phone are required.');
          const created = await post('/api/mobile/customers', { name, phone, email });
          if (!created.response.ok) throw new Error(created.data?.error || 'Could not add customer.');
          customerId = Number(created.data?.customer?.id);
        } else {
          customerId = Number($('rentalShareCustomer').value);
        }
        if (!customerId) throw new Error('Choose or add a customer.');

        const sent = await post('/api/mobile/rentals/share', { customerId });
        if (!sent.response.ok) throw new Error(sent.data?.error || 'Could not send booking link.');
        status.textContent = `Booking link sent to ${sent.data?.customer?.name || 'customer'} ✓`;
        setTimeout(closeSharePanel, 1200);
      } catch (err) {
        status.textContent = err?.message || 'Could not send booking link.';
        button.disabled = false;
      }
    });
  }

  function addShareButton() {
    if (!isRentalsScreen() || $('shareRentalBookingLink')) return;
    const actions = root.querySelector('.topbar .actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'shareRentalBookingLink';
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = 'Send Link';
    button.addEventListener('click', openSharePanel);
    actions.insertBefore(button, actions.firstChild);
  }

  function collapseCard(card) {
    if (!card || card.dataset.rentalCollapsible === 'true') return;
    const idMatch = String(card.id || '').match(/^rental-(\d+)$/);
    if (!idMatch) return;

    const rentalId = Number(idMatch[1]);
    const children = [...card.children];
    const header = children[0];
    if (!header) return;

    const contact = children[1];
    const address = children[2];
    const dateTotal = children[3];
    const detailsToHide = children.slice(4);

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'rental-collapse-toggle';
    summary.setAttribute('aria-expanded', 'false');
    summary.innerHTML = `
      <div style="text-align:left;min-width:0;flex:1">
        ${dateTotal ? `<div class="rental-summary-copy">${dateTotal.innerHTML}</div>` : ''}
        ${address?.textContent?.trim() ? `<div class="meta" style="margin-top:4px">${esc(address.textContent.trim())}</div>` : ''}
      </div>
      <span class="rental-card-chevron">⌄</span>`;

    if (contact) contact.classList.add('hidden');
    if (address) address.classList.add('hidden');
    if (dateTotal) dateTotal.classList.add('hidden');

    const details = document.createElement('div');
    details.className = 'rental-card-details hidden';
    if (contact) details.appendChild(contact);
    if (address) details.appendChild(address);
    detailsToHide.forEach(el => details.appendChild(el));

    card.appendChild(summary);
    card.appendChild(details);

    const setExpanded = expanded => {
      details.classList.toggle('hidden', !expanded);
      summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      summary.querySelector('.rental-card-chevron').textContent = expanded ? '⌃' : '⌄';
      card.classList.toggle('rental-card-expanded', expanded);
    };
    summary.addEventListener('click', () => setExpanded(details.classList.contains('hidden')));

    card.querySelectorAll('.save-rental').forEach(button => {
      button.addEventListener('click', () => {
        setTimeout(() => {
          const refreshed = document.getElementById(`rental-${rentalId}`);
          if (refreshed && refreshed !== card) collapseCard(refreshed);
        }, 250);
      });
    });

    card.dataset.rentalCollapsible = 'true';
  }

  function decorate() {
    if (decorating || !isRentalsScreen()) return;
    decorating = true;
    try {
      addShareButton();
      root.querySelectorAll('[id^="rental-"]').forEach(collapseCard);
    } finally {
      decorating = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (isRentalsScreen()) queueMicrotask(decorate);
    else closeSharePanel();
  });
  observer.observe(root, { childList: true, subtree: true });
  decorate();
})();
