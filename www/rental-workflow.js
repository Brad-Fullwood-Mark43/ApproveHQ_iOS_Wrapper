'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const originalShowOnly = window.showOnly;
  const originalSelectTab = window.selectTab;
  const bottomNav = $('bottomNav');
  const mainView = $('mainView');
  if (!bottomNav || !mainView || typeof originalShowOnly !== 'function' || typeof originalSelectTab !== 'function') return;

  let rentalData = null;
  let rentalMode = 'calendar';
  let rentalLoadedAt = 0;

  const screen = document.createElement('div');
  screen.id = 'rentalScreen';
  screen.className = 'screen hidden';
  screen.innerHTML = '<div id="rentalContent"></div>';
  const footer = mainView.querySelector('.footer');
  if (footer) mainView.insertBefore(screen, footer); else mainView.appendChild(screen);

  const navInner = bottomNav.querySelector('.bottom-inner');
  ['calendar','rentals','assets','customers'].forEach((name) => {
    const labels = { calendar: ['▦','Calendar'], rentals: ['▣','Rentals'], assets: ['▤','Assets'], customers: ['♟','Customers'] };
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rental-tab hidden';
    b.dataset.rentalTab = name;
    b.innerHTML = `<span>${labels[name][0]}</span>${labels[name][1]}`;
    navInner.appendChild(b);
  });

  function isRental() {
    return window.currentUser?.businessType === 'dumpster_rental';
  }

  function setRentalNav(active) {
    bottomNav.querySelectorAll('.tab').forEach(el => el.classList.toggle('hidden', isRental()));
    bottomNav.querySelectorAll('.rental-tab').forEach(el => {
      el.classList.toggle('hidden', !isRental());
      el.classList.toggle('active', el.dataset.rentalTab === active);
    });
  }

  window.showOnly = function (id) {
    originalShowOnly(id);
    screen.classList.toggle('hidden', id !== 'rentalScreen');
  };

  window.selectTab = async function (tab, force = false) {
    if (!isRental()) {
      screen.classList.add('hidden');
      setRentalNav(null);
      return originalSelectTab(tab, force);
    }

    if (tab === 'customers') {
      screen.classList.add('hidden');
      await originalSelectTab('customers', force);
      setRentalNav('customers');
      return;
    }

    const mode = tab === 'jobs' ? 'calendar' : tab;
    if (['calendar','rentals','assets'].includes(mode)) {
      originalShowOnly('jobsScreen');
      $('jobsScreen')?.classList.add('hidden');
      screen.classList.remove('hidden');
      bottomNav.classList.remove('hidden');
      setRentalNav(mode);
      await loadRental(mode, force);
      return;
    }

    return originalSelectTab(tab, force);
  };

  bottomNav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rental-tab]');
    if (!b || !isRental()) return;
    e.preventDefault();
    window.selectTab(b.dataset.rentalTab, false);
  }, true);

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function money(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
  }

  function niceDate(v) {
    if (!v) return '—';
    const d = new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusPill(status) {
    const map = {
      scheduled: ['Waiting','status-waiting'],
      delivered: ['In Progress','status-progress'],
      picked_up: ['Completed','status-complete'],
      cancelled: ['Cancelled','status-changes'],
    };
    const s = map[status] || [String(status || 'scheduled').replaceAll('_',' '),'status-waiting'];
    return `<span class="status-pill ${s[1]}">${esc(s[0])}</span>`;
  }

  async function fetchRental() {
    const x = await get('/api/mobile/rentals');
    if (!x.response.ok) throw new Error(x.data?.error || 'Could not load rental schedule.');
    rentalData = x.data;
    rentalLoadedAt = Date.now();
    return rentalData;
  }

  async function loadRental(mode, force) {
    rentalMode = mode;
    const root = $('rentalContent');
    root.innerHTML = '<div class="loading">Loading rental schedule…</div>';
    try {
      if (force || !rentalData || Date.now() - rentalLoadedAt > 30000) await fetchRental();
      renderRental();
    } catch (err) {
      root.innerHTML = `<div class="error" style="display:block">${esc(err.message || 'Could not load rental workflow.')}</div>`;
    }
  }

  function topbar(title, subtitle) {
    return `<div class="topbar"><div><div class="business-label">${esc(window.currentUser?.businessName || 'Roll-Off Rentals')}</div><h2>${esc(title)}</h2>${subtitle ? `<div class="meta">${esc(subtitle)}</div>` : ''}</div><div class="actions"><button id="rentalRefresh" class="text-button" type="button">Refresh</button><button id="rentalSettings" class="text-button" type="button">Settings</button></div></div>`;
  }

  function renderRental() {
    if (!rentalData) return;
    if (rentalMode === 'rentals') renderBookings();
    else if (rentalMode === 'assets') renderAssets();
    else renderCalendar();
    $('rentalRefresh')?.addEventListener('click', () => loadRental(rentalMode, true));
    $('rentalSettings')?.addEventListener('click', () => $('nativeFeaturesBtn')?.click());
  }

  function renderCalendar() {
    const root = $('rentalContent');
    const assets = rentalData.assets || [];
    const bookings = (rentalData.bookings || []).filter(r => r.status !== 'cancelled');
    const blocks = rentalData.blocks || [];
    const today = new Date(); today.setHours(0,0,0,0);
    const todayKey = today.toISOString().slice(0,10);
    const busyIds = new Set();
    bookings.forEach(r => { if (String(r.delivery_date).slice(0,10) <= todayKey && String(r.pickup_date).slice(0,10) >= todayKey) busyIds.add(Number(r.asset_id)); });
    blocks.forEach(b => { if (String(b.start_date).slice(0,10) <= todayKey && String(b.end_date).slice(0,10) >= todayKey) busyIds.add(Number(b.asset_id)); });
    const active = assets.filter(a => a.active !== false);
    const available = active.filter(a => !busyIds.has(Number(a.id))).length;
    const upcoming = [
      ...bookings.map(r => ({ type:'rental', start:String(r.delivery_date).slice(0,10), end:String(r.pickup_date).slice(0,10), row:r })),
      ...blocks.map(b => ({ type:'block', start:String(b.start_date).slice(0,10), end:String(b.end_date).slice(0,10), row:b })),
    ].filter(x => x.end >= todayKey).sort((a,b) => a.start.localeCompare(b.start)).slice(0,40);

    root.innerHTML = topbar('Rental Calendar', `${available} of ${active.length} dumpsters available today`) + `
      <div class="rental-summary-grid">
        <div class="detail-card rental-summary"><div class="eyebrow">Available now</div><div class="rental-big-number">${available}</div></div>
        <div class="detail-card rental-summary"><div class="eyebrow">Currently out / blocked</div><div class="rental-big-number">${busyIds.size}</div></div>
      </div>
      <div class="detail-card"><div class="section-title">Upcoming schedule</div>
        ${upcoming.length ? upcoming.map(item => {
          const r = item.row;
          if (item.type === 'block') return `<div class="rental-event"><div><strong>${esc(r.asset_name)}</strong><div class="meta">Unavailable · ${niceDate(r.start_date)} – ${niceDate(r.end_date)}</div>${r.reason ? `<div class="meta">${esc(r.reason)}</div>` : ''}</div><span class="status-pill status-changes">Blocked</span></div>`;
          return `<button class="rental-event rental-event-button" data-open-rental="${Number(r.id)}" type="button"><div><strong>${esc(r.asset_name)} · ${esc(r.yard_size)} yd</strong><div class="meta">${esc(r.customer_name || 'Customer')} · ${niceDate(r.delivery_date)} – ${niceDate(r.pickup_date)}</div><div class="meta">${esc(r.delivery_address || '')}</div></div>${statusPill(r.status)}</button>`;
        }).join('') : '<div class="meta">No upcoming rentals or blocked dates.</div>'}
      </div>
      <div class="detail-card"><div class="section-title">Block an asset</div><form id="blockAssetForm">
        <div class="field"><label>Dumpster</label><select id="blockAssetId" required>${active.map(a => `<option value="${Number(a.id)}">${esc(a.name)} · ${esc(a.yard_size)} yd</option>`).join('')}</select></div>
        <div class="action-grid"><div class="field"><label>Start</label><input id="blockStart" type="date" required></div><div class="field"><label>End</label><input id="blockEnd" type="date" required></div></div>
        <div class="field"><label>Reason</label><input id="blockReason" placeholder="Maintenance, reserved, repair…"></div>
        <button class="action-btn secondary" type="submit" style="width:100%">Block dates</button><div id="blockStatus" class="form-status"></div>
      </form></div>`;

    root.querySelectorAll('[data-open-rental]').forEach(b => b.addEventListener('click', () => { rentalMode='rentals'; setRentalNav('rentals'); renderBookings(Number(b.dataset.openRental)); }));
    $('blockAssetForm')?.addEventListener('submit', saveBlock);
  }

  function renderBookings(focusId = null) {
    const root = $('rentalContent');
    const rows = [...(rentalData.bookings || [])].sort((a,b) => String(b.delivery_date).localeCompare(String(a.delivery_date)));
    root.innerHTML = topbar('Rentals', `${rows.length} booking${rows.length === 1 ? '' : 's'}`) + `
      ${rows.length ? rows.map(r => `<div class="detail-card" id="rental-${Number(r.id)}">
        <div class="row"><div><div class="eyebrow">${esc(r.asset_name)} · ${esc(r.yard_size)} yard</div><div class="title">${esc(r.customer_name || 'Customer')}</div></div>${statusPill(r.status)}</div>
        <div class="meta" style="margin-top:6px">${esc(r.customer_phone || '')}${r.customer_email ? ' · '+esc(r.customer_email) : ''}</div>
        <div class="meta">${esc(r.delivery_address || '')}</div>
        <div class="row" style="margin-top:10px"><strong>${niceDate(r.delivery_date)} → ${niceDate(r.pickup_date)}</strong><strong>${money(r.price_cents)}</strong></div>
        <div class="action-grid" style="margin-top:12px"><div class="field"><label>Delivery</label><input id="rd-${Number(r.id)}" type="date" value="${esc(String(r.delivery_date).slice(0,10))}"></div><div class="field"><label>Pickup</label><input id="rp-${Number(r.id)}" type="date" value="${esc(String(r.pickup_date).slice(0,10))}"></div></div>
        <div class="field"><label>Status</label><select id="rs-${Number(r.id)}"><option value="scheduled" ${r.status==='scheduled'?'selected':''}>Scheduled</option><option value="delivered" ${r.status==='delivered'?'selected':''}>Delivered</option><option value="picked_up" ${r.status==='picked_up'?'selected':''}>Picked up</option><option value="cancelled" ${r.status==='cancelled'?'selected':''}>Cancelled</option></select></div>
        <div class="field"><label>Notes</label><textarea id="rn-${Number(r.id)}">${esc(r.notes || '')}</textarea></div>
        <button class="action-btn secondary save-rental" data-rental-id="${Number(r.id)}" type="button" style="width:100%">Save rental</button><div id="rstat-${Number(r.id)}" class="form-status"></div>
      </div>`).join('') : '<div class="detail-card"><div class="meta">No rentals yet. Customer bookings created from your booking link will appear here.</div></div>'}`;
    root.querySelectorAll('.save-rental').forEach(b => b.addEventListener('click', () => saveRental(Number(b.dataset.rentalId))));
    if (focusId) setTimeout(() => document.getElementById(`rental-${focusId}`)?.scrollIntoView({ behavior:'smooth', block:'start' }), 30);
  }

  function renderAssets() {
    const root = $('rentalContent');
    const assets = rentalData.assets || [];
    const rules = rentalData.rules || {};
    root.innerHTML = topbar('Assets', `${assets.length} dumpster${assets.length === 1 ? '' : 's'}`) + `
      ${rentalData.bookingUrl ? `<div class="detail-card"><div class="section-title">Customer booking link</div><div class="meta" style="word-break:break-all">${esc(rentalData.bookingUrl)}</div><div class="action-grid" style="margin-top:10px"><button id="copyBookingLink" class="action-btn secondary" type="button">Copy link</button><button id="openBookingLink" class="action-btn secondary" type="button">Open booking page</button></div><div id="bookingLinkStatus" class="form-status"></div></div>` : ''}
      <div class="detail-card"><div class="section-title">Rental rules</div><div class="action-grid"><div class="field"><label>Minimum days</label><input id="rentalMinDays" type="number" min="1" max="30" value="${Number(rules.rental_min_days || 1)}"></div><div class="field"><label>Turnaround days</label><input id="rentalTurnDays" type="number" min="0" max="14" value="${Number(rules.rental_turnaround_days || 0)}"></div></div><button id="saveRentalRules" class="action-btn secondary" type="button" style="width:100%">Save rental rules</button><div id="rulesStatus" class="form-status"></div></div>
      <div class="detail-card"><div class="section-title">Fleet</div>${assets.length ? assets.map(a => `<div class="rental-asset-row"><div><strong>${esc(a.name)}</strong><div class="meta">${esc(a.yard_size)} yard · ${money(a.price_cents)}/day · ${esc(a.booking_count || 0)} bookings</div>${a.notes ? `<div class="meta">${esc(a.notes)}</div>` : ''}</div><span class="status-pill ${a.active === false ? 'status-changes' : 'status-complete'}">${a.active === false ? 'Inactive' : 'Active'}</span></div>`).join('') : '<div class="meta">No dumpsters have been added yet.</div>'}</div>
      <div class="detail-card"><div class="section-title">Add dumpster</div><form id="addRentalAsset"><div class="field"><label>Asset name / number</label><input id="assetName" placeholder="Dumpster 01" required></div><div class="action-grid"><div class="field"><label>Yard size</label><input id="assetYards" type="number" min="1" step="1" placeholder="20" required></div><div class="field"><label>Daily price</label><input id="assetPrice" type="number" min="0" step="0.01" placeholder="195.00" required></div></div><div class="field"><label>Notes</label><input id="assetNotes" placeholder="Optional"></div><button class="action-btn" type="submit" style="width:100%">Add dumpster</button><div id="assetStatus" class="form-status"></div></form></div>`;

    $('addRentalAsset')?.addEventListener('submit', addAsset);
    $('saveRentalRules')?.addEventListener('click', saveRules);
    $('copyBookingLink')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(rentalData.bookingUrl); $('bookingLinkStatus').textContent='Booking link copied ✓'; } catch { $('bookingLinkStatus').textContent='Could not copy link.'; } });
    $('openBookingLink')?.addEventListener('click', () => { window.location.href = rentalData.bookingUrl; });
  }

  async function saveRental(id) {
    const s = $(`rstat-${id}`); s.textContent='Saving…';
    const x = await post('/api/mobile/rentals', { action:'update_booking', rentalId:id, deliveryDate:$(`rd-${id}`).value, pickupDate:$(`rp-${id}`).value, status:$(`rs-${id}`).value, notes:$(`rn-${id}`).value.trim() });
    if (!x.response.ok) { s.textContent=x.data?.error || 'Could not save rental.'; return; }
    s.textContent='Saved ✓'; await fetchRental(); renderBookings(id);
  }

  async function addAsset(e) {
    e.preventDefault(); const s=$('assetStatus'); s.textContent='Adding…';
    const x=await post('/api/mobile/rentals',{action:'create_asset',name:$('assetName').value.trim(),yardSize:Number($('assetYards').value),price:Number($('assetPrice').value),notes:$('assetNotes').value.trim()});
    if(!x.response.ok){s.textContent=x.data?.error||'Could not add dumpster.';return;} await fetchRental(); renderAssets();
  }

  async function saveBlock(e) {
    e.preventDefault(); const s=$('blockStatus'); s.textContent='Saving…';
    const x=await post('/api/mobile/rentals',{action:'create_block',assetId:Number($('blockAssetId').value),startDate:$('blockStart').value,endDate:$('blockEnd').value,reason:$('blockReason').value.trim()});
    if(!x.response.ok){s.textContent=x.data?.error||'Could not block dates.';return;} await fetchRental(); renderCalendar();
  }

  async function saveRules() {
    const s=$('rulesStatus'); s.textContent='Saving…';
    const x=await post('/api/mobile/rentals',{action:'update_rules',minDays:Number($('rentalMinDays').value),turnaroundDays:Number($('rentalTurnDays').value)});
    if(!x.response.ok){s.textContent=x.data?.error||'Could not save rules.';return;} await fetchRental(); renderAssets();
  }

  // Existing login/session code calls selectTab('jobs') after currentUser is set.
  // The wrapper above automatically diverts rental businesses into Calendar.
})();
