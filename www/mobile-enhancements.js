'use strict';
(function () {
  const $ = id => document.getElementById(id);
  let enhancingPayments = false;
  let enhancingJobPayments = false;

  function removeNativeFeatureCopies() {
    const operationalScreens = [
      'jobsScreen',
      'customersScreen',
      'paymentsScreen',
      'teamScreen',
      'detailScreen'
    ];
    operationalScreens.forEach(id => {
      const screen = $(id);
      if (!screen) return;
      screen.querySelectorAll('.detail-card, .card, .notice').forEach(card => {
        const heading = card.querySelector('.section-title, h2, h3');
        const headingText = (heading?.textContent || '').trim().toLowerCase();
        const fullText = (card.textContent || '').trim().toLowerCase();
        const hasNativeControls = Boolean(card.querySelector('#testFaceIdBtn, #enablePushBtn, #testPushBtn, [id*="faceId" i], [id*="pushPermission" i], [id*="pushRegistration" i]'));
        const looksLikeSettings = headingText === 'native features' || headingText === 'device features' || headingText === 'settings' || fullText.includes('face id') || fullText.includes('push notifications');
        if (hasNativeControls || looksLikeSettings) card.remove();
      });
    });
  }

  function ensureArchiveControl() {
    const root = $('detailContent');
    if (!root || root.querySelector('#archiveJobBtn') || !currentJobId) return;
    const card = document.createElement('div');
    card.className = 'detail-card';
    card.id = 'archiveJobCard';
    card.innerHTML = `<div class="section-title">Job management</div><p class="meta">Archive this job when it is complete. Its history, approvals, comments, photos, and payments are preserved.</p><button id="archiveJobBtn" class="action-btn danger" type="button" style="width:100%">Archive job</button><div id="archiveJobStatus" class="form-status"></div>`;
    root.appendChild(card);
    $('archiveJobBtn').addEventListener('click', async () => {
      const id = currentJobId;
      if (!id || !window.confirm('Archive this job? It will be removed from the active Jobs list.')) return;
      const button = $('archiveJobBtn'); const status = $('archiveJobStatus');
      button.disabled = true; status.textContent = 'Archiving…';
      try { const result = await post('/api/mobile/jobs/' + id, { action: 'archive' }); if (!result.response.ok) throw new Error(result.data?.error || 'Could not archive job.'); loaded.jobs = false; await selectTab('jobs', true); }
      catch (err) { status.textContent = err?.message || 'Could not archive job.'; button.disabled = false; }
    });
  }

  async function copyText(text, button) {
    if (!text) return;
    const original = button?.textContent || 'Copy';
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        button.textContent = 'Copied ✓';
        setTimeout(() => { button.textContent = original; }, 1800);
      }
    } catch {
      window.prompt('Copy this link:', text);
    }
  }

  function inviteResultHtml(data) {
    const inviteUrl = data?.inviteUrl || '';
    const appUrl = data?.appDownloadUrl || '';
    const needsSetup = Boolean(data?.needsPassphraseSetup);
    const sent = Boolean(data?.inviteSent);
    const sendError = data?.inviteError || '';
    let message;
    if (sent && needsSetup) message = 'Team member added · Invitation text sent ✓';
    else if (sent) message = 'Team member added · App link sent ✓';
    else if (needsSetup) message = `Team member added ✓<br><span class="meta">Invitation text was not sent${sendError ? ': ' + sendError : '.'}</span>`;
    else message = `Team member added ✓<br><span class="meta">They already have an ApproveHQ account and can use their existing passphrase.</span>`;

    const actions = [];
    if (inviteUrl) {
      actions.push(`<a class="action-btn secondary" href="${inviteUrl}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:10px;text-decoration:none">Open Setup Link</a>`);
      actions.push(`<button id="copyTeamInviteBtn" class="action-btn secondary" type="button" style="width:100%;margin-top:8px">Copy Setup Link</button>`);
    }
    if (appUrl) {
      actions.push(`<a class="action-btn secondary" href="${appUrl}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:8px;text-decoration:none">Open App Download</a>`);
    }
    return message + actions.join('');
  }

  function ensureTeamControls() {
    const screen = $('teamScreen');
    if (!screen || $('addTeamMemberBtn')) return;
    const topbar = screen.querySelector('.topbar'); if (!topbar) return;
    const refresh = $('refreshTeam'); const actions = document.createElement('div'); actions.className = 'actions';
    const add = document.createElement('button'); add.id = 'addTeamMemberBtn'; add.className = 'text-button'; add.type = 'button'; add.textContent = '+ Add';
    if (refresh) { refresh.parentNode.insertBefore(actions, refresh); actions.appendChild(add); actions.appendChild(refresh); } else { topbar.appendChild(actions); actions.appendChild(add); }
    const card = document.createElement('div'); card.id = 'addTeamMemberCard'; card.className = 'detail-card hidden';
    card.innerHTML = `<div class="section-title">Add team member</div><form id="addTeamMemberForm"><div class="field"><label for="teamMemberName">Name</label><input id="teamMemberName" type="text" maxlength="200"></div><div class="field"><label for="teamMemberPhone">Mobile phone</label><input id="teamMemberPhone" type="tel" inputmode="tel" required></div><div class="field"><label for="teamMemberRole">Role</label><select id="teamMemberRole"><option value="admin">Admin</option><option value="owner">Owner</option></select></div><button id="saveTeamMemberBtn" class="action-btn" type="submit" style="width:100%">Add team member</button><div id="addTeamMemberStatus" class="form-status"></div></form>`;
    const message = $('teamMessage'); if (message) screen.insertBefore(card, message); else topbar.insertAdjacentElement('afterend', card);
    add.addEventListener('click', () => card.classList.toggle('hidden'));
    $('addTeamMemberForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('saveTeamMemberBtn');
      const status = $('addTeamMemberStatus');
      button.disabled = true;
      status.textContent = 'Adding team member and sending invitation…';
      try {
        const result = await post('/api/mobile/team', {
          name: $('teamMemberName').value.trim(),
          phone: $('teamMemberPhone').value.trim(),
          role: $('teamMemberRole').value
        });
        if (!result.response.ok) throw new Error(result.data?.error || 'Could not add team member.');
        loaded.team = false;
        status.innerHTML = inviteResultHtml(result.data);
        const copy = $('copyTeamInviteBtn');
        if (copy && result.data?.inviteUrl) copy.addEventListener('click', () => copyText(result.data.inviteUrl, copy));
        $('teamMemberName').value = '';
        $('teamMemberPhone').value = '';
        await loadTeam();
      } catch (err) {
        status.textContent = err?.message || 'Could not add team member.';
      } finally {
        button.disabled = false;
      }
    });
  }

  async function markCash(paymentId, button, refresh) { if (!window.confirm('Mark this payment as paid in cash?')) return; const original = button.textContent; button.disabled = true; button.textContent = 'Recording…'; try { const result = await post('/api/mobile/payments', { action: 'mark_cash', paymentId }); if (!result.response.ok) throw new Error(result.data?.error || 'Could not mark payment paid in cash.'); loaded.payments = false; await refresh(); } catch (err) { showBanner(err?.message || 'Could not mark payment paid in cash.'); button.disabled = false; button.textContent = original; } }

  async function enhancePaymentDashboard() { const root = $('paymentsContent'); if (!root || root.closest('.hidden') || enhancingPayments) return; const rendered = Array.from(root.querySelectorAll('.payment-row')); if (!rendered.length) return; enhancingPayments = true; try { const suffix = typeof paymentQuery === 'function' ? paymentQuery() : ''; const result = await get('/api/mobile/payments' + suffix); if (!result.response.ok) return; const rows = Array.isArray(result.data?.payments) ? result.data.payments : []; rendered.forEach((node, index) => { const payment = rows[index]; if (!payment || node.dataset.cashEnhanced === String(payment.id)) return; node.dataset.cashEnhanced = String(payment.id); const status = String(payment.status || '').toLowerCase(); const meta = node.querySelector('.meta:last-of-type') || node.querySelector('.meta'); if (status === 'paid') { if (payment.paid_method === 'cash' && meta && !meta.textContent.includes('Cash')) meta.innerHTML = meta.innerHTML.replace(/<strong>Paid<\/strong>/, '<strong>Paid · Cash</strong>'); else if (payment.paid_method === 'square' && meta && !meta.textContent.includes('Square')) meta.innerHTML = meta.innerHTML.replace(/<strong>Paid<\/strong>/, '<strong>Paid · Square</strong>'); return; } if (status !== 'pending' && status !== 'failed') return; const button = document.createElement('button'); button.className = 'action-btn secondary'; button.type = 'button'; button.style.width = '100%'; button.style.marginTop = '10px'; button.textContent = 'Paid Cash'; button.addEventListener('click', () => markCash(payment.id, button, async () => { loaded.payments = false; await loadPayments(); })); node.appendChild(button); }); } catch (err) { console.error('Could not enhance payment dashboard for cash payments', err); } finally { enhancingPayments = false; } }

  async function enhanceJobPayments() { const root = $('jobPayments'); if (!root || !currentJobId || enhancingJobPayments) return; const rendered = Array.from(root.querySelectorAll('.payment-row')); if (!rendered.length) return; enhancingJobPayments = true; try { const jobId = currentJobId; const result = await get('/api/mobile/jobs/' + jobId + '/payment-requests'); if (!result.response.ok) return; const rows = Array.isArray(result.data?.paymentRequests) ? result.data.paymentRequests : []; rendered.forEach((node, index) => { const payment = rows[index]; if (!payment || node.dataset.cashEnhanced === String(payment.id)) return; node.dataset.cashEnhanced = String(payment.id); const status = String(payment.status || '').toLowerCase(); const meta = node.querySelector('.meta'); const isCash = String(payment.note || '').includes('[Payment method: Cash'); if (status === 'paid') { if (meta) meta.textContent = isCash ? 'Paid · Cash ✓' : 'Paid · Square ✓'; return; } if (status !== 'pending' && status !== 'failed') return; const button = document.createElement('button'); button.className = 'action-btn secondary'; button.type = 'button'; button.style.width = '100%'; button.style.marginTop = '10px'; button.textContent = 'Paid Cash'; button.addEventListener('click', () => markCash(payment.id, button, async () => { loaded.payments = false; await loadJobPayments(jobId); })); node.appendChild(button); }); } catch (err) { console.error('Could not enhance job payments for cash payments', err); } finally { enhancingJobPayments = false; } }

  let enhancementTimer = null;
  function scheduleEnhancements() { clearTimeout(enhancementTimer); enhancementTimer = setTimeout(() => { removeNativeFeatureCopies(); ensureArchiveControl(); ensureTeamControls(); enhancePaymentDashboard(); enhanceJobPayments(); }, 50); }
  const observer = new MutationObserver(scheduleEnhancements);
  document.addEventListener('DOMContentLoaded', () => { removeNativeFeatureCopies(); ensureTeamControls(); observer.observe(document.body, { childList: true, subtree: true }); scheduleEnhancements(); });
})();
