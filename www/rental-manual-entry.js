'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const root = $('rentalContent');
  if (!root) return;

  let installing = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(cents || 0) / 100);

  function rentalDays(start, end) {
    if (!start || !end || end < start) return 0;
    return Math.floor((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000) + 1;
  }

  function isRentalsScreen() {
    const title = root.querySelector('.topbar h2');
    return title?.textContent?.trim() === 'Rentals';
  }

  function removeManualForm() {
    $('manualRentalCard')?.remove();
  }

  async function openManualForm() {
    if ($('manualRentalCard')) return;
    const x = await get('/api/mobile/rentals');
    if (!x.response.ok) return;
    const assets = (x.data?.assets || []).filter(a => a.active !== false);

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
        <div class="action-grid"><div class="field"><label>Delivery</label><input id="manualDeliveryDate" type="date" required></div><div class="field"><label>Pickup</label><input id="manualPickupDate" type="date" required></div></div>
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

    const updatePrice = () => {
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
    };

    $('manualAssetId')?.addEventListener('change', updatePrice);
    $('manualDeliveryDate')?.addEventListener('change', updatePrice);
    $('manualPickupDate')?.addEventListener('change', updatePrice);

    $('manualRentalForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const status = $('manualRentalStatus');
      const button = $('manualRentalSubmit');
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
