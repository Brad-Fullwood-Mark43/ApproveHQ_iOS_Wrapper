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
      <div class="field"><label for="editTeamMemberName">Name</label><input id="editTeamMemberName" type="text" maxlength="200"></div>
      <div class="field"><label for="editTeamMemberPhone">Mobile phone</label><input id="editTeamMemberPhone" type="tel" readonly></div>
      <p class="meta" style="margin-top:-4px">Phone is the member's ApproveHQ sign-in ID and cannot be changed here.</p>
      <div class="field"><label for="editTeamMemberRole">Role</label><select id="editTeamMemberRole"><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
      <div id="teamMemberSetupState" class="meta"></div>
      <button id="saveTeamMemberChanges" class="action-btn" type="button" style="width:100%;margin-top:12px">Save changes</button>
      <button id="resendTeamMemberInvite" class="action-btn secondary hidden" type="button" style="width:100%;margin-top:10px">Resend invitation</button>
      <div id="teamMemberInviteLinks" class="action-grid hidden" style="margin-top:10px"></div>
      <div id="teamMemberDetailStatus" class="form-status"></div>`;
    const message = $('teamMessage');
    if (message) screen.insertBefore(card, message); else screen.appendChild(card);
    $('closeTeamMemberDetail').addEventListener('click', closeDetail);
    $('saveTeamMemberChanges').addEventListener('click', saveMember);
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
    $('resendTeamMemberInvite').classList.toggle('hidden', !member.pending);
    $('teamMemberInviteLinks').classList.add('hidden');
    $('teamMemberInviteLinks').innerHTML = '';
    $('teamMemberDetailStatus').textContent = '';
    $('teamList').classList.add('hidden');
    $('teamMemberDetailCard').classList.remove('hidden');
  }

  async function saveMember() {
    const member = teamRows.find(row => Number(row.id) === activeMemberId);
    if (!member) return;
    const button = $('saveTeamMemberChanges');
    const status = $('teamMemberDetailStatus');
    button.disabled = true;
    status.textContent = 'Saving changes…';
    try {
      const result = await post('/api/mobile/team', {
        action: 'update_member',
        userId: activeMemberId,
        name: $('editTeamMemberName').value.trim(),
        role: $('editTeamMemberRole').value,
      });
      if (!result.response.ok) throw new Error(result.data?.error || 'Could not save team member.');
      status.textContent = 'Team member updated ✓';
      await refreshTeamRows();
      const refreshed = teamRows.find(row => Number(row.id) === activeMemberId);
      if (refreshed) openDetail(refreshed);
    } catch (err) {
      status.textContent = err?.message || 'Could not save team member.';
    } finally {
      button.disabled = false;
    }
  }

  async function copyText(text, status) {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Setup link copied ✓';
    } catch {
      status.textContent = 'Could not copy the setup link.';
    }
  }

  function showInviteLinks(inviteUrl, appDownloadUrl) {
    const wrap = $('teamMemberInviteLinks');
    wrap.innerHTML = '';
    if (inviteUrl) {
      const open = document.createElement('button');
      open.className = 'action-btn secondary';
      open.type = 'button';
      open.textContent = 'Open setup link';
      open.addEventListener('click', () => { window.location.href = inviteUrl; });
      const copy = document.createElement('button');
      copy.className = 'action-btn secondary';
      copy.type = 'button';
      copy.textContent = 'Copy setup link';
      copy.addEventListener('click', () => copyText(inviteUrl, $('teamMemberDetailStatus')));
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
      status.textContent = 'Invitation text sent ✓';
      showInviteLinks(result.data?.inviteUrl, result.data?.appDownloadUrl);
    } catch (err) {
      status.textContent = err?.message || 'Could not resend invitation.';
    } finally {
      button.disabled = false;
      button.textContent = 'Resend invitation';
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
      <button class="job-button team-member-button" data-team-member-id="${Number(member.id)}" type="button">
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

  async function refreshTeamRows() {
    if (rendering || !$('teamScreen') || $('teamScreen').classList.contains('hidden')) return;
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
    const member = teamRows.find(row => Number(row.id) === Number(button.dataset.teamMemberId));
    if (member) openDetail(member);
  });

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
