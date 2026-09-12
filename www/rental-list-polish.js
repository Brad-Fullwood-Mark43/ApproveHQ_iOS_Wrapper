'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const root = $('rentalContent');
  if (!root) return;

  let decorating = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(cents || 0) / 100);

  function isRentalsScreen() {
    return root.querySelector('.topbar h2')?.textContent?.trim() === 'Rentals';
  }

  function closeSharePanel() { $('rentalSharePanel')?.remove(); }

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
    actions.insertBefore(button, actions.firstChild);
  }

  root.addEventListener('click', e => {
    const button = e.target.closest('#shareRentalBookingLink');
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openSharePanel();
  }, true);

  function paymentStatus(row) {
    const s = String(row.display_status || row.status || 'pending');
    const label = s === 'paid' ? 'Paid' : s === 'sent' ? 'Sent' : s === 'failed' ? 'Failed' : s === 'cancelled' ? 'Cancelled' : 'Pending';
    const cls = s === 'paid' ? 'status-complete' : s === 'failed' || s === 'cancelled' ? 'status-changes' : 'status-waiting';
    return `<span class="status-pill ${cls}">${label}</span>`;
  }

  async function loadRentalPayments(rentalId, section) {
    if (!section || section.dataset.loaded === 'true') return;
    const body = section.querySelector('.rental-payment-body');
    body.innerHTML = '<div class="loading">Loading payments…</div>';
    try {
      const x = await get(`/api/mobile/rentals/${rentalId}/payment-requests`);
      if (!x.response.ok) {
        if (x.response.status === 409) {
          body.innerHTML = `<div class="meta">${esc(x.data?.error || 'Connect Square in Settings before sending rental payment requests.')}</div>`;
          section.dataset.loaded = 'true';
          return;
        }
        throw new Error(x.data?.error || 'Could not load rental payments.');
      }

      const rental = x.data?.rental || {};
      const rows = Array.isArray(x.data?.paymentRequests) ? x.data.paymentRequests : [];
      body.innerHTML = `
        <div class="row" style="margin-bottom:10px"><div><div class="eyebrow">Rental total</div><strong>${money(rental.price_cents)}</strong></div></div>
        ${rows.length ? `<div class="rental-payment-history">${rows.map(p => `<div class="rental-payment-row"><div><strong>${esc(p.description)}</strong><div class="meta">${money(p.amount_cents)}${p.sent_at ? ' · Text sent' : ''}</div></div>${paymentStatus(p)}</div>`).join('')}</div>` : '<div class="meta" style="margin-bottom:12px">No payment requests yet.</div>'}
        ${String(rental.status) !== 'cancelled' ? `
          <div class="field"><label>Description</label><input id="rpay-desc-${rentalId}" value="Rental deposit"></div>
          <div class="field"><label>Amount</label><input id="rpay-amount-${rentalId}" type="number" min="0.01" step="0.01" placeholder="0.00"></div>
          <div class="field"><label>Note (optional)</label><input id="rpay-note-${rentalId}" placeholder="Deposit due to confirm reservation"></div>
          <button class="action-btn send-rental-payment" data-rental-payment-id="${rentalId}" type="button" style="width:100%">Send Square payment request</button>
          <div id="rpay-status-${rentalId}" class="form-status"></div>` : ''}`;
      section.dataset.loaded = 'true';
    } catch (err) {
      body.innerHTML = `<div class="form-status">${esc(err?.message || 'Could not load rental payments.')}</div>`;
    }
  }

  async function sendRentalPayment(rentalId, button) {
    const status = $(`rpay-status-${rentalId}`);
    button.disabled = true;
    status.textContent = 'Creating Square payment request…';
    try {
      const description = $(`rpay-desc-${rentalId}`).value.trim();
      const amount = $(`rpay-amount-${rentalId}`).value;
      const note = $(`rpay-note-${rentalId}`).value.trim();
      const x = await post(`/api/mobile/rentals/${rentalId}/payment-requests`, { description, amount, note });
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not send payment request.');
      status.textContent = x.data?.textSent ? 'Square payment request sent by text ✓' : (x.data?.textError || 'Payment request created, but text was not sent.');
      const section = document.querySelector(`[data-rental-payment-section="${rentalId}"]`);
      if (section) {
        section.dataset.loaded = 'false';
        setTimeout(() => loadRentalPayments(rentalId, section), 500);
      }
    } catch (err) {
      status.textContent = err?.message || 'Could not send payment request.';
      button.disabled = false;
    }
  }

  async function cancelRental(rentalId, button) {
    const card = $(`rental-${rentalId}`);
    if (!card) return;
    const customerName = card.querySelector('.title')?.textContent?.trim() || 'this customer';
    if (!window.confirm(`Cancel the rental for ${customerName}? This will free these dates for another booking.`)) return;

    const status = $(`rstat-${rentalId}`);
    button.disabled = true;
    if (status) status.textContent = 'Cancelling rental…';
    try {
      const x = await post('/api/mobile/rentals', {
        action: 'update_booking',
        rentalId,
        deliveryDate: $(`rd-${rentalId}`)?.value,
        pickupDate: $(`rp-${rentalId}`)?.value,
        status: 'cancelled',
        notes: $(`rn-${rentalId}`)?.value?.trim() || '',
      });
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not cancel rental.');
      $('rentalRefresh')?.click();
    } catch (err) {
      if (status) status.textContent = err?.message || 'Could not cancel rental.';
      button.disabled = false;
    }
  }

  function installRentalActions(card, rentalId, details) {
    if (details.querySelector(`[data-rental-actions="${rentalId}"]`)) return;
    const currentStatus = $(`rs-${rentalId}`)?.value;
    const actions = document.createElement('div');
    actions.dataset.rentalActions = String(rentalId);
    actions.innerHTML = `
      <div class="rental-payment-section" data-rental-payment-section="${rentalId}" style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(128,128,128,.18)">
        <div class="section-title">Payments</div>
        <div class="rental-payment-body"><div class="meta">Expand this rental to load Square payment activity.</div></div>
      </div>
      ${currentStatus !== 'cancelled' ? `<button class="action-btn danger cancel-rental" data-cancel-rental-id="${rentalId}" type="button" style="width:100%;margin-top:16px">Cancel booking</button>` : ''}`;
    details.appendChild(actions);
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
    installRentalActions(card, rentalId, details);

    card.appendChild(summary);
    card.appendChild(details);

    const setExpanded = expanded => {
      details.classList.toggle('hidden', !expanded);
      summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      summary.querySelector('.rental-card-chevron').textContent = expanded ? '⌃' : '⌄';
      card.classList.toggle('rental-card-expanded', expanded);
      if (expanded) {
        const paymentSection = details.querySelector(`[data-rental-payment-section="${rentalId}"]`);
        loadRentalPayments(rentalId, paymentSection);
      }
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

  root.addEventListener('click', e => {
    const pay = e.target.closest('.send-rental-payment');
    if (pay) {
      e.preventDefault();
      sendRentalPayment(Number(pay.dataset.rentalPaymentId), pay);
      return;
    }
    const cancel = e.target.closest('.cancel-rental');
    if (cancel) {
      e.preventDefault();
      cancelRental(Number(cancel.dataset.cancelRentalId), cancel);
    }
  });

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
