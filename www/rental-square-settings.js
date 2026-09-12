'use strict';
(function () {
  const $ = id => document.getElementById(id);

  function isRentalOwner() {
    return window.currentUser?.businessType === 'dumpster_rental' && (window.currentUser?.role === 'owner' || window.currentUser?.isMaster);
  }

  function browserPlugin() {
    const cap = window.Capacitor;
    if (!cap) return null;
    if (cap.Plugins?.Browser) return cap.Plugins.Browser;
    if (typeof cap.registerPlugin === 'function') return cap.registerPlugin('Browser');
    return null;
  }

  function installCard() {
    const screen = $('nativeFeaturesScreen');
    if (!screen || $('rentalSquareCard')) return;

    const card = document.createElement('div');
    card.id = 'rentalSquareCard';
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="section-title">Square Payments</div>
      <p class="meta">Connect this business to its own Square account to send rental deposits and payment requests.</p>
      <div id="rentalSquareStatus" class="meta" style="margin-top:10px">Checking Square connection…</div>
      <div id="rentalSquareDetails" class="hidden" style="margin-top:10px"></div>
      <button id="connectRentalSquare" class="action-btn" type="button" style="width:100%;margin-top:12px">Connect Square</button>
      <div id="rentalSquareActionStatus" class="form-status"></div>`;

    const teamCard = $('rentalTeamCard');
    if (teamCard) screen.insertBefore(card, teamCard);
    else screen.appendChild(card);

    $('connectRentalSquare')?.addEventListener('click', connectSquare);
  }

  async function refreshSquare() {
    installCard();
    const card = $('rentalSquareCard');
    if (!card) return;
    card.classList.toggle('hidden', !isRentalOwner());
    if (!isRentalOwner()) return;

    const status = $('rentalSquareStatus');
    const details = $('rentalSquareDetails');
    const button = $('connectRentalSquare');
    status.textContent = 'Checking Square connection…';
    details.classList.add('hidden');
    details.innerHTML = '';

    try {
      const x = await get('/api/mobile/payments');
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not load Square connection.');
      const c = x.data?.connection;
      if (!c) {
        status.textContent = 'Square is not connected to this business.';
        button.textContent = 'Connect Square';
        return;
      }

      status.textContent = 'Square is connected ✓';
      button.textContent = 'Reconnect Square';
      const rows = [];
      if (c.locationName) rows.push(`<div><strong>Location:</strong> ${String(c.locationName)}</div>`);
      if (c.merchantId) rows.push(`<div><strong>Merchant:</strong> ${String(c.merchantId)}</div>`);
      if (c.environment) rows.push(`<div><strong>Environment:</strong> ${String(c.environment)}</div>`);
      details.innerHTML = rows.join('');
      details.classList.remove('hidden');
    } catch (err) {
      status.textContent = err?.message || 'Could not load Square connection.';
    }
  }

  async function connectSquare() {
    const button = $('connectRentalSquare');
    const action = $('rentalSquareActionStatus');
    button.disabled = true;
    action.textContent = 'Preparing Square authorization…';
    try {
      const x = await post('/api/mobile/square/connect', {});
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not start Square connection.');
      const url = x.data?.authorizeUrl;
      const environment = x.data?.environment || 'unknown';
      if (!url) throw new Error('Square authorization URL was not returned.');

      if (environment === 'sandbox') {
        action.textContent = 'Opening Square Sandbox. If the page is blank or does not load, first open the Square Developer Console and launch the seller test account, then try Connect Square again.';
      } else {
        action.textContent = 'Opening Square Production authorization…';
      }

      console.log('ApproveHQ Square OAuth', { environment, host: new URL(url).host });
      const browser = browserPlugin();
      if (browser?.open) {
        await browser.open({ url });
      } else {
        window.location.href = url;
      }
    } catch (err) {
      action.textContent = err?.message || 'Could not connect Square.';
    } finally {
      button.disabled = false;
    }
  }

  $('nativeFeaturesBtn')?.addEventListener('click', () => setTimeout(refreshSquare, 0));
  $('refreshNativeFeatures')?.addEventListener('click', () => setTimeout(refreshSquare, 0));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('nativeFeaturesScreen')?.classList.contains('hidden')) refreshSquare();
  });

  installCard();
})();
