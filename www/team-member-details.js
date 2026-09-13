'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let teamRows = [];
  let activeMemberId = null;
  let rendering = false;

  function ensureDetailCard() {
    const screen = $('teamScreen');
    if (!screen || $('teamMemberDetailCard')) return;
    const card = document.createElement('div');
    card.id = 'teamMemberDetailCard';
    card.className = 'detail-card hidden';
    card.innerHTML = `
      <div class="row" style="align-items:center;margin-bottom:12px">
        <div class="section-title" style="margin:0">Team member</div>
        <button id="closeTeamMemberDetail" class="text-button" type="button">Close</button>
      </div>
      <div class="field"><label for="editTeamMemberName">Name</label><input id="editTeamMemberName" type="text" maxlength="200" autocomplete="name"></div>
      <div class="field"><label for="editTeamMemberPhone">Mobile phone</label><input id="editTeamMemberPhone" type="tel" autocomplete="tel"></div>
      <p class="meta" style="margin-top:-4px">This phone number is the member's ApproveHQ sign-in ID.</p>
      <div class="field"><label for="editTeamMemberRole">Role</label><select id="editTeamMemberRole"><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
      <div id="teamMemberSetupState" class="meta"></div>
      <button id="saveTeamMemberChanges" class="action-btn" type="button" style="width:100%;margin-top:12px">Save changes</button>
      <button id="resetTeamMemberPassword" class="action-btn secondary" type="button" style="width:100%;margin-top:10px">Reset password</button>
      <button id="resendTeamMemberInvite" class="action-btn secondary hidden" type="button" style="width:100%;margin-top:10px">Resend setup invitation</button>
      <div id="teamMemberInviteLinks" class="action-grid hidden" style="margin-top:10px"></div>
      <div id="teamMemberDetailStatus" class="form-status"></div>`;
    const message = $('teamMessage');
    if (message) screen.insertBefore(card, message); else screen.appendChild(card);
    $('closeTeamMemberDetail').addEventListener('click', closeDetail);
    $('saveTeamMemberChanges').addEventListener('click', saveMember);
    $('resetTeamMemberPassword').addEventListener('click', resetPassword);
    $('resendTeamMemberInvite').addEventListener('click', resendInvite);
  }

  function closeDetail() {
    activeMemberId = null;
    $('teamMemberDetailCard')?.classList.add('hidden');
    $('teamList')?.classList.remove('hidden');
    const message = $('teamMessage');
    if (message && teamRows.length) message.classList.add('hidden');
  }

  function openDetail(member) {
    ensureDetailCard();
    activeMemberId = Number(member.id);
    $('editTeamMemberName').value = member.name || '';
    $('editTeamMemberPhone').value = member.phone || '';
    $('editTeamMemberRole').value = member.role === 'owner' ? 'owner' : 'admin';
    $('teamMemberSetupState').textContent = member.pending ? 'Account setup: Pending' : 'Account setup: Complete ✓';
    $('resetTeamMemberPassword').textContent = member.pending ? 'Set up / reset password' : 'Reset password';
    $('resendTeamMemberInvite').classList.toggle('hidden', !member.pending);
    $('teamMemberInviteLinks').classList.add('hidden');
    $('teamMemberInviteLinks').innerHTML = '';
    $('teamMemberDetailStatus').textContent = '';
    $('teamList').classList.add('hidden');
    $('teamMemberDetailCard').classList.remove('hidden');
    $('editTeamMemberName').focus();
  }

  async function saveMember() {
    const member = teamRows.find(row => Number(row.id) === activeMemberId);
    if (!member) return;
    const button = $('saveTeamMemberChanges');
    const status = $('teamMemberDetailStatus');
    const name = $('editTeamMemberName').value.trim();
    const phone = $('editTeamMemberPhone').value.trim();
    if (!name) { status.textContent = 'Name is required.'; return; }
    if (!phone) { status.textContent = 'Mobile phone is required.'; return; }
    button.disabled = true;
    status.textContent = 'Saving changes…';
    try {
      const result = await post('/api/mobile/team', {
        action: 'update_member',
        userId: activeMemberId,
        name,
        phone,
        role: $('editTeamMemberRole').value,
      });
      if (!result.response.ok) throw new Error(result.data?.error || 'Could not save team member.');
      status.textContent = 'Team member updated ✓';
      await refreshTeamRows(true);
      const refreshed = teamRows.find(row => Number(row.id) === activeMemberId);
      if (refreshed) openDetail(refreshed);
    } catch (err) {
      status.textContent = err?.message || 'Could not save team member.';
    } finally {
      button.disabled = false;
    }
  }

  async function copyText(text, status, label = 'Link copied ✓') {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = label;
    } catch {
      status.textContent = 'Could not copy the link.';
    }
  }

  function showActionLinks({ primaryUrl, primaryLabel, appDownloadUrl }) {
    const wrap = $('teamMemberInviteLinks');
    wrap.innerHTML = '';
    if (primaryUrl) {
      const open = document.createElement('button');
      open.className = 'action-btn secondary';
      open.type = 'button';
      open.textContent = `Open ${primaryLabel}`;
      open.addEventListener('click', () => { window.location.href = primaryUrl; });
      const copy = document.createElement('button');
      copy.className = 'action-btn secondary';
      copy.type = 'button';
      copy.textContent = `Copy ${primaryLabel}`;
      copy.addEventListener('click', () => copyText(primaryUrl, $('teamMemberDetailStatus')));
      wrap.appendChild(open);
      wrap.appendChild(copy);
    }
    if (appDownloadUrl) {
      const app = document.createElement('button');
      app.className = 'action-btn secondary';
      app.type = 'button';
      app.textContent = 'Open app download';
      app.addEventListener('click', () => { window.location.href = appDownloadUrl; });
      wrap.appendChild(app);
    }
    wrap.classList.toggle('hidden', !wrap.children.length);
  }

  async function resendInvite() {
    const member = teamRows.find(row => Number(row.id) === activeMemberId);
    if (!member || !member.pending) return;
    const button = $('resendTeamMemberInvite');
    const status = $('teamMemberDetailStatus');
    button.disabled = true;
    button.textContent = 'Sending…';
    status.textContent = 'Generating a fresh setup link and sending invitation…';
    try {
      const result = await post('/api/mobile/team', {
        action: 'resend_invite',
        userId: activeMemberId,
      });
      if (!result.response.ok) throw new Error(result.data?.error || 'Could not resend invitation.');
      status.textContent = 'Setup invitation text sent ✓';
      showActionLinks({
        primaryUrl: result.data?.inviteUrl,
        primaryLabel: 'setup link',
        appDownloadUrl: result.data?.appDownloadUrl,
      });
    } catch (err) {
      status.textContent = err?.message || 'Could not resend invitation.';
    } finally {
      button.disabled = false;
      button.textContent = 'Resend setup invitation';
    }
  }

  async function resetPassword() {
    const member = teamRows.find(row => Number(row.id) === activeMemberId);
    if (!member) return;
    const button = $('resetTeamMemberPassword');
    const status = $('teamMemberDetailStatus');
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Sending…';
    status.textContent = member.pending
      ? 'Sending a fresh account setup link…'
      : 'Sending a secure password reset link…';
    try {
      const result = await post('/api/mobile/team', {
        action: 'reset_password',
        userId: activeMemberId,
      });
      if (!result.response.ok) throw new Error(result.data?.error || 'Could not send password reset.');
      if (result.data?.setupRequired) {
        status.textContent = 'Account setup link sent ✓';
        showActionLinks({
          primaryUrl: result.data?.inviteUrl,
          primaryLabel: 'setup link',
          appDownloadUrl: result.data?.appDownloadUrl,
        });
      } else {
        status.textContent = `Password reset link sent ✓${result.data?.expiresMinutes ? ` Expires in ${result.data.expiresMinutes} minutes.` : ''}`;
        showActionLinks({
          primaryUrl: result.data?.resetUrl,
          primaryLabel: 'reset link',
          appDownloadUrl: null,
        });
      }
    } catch (err) {
      status.textContent = err?.message || 'Could not send password reset.';
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function renderTeamRows() {
    const list = $('teamList');
    const message = $('teamMessage');
    if (!list) return;
    if (!teamRows.length) {
      list.innerHTML = '';
      if (message) { message.textContent = 'No team members yet.'; message.classList.remove('hidden'); }
      return;
    }
    if (message) message.classList.add('hidden');
    list.innerHTML = teamRows.map(member => `
      <button class="job-button team-member-button" data-team-member-id="${Number(member.id)}" type="button" style="width:100%;text-align:left">
        <div class="row">
          <div>
            <div class="title">${safe(member.name || member.phone || 'Team member')}</div>
            <div class="meta">${safe(member.phone || '')}</div>
          </div>
          <div class="pill">${safe(member.role === 'owner' ? 'Owner' : 'Admin')}</div>
        </div>
        <div class="view">${member.pending ? 'Pending setup · ' : ''}View / Edit ›</div>
      </button>`).join('');
    list.classList.remove('hidden');
  }

  async function refreshTeamRows(force = false) {
    if (rendering || !$('teamScreen') || (!force && $('teamScreen').classList.contains('hidden'))) return;
    rendering = true;
    try {
      const result = await get('/api/mobile/team');
      if (!result.response.ok) return;
      teamRows = Array.isArray(result.data?.users) ? result.data.users : [];
      renderTeamRows();
    } catch (err) {
      console.error('Could not enhance team member list', err);
    } finally {
      rendering = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-team-member-id]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const member = teamRows.find(row => Number(row.id) === Number(button.dataset.teamMemberId));
    if (member) openDetail(member);
  }, true);

  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureDetailCard();
      if ($('teamScreen') && !$('teamScreen').classList.contains('hidden') && !activeMemberId) refreshTeamRows();
    }, 120);
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureDetailCard();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
})();

(() => {
  const script = document.createElement('script');
  script.src = 'new-job-customer.js';
  script.defer = true;
  document.head.appendChild(script);
})();
