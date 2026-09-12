'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const root = $('rentalContent');
  if (!root) return;

  let installing = false;
  let rentalSnapshot = null;
  let calendarMonth = null;
  let calendarTarget = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(cents || 0) / 100);

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyFromDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function dateFromKey(v) {
    const [y,m,d] = String(v || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  }
  function addDays(key, n) {
    const d = dateFromKey(key); d.setDate(d.getDate() + Number(n || 0)); return keyFromDate(d);
  }
  function eachDate(start, end, fn) {
    if (!start || !end || end < start) return;
    let d = dateFromKey(start); const stop = dateFromKey(end);
    while (d <= stop) { fn(keyFromDate(d)); d.setDate(d.getDate() + 1); }
  }
  function rentalDays(start, end) {
    if (!start || !end || end < start) return 0;
    return Math.floor((dateFromKey(end) - dateFromKey(start)) / 86400000) + 1;
  }
  function prettyDate(v) {
    if (!v) return 'Choose date';
    return dateFromKey(v).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }

  function isRentalsScreen() {
    const title = root.querySelector('.topbar h2');
    return title?.textContent?.trim() === 'Rentals';
  }

  function ensureStyles() {
    if ($('manualRentalCalendarStyles')) return;
    const style = document.createElement('style');
    style.id = 'manualRentalCalendarStyles';
    style.textContent = `
      .rental-date-button{width:100%;text-align:left;min-height:44px;border:1px solid rgba(128,128,128,.28);border-radius:10px;background:var(--card-bg,#fff);padding:10px 12px;font:inherit;color:inherit}
      .rental-date-button .meta{display:block;margin-top:2px}
      .rental-calendar-wrap{margin:8px 0 14px;padding:12px;border:1px solid rgba(128,128,128,.24);border-radius:14px;background:rgba(128,128,128,.05)}
      .rental-calendar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .rental-calendar-nav{border:0;background:transparent;font:inherit;font-size:20px;padding:6px 10px;color:inherit}
      .rental-calendar-title{font-weight:700}
      .rental-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
      .rental-calendar-weekday{text-align:center;font-size:11px;font-weight:700;opacity:.62;padding:3px 0}
      .rental-calendar-day{min-height:54px;border:1px solid rgba(128,128,128,.2);border-radius:9px;background:var(--card-bg,#fff);padding:5px 2px;text-align:center;font:inherit;color:inherit;display:flex;flex-direction:column;justify-content:center;gap:2px}
      .rental-calendar-day span{font-size:9px;line-height:1.05;font-weight:700}
      .rental-calendar-day.unavailable{opacity:.72;background:rgba(185,28,28,.08);border-color:rgba(185,28,28,.28)}
      .rental-calendar-day.blocked{background:rgba(202,138,4,.11);border-color:rgba(202,138,4,.35)}
      .rental-calendar-day.turnaround{background:rgba(107,114,128,.12);border-color:rgba(107,114,128,.3)}
      .rental-calendar-day.selected{outline:2px solid currentColor;outline-offset:1px}
      .rental-calendar-day:disabled{cursor:not-allowed}
      .rental-calendar-legend{display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:10px;font-size:11px;opacity:.78}
      .rental-calendar-legend b{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:-1px}
      .rental-calendar-legend .rent{background:rgba(185,28,28,.45)}
      .rental-calendar-legend .block{background:rgba(202,138,4,.55)}
      .rental-calendar-legend .turn{background:rgba(107,114,128,.5)}
      .rental-calendar-note{margin:8px 0 0;font-size:12px;opacity:.72}
    `;
    document.head.appendChild(style);
  }

  function removeManualForm() {
    $('manualRentalCard')?.remove();
    calendarTarget = null;
    calendarMonth = null;
    rentalSnapshot = null;
  }

  function selectedAssetId() { return Number($('manualAssetId')?.value || 0); }

  function availabilityMap(assetId) {
    const map = new Map();
    const turn = Number(rentalSnapshot?.rules?.rental_turnaround_days || 0);
    const bookings = (rentalSnapshot?.bookings || []).filter(r => Number(r.asset_id) === Number(assetId) && r.status !== 'cancelled');
    const blocks = (rentalSnapshot?.blocks || []).filter(b => Number(b.asset_id) === Number(assetId));

    bookings.forEach(r => {
      const start = String(r.delivery_date || '').slice(0,10);
      const end = String(r.pickup_date || '').slice(0,10);
      eachDate(start, end, k => map.set(k, { type:'rented', label:'Rented', customer:r.customer_name || null }));
      if (turn > 0) eachDate(addDays(end, 1), addDays(end, turn), k => { if (!map.has(k)) map.set(k, { type:'turnaround', label:'Turnaround' }); });
    });
    blocks.forEach(b => {
      eachDate(String(b.start_date || '').slice(0,10), String(b.end_date || '').slice(0,10), k => map.set(k, { type:'blocked', label:'Blocked', reason:b.reason || null }));
    });
    return map;
  }

  function rangeHasUnavailable(start, end, map) {
    let bad = false;
    eachDate(start, end, k => { if (map.has(k)) bad = true; });
    return bad;
  }

  function closeCalendar() { $('manualAvailabilityCalendar')?.remove(); }

  function openCalendar(target) {
    calendarTarget = target;
    const current = $(target === 'delivery' ? 'manualDeliveryDate' : 'manualPickupDate')?.value;
    const anchor = current ? dateFromKey(current) : new Date();
    calendarMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    renderCalendar();
  }

  function renderCalendar() {
    closeCalendar();
    if (!calendarTarget || !calendarMonth) return;
    const assetId = selectedAssetId();
    const map = availabilityMap(assetId);
    const delivery = $('manualDeliveryDate')?.value || '';
    const selected = $(calendarTarget === 'delivery' ? 'manualDeliveryDate' : 'manualPickupDate')?.value || '';
    const today = keyFromDate(new Date());

    const box = document.createElement('div');
    box.id = 'manualAvailabilityCalendar';
    box.className = 'rental-calendar-wrap';

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1, 12);
    const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
    const leading = first.getDay();
    const cells = [];
    for (let i=0; i<leading; i++) cells.push('<div></div>');

    for (let day=1; day<=daysInMonth; day++) {
      const key = keyFromDate(new Date(year, month, day, 12));
      const reason = map.get(key);
      let disabled = key < today || Boolean(reason);
      let label = reason?.label || '';
      let cls = reason ? `unavailable ${reason.type}` : '';
      if (calendarTarget === 'pickup' && delivery) {
        if (key < delivery) disabled = true;
        else if (!disabled && rangeHasUnavailable(delivery, key, map)) {
          disabled = true;
          label = 'Conflict';
          cls = 'unavailable';
        }
      }
      const detail = reason?.type === 'rented' && reason.customer ? ` title="Rented to ${esc(reason.customer)}"` : reason?.reason ? ` title="${esc(reason.reason)}"` : '';
      cells.push(`<button class="rental-calendar-day ${cls} ${key===selected?'selected':''}" type="button" data-calendar-date="${key}" ${disabled?'disabled':''}${detail}><strong>${day}</strong>${label?`<span>${esc(label)}</span>`:''}</button>`);
    }

    box.innerHTML = `
      <div class="rental-calendar-head">
        <button class="rental-calendar-nav" type="button" data-cal-prev>‹</button>
        <div class="rental-calendar-title">${calendarMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div>
        <button class="rental-calendar-nav" type="button" data-cal-next>›</button>
      </div>
      <div class="rental-calendar-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="rental-calendar-weekday">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="rental-calendar-legend"><span><b class="rent"></b>Rented</span><span><b class="block"></b>Blocked</span><span><b class="turn"></b>Turnaround</span></div>
      <div class="rental-calendar-note">Choose an available ${calendarTarget === 'delivery' ? 'delivery' : 'pickup'} date for this dumpster.</div>`;

    const host = $(calendarTarget === 'delivery' ? 'manualDeliveryField' : 'manualPickupField');
    host?.appendChild(box);
    box.querySelector('[data-cal-prev]')?.addEventListener('click', () => { calendarMonth = new Date(year, month-1, 1, 12); renderCalendar(); });
    box.querySelector('[data-cal-next]')?.addEventListener('click', () => { calendarMonth = new Date(year, month+1, 1, 12); renderCalendar(); });
    box.querySelectorAll('[data-calendar-date]').forEach(b => b.addEventListener('click', () => chooseDate(b.dataset.calendarDate)));
  }

  function chooseDate(key) {
    const input = $(calendarTarget === 'delivery' ? 'manualDeliveryDate' : 'manualPickupDate');
    const button = $(calendarTarget === 'delivery' ? 'manualDeliveryButton' : 'manualPickupButton');
    if (!input || !button) return;
    input.value = key;
    button.querySelector('strong').textContent = prettyDate(key);
    if (calendarTarget === 'delivery') {
      const pickup = $('manualPickupDate');
      if (pickup?.value && pickup.value < key) {
        pickup.value = '';
        $('manualPickupButton')?.querySelector('strong') && ($('manualPickupButton').querySelector('strong').textContent = 'Choose date');
      }
    }
    closeCalendar();
    updatePrice();
  }

  function updatePrice() {
    const select = $('manualAssetId');
    const start = $('manualDeliveryDate')?.value;
    const end = $('manualPickupDate')?.value;
    const box = $('manualRentalPrice');
    if (!select || !box) return;
    const days = rentalDays(start, end);
    const cents = Number(select.selectedOptions?.[0]?.dataset?.price || 0);
    if (days > 0) {
      box.textContent = `${days} day${days === 1 ? '' : 's'} × ${money(cents)}/day = ${money(days * cents)}`;
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
  }

  async function openManualForm() {
    if ($('manualRentalCard')) return;
    ensureStyles();
    const x = await get('/api/mobile/rentals');
    if (!x.response.ok) return;
    rentalSnapshot = x.data || {};
    const assets = (rentalSnapshot.assets || []).filter(a => a.active !== false);

    const card = document.createElement('div');
    card.id = 'manualRentalCard';
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Owner entry</div><div class="section-title" style="margin:2px 0 0">Add rental manually</div></div>
        <button id="cancelManualRental" class="text-button" type="button">Cancel</button>
      </div>
      ${assets.length ? `<form id="manualRentalForm">
        <div class="field"><label>Dumpster</label><select id="manualAssetId" required>${assets.map(a => `<option value="${Number(a.id)}" data-price="${Number(a.price_cents || 0)}">${esc(a.name)} · ${esc(a.yard_size)} yd · ${money(a.price_cents)}/day</option>`).join('')}</select></div>
        <div class="field"><label>Customer name</label><input id="manualCustomerName" autocomplete="name" required></div>
        <div class="action-grid"><div class="field"><label>Phone</label><input id="manualCustomerPhone" type="tel" inputmode="tel" required></div><div class="field"><label>Email</label><input id="manualCustomerEmail" type="email"></div></div>
        <div class="action-grid">
          <div class="field" id="manualDeliveryField"><label>Delivery</label><button id="manualDeliveryButton" class="rental-date-button" type="button"><strong>Choose date</strong><span class="meta">Tap to view availability</span></button><input id="manualDeliveryDate" type="hidden" required></div>
          <div class="field" id="manualPickupField"><label>Pickup</label><button id="manualPickupButton" class="rental-date-button" type="button"><strong>Choose date</strong><span class="meta">Tap to view availability</span></button><input id="manualPickupDate" type="hidden" required></div>
        </div>
        <div id="manualRentalPrice" class="notice hidden" style="margin-bottom:12px"></div>
        <div class="field"><label>Delivery address</label><textarea id="manualDeliveryAddress" required></textarea></div>
        <div class="field"><label>Notes</label><textarea id="manualRentalNotes" placeholder="Placement instructions, gate code, payment notes…"></textarea></div>
        <button id="manualRentalSubmit" class="action-btn" type="submit" style="width:100%">Add rental</button>
        <div id="manualRentalStatus" class="form-status"></div>
      </form>` : '<div class="meta">Add an active dumpster in Assets before creating a manual rental.</div>'}`;

    const topbar = root.querySelector('.topbar');
    if (topbar?.nextSibling) root.insertBefore(card, topbar.nextSibling);
    else root.appendChild(card);

    $('cancelManualRental')?.addEventListener('click', removeManualForm);
    $('manualDeliveryButton')?.addEventListener('click', () => openCalendar('delivery'));
    $('manualPickupButton')?.addEventListener('click', () => {
      if (!$('manualDeliveryDate')?.value) {
        $('manualRentalStatus').textContent = 'Choose a delivery date first.';
        return;
      }
      $('manualRentalStatus').textContent = '';
      openCalendar('pickup');
    });
    $('manualAssetId')?.addEventListener('change', () => {
      $('manualDeliveryDate').value = '';
      $('manualPickupDate').value = '';
      $('manualDeliveryButton').querySelector('strong').textContent = 'Choose date';
      $('manualPickupButton').querySelector('strong').textContent = 'Choose date';
      closeCalendar();
      updatePrice();
    });

    $('manualRentalForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const status = $('manualRentalStatus');
      const button = $('manualRentalSubmit');
      if (!$('manualDeliveryDate').value || !$('manualPickupDate').value) {
        status.textContent = 'Choose available delivery and pickup dates.';
        return;
      }
      status.textContent = 'Adding rental…';
      button.disabled = true;
      try {
        const result = await post('/api/mobile/rentals', {
          action: 'create_manual_booking',
          assetId: Number($('manualAssetId').value),
          customerName: $('manualCustomerName').value.trim(),
          customerPhone: $('manualCustomerPhone').value.trim(),
          customerEmail: $('manualCustomerEmail').value.trim(),
          deliveryDate: $('manualDeliveryDate').value,
          pickupDate: $('manualPickupDate').value,
          deliveryAddress: $('manualDeliveryAddress').value.trim(),
          notes: $('manualRentalNotes').value.trim(),
        });
        if (!result.response.ok) throw new Error(result.data?.error || 'Could not add rental.');
        removeManualForm();
        $('rentalRefresh')?.click();
      } catch (err) {
        status.textContent = err?.message || 'Could not add rental.';
        button.disabled = false;
      }
    });
  }

  function installAddButton() {
    if (installing || !isRentalsScreen() || $('addManualRentalBtn')) return;
    installing = true;
    try {
      const actions = root.querySelector('.topbar .actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.id = 'addManualRentalBtn';
      button.className = 'text-button';
      button.type = 'button';
      button.textContent = '+ Add';
      button.addEventListener('click', openManualForm);
      actions.insertBefore(button, actions.firstChild);
    } finally {
      installing = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (isRentalsScreen()) installAddButton();
    else removeManualForm();
  });
  observer.observe(root, { childList: true, subtree: true });
})();
