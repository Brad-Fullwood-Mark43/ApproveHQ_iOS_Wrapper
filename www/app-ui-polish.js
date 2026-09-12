'use strict';
(function () {
  const byId = id => document.getElementById(id);
  let activeJobFilter = 'all';
  let activePaymentFilter = 'all';
  let detailJobLoaded = null;
  let detailEnhancing = false;

  const JOB_STATUS = {
    draft: { label: 'In Progress', cls: 'status-blue', icon: '●' },
    sent: { label: 'Waiting', cls: 'status-amber', icon: '◷' },
    approved: { label: 'Completed', cls: 'status-green', icon: '✓' },
    changes_requested: { label: 'Changes', cls: 'status-red', icon: '!' }
  };
  const PAYMENT_STATUS = {
    pending: { label: 'Pending', cls: 'status-amber', icon: '◷' },
    paid: { label: 'Paid', cls: 'status-green', icon: '✓' },
    failed: { label: 'Failed', cls: 'status-red', icon: '!' }
  };

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function normalizeStatus(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function currentFirstName() {
    const full = String(typeof currentUser !== 'undefined' && currentUser?.name || '').trim();
    return full ? full.split(/\s+/)[0] : 'Team';
  }

  function statusMarkup(config) {
    return `<span class="status-icon">${safe(config.icon)}</span><span>${safe(config.label)}</span>`;
  }

  function ensureJobFilters() {
    const screen = byId('jobsScreen');
    const message = byId('jobsMessage');
    if (!screen || !message || byId('jobStatusFilters')) return;
    const bar = document.createElement('div');
    bar.id = 'jobStatusFilters';
    bar.className = 'status-filter-bar';
    bar.innerHTML = `
      <button class="status-filter active" type="button" data-job-filter="all">All</button>
      <button class="status-filter" type="button" data-job-filter="draft">In Progress</button>
      <button class="status-filter" type="button" data-job-filter="sent">Waiting</button>
      <button class="status-filter" type="button" data-job-filter="approved">Completed</button>
      <button class="status-filter" type="button" data-job-filter="changes_requested">Changes</button>`;
    message.parentNode.insertBefore(bar, message);
    bar.addEventListener('click', event => {
      const button = event.target.closest('[data-job-filter]');
      if (!button) return;
      activeJobFilter = button.dataset.jobFilter || 'all';
      bar.querySelectorAll('.status-filter').forEach(x => x.classList.toggle('active', x === button));
      applyJobFilter();
    });
  }

  function decorateJobs() {
    const list = byId('jobsList');
    if (!list) return;
    list.querySelectorAll('.job-button').forEach(button => {
      const pill = button.querySelector('.pill');
      if (!pill) return;
      let raw = button.dataset.jobStatus;
      if (!raw) {
        raw = normalizeStatus(pill.textContent);
        button.dataset.jobStatus = raw;
      }
      const config = JOB_STATUS[raw] || { label: String(pill.textContent || '').trim(), cls: 'status-neutral', icon: '●' };
      pill.className = `pill status-pill ${config.cls}`;
      pill.innerHTML = statusMarkup(config);
      const meta = button.querySelector('.meta');
      if (meta && !button.querySelector('.job-counts')) {
        const counts = document.createElement('div');
        counts.className = 'job-counts';
        counts.innerHTML = '<span>Tap to view details</span><span class="chevron">›</span>';
        const view = button.querySelector('.view');
        if (view) view.replaceWith(counts); else button.appendChild(counts);
      }
    });
    applyJobFilter();
  }

  function applyJobFilter() {
    const list = byId('jobsList');
    if (!list) return;
    let visible = 0;
    list.querySelectorAll('.job-button').forEach(button => {
      const show = activeJobFilter === 'all' || button.dataset.jobStatus === activeJobFilter;
      button.classList.toggle('filtered-out', !show);
      if (show) visible += 1;
    });
    let empty = byId('jobFilterEmpty');
    if (!visible && list.children.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'jobFilterEmpty';
        empty.className = 'loading';
        list.parentNode.insertBefore(empty, list.nextSibling);
      }
      empty.textContent = 'No jobs in this status.';
      empty.classList.remove('hidden');
    } else if (empty) empty.classList.add('hidden');
  }

  function ensurePaymentFilters() {
    const screen = byId('paymentsScreen');
    const message = byId('paymentsMessage');
    if (!screen || !message || byId('paymentStatusFilters')) return;
    const bar = document.createElement('div');
    bar.id = 'paymentStatusFilters';
    bar.className = 'status-filter-bar';
    bar.innerHTML = `
      <button class="status-filter active" type="button" data-payment-filter="all">All</button>
      <button class="status-filter" type="button" data-payment-filter="pending">Pending</button>
      <button class="status-filter" type="button" data-payment-filter="paid">Paid</button>
      <button class="status-filter" type="button" data-payment-filter="failed">Failed</button>`;
    message.parentNode.insertBefore(bar, message);
    bar.addEventListener('click', event => {
      const button = event.target.closest('[data-payment-filter]');
      if (!button) return;
      activePaymentFilter = button.dataset.paymentFilter || 'all';
      bar.querySelectorAll('.status-filter').forEach(x => x.classList.toggle('active', x === button));
      applyPaymentFilter();
    });
  }

  function detectPaymentStatus(row) {
    const metaText = Array.from(row.querySelectorAll('.meta')).map(x => x.textContent.trim().toLowerCase()).join(' ');
    if (/\bfailed\b/.test(metaText)) return 'failed';
    if (/\bpaid\b/.test(metaText)) return 'paid';
    if (/\bpending\b|awaiting payment/.test(metaText)) return 'pending';
    const strongText = Array.from(row.querySelectorAll('strong')).map(x => x.textContent.trim().toLowerCase()).join(' ');
    if (/\bfailed\b/.test(strongText)) return 'failed';
    if (/\bpaid\b/.test(strongText)) return 'paid';
    return 'pending';
  }

  function decoratePaymentRows() {
    const root = byId('paymentsContent');
    if (!root) return;
    root.querySelectorAll('.payment-row').forEach(row => {
      const status = detectPaymentStatus(row);
      row.dataset.paymentStatus = status;
      let badge = row.querySelector('.payment-status-badge');
      const config = PAYMENT_STATUS[status] || PAYMENT_STATUS.pending;
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'payment-status-badge';
        const firstRow = row.querySelector('.row');
        if (firstRow) firstRow.appendChild(badge);
      }
      badge.className = `payment-status-badge status-pill ${config.cls}`;
      badge.innerHTML = statusMarkup(config);
    });
    applyPaymentFilter();
  }

  function applyPaymentFilter() {
    const root = byId('paymentsContent');
    if (!root) return;
    root.querySelectorAll('.payment-row').forEach(row => {
      row.classList.toggle('filtered-out', activePaymentFilter !== 'all' && row.dataset.paymentStatus !== activePaymentFilter);
    });
  }

  function cardByTitle(title) {
    return Array.from(byId('detailContent')?.querySelectorAll('.detail-card') || [])
      .find(card => String(card.querySelector('.section-title')?.textContent || '').trim().toLowerCase() === title.toLowerCase());
  }

  function ensureDetailNav() {
    const screen = byId('detailScreen');
    const message = byId('detailMessage');
    if (!screen || !message) return null;
    let nav = byId('jobDetailNav');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'jobDetailNav';
      nav.className = 'job-detail-nav hidden';
      nav.innerHTML = `
        <button type="button" data-detail-target="details" class="active">Details</button>
        <button type="button" data-detail-target="photos">Photos</button>
        <button type="button" data-detail-target="comments">Comments</button>
        <button type="button" data-detail-target="approvals">Approvals</button>`;
      message.parentNode.insertBefore(nav, message.nextSibling);
      nav.addEventListener('click', event => {
        const button = event.target.closest('[data-detail-target]');
        if (!button) return;
        const target = button.dataset.detailTarget;
        let node;
        if (target === 'details') node = byId('detailContent')?.querySelector('.detail-card');
        if (target === 'photos') node = cardByTitle('Photos');
        if (target === 'comments') node = cardByTitle('Comments');
        if (target === 'approvals') node = byId('approvalsCard');
        if (node) {
          nav.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === button));
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    return nav;
  }

  function fmtDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  }

  function activityItem(icon, cls, title, detail, when) {
    return `<div class="activity-row"><div class="activity-icon ${safe(cls)}">${safe(icon)}</div><div class="activity-copy"><strong>${safe(title)}</strong>${detail ? `<div>${safe(detail)}</div>` : ''}${when ? `<span>${safe(when)}</span>` : ''}</div></div>`;
  }

  function renderRecentActivity(data) {
    const root = byId('detailContent');
    if (!root) return;
    const oldActivity = cardByTitle('Activity');
    if (oldActivity) oldActivity.remove();
    let card = byId('recentActivityCard');
    if (card) card.remove();
    card = document.createElement('div');
    card.id = 'recentActivityCard';
    card.className = 'detail-card anchor-card';
    card.innerHTML = '<div class="section-title">Recent Activity</div>';

    const events = [];
    (data.photos || []).forEach(p => events.push({ time: p.created_at || p.uploaded_at, html: activityItem('▧', 'activity-blue', 'Photo added', 'New job photo uploaded', fmtDate(p.created_at || p.uploaded_at)) }));
    (data.comments || []).forEach(c => {
      let author = String(c.author_name || 'Customer').trim();
      if (/^\+?\d[\d\s().-]{7,}$/.test(author)) author = currentFirstName();
      events.push({ time: c.created_at, html: activityItem('◌', 'activity-blue', `Comment from ${author}`, String(c.body || '').slice(0, 90), fmtDate(c.created_at)) });
    });
    (data.approvals || []).forEach(a => {
      const approved = normalizeStatus(a.status || a.decision || '') === 'approved';
      events.push({ time: a.created_at || a.updated_at || a.approved_at, html: activityItem(approved ? '✓' : '!', approved ? 'activity-green' : 'activity-amber', approved ? 'Approval received' : 'Approval updated', String(a.comment || a.note || '').slice(0, 90), fmtDate(a.created_at || a.updated_at || a.approved_at)) });
    });
    events.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    card.innerHTML += events.length ? events.slice(0, 8).map(x => x.html).join('') : '<div class="meta">Activity will appear here as photos, comments, and approvals are added.</div>';

    const comments = cardByTitle('Comments');
    if (comments) root.insertBefore(card, comments); else root.appendChild(card);
  }

  function renderApprovals(data) {
    const root = byId('detailContent');
    if (!root) return;
    let card = byId('approvalsCard');
    if (card) card.remove();
    card = document.createElement('div');
    card.id = 'approvalsCard';
    card.className = 'detail-card anchor-card';
    card.innerHTML = '<div class="section-title">Approvals</div>';
    const approvals = Array.isArray(data.approvals) ? data.approvals : [];
    if (!approvals.length) {
      card.innerHTML += '<div class="approval-empty"><div class="activity-icon activity-amber">◷</div><div><strong>Waiting for approval</strong><div class="meta">Customer decisions and requested changes will appear here.</div></div></div>';
    } else {
      card.innerHTML += approvals.map(a => {
        const raw = normalizeStatus(a.status || a.decision || 'approved');
        const approved = raw === 'approved';
        const config = approved ? { label: 'Approved', cls: 'status-green', icon: '✓' } : { label: raw.replaceAll('_', ' '), cls: 'status-amber', icon: '!' };
        const who = safe(a.customer_name || a.author_name || 'Customer');
        const when = safe(fmtDate(a.created_at || a.updated_at || a.approved_at));
        return `<div class="approval-row"><div><strong>${who}</strong><div class="meta">${when}</div></div><span class="status-pill ${config.cls}">${statusMarkup(config)}</span></div>`;
      }).join('');
    }
    const comments = cardByTitle('Comments');
    if (comments) root.insertBefore(card, comments.nextSibling); else root.appendChild(card);
  }

  function decorateComments() {
    const root = byId('detailContent');
    if (!root) return;
    root.querySelectorAll('.comment-author').forEach(author => {
      if (/^\+?\d[\d\s().-]{7,}$/.test(author.textContent.trim())) author.textContent = currentFirstName();
    });
  }

  async function enhanceJobDetail() {
    const root = byId('detailContent');
    const nav = ensureDetailNav();
    if (!root || !nav || !currentJobId || detailEnhancing) return;
    if (!root.querySelector('.detail-card')) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');
    decorateComments();
    root.querySelectorAll('.detail-card').forEach(card => card.classList.add('anchor-card'));
    const id = currentJobId;
    if (detailJobLoaded === id && byId('recentActivityCard') && byId('approvalsCard')) return;
    detailEnhancing = true;
    try {
      const result = await get('/api/mobile/jobs/' + id);
      if (!result.response.ok || currentJobId !== id) return;
      renderRecentActivity(result.data || {});
      renderApprovals(result.data || {});
      decorateComments();
      detailJobLoaded = id;
    } catch (err) {
      console.error('Could not enhance job detail', err);
    } finally {
      detailEnhancing = false;
    }
  }

  let timer;
  function refreshEnhancements() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureJobFilters();
      decorateJobs();
      ensurePaymentFilters();
      decoratePaymentRows();
      enhanceJobDetail();
    }, 70);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureJobFilters();
    ensurePaymentFilters();
    ensureDetailNav();
    const observer = new MutationObserver(refreshEnhancements);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    refreshEnhancements();
  });
})();
