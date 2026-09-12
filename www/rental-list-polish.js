'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const root = $('rentalContent');
  if (!root) return;

  let decorating = false;
  let lastBookingUrl = null;

  function isRentalsScreen() {
    return root.querySelector('.topbar h2')?.textContent?.trim() === 'Rentals';
  }

  async function bookingUrl() {
    if (lastBookingUrl) return lastBookingUrl;
    try {
      const x = await get('/api/mobile/rentals');
      if (x.response.ok && x.data?.bookingUrl) {
        lastBookingUrl = x.data.bookingUrl;
        return lastBookingUrl;
      }
    } catch {}
    return null;
  }

  async function shareBookingLink(button) {
    const original = button.textContent;
    button.disabled = true;
    try {
      const url = await bookingUrl();
      if (!url) throw new Error('Booking link is not available yet.');
      const business = window.currentUser?.businessName || 'our rental company';
      if (navigator.share) {
        await navigator.share({
          title: `${business} rental booking`,
          text: `Book a rental with ${business}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        button.textContent = 'Copied ✓';
        setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1600);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        button.textContent = 'Could not share';
        setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1800);
      }
    } finally {
      button.disabled = false;
    }
  }

  function addShareButton() {
    if (!isRentalsScreen() || $('shareRentalBookingLink')) return;
    const actions = root.querySelector('.topbar .actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'shareRentalBookingLink';
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = 'Share Link';
    button.addEventListener('click', () => shareBookingLink(button));
    actions.insertBefore(button, actions.firstChild);
  }

  function collapseCard(card) {
    if (!card || card.dataset.rentalCollapsible === 'true') return;
    const idMatch = String(card.id || '').match(/^rental-(\d+)$/);
    if (!idMatch) return;

    const rentalId = Number(idMatch[1]);
    const row = card.querySelector(':scope > .row');
    if (!row) return;

    const allChildren = [...card.children];
    const summaryRow = allChildren.find(el => el === row);
    const detailChildren = allChildren.filter(el => el !== summaryRow);
    if (!detailChildren.length) return;

    const details = document.createElement('div');
    details.className = 'rental-card-details hidden';
    detailChildren.forEach(el => details.appendChild(el));
    card.appendChild(details);

    const chevron = document.createElement('span');
    chevron.className = 'rental-card-chevron';
    chevron.textContent = '⌄';

    const status = row.lastElementChild;
    if (status) {
      const right = document.createElement('div');
      right.className = 'rental-card-summary-right';
      row.replaceChild(right, status);
      right.appendChild(status);
      right.appendChild(chevron);
    } else {
      row.appendChild(chevron);
    }

    row.classList.add('rental-card-summary');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-expanded', 'false');

    const setExpanded = expanded => {
      details.classList.toggle('hidden', !expanded);
      row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      chevron.textContent = expanded ? '⌃' : '⌄';
      card.classList.toggle('rental-card-expanded', expanded);
    };

    const toggle = e => {
      if (e?.target?.closest('button, input, select, textarea, a')) return;
      setExpanded(details.classList.contains('hidden'));
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(e);
      }
    });

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
  });
  observer.observe(root, { childList: true, subtree: true });
  decorate();
})();
